import { afterEach, describe, expect, it } from 'vitest';
import { mkdtemp, rm, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Pool } from 'pg';
import { startLocalDatabase } from '../../scripts/local-database.mjs';
import { ReportStore } from './store.js';
import { ReportingService } from './service.js';

const directories: string[] = [];
afterEach(async () => {
  for (const dir of directories.splice(0))
    await rm(dir, { recursive: true, force: true });
});
describe('Dockerloze lokale database', () => {
  it('past migraties toe, bewaart importoriginelen en instellingen na herstart en weigert een tweede proces', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'cop-persistent-'));
    directories.push(dir);
    let database = await startLocalDatabase(dir, { port: 0 });
    let pool = new Pool({ connectionString: database.connectionString });
    try {
      const store = new ReportStore(pool);
      await store.seed();
      await expect(startLocalDatabase(dir, { port: 0 })).rejects.toThrow(
        'vergrendeld',
      );
      await pool.query(
        'UPDATE report_settings SET settings=jsonb_set(settings,$1,$2::jsonb) WHERE organization_id=$3',
        ['{time}', '"09:15"', 'sport-society'],
      );
      const original = Buffer.from('private-test-fixture');
      await store.saveImport(
        'sport-society',
        {
          dataset: 'real',
          source: 'dewi-members',
          from: '2026-09-01',
          through: '2026-09-30',
          locations: ['achterveld'],
          complete: false,
        },
        'fixture.csv',
        original,
        'fixture-hash',
        [],
        null,
        'tester',
      );
      await pool.end();
      await database.close();
      database = await startLocalDatabase(dir, { port: 0 });
      pool = new Pool({ connectionString: database.connectionString });
      const reopened = new ReportStore(pool);
      expect((await reopened.settings('sport-society')).time).toBe('09:15');
      const imports = await reopened.imports('sport-society', 'real');
      expect(imports).toHaveLength(1);
      const stored = await reopened.original('sport-society', imports[0]!.id);
      expect(stored?.original).toEqual(original);
      expect(await reopened.imports('other', 'real')).toHaveLength(0);
    } finally {
      await pool.end();
      await database.close();
    }
  });
  it('maakt precies één eerste beheerder zonder verbinding-deadlock', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'cop-setup-persistent-'));
    directories.push(dir);
    const database = await startLocalDatabase(dir, { port: 0 });
    const pool = new Pool({ connectionString: database.connectionString });
    const service = new ReportingService();
    await service.pool.end();
    Object.assign(service, {
      pool,
      store: new ReportStore(pool),
      dataDirectory: dir,
    });
    try {
      await service.onModuleInit();
      expect(service.status().ready).toBe(true);
      const token = (await readFile(join(dir, 'setup-token'), 'utf8')).trim();
      const body = {
        token,
        email: 'bootstrap@fixture.invalid',
        name: 'Fixture',
        password: 'Fixture-long-password-2026',
      };
      const result = await Promise.allSettled([
        service.setup(body),
        service.setup(body),
      ]);
      expect(result.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
      expect(result.filter((r) => r.status === 'rejected')).toHaveLength(1);
      expect(service.status().setupRequired).toBe(false);
      expect(
        Number(
          (await pool.query('SELECT count(*) AS n FROM report_access')).rows[0]
            .n,
        ),
      ).toBe(1);
      const session = await service.auth.api.signInEmail({
        body: { email: body.email, password: body.password },
      });
      expect(session.user.email).toBe(body.email);
    } finally {
      await service.onModuleDestroy();
      await database.close();
    }
  }, 10000);
});
