import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { mkdtemp, rm, writeFile, utimes, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Pool } from 'pg';
import type { Principal } from '@cop/contracts';
import { startLocalDatabase } from '../../scripts/local-database.mjs';
import { zipFixture } from './zip-fixtures.js';
import { WorkbookImports } from './workbook-imports.js';
import { WorkbookInbox } from './workbook-inbox.js';
import { ReportStore, sportSociety } from './store.js';
import { requirePermission } from './service.js';
import {
  forecastFixture,
  healthplannerFixture,
  membersFixture,
  financeFixture,
} from './workbook-fixtures.js';
let directory: string,
  database: Awaited<ReturnType<typeof startLocalDatabase>>,
  pool: Pool,
  store: WorkbookImports;
const admin: Principal = {
  userId: 'fixture',
  organizationId: 'sport-society',
  locations: null,
  permissions: ['reports.read', 'reports.manage'],
};
beforeAll(async () => {
  directory = await mkdtemp(join(tmpdir(), 'cop-workbooks-'));
  database = await startLocalDatabase(directory, { port: 0 });
  pool = new Pool({ connectionString: database.connectionString });
  await new ReportStore(pool).seed();
  store = new WorkbookImports(pool);
}, 60000);
afterAll(async () => {
  await pool?.end();
  await database?.close();
  if (directory) await rm(directory, { recursive: true, force: true });
});
describe('lokaal bewaarde werkboeken', () => {
  it('verwerkt een optionele lokale map, hergebruikt bevestigde clubs en voorkomt dubbeltelling bij scannen/herstart', async () => {
    const inbox = new WorkbookInbox(directory, store, true);
    await expect(
      new WorkbookInbox(directory, store, false).enable(
        admin.organizationId,
        'demo',
      ),
    ).rejects.toThrow('alleen beschikbaar');
    await store.preferences.inbox(
      admin.organizationId,
      'demo',
      admin.userId,
      true,
    );
    await store.preferences.remember(
      admin.organizationId,
      'demo',
      admin.userId,
      'inbox-omzet.xlsx',
      'finance',
      'barneveld',
    );
    await inbox.enable(admin.organizationId, 'demo');
    const folder = inbox.path(admin.organizationId, 'demo');
    const old = new Date(Date.now() - 10000);
    for (const [name, bytes] of [
      ['inbox-hp.xlsx', await healthplannerFixture()],
      ['inbox-leden.xlsx', await membersFixture()],
      ['inbox-omzet.xlsx', await financeFixture()],
      [
        'inbox-leden.xlsx.cop.json',
        Buffer.from(
          JSON.stringify({
            locationId: 'barneveld',
            asOf: '2026-10-18',
            scopeConfirmed: true,
          }),
        ),
      ],
    ] as const) {
      const file = join(folder, name);
      await writeFile(file, bytes);
      await utimes(file, old, old);
    }
    if (process.platform !== 'win32') {
      const outside = join(directory, 'unrelated.xlsx');
      await writeFile(outside, await financeFixture());
      await symlink(outside, join(folder, 'outside.xlsx'));
    }
    await Promise.all([
      inbox.scan(sportSociety, 'demo'),
      inbox.scan(sportSociety, 'demo'),
    ]);
    const imported = await store.list(admin, 'demo');
    expect(imported).toHaveLength(3);
    expect(imported.every((i) => i.status === 'accepted')).toBe(true);
    expect(inbox.status(admin.organizationId, 'demo', true).files).toHaveLength(
      3,
    );
    expect(
      inbox.status(admin.organizationId, 'real', false).lastScan,
    ).toBeNull();
    await inbox.scan(sportSociety, 'demo');
    await new WorkbookInbox(directory, store, true).scan(sportSociety, 'demo');
    expect(await store.list(admin, 'demo')).toHaveLength(3);
    await store.preferences.inbox(
      admin.organizationId,
      'demo',
      admin.userId,
      false,
    );
    const extra = join(folder, 'inbox-new.xlsx');
    await writeFile(extra, await healthplannerFixture());
    await utimes(extra, old, old);
    await inbox.scan(sportSociety, 'demo');
    expect(await store.list(admin, 'demo')).toHaveLength(3);
    await pool.query(
      'DELETE FROM report_workbooks WHERE organization_id=$1 AND dataset=$2',
      [admin.organizationId, 'demo'],
    );
    await pool.query(
      'DELETE FROM report_workbook_preferences WHERE organization_id=$1 AND dataset=$2',
      [admin.organizationId, 'demo'],
    );
  });
  it('onthoudt uitsluitend bevestigde toewijzingen, stelt ze voor zonder datums en schrijft niet tijdens controle', async () => {
    const body = {
      dataset: 'real' as const,
      filename: 'vaste-leden.xlsx',
      content: (await membersFixture()).toString('base64'),
      locationId: 'barneveld',
      asOf: '2026-10-18',
      scopeConfirmed: true,
      rememberMapping: true,
    };
    const before = (await store.list(admin, 'real')).length;
    expect((await store.preview(sportSociety, body))[0]?.status).toBe('ready');
    expect((await store.list(admin, 'real')).length).toBe(before);
    expect(
      (await store.preferences.read(admin.organizationId, 'real')).mappings,
    ).toEqual({});
    await store.import(sportSociety, admin, body);
    const fresh = new WorkbookImports(pool);
    const preview = await fresh.preview(sportSociety, {
      dataset: 'real',
      filename: 'VASTE-LEDEN.xlsx',
      content: body.content,
    });
    expect(preview[0]).toMatchObject({
      status: 'needs-context',
      kind: 'members',
      locationId: 'barneveld',
      asOf: null,
      suggested: true,
    });
    expect(
      (
        await fresh.preview(sportSociety, {
          dataset: 'demo',
          filename: body.filename,
          content: body.content,
        })
      )[0]?.locationId,
    ).toBeNull();
    expect((await fresh.preferences.read('other', 'real')).mappings).toEqual(
      {},
    );
    const mismatch = await fresh.preview(sportSociety, {
      dataset: 'real',
      filename: body.filename,
      content: (await financeFixture()).toString('base64'),
    });
    expect(mismatch[0]).toMatchObject({
      status: 'needs-context',
      locationId: null,
    });
    await fresh.preferences.thresholds(
      admin.organizationId,
      'real',
      admin.userId,
      { withoutAppointmentPercent: 40, increasePercent: 25, staleDays: 3 },
    );
    expect(
      (await fresh.preferences.read(admin.organizationId, 'real')).mappings[
        'vaste-leden.xlsx'
      ],
    ).toMatchObject({ locationId: 'barneveld', kind: 'members' });
    expect(
      (await fresh.preferences.read(admin.organizationId, 'demo')).thresholds
        .staleDays,
    ).toBe(7);
    await expect(
      fresh.preferences.thresholds(admin.organizationId, 'real', admin.userId, {
        withoutAppointmentPercent: 101,
        increasePercent: 0,
        staleDays: 0,
      }),
    ).rejects.toThrow();
    await fresh.preferences.forget(
      admin.organizationId,
      'real',
      admin.userId,
      'vaste-leden.xlsx',
    );
    expect(
      (await fresh.preferences.read(admin.organizationId, 'real')).mappings,
    ).toEqual({});
    // Remove this test's source through a scoped SQL statement to preserve the
    // independent history expectations of the remaining storage scenarios.
    await pool.query(
      'DELETE FROM report_workbooks WHERE organization_id=$1 AND filename=$2',
      [admin.organizationId, body.filename],
    );
  });
  it('bewaart originelen en afwijzingen, herkent gelijktijdige dubbele imports en isoleert dataset/tenant/club', async () => {
    const original = await forecastFixture();
    const body = {
      dataset: 'real' as const,
      filename: 'test.xlsx',
      content: original.toString('base64'),
    };
    const results = await Promise.all([
      store.import(sportSociety, admin, body),
      store.import(sportSociety, admin, body),
    ]);
    expect(results.filter((r) => r.duplicate)).toHaveLength(1);
    expect(
      (
        await store.import(sportSociety, admin, {
          ...body,
          locationId: 'harskamp',
          asOf: '2026-10-01',
          scopeConfirmed: true,
        })
      ).duplicate,
    ).toBe(true);
    const entries = await store.list(admin, 'real');
    expect(entries).toHaveLength(1);
    expect(
      (await store.original(admin.organizationId, entries[0]!.id)).original,
    ).toEqual(original);
    expect(
      await store.list({ ...admin, organizationId: 'other' }, 'real'),
    ).toHaveLength(0);
    expect(await store.original('other', entries[0]!.id)).toBeNull();
    expect(
      await store.list({ ...admin, locations: ['harskamp'] }, 'real'),
    ).toHaveLength(0);
    expect(await store.list(admin, 'demo')).toHaveLength(0);
    await store.import(sportSociety, admin, { ...body, dataset: 'demo' });
    expect(await store.list(admin, 'demo')).toHaveLength(1);
    const rejected = await store.import(sportSociety, admin, {
      ...body,
      content: Buffer.from('not-xlsx').toString('base64'),
    });
    expect(rejected.status).toBe('rejected');
    expect(
      (
        await store.original(admin.organizationId, rejected.id)
      ).original.toString(),
    ).toBe('not-xlsx');
    expect(() =>
      requirePermission(
        { ...admin, locations: ['barneveld'] },
        admin.organizationId,
        'reports.manage',
      ),
    ).toThrow('organisatiescope');
  });
  it('verwijdert andere clubs uit een organisatiebreed Healthplanner-overzicht', async () => {
    await store.import(sportSociety, admin, {
      dataset: 'real',
      filename: 'healthplanner.xlsx',
      content: (await healthplannerFixture()).toString('base64'),
    });
    const view = await store.list(
      { ...admin, locations: ['barneveld'] },
      'real',
    );
    const hp = view.find((i) => i.report?.kind === 'healthplanner')?.report;
    if (!hp || hp.kind !== 'healthplanner')
      throw new Error('overzicht ontbreekt');
    expect(hp.locationIds).toEqual(['barneveld']);
    expect(hp.rows.every((r) => r.locationId === 'barneveld')).toBe(true);
    expect(hp.cards).toEqual([]);
  });
  it('verwerkt één ZIP gedeeltelijk, bewaart originelen en hervat met expliciete context zonder dubbeltelling', async () => {
    const bytes = zipFixture([
      { filename: 'hp.xlsx', bytes: await healthplannerFixture() },
      { filename: 'leden.xlsx', bytes: await membersFixture() },
      { filename: 'kapot.xlsx', bytes: Buffer.from('broken') },
    ]);
    const body = {
      dataset: 'demo' as const,
      filename: 'pakket.zip',
      content: bytes.toString('base64'),
    };
    const first = await store.importZip(sportSociety, admin, body);
    expect(first.results.map((r) => r.status)).toEqual([
      'accepted',
      'rejected',
      'rejected',
    ]);
    expect(
      (await store.original(admin.organizationId, first.id)).original,
    ).toEqual(bytes);
    const second = await store.importZip(sportSociety, admin, {
      ...body,
      fileContexts: {
        'leden.xlsx': {
          locationId: 'barneveld',
          asOf: '2026-10-18',
          scopeConfirmed: true,
        },
      },
    });
    expect(second.id).toBe(first.id);
    expect(second.results.map((r) => r.status)).toEqual([
      'accepted',
      'accepted',
      'rejected',
    ]);
    expect(second.results[0]!.duplicate).toBe(true);
    const third = await store.importZip(sportSociety, admin, {
      ...body,
      fileContexts: {
        'leden.xlsx': {
          locationId: 'barneveld',
          asOf: '2026-10-18',
          scopeConfirmed: true,
        },
      },
    });
    expect(third.results.every((r) => r.duplicate)).toBe(true);
    expect(await store.original('other', first.id)).toBeNull();
    const scoped = await store.list(
      { ...admin, locations: ['harskamp'] },
      'demo',
    );
    expect(
      scoped.some(
        (r) => r.filename === 'pakket.zip' || r.report?.kind === 'members',
      ),
    ).toBe(false);
  });
});
