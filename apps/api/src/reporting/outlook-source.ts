import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import type { Pool } from 'pg';
import type { ReportOrganization } from '@cop/contracts';
import { localClock, shiftDate } from './calculation.js';
import { HP_SENDER, HP_SUBJECT } from './healthplanner-mail.js';

interface SourceConfig {
  organizationId: string;
  enabled: boolean;
  tenantId: string;
  clientId: string;
  clientSecret: string;
  mailbox: string;
  folderId: string;
}
export async function loadOutlookSource(
  directory: string,
  org: string,
): Promise<SourceConfig | null> {
  try {
    const c = JSON.parse(
      await readFile(
        join(directory, 'sources', `${encodeURIComponent(org)}.json`),
        'utf8',
      ),
    ) as SourceConfig;
    if (c.enabled === false) return null;
    const guid = /^[a-f\d]{8}-[a-f\d]{4}-[a-f\d]{4}-[a-f\d]{4}-[a-f\d]{12}$/i;
    if (
      c.organizationId !== org ||
      c.enabled !== true ||
      !guid.test(c.tenantId) ||
      !guid.test(c.clientId) ||
      typeof c.clientSecret !== 'string' ||
      !c.clientSecret.trim() ||
      typeof c.mailbox !== 'string' ||
      !/^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(c.mailbox) ||
      typeof c.folderId !== 'string' ||
      !c.folderId ||
      c.folderId.length > 300
    )
      throw new Error('invalid');
    return c;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null;
    // eslint-disable-next-line preserve-caught-error -- JSON parse errors can contain secrets.
    throw new Error(
      'Outlook-bronconfiguratie ongeldig; controleer het lokale bronbestand.',
    );
  }
}
async function limitedBytes(response: Response) {
  if (!response.ok)
    throw new Error('Outlook gaf geen toegang of is niet bereikbaar.');
  if (Number(response.headers.get('content-length')) > 5_000_000)
    throw new Error('Mail groter dan 5 MB.');
  const reader = response.body?.getReader();
  if (!reader) throw new Error('Lege Outlook-response.');
  const chunks: Uint8Array[] = [];
  let total = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.length;
    if (total > 5_000_000) {
      await reader.cancel();
      throw new Error('Outlook-response groter dan 5 MB.');
    }
    chunks.push(value);
  }
  return Buffer.concat(chunks);
}
export async function collectOutlookMails(
  c: SourceConfig,
  now: Date,
  save: (bytes: Buffer) => Promise<boolean>,
) {
  const budget = AbortSignal.timeout(60_000);
  const signal = () => AbortSignal.any([budget, AbortSignal.timeout(15_000)]);
  const auth = await fetch(
    `https://login.microsoftonline.com/${c.tenantId}/oauth2/v2.0/token`,
    {
      method: 'POST',
      body: new URLSearchParams({
        grant_type: 'client_credentials',
        client_id: c.clientId,
        client_secret: c.clientSecret,
        scope: 'https://graph.microsoft.com/.default',
      }),
      signal: signal(),
    },
  );
  if (!auth.ok) throw new Error('Outlook-leesautorisatie mislukt.');
  const token = (await auth.json()) as { access_token?: string };
  if (!token.access_token) throw new Error('Outlook-leestoegang ontbreekt.');
  const base = `https://graph.microsoft.com/v1.0/users/${encodeURIComponent(c.mailbox)}/`;
  let next: string | undefined =
    `${base}mailFolders/${encodeURIComponent(c.folderId)}/messages?` +
    new URLSearchParams({
      $select: 'id,subject,from,receivedDateTime',
      $filter: `receivedDateTime ge ${new Date(now.getTime() - 7 * 86400_000).toISOString()} and receivedDateTime le ${now.toISOString()}`,
      $top: '100',
    });
  let pages = 0,
    matched = 0,
    imported = 0,
    duplicates = 0,
    rejected = 0;
  const headers = {
    Authorization: `Bearer ${token.access_token}`,
    Prefer: 'IdType="ImmutableId"',
  };
  const ids = new Set<string>();
  while (next) {
    if (++pages > 10 || !next.startsWith(base))
      throw new Error(
        'Outlook-paginering onverwacht of meer dan 1000 mails; gebruik een aparte rapportagemap.',
      );
    const response = await fetch(next, {
      headers,
      signal: signal(),
      redirect: 'error',
    });
    const data = JSON.parse(
      (await limitedBytes(response)).toString('utf8'),
    ) as {
      value: {
        id: string;
        subject: string;
        from?: { emailAddress?: { address?: string } };
      }[];
      '@odata.nextLink'?: string;
    };
    if (!Array.isArray(data.value))
      throw new Error('Ongeldige Outlook-berichtenlijst.');
    for (const m of data.value) {
      if (
        m.subject !== HP_SUBJECT ||
        m.from?.emailAddress?.address?.toLowerCase() !== HP_SENDER ||
        ids.has(m.id)
      )
        continue;
      ids.add(m.id);
      matched++;
      const bytes = await limitedBytes(
        await fetch(`${base}messages/${encodeURIComponent(m.id)}/$value`, {
          headers,
          signal: signal(),
          redirect: 'error',
        }),
      );
      try {
        if (await save(bytes)) duplicates++;
        else imported++;
      } catch {
        rejected++;
      }
    }
    next = data['@odata.nextLink'];
  }
  if (rejected)
    throw new Error(
      `${rejected} Healthplanner-mail(s) afgewezen; controleer de originele mails handmatig.`,
    );
  return { matched, imported, duplicates };
}
export function outlookSlot(now: Date) {
  const clock = localClock(now);
  if (clock.time < '08:35' || clock.time >= '08:45') return null;
  const slot = ['08:35', '08:38', '08:41', '08:44']
    .filter((s) => s <= clock.time)
    .at(-1)!;
  return { date: clock.date, slot, key: `${clock.date}:${slot}` };
}
export class OutlookSource {
  private lastAttempt = new Map<string, string>();
  constructor(
    private directory: string,
    private pool: Pool,
  ) {}
  async status(org: string) {
    const { rows } = await this.pool.query(
      "SELECT detail,created_at FROM report_audit WHERE organization_id=$1 AND action='healthplanner.poll' ORDER BY created_at DESC LIMIT 1",
      [org],
    );
    let configured = false,
      error: string | null = null;
    try {
      configured = !!(await loadOutlookSource(this.directory, org));
    } catch {
      error = 'Lokale Outlook-bronconfiguratie ongeldig.';
    }
    return {
      configured,
      error,
      lastAttempt: rows[0]?.created_at ?? null,
      lastResult: rows[0]?.detail ?? null,
      time: '08:35',
      retryTimes: ['08:38', '08:41', '08:44'],
      timezone: 'Europe/Amsterdam',
      lookbackDays: 7,
    };
  }
  async poll(
    org: ReportOrganization,
    now: Date,
    save: (bytes: Buffer) => Promise<boolean>,
  ) {
    const slot = outlookSlot(now);
    if (!slot || this.lastAttempt.get(org.id) === slot.key) return;
    this.lastAttempt.set(org.id, slot.key);
    const client = await this.pool.connect();
    let locked = false;
    try {
      const lock = await client.query(
        'SELECT pg_try_advisory_lock(hashtext($1)) AS locked',
        [`cop-outlook:${org.id}`],
      );
      locked = lock.rows[0]?.locked === true;
      if (!locked) return;
      // Persisted slots prevent repeated reads on restarts or other processes.
      const recent = await client.query(
        "SELECT 1 FROM report_audit WHERE organization_id=$1 AND action='healthplanner.poll' AND (detail->>'slotKey'=$2 OR (detail->>'day'=$3 AND detail->>'ok'='true' AND detail->>'currentReportAvailable'='true')) LIMIT 1",
        [org.id, slot.key, slot.date],
      );
      if (recent.rows.length) return;
      let detail: Record<string, unknown>;
      try {
        const c = await loadOutlookSource(this.directory, org.id);
        if (!c) return;
        const result = await collectOutlookMails(c, now, save);
        const current = await client.query(
          "SELECT 1 FROM report_imports WHERE organization_id=$1 AND source='healthplanner' AND dataset='real' AND status='accepted' AND filename='healthplanner.eml' AND metadata->>'from'=$2 AND metadata->>'through'=$2 LIMIT 1",
          [org.id, shiftDate(slot.date, -1)],
        );
        detail = {
          ok: true,
          ...result,
          currentReportAvailable: current.rows.length > 0,
        };
      } catch {
        detail = {
          ok: false,
          error:
            'Ophalen of verwerken mislukt. Controleer Outlook-leesrechten, internet en rapportageformaat; geen broncijfers als nul ingevuld.',
        };
      }
      await client.query(
        'INSERT INTO report_audit(id,organization_id,actor,action,detail) VALUES($1,$2,$3,$4,$5)',
        [
          randomUUID(),
          org.id,
          'outlook-source',
          'healthplanner.poll',
          { ...detail, slotKey: slot.key, day: slot.date },
        ],
      );
    } finally {
      if (locked)
        await client
          .query('SELECT pg_advisory_unlock(hashtext($1))', [
            `cop-outlook:${org.id}`,
          ])
          .catch(() => undefined);
      client.release();
    }
  }
}
