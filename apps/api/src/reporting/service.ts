import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  OnModuleDestroy,
  OnModuleInit,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { mkdir, readFile, writeFile, unlink } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { Pool, type PoolClient } from 'pg';
import { betterAuth, type BetterAuthOptions } from 'better-auth';
import type {
  Dataset,
  ImportMeta,
  Permission,
  Principal,
  ReportSettings,
  StoredImport,
} from '@cop/contracts';
import { REPORT_RULES_VERSION } from '@cop/contracts';
import { ReportStore, sportSociety } from './store.js';
import {
  calculateReport,
  dateOnly,
  emptyMetrics,
  reportPeriod,
  validateMeta,
} from './calculation.js';
import { parseHealthplannerMail } from './healthplanner-mail.js';
import { CanonicalFileAdapter } from './adapters.js';
import { LocalTestMailer, previewMail } from './mail.js';
import {
  loadMicrosoftConfig,
  Microsoft365Mailer,
  checkRealRecipients,
} from './microsoft-mail.js';
import { OutlookSource } from './outlook-source.js';
import {
  deliver,
  dueRuns,
  scheduledRun,
  canDeliverReport,
} from './delivery.js';

export const WEB_ORIGIN = process.env.WEB_URL ?? 'http://localhost:5173';
export function requirePermission(
  principal: Principal | null,
  org: string,
  permission: Permission,
) {
  if (!principal)
    throw new UnauthorizedException('Meld je aan voor de rapportagemodule.');
  if (
    principal.organizationId !== org ||
    !principal.permissions.includes(permission)
  )
    throw new ForbiddenException('Geen toegang tot deze organisatie of actie.');
  if (permission === 'reports.manage' && principal.locations !== null)
    throw new ForbiddenException('Deze actie vereist organisatiescope.');
  return principal;
}
export function scopedOrganization(
  organization: typeof sportSociety,
  principal: Principal,
) {
  return {
    ...organization,
    locations: organization.locations.filter(
      (l) => principal.locations === null || principal.locations.includes(l.id),
    ),
  };
}
@Injectable()
export class ReportingService implements OnModuleInit, OnModuleDestroy {
  readonly pool = new Pool({
    connectionString:
      process.env.DATABASE_URL ?? 'postgresql://cop:cop@localhost:5432/cop',
    connectionTimeoutMillis: 3000,
  });
  readonly store = new ReportStore(this.pool);
  readonly dataDirectory = process.env.COP_DATA_DIR ?? join(homedir(), '.cop');
  auth!: ReturnType<typeof betterAuth>;
  ready = false;
  private initializationError: string | null = null;
  private timer: ReturnType<typeof setInterval> | undefined;
  private ticking = false;
  private outlook?: OutlookSource;
  private setupToken = '';
  private setupInProgress = false;
  private lastTick: string | null = null;
  private schedulerError: string | null = null;
  async onModuleInit() {
    try {
      await mkdir(this.dataDirectory, { recursive: true, mode: 0o700 });
      const secretFile = join(this.dataDirectory, 'auth-secret');
      try {
        await writeFile(secretFile, randomBytes(48).toString('hex'), {
          flag: 'wx',
          mode: 0o600,
        });
      } catch (e) {
        if ((e as NodeJS.ErrnoException).code !== 'EEXIST') throw e;
      }
      const secret = await readFile(secretFile, 'utf8');
      const authOptions: BetterAuthOptions = {
        database: this.pool,
        baseURL: process.env.API_URL ?? 'http://localhost:3000',
        basePath: '/api/v1/local-auth',
        secret,
        trustedOrigins: [WEB_ORIGIN],
        emailAndPassword: { enabled: true, minPasswordLength: 12 },
        advanced: { useSecureCookies: false },
        rateLimit: { enabled: true },
        logger: { disabled: true },
      };
      this.auth = betterAuth(authOptions);
      await this.store.seed();
      const { rows } = await this.pool.query(
        'SELECT count(*) AS n FROM report_access',
      );
      if (Number(rows[0]?.n) === 0) {
        const file = join(this.dataDirectory, 'setup-token');
        try {
          await writeFile(file, randomBytes(32).toString('hex'), {
            flag: 'wx',
            mode: 0o600,
          });
        } catch (e) {
          if ((e as NodeJS.ErrnoException).code !== 'EEXIST') throw e;
        }
        this.setupToken = (await readFile(file, 'utf8')).trim();
      }
      this.outlook = new OutlookSource(this.dataDirectory, this.pool);
      this.ready = true;
      this.pool.on('error', () => {
        this.schedulerError = 'Databaseverbinding onderbroken.';
      });
      this.timer = setInterval(() => void this.tick(), 30_000);
      this.timer.unref();
      void this.tick();
    } catch (error) {
      const code = (error as { code?: string }).code;
      this.initializationError =
        code === '42P01'
          ? 'Rapportagetabellen ontbreken. Voer pnpm.cmd --filter @cop/db db:migrate uit en herstart COP.'
          : code === '28P01'
            ? 'PostgreSQL weigert de aanmelding. Controleer de lokale database-instellingen.'
            : ['ECONNREFUSED', 'ENOTFOUND', 'ETIMEDOUT'].includes(code ?? '')
              ? 'PostgreSQL is niet bereikbaar. Start Docker en controleer de databasecontainer.'
              : ['EACCES', 'EPERM'].includes(code ?? '')
                ? 'COP kan zijn lokale gegevensmap niet lezen of schrijven.'
                : 'Rapportage-initialisatie mislukt. Controleer de database, migraties en lokale gegevensmap.';
      this.ready = false; /* Do not log database URLs/secrets or private records. Health endpoint remains available. */
    }
  }
  ensureReady() {
    if (!this.ready)
      throw new ServiceUnavailableException(
        'Rapportages niet gestart. Start lokale PostgreSQL, voer db:migrate uit en herstart de API.',
      );
  }
  status() {
    return {
      ready: this.ready,
      setupRequired: this.ready && !!this.setupToken,
      setupTokenFile:
        this.ready && this.setupToken
          ? join(this.dataDirectory, 'setup-token')
          : null,
      initializationError: this.initializationError,
      localTestMailAvailable: process.env.COP_STORAGE_MODE !== 'pglite-local',
      lastTick: this.lastTick,
      schedulerError: this.schedulerError,
    };
  }
  async setup(body: {
    token: string;
    email: string;
    password: string;
    name: string;
  }) {
    this.ensureReady();
    const token = typeof body.token === 'string' ? body.token : '';
    if (
      !this.setupToken ||
      token.length !== this.setupToken.length ||
      !timingSafeEqual(Buffer.from(token), Buffer.from(this.setupToken))
    )
      throw new ForbiddenException(
        'Ongeldige eenmalige lokale installatiecode.',
      );
    if (
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(body.email) ||
      typeof body.password !== 'string' ||
      body.password.length < 12 ||
      body.password.length > 128 ||
      typeof body.name !== 'string' ||
      !body.name.trim() ||
      body.name.length > 120
    )
      throw new BadRequestException(
        'Gebruik een geldig e-mailadres, naam en wachtwoord van 12–128 tekens.',
      );
    if (this.setupInProgress)
      throw new ForbiddenException('Installatie wordt al uitgevoerd.');
    this.setupInProgress = true;
    let client: PoolClient | undefined;
    let locked = false;
    try {
      client = await this.pool.connect();
      // Session lock protects multiple API processes without holding a transaction
      // while Better Auth uses another pool connection (PGlite serializes connections).
      await client.query('SELECT pg_advisory_lock(73481026)');
      locked = true;
      const check = await client.query(
        'SELECT count(*) AS n FROM report_access',
      );
      if (Number(check.rows[0]?.n) > 0)
        throw new ForbiddenException('Installatie is al voltooid.');
      const result = await this.auth.api.signUpEmail({
        body: { email: body.email, name: body.name, password: body.password },
      });
      await client.query(
        'INSERT INTO report_access(user_id,organization_id,permissions,locations) VALUES($1,$2,$3,NULL)',
        [
          result.user.id,
          sportSociety.id,
          JSON.stringify(['reports.read', 'reports.manage']),
        ],
      );
      this.setupToken = '';
      await unlink(join(this.dataDirectory, 'setup-token')).catch(
        () => undefined,
      );
      return { ok: true };
    } finally {
      if (locked && client)
        await client
          .query('SELECT pg_advisory_unlock(73481026)')
          .catch(() => undefined);
      client?.release();
      this.setupInProgress = false;
    }
  }
  async principal(headers: Headers, org: string, permission: Permission) {
    this.ensureReady();
    const session = await this.auth.api.getSession({ headers });
    if (!session)
      throw new UnauthorizedException('Meld je aan voor de rapportagemodule.');
    const access = await this.store.access(session.user.id, org);
    if (!access)
      throw new ForbiddenException('Geen toegang tot deze organisatie.');
    return requirePermission(access, org, permission);
  }
  async organization(org: string) {
    const found = await this.store.organization(org);
    if (!found) throw new NotFoundException('Organisatie niet gevonden.');
    return found;
  }
  async report(
    principal: Principal,
    dataset: Dataset,
    kind: 'daily' | 'monthly',
    date: string,
  ) {
    if (
      !['real', 'demo'].includes(dataset) ||
      !['daily', 'monthly'].includes(kind)
    )
      throw new BadRequestException('Ongeldige rapportselectie.');
    try {
      dateOnly(date);
    } catch {
      throw new BadRequestException('Ongeldige rapportdatum.');
    }
    // Calculate tenant-wide for reliable transfer detection, then scope and redact the response.
    const org = await this.organization(principal.organizationId);
    const settings = await this.store.settings(org.id);
    const report = calculateReport(
      org,
      await this.store.imports(org.id, dataset),
      dataset,
      kind,
      date,
      settings,
    );
    if (principal.locations !== null) {
      report.organization = scopedOrganization(org, principal);
      report.clubs = report.clubs.filter((c) =>
        principal.locations!.includes(c.id),
      );
      report.sources = report.sources.filter((s) =>
        principal.locations!.includes(s.locationId),
      );
      report.warnings = report.warnings.filter(
        (w) =>
          !org.locations.some(
            (l) =>
              !principal.locations!.includes(l.id) &&
              w.startsWith(l.name + ' ·'),
          ),
      );
      // Managers receive their authorized location scope, not organizational totals or other clubs.
      report.total =
        report.clubs.length === 1
          ? { ...report.clubs[0]!.metrics }
          : emptyMetrics();
    }
    return report;
  }
  async importFile(
    principal: Principal,
    body: { meta: ImportMeta; filename: string; content: string },
  ) {
    if (!body?.meta) throw new BadRequestException('Importmetadata ontbreken.');
    requirePermission(principal, principal.organizationId, 'reports.manage');
    const org = await this.organization(principal.organizationId);
    const isMail =
      typeof body.filename === 'string' && /\.eml$/i.test(body.filename);
    let mailRows: StoredImport['rows'] | undefined;
    let mailError: string | null = null;
    if (isMail) {
      if (
        body.meta.source !== 'healthplanner' ||
        typeof body.content !== 'string' ||
        body.content.length > 7_000_000 ||
        !/^[A-Za-z0-9+/]*={0,2}$/.test(body.content)
      )
        throw new BadRequestException(
          'Gebruik Healthplanner en een geldige EML van maximaal 5 MB.',
        );
      try {
        const parsed = await parseHealthplannerMail(
          Buffer.from(body.content, 'base64'),
          org,
        );
        body = {
          ...body,
          meta: { ...parsed.meta, dataset: body.meta.dataset },
        };
        mailRows = parsed.rows;
      } catch (error) {
        mailError = (error as Error).message.slice(0, 600);
        body = {
          ...body,
          meta: {
            ...body.meta,
            locations: org.locations.map((l) => l.id),
            complete: false,
          },
        };
      }
    }
    try {
      validateMeta(body.meta, org);
    } catch (e) {
      throw new BadRequestException((e as Error).message);
    }
    if (
      typeof body.content !== 'string' ||
      !/^[A-Za-z0-9+/]*={0,2}$/.test(body.content) ||
      body.content.length > 7_000_000
    )
      throw new BadRequestException('Ongeldige inhoud; maximaal 5 MB.');
    const bytes = Buffer.from(body.content, 'base64');
    if (bytes.length === 0 || bytes.length > 5_000_000)
      throw new BadRequestException('Gebruik een bestand van 1 byte tot 5 MB.');
    const filename =
      typeof body.filename === 'string'
        ? body.filename.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 100)
        : 'import.csv';
    const meta: ImportMeta = {
      source: body.meta.source,
      dataset: body.meta.dataset,
      from: body.meta.from,
      through: body.meta.through,
      complete: body.meta.complete,
      locations: [...body.meta.locations].sort(),
    };
    const hash = createHash('sha256')
      .update(bytes)
      .update(JSON.stringify(meta))
      .digest('hex');
    let rows: StoredImport['rows'] = [],
      error: string | null = mailError;
    try {
      if (mailError) throw new Error(mailError);
      rows =
        mailRows ??
        (await new CanonicalFileAdapter().parse(bytes, filename, meta));
    } catch (e) {
      error = (e as Error).message.slice(0, 600);
    }
    return this.store.saveImport(
      org.id,
      meta,
      filename,
      bytes,
      hash,
      rows,
      error,
      principal.userId,
    );
  }
  async updateSettings(principal: Principal, body: ReportSettings) {
    if (!body) throw new BadRequestException('Instellingen ontbreken.');
    requirePermission(principal, principal.organizationId, 'reports.manage');
    if (
      !Array.isArray(body.recipients) ||
      body.recipients.length > 20 ||
      body.recipients.some(
        (v) =>
          typeof v !== 'string' ||
          v.length > 254 ||
          !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v),
      ) ||
      typeof body.time !== 'string' ||
      !/^([01]\d|2[0-3]):[0-5]\d$/.test(body.time) ||
      body.timezone !== 'Europe/Amsterdam' ||
      typeof body.enabled !== 'boolean' ||
      typeof body.rulesApproved !== 'boolean' ||
      body.rulesVersion !== REPORT_RULES_VERSION
    )
      throw new BadRequestException(
        'Ongeldige instellingen of bedrijfsregelversie.',
      );
    const settings = {
      recipients: [...new Set(body.recipients)],
      time: body.time,
      timezone: body.timezone,
      enabled: body.enabled,
      rulesApproved: body.rulesApproved,
      allowPartialDaily: body.allowPartialDaily === true,
      rulesVersion: REPORT_RULES_VERSION,
    };
    if (
      settings.enabled &&
      (!settings.rulesApproved || !settings.recipients.length)
    )
      throw new BadRequestException(
        'Keur de voorstellen goed en vul ontvangers in vóór planning.',
      );
    await this.store.saveSettings(
      principal.organizationId,
      settings,
      principal.userId,
    );
    return settings;
  }
  async demo(principal: Principal, date: string) {
    requirePermission(principal, principal.organizationId, 'reports.manage');
    let period;
    try {
      period = reportPeriod('monthly', date);
    } catch {
      throw new BadRequestException('Ongeldige demodatum.');
    }
    const org = await this.organization(principal.organizationId);
    const locations = org.locations.map((l) => l.id);
    const members = [
      'subscriptionId,memberId,locationId,startDate,endDate,cancellationRequestedDate,pauseStart,pauseEnd,pauseKind',
    ];
    const finance = ['eventId,locationId,date,kind,amountCents'];
    const hp = [
      'locationId,date,leads,converted,appointments,visitingActive,sleeping',
    ];
    org.locations.forEach((l, index) => {
      for (let i = 0; i < 10 + index * 3; i++)
        members.push(
          `demo-${l.id}-${i},demo-${l.id}-${i},${l.id},2000-01-01,${i === 0 ? period.from : ''},${i === 0 ? '1999-12-31' : ''},${i === 1 ? period.from : ''},,${i === 1 ? 'paused' : ''}`,
        );
      members.push(
        `demo-new-${l.id},demo-new-${l.id},${l.id},${period.from},,,,,`,
      );
      for (
        let day = period.from;
        day <= period.through;
        day = new Date(Date.parse(day) + 86400000).toISOString().slice(0, 10)
      ) {
        finance.push(
          `demo-revenue-${l.id}-${day},${l.id},${day},revenue,${(index + 1) * 7500}`,
        );
        finance.push(
          `demo-payment-${l.id}-${day},${l.id},${day},payment,${(index + 1) * 6500}`,
        );
        finance.push(
          `demo-balance-${l.id}-${day},${l.id},${day},outstanding,${index * 2500}`,
        );
        if (index === 2)
          finance.push(
            `demo-failed-${l.id}-${day},${l.id},${day},failed_debit,3500`,
          );
        hp.push(`${l.id},${day},4,1,8,${9 + index * 3},2`);
      }
    });
    const results = [];
    for (const [source, lines] of [
      ['dewi-members', members],
      ['dewi-finance', finance],
      ['healthplanner', hp],
    ] as const)
      results.push(
        await this.importFile(principal, {
          meta: {
            source,
            dataset: 'demo',
            ...period,
            locations,
            complete: true,
          },
          filename: `demo-${source}.csv`,
          content: Buffer.from(lines.join('\n')).toString('base64'),
        }),
      );
    return results;
  }
  async mailStatus(principal: Principal) {
    requirePermission(principal, principal.organizationId, 'reports.manage');
    try {
      const config = await loadMicrosoftConfig(
        this.dataDirectory,
        principal.organizationId,
      );
      return {
        ready: !!config,
        delivery: config ? 'microsoft365' : 'local-test-only',
        sender: config?.mailbox ?? null,
        error: null,
      };
    } catch {
      return {
        ready: false,
        delivery: 'local-test-only',
        sender: null,
        error: 'Lokale Microsoft 365-configuratie ongeldig of niet leesbaar.',
      };
    }
  }
  async send(
    principal: Principal,
    dataset: Dataset,
    kind: 'daily' | 'monthly',
    date: string,
  ) {
    requirePermission(principal, principal.organizationId, 'reports.manage');
    if (dataset !== 'real')
      throw new BadRequestException(
        'Demo-gegevens worden nooit via echte mail verzonden.',
      );
    const config = await loadMicrosoftConfig(
      this.dataDirectory,
      principal.organizationId,
    );
    if (!config)
      throw new BadRequestException(
        'Microsoft 365 is nog niet lokaal ingesteld.',
      );
    const report = await this.report(principal, dataset, kind, date);
    const settings = await this.store.settings(principal.organizationId);
    if (!canDeliverReport(report, settings))
      throw new BadRequestException(
        'Echte verzending vereist goedgekeurde bedrijfsregels en complete geldige bronnen.',
      );
    try {
      checkRealRecipients(config, settings.recipients);
    } catch {
      throw new BadRequestException(
        'Controleer ontvangers en de lokale toegestane ontvangers.',
      );
    }
    return deliver(
      this.store,
      new Microsoft365Mailer(config),
      principal.organizationId,
      report,
      settings,
      principal.userId,
    );
  }
  async capture(
    principal: Principal,
    dataset: Dataset,
    kind: 'daily' | 'monthly',
    date: string,
  ) {
    requirePermission(principal, principal.organizationId, 'reports.manage');
    const report = await this.report(principal, dataset, kind, date);
    const settings = await this.store.settings(principal.organizationId);
    return deliver(
      this.store,
      new LocalTestMailer(),
      principal.organizationId,
      report,
      settings,
      principal.userId,
    );
  }
  async preview(
    principal: Principal,
    dataset: Dataset,
    kind: 'daily' | 'monthly',
    date: string,
  ) {
    return previewMail(
      await this.report(principal, dataset, kind, date),
      principal.permissions.includes('reports.manage') &&
        principal.locations === null
        ? (await this.store.settings(principal.organizationId)).recipients
        : [],
      dataset === 'real' &&
        (await loadMicrosoftConfig(
          this.dataDirectory,
          principal.organizationId,
        ))
        ? 'microsoft365'
        : 'local-test-only',
    );
  }
  async sourceStatus(principal: Principal) {
    requirePermission(principal, principal.organizationId, 'reports.manage');
    return this.outlook!.status(principal.organizationId);
  }
  async tick(now = new Date()) {
    if (this.ticking || !this.ready) return;
    this.ticking = true;
    try {
      await this.store.recoverClaims();
      const { rows } = await this.pool.query(
        'SELECT id AS organization_id FROM report_organizations',
      );
      for (const r of rows) {
        const org = await this.organization(r.organization_id);
        await this.outlook!.poll(org, now, async (bytes) => {
          const day = new Intl.DateTimeFormat('en-CA', {
            timeZone: 'Europe/Amsterdam',
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
          }).format(new Date(now.getTime() - 86400_000));
          const result = await this.importFile(
            {
              userId: 'outlook-source',
              organizationId: org.id,
              permissions: ['reports.manage'],
              locations: null,
            },
            {
              meta: {
                source: 'healthplanner',
                dataset: 'real',
                from: day,
                through: day,
                locations: org.locations.map((l) => l.id),
                complete: true,
              },
              filename: 'healthplanner.eml',
              content: bytes.toString('base64'),
            },
          );
          if (result.status === 'rejected')
            throw new Error('Import afgewezen.');
          return result.duplicate;
        });
        const settings = await this.store.settings(org.id);
        if (!settings.enabled) continue;
        let config: Awaited<ReturnType<typeof loadMicrosoftConfig>> = null;
        let mailError = false;
        try {
          config = await loadMicrosoftConfig(this.dataDirectory, org.id);
          if (config) checkRealRecipients(config, settings.recipients);
        } catch {
          mailError = true;
        }
        for (const run of dueRuns(now, settings.time)) {
          const date = reportPeriod(run.kind, run.date).from;
          const report = calculateReport(
            org,
            await this.store.imports(org.id, 'real'),
            'real',
            run.kind,
            date,
            settings,
            now,
          );
          if (mailError && !run.missed) {
            await this.store.claim(
              org.id,
              'real',
              run.kind,
              report.from,
              'scheduler',
              'blocked',
              'Microsoft 365-configuratie of toegestane ontvangers ongeldig. Controleer lokale mailinstellingen.',
            );
            continue;
          }
          await scheduledRun(
            this.store,
            config ? new Microsoft365Mailer(config) : new LocalTestMailer(),
            org.id,
            run,
            report,
            settings,
          );
        }
      }
      this.lastTick = now.toISOString();
      this.schedulerError = null;
    } catch {
      this.schedulerError =
        'Planning kon niet worden verwerkt; controleer database en lokale mailopvang.';
    } finally {
      this.ticking = false;
    }
  }
  async onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
    await this.pool.end();
  }
}
