import { beforeAll, afterAll, describe, it, expect } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Pool } from 'pg';
import type { Principal } from '@cop/contracts';
import { startLocalDatabase } from '../../scripts/local-database.mjs';
import { ReportStore } from '../reporting/store.js';
import { InventoryStore } from './inventory.js';

const admin: Principal = {
  userId: 'inventory-admin',
  organizationId: 'sport-society',
  locations: null,
  permissions: ['operations.read', 'operations.manage'],
};
let dir: string,
  database: Awaited<ReturnType<typeof startLocalDatabase>>,
  pool: Pool,
  inventory: InventoryStore;
beforeAll(async () => {
  dir = await mkdtemp(join(tmpdir(), 'cop-inventory-'));
  database = await startLocalDatabase(dir, { port: 0 });
  pool = new Pool({ connectionString: database.connectionString });
  await new ReportStore(pool).seed();
  await pool.query(
    'INSERT INTO report_organizations(id,definition) VALUES($1,$2)',
    [
      'inventory-other',
      { id: 'inventory-other', name: 'Other', locations: [] },
    ],
  );
  inventory = new InventoryStore(pool);
}, 60000);
afterAll(async () => {
  await pool?.end();
  await database?.close();
  if (dir) await rm(dir, { recursive: true, force: true });
});

describe('centrale voorraad', () => {
  it('bewaart opgegeven aantallen, scheidt onbekend van nul en overschrijft niets bij opnieuw starten', async () => {
    const initial = await inventory.read('sport-society', admin, 'real');
    expect(initial.items[0]?.quantities).toEqual({
      S: null,
      M: 2,
      L: 2,
      XL: 3,
      XXL: null,
    });
    expect(initial.items[3]?.quantities.total).toBeNull();
    const items = structuredClone(initial.items);
    items[0]!.quantities.S = 0;
    items[0]!.quantities.M = 1;
    items[3]!.quantities.total = 4;
    const saved = await inventory.save('sport-society', admin, {
      dataset: 'real',
      version: initial.version,
      items,
    });
    expect(saved.version).toBe(initial.version + 1);
    await new ReportStore(pool).seed();
    expect(
      (await new InventoryStore(pool).read('sport-society', admin, 'real'))
        .items,
    ).toEqual(items);
    expect(
      (await inventory.read('sport-society', admin, 'demo')).items,
    ).toEqual([]);
    const audit = await pool.query(
      "SELECT detail FROM report_audit WHERE action='inventory.updated'",
    );
    expect(audit.rows[0].detail.items).toEqual(items);
  });
  it('weigert verouderde versies, negatieve/breuk-aantallen en ontbrekende velden', async () => {
    const current = await inventory.read('sport-society', admin, 'real');
    await expect(
      inventory.save('sport-society', admin, {
        dataset: 'real',
        version: 1,
        items: current.items,
      }),
    ).rejects.toThrow('ondertussen gewijzigd');
    for (const n of [-1, 1.5, '2', 1000001, undefined]) {
      const items = structuredClone(current.items);
      Object.assign(items[3]!.quantities, { total: n });
      await expect(
        inventory.save('sport-society', admin, {
          dataset: 'real',
          version: current.version,
          items,
        }),
      ).rejects.toThrow('hele aantallen');
    }
    expect((await inventory.read('sport-society', admin, 'real')).version).toBe(
      current.version,
    );
  });
  it('beschermt centrale voorraad tegen andere tenants, locatiemanagers en alleen-lezen accounts', async () => {
    await expect(
      inventory.read(
        'sport-society',
        { ...admin, organizationId: 'inventory-other' },
        'real',
      ),
    ).rejects.toThrow('toegang');
    await expect(
      inventory.read(
        'sport-society',
        { ...admin, locations: ['achterveld'] },
        'real',
      ),
    ).rejects.toThrow('hele organisatie');
    const reader = {
      ...admin,
      permissions: ['operations.read'] as Principal['permissions'],
    };
    expect(
      (await inventory.read('sport-society', reader, 'real')).canWrite,
    ).toBe(false);
    await expect(
      inventory.save('sport-society', reader, {
        dataset: 'real',
        version: 0,
        items: [],
      }),
    ).rejects.toThrow('toegang');
    const other = { ...admin, organizationId: 'inventory-other' };
    expect(
      (await inventory.read('inventory-other', other, 'real')).items,
    ).toEqual([]);
    const competing = await Promise.allSettled(
      [1, 2].map((n) =>
        inventory.save('inventory-other', other, {
          dataset: 'real',
          version: 0,
          items: [
            {
              id: 'bag',
              name: 'Tas',
              category: 'merch',
              quantities: { total: n },
            },
          ],
        }),
      ),
    );
    expect(
      competing.filter((result) => result.status === 'fulfilled'),
    ).toHaveLength(1);
    expect(
      competing.filter((result) => result.status === 'rejected'),
    ).toHaveLength(1);
  });
});
