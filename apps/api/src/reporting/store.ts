import { randomUUID } from 'node:crypto';
import { Pool } from 'pg';
import type {
  Dataset,
  ImportMeta,
  MailPreview,
  Principal,
  ReportOrganization,
  ReportSettings,
  SendRun,
  StoredImport,
} from '@cop/contracts';
import { REPORT_RULES_VERSION } from '@cop/contracts';

export const defaultSettings: ReportSettings = {
  recipients: [],
  time: '07:00',
  timezone: 'Europe/Amsterdam',
  enabled: false,
  rulesApproved: false,
  rulesVersion: REPORT_RULES_VERSION,
};
export const sportSociety: ReportOrganization = {
  id: 'sport-society',
  name: 'Sport Society',
  locations: [
    'Achterveld',
    'Barneveld',
    'Voorthuizen',
    'Harskamp',
    'Wekerom',
  ].map((name) => ({ id: name.toLowerCase(), name })),
};
type ImportRecord = {
  id: string;
  metadata: ImportMeta;
  filename: string;
  hash: string;
  status: 'accepted' | 'rejected';
  error: string | null;
  rows: StoredImport['rows'];
  imported_at: Date;
};
type RunRecord = {
  id: string;
  kind: SendRun['kind'];
  report_date: string;
  dataset: Dataset;
  status: SendRun['status'];
  created_at: Date;
  completed_at: Date | null;
  reason: string | null;
  preview: MailPreview | null;
};
export class ReportStore {
  constructor(readonly pool: Pool) {}
  async seed() {
    await this.pool.query(
      'INSERT INTO report_organizations(id,definition) VALUES($1,$2) ON CONFLICT DO NOTHING',
      [sportSociety.id, sportSociety],
    );
    await this.pool.query(
      'INSERT INTO report_settings(organization_id,settings) VALUES($1,$2) ON CONFLICT DO NOTHING',
      [sportSociety.id, defaultSettings],
    );
  }
  async organization(id: string): Promise<ReportOrganization | null> {
    const { rows } = await this.pool.query(
      'SELECT definition FROM report_organizations WHERE id=$1',
      [id],
    );
    return rows[0]?.definition ?? null;
  }
  async access(
    userId: string,
    organizationId: string,
  ): Promise<Principal | null> {
    const { rows } = await this.pool.query(
      'SELECT permissions,locations FROM report_access WHERE user_id=$1 AND organization_id=$2',
      [userId, organizationId],
    );
    return rows[0]
      ? {
          userId,
          organizationId,
          permissions: rows[0].permissions,
          locations: rows[0].locations,
        }
      : null;
  }
  async settings(org: string): Promise<ReportSettings> {
    const { rows } = await this.pool.query(
      'SELECT settings FROM report_settings WHERE organization_id=$1',
      [org],
    );
    return rows[0]?.settings ?? { ...defaultSettings };
  }
  async saveSettings(org: string, settings: ReportSettings, userId: string) {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(
        'INSERT INTO report_settings(organization_id,settings,updated_by) VALUES($1,$2,$3) ON CONFLICT(organization_id) DO UPDATE SET settings=EXCLUDED.settings,updated_by=EXCLUDED.updated_by,updated_at=now()',
        [org, settings, userId],
      );
      await client.query(
        'INSERT INTO report_audit(id,organization_id,actor,action,detail) VALUES($1,$2,$3,$4,$5)',
        [
          randomUUID(),
          org,
          userId,
          'settings.updated',
          { ...settings, recipients: settings.recipients.length },
        ],
      );
      await client.query('COMMIT');
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    } finally {
      client.release();
    }
  }
  async imports(org: string, dataset: Dataset): Promise<StoredImport[]> {
    const { rows } = await this.pool.query<ImportRecord>(
      'SELECT id,metadata,filename,hash,status,error,rows,imported_at FROM report_imports WHERE organization_id=$1 AND dataset=$2 ORDER BY imported_at DESC,id DESC',
      [org, dataset],
    );
    return rows.map((r) => ({
      ...r.metadata,
      id: r.id,
      filename: r.filename,
      hash: r.hash,
      status: r.status,
      error: r.error,
      rows: r.rows,
      importedAt: r.imported_at.toISOString(),
    }));
  }
  async saveImport(
    org: string,
    meta: ImportMeta,
    filename: string,
    original: Buffer,
    hash: string,
    rows: StoredImport['rows'],
    error: string | null,
    userId: string,
  ) {
    const id = randomUUID();
    const result = await this.pool.query(
      'INSERT INTO report_imports(id,organization_id,dataset,source,hash,metadata,filename,original,rows,status,error,imported_by) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) ON CONFLICT(organization_id,dataset,source,hash) DO NOTHING RETURNING id',
      [
        id,
        org,
        meta.dataset,
        meta.source,
        hash,
        meta,
        filename,
        original,
        JSON.stringify(rows),
        error ? 'rejected' : 'accepted',
        error,
        userId,
      ],
    );
    if (result.rows[0])
      return {
        id,
        duplicate: false,
        status: error ? 'rejected' : 'accepted',
        error,
      };
    const existing = await this.pool.query(
      'SELECT id,status,error FROM report_imports WHERE organization_id=$1 AND dataset=$2 AND source=$3 AND hash=$4',
      [org, meta.dataset, meta.source, hash],
    );
    return { ...existing.rows[0], duplicate: true };
  }
  async original(
    org: string,
    id: string,
  ): Promise<{ filename: string; original: Buffer } | null> {
    const { rows } = await this.pool.query(
      'SELECT filename,original FROM report_imports WHERE organization_id=$1 AND id=$2',
      [org, id],
    );
    return rows[0] ?? null;
  }
  async claim(
    org: string,
    dataset: Dataset,
    kind: SendRun['kind'],
    date: string,
    actor: string,
    status: SendRun['status'] = 'claimed',
    reason: string | null = null,
  ): Promise<string | null> {
    const id = randomUUID();
    const { rows } = await this.pool.query(
      'INSERT INTO report_runs(id,organization_id,dataset,kind,report_date,status,reason,created_by) VALUES($1,$2,$3,$4,$5,$6,$7,$8) ON CONFLICT(organization_id,dataset,kind,report_date) DO NOTHING RETURNING id',
      [id, org, dataset, kind, date, status, reason, actor],
    );
    return rows[0]?.id ?? null;
  }
  async attachPreview(org: string, id: string, preview: MailPreview) {
    await this.pool.query(
      "UPDATE report_runs SET preview=$3 WHERE organization_id=$1 AND id=$2 AND status='claimed'",
      [org, id, preview],
    );
  }
  async finish(
    org: string,
    id: string,
    status: SendRun['status'],
    preview: MailPreview | null,
    reason: string | null,
  ) {
    await this.pool.query(
      'UPDATE report_runs SET status=$3,preview=$4,reason=$5,completed_at=now() WHERE organization_id=$1 AND id=$2',
      [org, id, status, preview, reason],
    );
  }
  async runs(org: string, dataset: Dataset): Promise<SendRun[]> {
    const { rows } = await this.pool.query<RunRecord>(
      'SELECT * FROM report_runs WHERE organization_id=$1 AND dataset=$2 ORDER BY created_at DESC LIMIT 100',
      [org, dataset],
    );
    return rows.map((r) => ({
      id: r.id,
      kind: r.kind,
      reportDate: r.report_date,
      dataset: r.dataset,
      status: r.status,
      createdAt: r.created_at.toISOString(),
      completedAt: r.completed_at?.toISOString() ?? null,
      reason: r.reason,
      preview: r.preview,
    }));
  }
  async recoverClaims() {
    await this.pool.query(
      "UPDATE report_runs SET status='uncertain',reason='Proces gestopt of verzending niet bevestigd. Niet automatisch opnieuw verzenden.',completed_at=now() WHERE status='claimed' AND created_at < now() - interval '10 minutes'",
    );
  }
}
