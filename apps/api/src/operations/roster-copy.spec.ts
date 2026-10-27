import 'reflect-metadata';
import { beforeAll, beforeEach, afterAll, expect, it } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
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
