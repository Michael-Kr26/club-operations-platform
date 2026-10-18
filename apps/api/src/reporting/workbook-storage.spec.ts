import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Pool } from 'pg';
import type { Principal } from '@cop/contracts';
import { startLocalDatabase } from '../../scripts/local-database.mjs';
import { WorkbookImports } from './workbook-imports.js';
import { ReportStore, sportSociety } from './store.js';
import { requirePermission } from './service.js';
import { forecastFixture, healthplannerFixture } from './workbook-fixtures.js';
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
}, 10000);
afterAll(async () => {
  await pool?.end();
  await database?.close();
  if (directory) await rm(directory, { recursive: true, force: true });
});
describe('lokaal bewaarde werkboeken', () => {
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
});
