import 'reflect-metadata';
import { beforeAll, afterAll, describe, it, expect } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Pool } from 'pg';
import type {
  Principal,
  EmployeeRecord,
  ShiftRecord,
  TaskRecord,
  TaskData,
} from '@cop/contracts';
import { startLocalDatabase } from '../../scripts/local-database.mjs';
import { ReportStore, sportSociety } from '../reporting/store.js';
import { WorkbookImports } from '../reporting/workbook-imports.js';
import { membersFixture } from '../reporting/workbook-fixtures.js';
import { OperationsStore } from './store.js';
import { memberDirectory } from './members.js';
import { Test } from '@nestjs/testing';
import { FastifyAdapter } from '@nestjs/platform-fastify';
import {
  ReportingService,
  requirePermission,
  WEB_ORIGIN,
} from '../reporting/service.js';
import { OperationsController } from './controller.js';
const admin: Principal = {
  userId: 'fixture-admin',
  organizationId: sportSociety.id,
  locations: null,
  permissions: [
    'operations.read',
    'operations.manage',
    'members.read',
    'reports.read',
    'reports.manage',
  ],
};
const manager: Principal = {
  ...admin,
  userId: 'fixture-manager',
  locations: ['achterveld'],
};
let directory: string,
  database: Awaited<ReturnType<typeof startLocalDatabase>>,
  pool: Pool,
  store: OperationsStore,
  workbooks: WorkbookImports;
beforeAll(async () => {
  directory = await mkdtemp(join(tmpdir(), 'cop-ops-'));
  database = await startLocalDatabase(directory, { port: 0 });
  pool = new Pool({ connectionString: database.connectionString });
  await new ReportStore(pool).seed();
  store = new OperationsStore(pool);
  workbooks = new WorkbookImports(pool);
  await pool.query(
    'INSERT INTO report_organizations(id,definition) VALUES($1,$2)',
    ['other', { ...sportSociety, id: 'other' }],
  );
}, 15000);
afterAll(async () => {
  await pool?.end();
  await database?.close();
  if (directory) await rm(directory, { recursive: true, force: true });
});
const task = (title: string): TaskData => ({
  title,
  description: '',
  assigneeId: null,
  dueDate: '2026-10-20',
  priority: 'normal',
  status: 'open',
});
const save = (
  kind: Parameters<OperationsStore['save']>[2]['kind'],
  data: unknown,
  locationId = 'achterveld',
  principal = admin,
  dataset: 'real' | 'demo' = 'real',
) => store.save(sportSociety, principal, { kind, data, locationId, dataset });
describe('lokale operationele werkruimte', () => {
  it('isoleert tenants, locaties, demo, persoonsgegevens en bewerkingen', async () => {
    await save('task', task('Achterveldtaak'));
    await save('task', task('Barneveldtaak'), 'barneveld');
    await save('task', task('Demotaak'), 'achterveld', admin, 'demo');
    expect(
      (await store.list(manager, 'real')).map(
        (r) => (r.data as TaskData).title,
      ),
    ).toEqual(['Achterveldtaak']);
    expect(
      await store.list({ ...admin, organizationId: 'other' }, 'real'),
    ).toEqual([]);
    await expect(
      save('task', task('Verboden'), 'barneveld', manager),
    ).rejects.toThrow('locatie');
    await expect(
      save('task', task('Verboden'), 'achterveld', {
        ...admin,
        organizationId: 'other',
      }),
    ).rejects.toThrow('werkruimte');
    await expect(
      save('task', task('Verboden'), 'achterveld', {
        ...manager,
        permissions: ['operations.read'],
      }),
    ).rejects.toThrow('werkruimte');
    await save('contact', {
      memberKey: 'achterveld:1',
      sourceId: 'fixture',
      note: 'Correctie',
      nextContact: null,
    });
    expect(
      (
        await store.list(
          { ...manager, permissions: ['operations.read'] },
          'real',
        )
      ).every((r) => r.kind !== 'contact'),
    ).toBe(true);
    await expect(
      memberDirectory(
        workbooks,
        { ...manager, permissions: ['operations.read'] },
        'real',
      ),
    ).rejects.toThrow('persoonsgegevens');
  });
  it('voorkomt verloren wijzigingen en dubbele brontaken zonder afgeronde taken te heropenen', async () => {
    const body = {
      kind: 'task' as const,
      dataset: 'real' as const,
      locationId: 'achterveld',
      data: task('Uniek signaal'),
    };
    const source = {
      key: 'fixture-report',
      source: { type: 'report' as const, key: 'fixture-report' },
    };
    const created = await store.save(sportSociety, admin, body, source),
      r = created.record as TaskRecord;
    await store.save(sportSociety, admin, {
      ...body,
      id: r.id,
      version: r.version,
      data: { ...r.data, status: 'done' },
    });
    await expect(
      store.save(sportSociety, admin, {
        ...body,
        id: r.id,
        version: r.version,
      }),
    ).rejects.toThrow('gewijzigd');
    const retry = await store.save(sportSociety, admin, body, source);
    expect(retry.duplicate).toBe(true);
    expect((retry.record.data as TaskData).status).toBe('done');
    await expect(
      store.save(sportSociety, admin, {
        ...body,
        id: r.id,
        version: 2,
        locationId: 'barneveld',
      }),
    ).rejects.toThrow('oorspronkelijke locatie');
  });
  it('controleert overlap tussen clubs atomair, vaardigheden, inzetbaarheid en aangrenzende tijden', async () => {
    const employee = (
      await save('employee', {
        name: 'Testplanner',
        number: 'P-001',
        locationIds: ['achterveld', 'barneveld'],
        skills: ['floor'],
        contractMinutes: 1200,
        active: true,
      })
    ).record as EmployeeRecord;
    await expect(
      save('employee', { ...employee.data, number: 'p-001' }),
    ).rejects.toThrow('bestaat al');
    await expect(
      save('employee', employee.data, 'achterveld', manager),
    ).rejects.toThrow('organisatierechten');
    const shift = {
      employeeId: employee.id,
      date: '2027-01-01',
      start: '09:00',
      end: '12:00',
      activity: 'floor',
      status: 'published',
      notes: '',
    };
    const results = await Promise.allSettled([
      save('shift', shift),
      save('shift', shift, 'barneveld'),
    ]);
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    expect(results.filter((r) => r.status === 'rejected')).toHaveLength(1);
    await expect(
      save('shift', { ...shift, start: '12:00', end: '13:00' }, 'barneveld'),
    ).resolves.toBeDefined();
    await expect(
      save(
        'shift',
        { ...shift, start: '13:00', end: '14:00', activity: 'pt' },
        'barneveld',
      ),
    ).rejects.toThrow('vaardigheid');
    await expect(
      save('shift', { ...shift, date: '2027-02-30' }),
    ).rejects.toThrow('datum');
    await expect(
      save('shift', { ...shift, start: '23:00', end: '02:00' }),
    ).rejects.toThrow('eindtijd');
    await expect(save('shift', shift, 'wekerom')).rejects.toThrow(
      'actieve medewerker',
    );
    await expect(
      store.save(sportSociety, admin, {
        kind: 'employee',
        dataset: 'real',
        locationId: employee.locationId,
        data: { ...employee.data, active: false },
        id: employee.id,
        version: employee.version,
      }),
    ).rejects.toThrow('toekomstige diensten');
    const scoped = (await store.list(manager, 'real')).find(
      (r) => r.id === employee.id,
    ) as EmployeeRecord;
    expect(scoped.data.locationIds).toEqual(['achterveld']);
    const assigned = (await store.list(admin, 'real')).find(
      (r) =>
        r.kind === 'shift' &&
        (r.data as ShiftRecord['data']).employeeId === employee.id,
    ) as ShiftRecord;
    await store.save(sportSociety, admin, {
      kind: 'shift',
      dataset: 'real',
      locationId: assigned.locationId,
      id: assigned.id,
      version: assigned.version,
      data: { ...assigned.data, status: 'cancelled' },
    });
  });
  it('maakt periodes herhaalbaar, bewaart snapshots en blokkeert onvolledige controles', async () => {
    const template = (
      await save('checklist', {
        title: 'Weekcontrole',
        items: ['AED controleren', 'Nooduitgang controleren'],
        cadence: 'weekly',
        startDate: '2026-12-28',
        assigneeId: null,
        active: true,
      })
    ).record;
    const first = await store.generateChecklists(
      sportSociety,
      admin,
      'real',
      '2027-01-01',
    );
    expect(first).toHaveLength(1);
    const run = first[0]!.record as TaskRecord;
    expect(run.data.dueDate).toBe('2027-01-03');
    expect(
      (
        await store.generateChecklists(
          sportSociety,
          admin,
          'real',
          '2027-01-03',
        )
      )[0]!.duplicate,
    ).toBe(true);
    await expect(
      store.save(sportSociety, admin, {
        dataset: 'real',
        kind: 'task',
        locationId: run.locationId,
        id: run.id,
        version: run.version,
        data: { ...run.data, status: 'done' },
      }),
    ).rejects.toThrow('controlepunten');
    const completed = await store.save(sportSociety, admin, {
      dataset: 'real',
      kind: 'task',
      locationId: run.locationId,
      id: run.id,
      version: run.version,
      data: {
        ...run.data,
        status: 'done',
        checks: run.data.checks!.map((c) => ({
          ...c,
          label: 'Poging wijziging',
          done: true,
        })),
      },
    });
    expect((completed.record.data as TaskData).checks![0]!.label).toBe(
      'AED controleren',
    );
    await store.save(sportSociety, admin, {
      dataset: 'real',
      kind: 'checklist',
      locationId: template.locationId,
      id: template.id,
      version: template.version,
      data: { ...template.data, items: ['Nieuw controlepunt'] },
    });
    const next = await store.generateChecklists(
      sportSociety,
      admin,
      'real',
      '2027-01-04',
    );
    expect(next[0]!.record.id).not.toBe(run.id);
    expect((next[0]!.record.data as TaskData).checks).toEqual([
      { label: 'Nieuw controlepunt', done: false },
    ]);
    const again = await store.generateChecklists(
      sportSociety,
      admin,
      'real',
      '2027-01-01',
    );
    expect((again[0]!.record.data as TaskData).status).toBe('done');
  });
  it('leidt leden alleen af uit toegankelijke bronnen met bronpeildatum en behoudt contactcorrecties', async () => {
    const bytes = await membersFixture();
    for (const locationId of ['achterveld', 'barneveld'])
      await workbooks.import(sportSociety, admin, {
        dataset: 'real',
        filename: `${locationId}.xlsx`,
        content: bytes.toString('base64'),
        locationId,
        asOf: '2026-10-01',
        scopeConfirmed: true,
      });
    const directory = await memberDirectory(workbooks, manager, 'real');
    expect(directory.members).toHaveLength(3);
    expect(directory.members.every((m) => m.locationId === 'achterveld')).toBe(
      true,
    );
    expect(directory.members[0]!.inactiveDays).toBe(30);
    expect(directory.members[1]!.inactiveDays).toBeNull();
    const barneveld = (
      await memberDirectory(workbooks, admin, 'real')
    ).sources.find((s) => s.locationId === 'barneveld')!;
    await expect(
      memberDirectory(workbooks, manager, 'real', barneveld.id),
    ).rejects.toThrow('locaties');
    const contact = (
      await save('contact', {
        memberKey: 'achterveld:1',
        sourceId: directory.sources[0]!.id,
        note: 'Contact opgenomen',
        nextContact: '2026-10-22',
      })
    ).record;
    await expect(
      store.save(sportSociety, admin, {
        kind: 'contact',
        dataset: 'real',
        locationId: 'achterveld',
        id: contact.id,
        version: contact.version,
        data: contact.data,
      }),
    ).rejects.toThrow('blijvend');
    expect(
      (await new OperationsStore(pool).list(admin, 'real')).some(
        (r) => r.id === contact.id,
      ),
    ).toBe(true);
  });
  it('handhaaft bronverificatie, leesrechten, oorsprong en idempotentie op de HTTP-routes', async () => {
    const module = await Test.createTestingModule({
      controllers: [OperationsController],
      providers: [
        {
          provide: ReportingService,
          useValue: {
            operations: store,
            workbooks,
            organization: async () => sportSociety,
            principal: async (
              headers: Headers,
              org: string,
              permission: Parameters<typeof requirePermission>[2],
            ) => {
              const principal = headers.get('x-reader')
                ? {
                    ...manager,
                    permissions: [
                      'operations.read',
                    ] as Principal['permissions'],
                  }
                : manager;
              requirePermission(principal, org, permission);
              return principal;
            },
            workbookDashboard: async () => ({
              organization: sportSociety,
              dataset: 'real',
              imports: [],
              combined: {
                periods: [
                  {
                    period: '202610',
                    attention: [
                      {
                        code: 'fixture',
                        message: 'Controleer rapportage',
                        locationId: 'achterveld',
                        sourceId: null,
                      },
                    ],
                  },
                ],
              },
            }),
          },
        },
      ],
    }).compile();
    const app = module.createNestApplication(new FastifyAdapter(), {
      logger: false,
    });
    app.setGlobalPrefix('api/v1');
    await app.init();
    await app.getHttpAdapter().getInstance().ready();
    try {
      const prefix = '/api/v1/organizations/sport-society/operations',
        headers = { origin: WEB_ORIGIN };
      const rejected = await app.inject({
        method: 'POST',
        url: `${prefix}/records`,
        payload: {
          kind: 'task',
          dataset: 'real',
          locationId: 'achterveld',
          data: task('CSRF'),
        },
      });
      expect(rejected.statusCode).toBe(400);
      const readonly = await app.inject({
        method: 'POST',
        url: `${prefix}/records`,
        headers: { ...headers, 'x-reader': '1' },
        payload: {
          kind: 'task',
          dataset: 'real',
          locationId: 'achterveld',
          data: task('Verboden'),
        },
      });
      expect(readonly.statusCode).toBe(403);
      const contact = await app.inject({
        method: 'POST',
        url: `${prefix}/records`,
        headers,
        payload: {
          dataset: 'real',
          kind: 'contact',
          locationId: 'achterveld',
          data: {
            memberKey: 'achterveld:999',
            sourceId: (await memberDirectory(workbooks, manager, 'real'))
              .sources[0]!.id,
            note: 'Ongeldig lid',
            nextContact: null,
          },
        },
      });
      expect(contact.statusCode).toBe(400);
      const alertBody = {
        dataset: 'real',
        period: '202610',
        code: 'fixture',
        locationId: 'achterveld',
      };
      const first = await app.inject({
        method: 'POST',
        url: `${prefix}/report-task`,
        headers,
        payload: alertBody,
      });
      expect(first.statusCode).toBe(201);
      const second = await app.inject({
        method: 'POST',
        url: `${prefix}/report-task`,
        headers,
        payload: alertBody,
      });
      expect(second.json().duplicate).toBe(true);
      expect(second.json().record.id).toBe(first.json().record.id);
      const forged = await app.inject({
        method: 'POST',
        url: `${prefix}/report-task`,
        headers,
        payload: { ...alertBody, locationId: 'barneveld' },
      });
      expect(forged.statusCode).toBe(400);
      const directory = await app.inject({
        method: 'GET',
        url: `${prefix}/members`,
        headers: { 'x-reader': '1' },
      });
      expect(directory.statusCode).toBe(403);
    } finally {
      await app.close();
    }
  });
});
