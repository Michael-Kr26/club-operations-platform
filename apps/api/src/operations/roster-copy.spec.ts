import 'reflect-metadata';
import { beforeAll, beforeEach, afterAll, expect, it } from 'vitest';
import { mkdtemp, rm, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Pool } from 'pg';
import type { EmployeeRecord, Principal, ShiftRecord } from '@cop/contracts';
import { startLocalDatabase } from '../../scripts/local-database.mjs';
import { ReportStore, sportSociety } from '../reporting/store.js';
import { OperationsStore } from './store.js';

const admin: Principal = {
  userId: 'fixture-roster',
  organizationId: sportSociety.id,
  locations: null,
  permissions: ['operations.read', 'operations.manage'],
};
const manager = { ...admin, locations: ['achterveld'] };
let directory: string,
  database: Awaited<ReturnType<typeof startLocalDatabase>>,
  pool: Pool,
  store: OperationsStore;
beforeAll(async () => {
  directory = await mkdtemp(join(tmpdir(), 'cop-roster-copy-'));
  database = await startLocalDatabase(directory, { port: 0 });
  pool = new Pool({ connectionString: database.connectionString });
  await new ReportStore(pool).seed();
  store = new OperationsStore(pool);
}, 60000);
beforeEach(async () => {
  await pool.query('DELETE FROM operation_roster_templates');
  await pool.query('DELETE FROM operation_records');
});
afterAll(async () => {
  await pool?.end();
  await database?.close();
  if (directory) await rm(directory, { recursive: true, force: true });
});
async function person() {
  return (
    await store.save(sportSociety, admin, {
      dataset: 'real',
      kind: 'employee',
      locationId: 'achterveld',
      data: {
        name: 'Fictieve medewerker',
        number: 'TEST-1',
        locationIds: ['achterveld', 'barneveld'],
        skills: ['floor'],
        contractMinutes: 1200,
        active: true,
      },
    })
  ).record as EmployeeRecord;
}
async function shift(
  employeeId: string | null,
  date = '2027-03-22',
  locationId = 'achterveld',
  status = 'published',
) {
  return (
    await store.save(sportSociety, admin, {
      dataset: 'real',
      kind: 'shift',
      locationId,
      data: {
        employeeId,
        date,
        start: '09:00',
        end: '12:00',
        shiftType: 'internship',
        activity: 'floor',
        status,
        notes: 'Fictieve stage-afspraak',
      },
    })
  ).record as ShiftRecord;
}
const all = async () =>
  (await store.list(admin, 'real')).filter(
    (r) => r.kind === 'shift',
  ) as ShiftRecord[];
async function basis() {
  const employee = await person();
  const first = await shift(employee.id);
  await shift(employee.id, '2027-03-24');
  await shift(null, '2027-03-26', 'achterveld', 'draft');
  await store.saveRosterTemplate(sportSociety, admin, {
    dataset: 'real',
    locationId: 'achterveld',
    from: '2027-03-22',
    version: 0,
  });
  return { employee, first };
}
const apply = (weekStart = '2027-03-29', weeks = 1, version = 1) =>
  store.applyRosterTemplate(sportSociety, admin, {
    dataset: 'real',
    locationId: 'achterveld',
    weekStart,
    weeks,
    version,
  });

it('kopieert een dienst één keer, bewaart alle velden en laat de bron definitief staan', async () => {
  const original = await shift((await person()).id);
  const input = {
    dataset: 'real' as const,
    id: original.id,
    version: original.version,
    date: '2027-03-28',
  };
  const results = await Promise.all([
    store.copyShift(sportSociety, admin, input),
    store.copyShift(sportSociety, admin, input),
  ]);
  expect(results.map((r) => r.created).sort()).toEqual([0, 1]);
  const records = await all();
  expect(records.find((r) => r.id === original.id)?.data).toEqual(
    original.data,
  );
  expect(records.find((r) => r.id !== original.id)?.data).toEqual({
    ...original.data,
    date: '2027-03-28',
    status: 'draft',
  });
  expect(new Set(records.map((r) => r.id)).size).toBe(2);
});
it('weigert overlap over clubs, dezelfde dag, verlopen versies en geannuleerde bronnen', async () => {
  const employee = await person(),
    original = await shift(employee.id);
  await shift(employee.id, '2027-03-23', 'barneveld');
  const input = {
    dataset: 'real' as const,
    id: original.id,
    version: original.version,
    date: '2027-03-23',
  };
  await expect(store.copyShift(sportSociety, admin, input)).rejects.toThrow(
    'overlappende',
  );
  await expect(
    store.copyShift(sportSociety, admin, {
      ...input,
      date: original.data.date,
    }),
  ).rejects.toThrow('andere dag');
  await expect(
    store.copyShift(sportSociety, admin, { ...input, version: 0 }),
  ).rejects.toThrow('gewijzigd');
  const cancelled = (
    await store.save(sportSociety, admin, {
      kind: 'shift',
      dataset: 'real',
      locationId: original.locationId,
      id: original.id,
      version: original.version,
      data: { ...original.data, status: 'cancelled' },
    })
  ).record;
  await expect(
    store.copyShift(sportSociety, admin, {
      ...input,
      version: cancelled.version,
    }),
  ).rejects.toThrow('geannuleerde');
  expect(await all()).toHaveLength(2);
});
it('isoleert locatie, organisatie en dataset en weigert leesaccounts ook bij directe aanroep', async () => {
  const original = await shift((await person()).id, '2027-03-22', 'barneveld');
  const input = {
    dataset: 'real' as const,
    id: original.id,
    version: original.version,
    date: '2027-03-23',
  };
  await expect(store.copyShift(sportSociety, manager, input)).rejects.toThrow(
    'locatie',
  );
  await expect(
    store.copyShift(
      sportSociety,
      { ...admin, permissions: ['operations.read'] },
      input,
    ),
  ).rejects.toThrow('werkruimte');
  await expect(
    store.copyShift(sportSociety, { ...admin, organizationId: 'other' }, input),
  ).rejects.toThrow('werkruimte');
  await expect(
    store.copyShift(sportSociety, admin, { ...input, dataset: 'demo' }),
  ).rejects.toThrow('niet gevonden');
  await expect(
    store.saveRosterTemplate(sportSociety, manager, {
      dataset: 'real',
      locationId: 'barneveld',
      from: '2027-03-22',
      version: 0,
    }),
  ).rejects.toThrow('locatie');
  await store.saveRosterTemplate(sportSociety, admin, {
    dataset: 'real',
    locationId: 'barneveld',
    from: '2027-03-22',
    version: 0,
  });
  expect(await store.rosterTemplates(sportSociety, manager, 'real')).toEqual(
    [],
  );
  expect(await store.rosterTemplates(sportSociety, admin, 'demo')).toEqual([]);
  await expect(
    store.applyRosterTemplate(sportSociety, manager, {
      dataset: 'real',
      locationId: 'barneveld',
      weekStart: '2027-03-29',
      weeks: 1,
      version: 1,
    }),
  ).rejects.toThrow('locatie');
});
it('bewaart een basisweek in de database en zet opeenvolgende weken met dezelfde lokale tijden klaar', async () => {
  await basis();
  expect(
    (
      await new OperationsStore(pool).rosterTemplates(
        sportSociety,
        admin,
        'real',
      )
    )[0],
  ).toMatchObject({
    locationId: 'achterveld',
    sourceWeek: '2027-03-22',
    shiftCount: 3,
    version: 1,
  });
  expect(await apply('2027-03-29', 2)).toEqual({ created: 6, skipped: 0 });
  const copies = (await all()).filter((r) => r.data.date >= '2027-03-29');
  expect(copies.map((r) => r.data.date).sort()).toEqual([
    '2027-03-29',
    '2027-03-31',
    '2027-04-02',
    '2027-04-05',
    '2027-04-07',
    '2027-04-09',
  ]);
  expect(
    copies.every(
      (r) =>
        r.data.start === '09:00' &&
        r.data.end === '12:00' &&
        r.data.shiftType === 'internship' &&
        r.data.status === 'draft' &&
        r.data.notes === 'Fictieve stage-afspraak',
    ),
  ).toBe(true);
});
it('voorkomt dubbele weken en behoudt handmatige wijzigingen en annuleringen bij opnieuw toepassen', async () => {
  await basis();
  const concurrent = await Promise.all([apply(), apply()]);
  expect(concurrent.map((r) => r.created).sort()).toEqual([0, 3]);
  const copy = (await all()).find((r) => r.data.date === '2027-03-29')!;
  await store.save(sportSociety, admin, {
    kind: 'shift',
    dataset: 'real',
    locationId: copy.locationId,
    id: copy.id,
    version: copy.version,
    data: { ...copy.data, start: '10:00', status: 'cancelled' },
  });
  expect(await apply()).toEqual({ created: 0, skipped: 3 });
  expect((await all()).find((r) => r.id === copy.id)?.data).toMatchObject({
    start: '10:00',
    status: 'cancelled',
  });
  expect(await all()).toHaveLength(6);
});
it('draait ook eerdere doelweken terug als een latere week al gevuld is', async () => {
  await basis();
  await shift(null, '2027-04-05');
  await expect(apply('2027-03-29', 2)).rejects.toThrow(
    'Er is niets toegevoegd',
  );
  expect((await all()).filter((r) => r.data.date >= '2027-03-29')).toHaveLength(
    1,
  );
});
it('controleert overlap met een andere club tijdens toepassen en draait het hele weekrooster terug', async () => {
  const { employee } = await basis();
  await shift(employee.id, '2027-03-31', 'barneveld');
  await expect(apply()).rejects.toThrow('overlappende');
  expect(
    (await all()).filter(
      (r) => r.locationId === 'achterveld' && r.data.date >= '2027-03-29',
    ),
  ).toEqual([]);
});
it('beschermt wijzigingen van het basisrooster en begrenst de doelperiode', async () => {
  await basis();
  await expect(
    store.saveRosterTemplate(sportSociety, admin, {
      dataset: 'real',
      locationId: 'achterveld',
      from: '2027-03-22',
      version: 0,
    }),
  ).rejects.toThrow('gewijzigd');
  await expect(apply('2027-03-29', 1, 0)).rejects.toThrow('gewijzigd');
  await expect(apply('2027-03-30')).rejects.toThrow('maandag');
  await expect(apply('2027-03-29', 13)).rejects.toThrow('1 tot 12');
  await expect(
    store.saveRosterTemplate(sportSociety, admin, {
      dataset: 'real',
      locationId: 'achterveld',
      from: '2027-04-12',
      version: 1,
    }),
  ).rejects.toThrow('1 tot 500');
});

async function twoWeeks() {
  const employeeA = await person();
  const employeeB = (
    await store.save(sportSociety, admin, {
      kind: 'employee',
      dataset: 'real',
      locationId: 'achterveld',
      data: {
        ...employeeA.data,
        name: 'Fictieve zondagcollega',
        number: 'TEST-2',
      },
    })
  ).record as EmployeeRecord;
  await shift(employeeA.id, '2026-12-21');
  await shift(employeeA.id, '2026-12-27');
  await shift(employeeA.id, '2026-12-28');
  await shift(employeeB.id, '2027-01-03');
  for (const [slot, from] of [
    ['A', '2026-12-21'],
    ['B', '2026-12-28'],
  ] as const)
    await store.saveRosterTemplate(sportSociety, admin, {
      dataset: 'real',
      locationId: 'achterveld',
      from,
      slot,
      version: 0,
    });
  return { employeeA, employeeB };
}
const alternateWeeks = (
  slot: 'A' | 'B' = 'A',
  weekStart = '2027-01-04',
  weeks = 4,
  otherVersion = 1,
) =>
  store.applyRosterTemplate(sportSociety, admin, {
    dataset: 'real',
    locationId: 'achterveld',
    weekStart,
    weeks,
    slot,
    alternate: true,
    version: 1,
    otherVersion,
  });

it('bewaart A en B apart en wisselt de zondagbezetting af over de jaargrens', async () => {
  const { employeeA, employeeB } = await twoWeeks();
  const templates = await new OperationsStore(pool).rosterTemplates(
    sportSociety,
    admin,
    'real',
  );
  expect(templates.map((t) => [t.slot, t.shiftCount, t.version])).toEqual([
    ['A', 2, 1],
    ['B', 2, 1],
  ]);
  expect(new Set(templates.map((t) => t.id)).size).toBe(2);
  expect(await alternateWeeks('A', '2027-12-27', 4)).toEqual({
    created: 8,
    skipped: 0,
  });
  const sundays = (await all())
    .filter(
      (r) =>
        r.data.date >= '2027-12-27' && new Date(r.data.date).getUTCDay() === 0,
    )
    .sort((a, b) => a.data.date.localeCompare(b.data.date));
  expect(sundays.map((r) => [r.data.date, r.data.employeeId])).toEqual([
    ['2028-01-02', employeeA.id],
    ['2028-01-09', employeeB.id],
    ['2028-01-16', employeeA.id],
    ['2028-01-23', employeeB.id],
  ]);
  expect(sundays.every((r) => r.data.status === 'draft')).toBe(true);
  expect(await alternateWeeks('A', '2027-12-27', 4)).toEqual({
    created: 0,
    skipped: 8,
  });
});
it('kan beginnen bij B en bewaart weekuitzonderingen bij herhaald afwisselen', async () => {
  const { employeeB } = await twoWeeks();
  expect(await alternateWeeks('B', '2027-01-04', 3)).toEqual({
    created: 6,
    skipped: 0,
  });
  const sunday = (await all()).find((r) => r.data.date === '2027-01-10')!;
  expect(sunday.data.employeeId).toBe(employeeB.id);
  await store.save(sportSociety, admin, {
    kind: 'shift',
    dataset: 'real',
    locationId: 'achterveld',
    id: sunday.id,
    version: sunday.version,
    data: { ...sunday.data, status: 'cancelled', notes: 'Weekuitzondering' },
  });
  expect(await alternateWeeks('B', '2027-01-04', 3)).toEqual({
    created: 0,
    skipped: 6,
  });
  expect((await all()).find((r) => r.id === sunday.id)?.data).toMatchObject({
    status: 'cancelled',
    notes: 'Weekuitzondering',
  });
  await expect(alternateWeeks('A', '2027-01-04', 3)).rejects.toThrow(
    'bevat al diensten',
  );
});
it('weigert ontbrekende of verouderde B zonder A-weken alvast toe te voegen', async () => {
  await basis();
  await expect(alternateWeeks()).rejects.toThrow('basisweek B');
  expect((await all()).filter((r) => r.data.date < '2027-03-22')).toEqual([]);
  await store.saveRosterTemplate(sportSociety, admin, {
    dataset: 'real',
    locationId: 'achterveld',
    slot: 'B',
    from: '2027-03-22',
    version: 0,
  });
  await expect(alternateWeeks('A', '2027-04-05', 4, 0)).rejects.toThrow(
    'Basisweek B is gewijzigd',
  );
  expect((await all()).filter((r) => r.data.date >= '2027-04-05')).toEqual([]);
  await store.saveRosterTemplate(sportSociety, admin, {
    dataset: 'real',
    locationId: 'achterveld',
    slot: 'B',
    from: '2027-03-22',
    version: 1,
  });
  expect(
    (await store.rosterTemplates(sportSociety, admin, 'real')).map((t) => [
      t.slot,
      t.version,
    ]),
  ).toEqual([
    ['A', 1],
    ['B', 2],
  ]);
});
it('draait de volledige A/B-reeks terug bij een conflict in een B-zondag', async () => {
  const { employeeB } = await twoWeeks();
  await shift(employeeB.id, '2027-01-17', 'barneveld');
  await expect(alternateWeeks()).rejects.toThrow('overlappende');
  expect(
    (await all()).filter(
      (r) => r.locationId === 'achterveld' && r.data.date >= '2027-01-04',
    ),
  ).toEqual([]);
});
it('houdt B binnen dezelfde locatie- en datasetscope en weigert onbekende varianten', async () => {
  await twoWeeks();
  expect(await store.rosterTemplates(sportSociety, manager, 'demo')).toEqual(
    [],
  );
  expect(
    await store.rosterTemplates(
      sportSociety,
      { ...manager, locations: ['barneveld'] },
      'real',
    ),
  ).toEqual([]);
  const input = {
    dataset: 'real' as const,
    locationId: 'achterveld',
    weekStart: '2027-01-04',
    weeks: 2,
    slot: 'B' as const,
    version: 1,
    alternate: true,
    otherVersion: 1,
  };
  await expect(
    store.applyRosterTemplate(
      sportSociety,
      { ...manager, locations: ['barneveld'] },
      input,
    ),
  ).rejects.toThrow('locatie');
  await expect(
    store.applyRosterTemplate(sportSociety, admin, {
      ...input,
      dataset: 'demo',
    }),
  ).rejects.toThrow('basisweek B');
  await expect(
    store.applyRosterTemplate(sportSociety, admin, {
      ...input,
      slot: 'C' as 'A',
    }),
  ).rejects.toThrow('Ongeldige keuze');
  await expect(
    store.applyRosterTemplate(sportSociety, admin, {
      ...input,
      alternate: 'true' as unknown as boolean,
    }),
  ).rejects.toThrow('afwisselen');
});
it('behoudt het bestaande basisrooster als A bij migratie en laat daarna B toe', async () => {
  // Reconstruct the previous schema in an isolated test transaction, then run the actual upgrade.
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(
      'ALTER TABLE operation_roster_templates DROP CONSTRAINT roster_template_slot',
    );
    await client.query('DROP INDEX roster_template_location_slot');
    await client.query(
      'ALTER TABLE operation_roster_templates DROP COLUMN slot',
    );
    await client.query(
      'CREATE UNIQUE INDEX roster_template_location ON operation_roster_templates(organization_id,dataset,location_id)',
    );
    await client.query(
      "INSERT INTO operation_roster_templates(id,organization_id,dataset,location_id,source_week,entries,version,updated_by) VALUES('legacy',$1,'real','achterveld','2026-12-21','[]',4,'fixture')",
      [sportSociety.id],
    );
    const sql = await readFile(
      new URL(
        '../../../../packages/db/migrations/0008_roster_week_variants.sql',
        import.meta.url,
      ),
      'utf8',
    );
    for (const statement of sql.split('--> statement-breakpoint'))
      await client.query(statement);
    expect(
      (
        await client.query(
          "SELECT id,slot,version FROM operation_roster_templates WHERE id='legacy'",
        )
      ).rows,
    ).toEqual([{ id: 'legacy', slot: 'A', version: 4 }]);
    await client.query(
      "INSERT INTO operation_roster_templates(id,organization_id,dataset,location_id,source_week,entries,updated_by,slot) VALUES('variant-b',$1,'real','achterveld','2026-12-28','[]','fixture','B')",
      [sportSociety.id],
    );
    expect(
      (
        await client.query(
          'SELECT count(*)::int AS count FROM operation_roster_templates',
        )
      ).rows[0].count,
    ).toBe(2);
  } finally {
    await client.query('ROLLBACK');
    client.release();
  }
});
