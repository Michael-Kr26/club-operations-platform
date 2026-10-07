import 'reflect-metadata';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { readFile, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { PGlite } from '@electric-sql/pglite';
import { PGLiteSocketServer } from '@electric-sql/pglite-socket';
import { Pool } from 'pg';
import { betterAuth } from 'better-auth';
import {
  FastifyAdapter,
  type NestFastifyApplication,
} from '@nestjs/platform-fastify';
import { Test } from '@nestjs/testing';
import { ReportStore, defaultSettings, sportSociety } from './store.js';
import { calculateReport } from './calculation.js';
import { deliver } from './delivery.js';
import {
  ReportingService,
  requirePermission,
  scopedOrganization,
} from './service.js';
import { LocalAuthController, ReportsController } from './controller.js';
import type { Principal } from '@cop/contracts';

describe('PostgreSQL-protocol opslag en servertoegang (PGlite)', () => {
  let db: PGlite,
    server: PGLiteSocketServer,
    pool: Pool,
    store: ReportStore,
    app: NestFastifyApplication,
    dir: string;
  let cookie = '';
  const manager: Principal = {
    userId: 'manager',
    organizationId: 'sport-society',
    permissions: ['reports.read'],
    locations: ['achterveld'],
  };
  beforeAll(async () => {
    db = await PGlite.create();
    const migration = await readFile(
      new URL(
        '../../../../packages/db/migrations/0000_local_reports.sql',
        import.meta.url,
      ),
      'utf8',
    );
    await db.exec(migration);
    server = new PGLiteSocketServer({
      db,
      port: 0,
      host: '127.0.0.1',
      maxConnections: 20,
    });
    await server.start();
    pool = new Pool({
      connectionString: `postgresql://postgres:postgres@${server.getServerConn()}/postgres`,
    });
    store = new ReportStore(pool);
    await store.seed();
    await pool.query(
      'INSERT INTO report_organizations(id,definition) VALUES($1,$2)',
      [
        'other',
        {
          id: 'other',
          name: 'Andere organisatie',
          locations: [{ id: 'elsewhere', name: 'Elders' }],
        },
      ],
    );
    const auth = betterAuth({
      database: pool,
      secret: 'test-only-secret-at-least-32-characters-long',
      baseURL: 'http://localhost:3000',
      basePath: '/api/v1/local-auth',
      trustedOrigins: ['http://localhost:5173'],
      emailAndPassword: { enabled: true },
      advanced: { useSecureCookies: false },
    });
    const user = await auth.api.signUpEmail({
      body: {
        email: 'admin@example.invalid',
        name: 'Test beheerder',
        password: 'A-long-test-only-password-42',
      },
    });
    await pool.query(
      'INSERT INTO report_access(user_id,organization_id,permissions,locations) VALUES($1,$2,$3,NULL)',
      [
        user.user.id,
        'sport-society',
        JSON.stringify(['reports.read', 'reports.manage']),
      ],
    );
    dir = await mkdtemp(join(tmpdir(), 'cop-report-test-'));
    // Inject storage/auth without running production scheduler during tests.
    const service = new ReportingService();
    await service.pool.end();
    Object.assign(service, {
      pool,
      store,
      auth,
      ready: true,
      dataDirectory: dir,
    });
    const module = await Test.createTestingModule({
      controllers: [LocalAuthController, ReportsController],
      providers: [{ provide: ReportingService, useValue: service }],
    }).compile();
    // Nest metadata is emitted by the production build; Vitest/esbuild doesn't emit constructor param types.
    app = module.createNestApplication<NestFastifyApplication>(
      new FastifyAdapter(),
    );
    app.setGlobalPrefix('api/v1');
    await app.init();
    await app.getHttpAdapter().getInstance().ready();
  }, 30000);
  afterAll(async () => {
    if (app) await app.close();
    else if (pool) await pool.end();
    if (server) await server.stop();
    if (db) await db.close();
    if (dir) await rm(dir, { recursive: true, force: true });
  });
  it('bewaart originele bytes, dedupe per tenant/dataset en geen kruisdownload', async () => {
    const meta = {
      dataset: 'real' as const,
      source: 'dewi-members' as const,
      from: '2026-09-01',
      through: '2026-09-30',
      locations: ['achterveld'],
      complete: true,
    };
    const bytes = Buffer.from('private-original');
    const a = await store.saveImport(
      'sport-society',
      meta,
      'members.csv',
      bytes,
      'same-hash',
      [],
      null,
      'admin',
    );
    const b = await store.saveImport(
      'sport-society',
      meta,
      'members.csv',
      bytes,
      'same-hash',
      [],
      null,
      'admin',
    );
    expect(a.duplicate).toBe(false);
    expect(b.duplicate).toBe(true);
    expect(
      (await store.original('sport-society', a.id))?.original.equals(bytes),
    ).toBe(true);
    expect(await store.original('other', a.id)).toBeNull();
    expect(await store.imports('other', 'real')).toEqual([]);
    const demo = await store.saveImport(
      'sport-society',
      { ...meta, dataset: 'demo' },
      'demo.csv',
      bytes,
      'same-hash',
      [],
      null,
      'admin',
    );
    expect(demo.duplicate).toBe(false);
  });
  it('claimt één verzending bij gelijktijdige processen en na herstart', async () => {
    const report = calculateReport(
      sportSociety,
      [],
      'demo',
      'daily',
      '2026-09-18',
      defaultSettings,
    );
    let captures = 0;
    const mailer = {
      capture: async () => {
        captures++;
      },
    };
    const result = await Promise.all([
      deliver(store, mailer, 'sport-society', report, defaultSettings, 'admin'),
      deliver(
        new ReportStore(pool),
        mailer,
        'sport-society',
        report,
        defaultSettings,
        'admin',
      ),
    ]);
    expect(captures).toBe(1);
    expect(result.filter((r) => 'duplicate' in r && r.duplicate)).toHaveLength(
      1,
    );
    expect(
      await deliver(
        new ReportStore(pool),
        mailer,
        'sport-society',
        report,
        defaultSettings,
        'admin',
      ),
    ).toEqual({ duplicate: true });
    const run = (await store.runs('sport-society', 'demo')).find(
      (r) => r.reportDate === '2026-09-18',
    );
    expect(run?.status).toBe('captured');
    expect(run?.preview?.text).toContain('onbekend');
  });
  it('herhaalt SMTP-onzekerheid niet en markeert achtergebleven claims', async () => {
    const report = calculateReport(
      sportSociety,
      [],
      'demo',
      'daily',
      '2026-09-19',
      defaultSettings,
    );
    const mailer = {
      capture: async () => {
        throw new Error('SMTP response lost');
      },
    };
    expect(
      await deliver(
        store,
        mailer,
        'sport-society',
        report,
        defaultSettings,
        'admin',
      ),
    ).toMatchObject({ status: 'uncertain' });
    expect(
      await deliver(
        store,
        mailer,
        'sport-society',
        report,
        defaultSettings,
        'admin',
      ),
    ).toEqual({ duplicate: true });
    const id = await store.claim(
      'sport-society',
      'demo',
      'daily',
      '2026-09-20',
      'admin',
    );
    await pool.query(
      "UPDATE report_runs SET created_at=now()-interval '11 minutes' WHERE id=$1",
      [id],
    );
    await store.recoverClaims();
    expect(
      (await store.runs('sport-society', 'demo')).find((r) => r.id === id)
        ?.status,
    ).toBe('uncertain');
  });
  it('controleert acties en locaties aan serverkant', () => {
    expect(() =>
      requirePermission(null, 'sport-society', 'reports.read'),
    ).toThrow();
    expect(() => requirePermission(manager, 'other', 'reports.read')).toThrow();
    expect(() =>
      requirePermission(manager, 'sport-society', 'reports.manage'),
    ).toThrow();
    expect(
      scopedOrganization(sportSociety, manager).locations.map((l) => l.id),
    ).toEqual(['achterveld']);
    const forged = {
      ...manager,
      permissions: [
        'reports.read',
        'reports.manage',
      ] as Principal['permissions'],
    };
    expect(() =>
      requirePermission(forged, 'sport-society', 'reports.manage'),
    ).toThrow();
  });
  it('HTTP weigert zonder sessie en publieke registratie', async () => {
    const f = app.getHttpAdapter().getInstance();
    expect(
      (
        await f.inject({
          url: '/api/v1/organizations/sport-society/reports?date=2026-09-30',
        })
      ).statusCode,
    ).toBe(401);
    expect(
      (
        await f.inject({
          method: 'POST',
          url: '/api/v1/local-auth/sign-up/email',
          payload: {},
        })
      ).statusCode,
    ).toBe(404);
  });
  it('HTTP logt in met HttpOnly sessie, redigeert clubscope en weigert andere tenant', async () => {
    const f = app.getHttpAdapter().getInstance();
    const login = await f.inject({
      method: 'POST',
      url: '/api/v1/local-auth/sign-in/email',
      headers: { origin: 'http://localhost:5173' },
      payload: {
        email: 'admin@example.invalid',
        password: 'A-long-test-only-password-42',
      },
    });
    expect(login.statusCode, login.body).toBe(200);
    const raw = login.headers['set-cookie'];
    const cookies = Array.isArray(raw) ? raw : [raw];
    expect(cookies.join(';')).toContain('HttpOnly');
    cookie = cookies.map((c: string) => c.split(';')[0]).join('; ');
    const own = await f.inject({
      url: '/api/v1/organizations/sport-society/reports?date=2026-09-30',
      headers: { cookie },
    });
    expect(own.statusCode, own.body).toBe(200);
    expect(own.json().clubs).toHaveLength(5);
    expect(
      (
        await f.inject({
          url: '/api/v1/organizations/other/reports?date=2026-09-30',
          headers: { cookie },
        })
      ).statusCode,
    ).toBe(403);
    const userId = own.json().organization.id;
    expect(userId).toBe('sport-society');
    const demo = await f.inject({
      method: 'POST',
      url: '/api/v1/organizations/sport-society/reports/demo',
      headers: { cookie, origin: 'http://localhost:5173' },
      payload: { date: '2026-09-30' },
    });
    expect(demo.statusCode, demo.body).toBe(201);
    expect(demo.json()).toHaveLength(3);
    expect(
      demo.json().every((i: { status: string }) => i.status === 'accepted'),
    ).toBe(true);
    const demoAgain = await f.inject({
      method: 'POST',
      url: '/api/v1/organizations/sport-society/reports/demo',
      headers: { cookie, origin: 'http://localhost:5173' },
      payload: { date: '2026-09-30' },
    });
    expect(
      demoAgain.json().every((i: { duplicate: boolean }) => i.duplicate),
    ).toBe(true);
    const simulated = await f.inject({
      url: '/api/v1/organizations/sport-society/reports?date=2026-09-30&kind=monthly&dataset=demo',
      headers: { cookie },
    });
    expect(simulated.json().total.active).toBeGreaterThan(0);
    expect(simulated.json().dataset).toBe('demo');
    const real = await f.inject({
      url: '/api/v1/organizations/sport-society/reports?date=2026-09-30&kind=monthly&dataset=real',
      headers: { cookie },
    });
    expect(real.json().total.active).toBeNull();
    const meta = {
      source: 'dewi-members',
      dataset: 'demo',
      from: '2026-09-01',
      through: '2026-09-30',
      complete: true,
      locations: ['achterveld'],
    };
    const content = Buffer.from(
      'subscriptionId,memberId,locationId,startDate,endDate,cancellationRequestedDate,pauseStart,pauseEnd,pauseKind\nsame,m1,achterveld,2026-01-01,,,,,',
    ).toString('base64');
    const first = await f.inject({
      method: 'POST',
      url: '/api/v1/organizations/sport-society/reports/imports',
      headers: { cookie, origin: 'http://localhost:5173' },
      payload: { meta, filename: 'same.csv', content },
    });
    expect(first.json().duplicate).toBe(false);
    const second = await f.inject({
      method: 'POST',
      url: '/api/v1/organizations/sport-society/reports/imports',
      headers: { cookie, origin: 'http://localhost:5173' },
      payload: {
        meta: {
          locations: meta.locations,
          complete: true,
          through: meta.through,
          from: meta.from,
          dataset: meta.dataset,
          source: meta.source,
        },
        filename: 'renamed.csv',
        content,
      },
    });
    expect(second.json().duplicate).toBe(true);
    await pool.query(
      'UPDATE report_access SET permissions=$1,locations=$2 WHERE organization_id=$3',
      [
        JSON.stringify(['reports.read']),
        JSON.stringify(['achterveld']),
        'sport-society',
      ],
    );
    const limited = await f.inject({
      url: '/api/v1/organizations/sport-society/reports?date=2026-09-30',
      headers: { cookie },
    });
    expect(limited.statusCode, limited.body).toBe(200);
    expect(limited.json().clubs.map((c: { id: string }) => c.id)).toEqual([
      'achterveld',
    ]);
    expect(limited.body).not.toContain('Barneveld');
    expect(
      (
        await f.inject({
          url: '/api/v1/organizations/sport-society/reports/imports',
          headers: { cookie },
        })
      ).statusCode,
    ).toBe(403);
    expect(
      (
        await f.inject({
          method: 'POST',
          url: '/api/v1/organizations/sport-society/reports/capture',
          headers: { cookie, origin: 'https://foreign.example' },
          payload: {},
        })
      ).statusCode,
    ).toBe(400);
  });
  it('parameterizes tenant identifiers without query escape', async () => {
    expect(await store.organization(`other' OR '1'='1`)).toBeNull();
  });
});
