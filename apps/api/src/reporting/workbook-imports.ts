import { createHash, randomUUID } from 'node:crypto';
import type { Pool } from 'pg';
import type {
  Dataset,
  ForecastImport,
  Principal,
  ReportOrganization,
  WorkbookReport,
} from '@cop/contracts';
import { parseWorkbook } from './workbook-source.js';

export class WorkbookImports {
  constructor(private pool: Pool) {}
  async import(
    org: ReportOrganization,
    principal: Principal,
    body: {
      dataset: Dataset;
      filename: string;
      content: string;
      locationId?: string;
      asOf?: string;
      scopeConfirmed?: boolean;
    },
  ) {
    if (
      !body ||
      !['real', 'demo'].includes(body.dataset) ||
      typeof body.filename !== 'string' ||
      !/\.(xlsx|eml)$/i.test(body.filename) ||
      typeof body.content !== 'string' ||
      !/^[A-Za-z0-9+/]*={0,2}$/.test(body.content) ||
      body.content.length > 7_000_000
    )
      throw new Error(
        'Gebruik een geldig XLSX-bestand van maximaal 5 MB en een dataset.',
      );
    const original = Buffer.from(body.content, 'base64');
    if (!original.length || original.length > 5_000_000)
      throw new Error('Maximaal 5 MB per bestand.');
    let report: WorkbookReport | null = null,
      error: string | null = null;
    try {
      report = await parseWorkbook(original, org, {
        locationId: body.locationId,
        asOf: body.asOf,
        scopeConfirmed: body.scopeConfirmed,
        filename: body.filename,
      });
    } catch (e) {
      error = (e as Error).message.slice(0, 1000);
    }
    const filename = body.filename
      .replace(/[^a-zA-Z0-9._-]/g, '_')
      .slice(0, 120);
    const locationId = report
      ? report.kind === 'forecast'
        ? report.locationId
        : report.locationIds.length === 1
          ? report.locationIds[0]!
          : null
      : null;
    const context = report
      ? report.kind === 'members'
        ? { kind: report.kind, locationId, asOf: report.period }
        : report.kind === 'finance'
          ? { kind: report.kind, locationId }
          : { kind: report.kind }
      : {
          locationId: body.locationId ?? null,
          asOf: body.asOf ?? null,
          scopeConfirmed: body.scopeConfirmed === true,
        };
    // Format version is part of the key so a rejected file can be reviewed again after an adapter upgrade.
    const hash = createHash('sha256')
      .update(original)
      .update(JSON.stringify({ version: 1, ...context }))
      .digest('hex');
    const id = randomUUID();
    const result = await this.pool.query(
      'INSERT INTO report_workbooks(id,organization_id,dataset,location_id,filename,hash,original,report,status,error,imported_by) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) ON CONFLICT(organization_id,dataset,hash) DO NOTHING RETURNING id',
      [
        id,
        org.id,
        body.dataset,
        locationId,
        filename,
        hash,
        original,
        report ? JSON.stringify(report) : null,
        error ? 'rejected' : 'accepted',
        error,
        principal.userId,
      ],
    );
    if (result.rows.length)
      return {
        id,
        duplicate: false,
        status: error ? 'rejected' : 'accepted',
        error,
      };
    const existing = await this.pool.query(
      'SELECT id,status,error FROM report_workbooks WHERE organization_id=$1 AND dataset=$2 AND hash=$3',
      [org.id, body.dataset, hash],
    );
    return { ...existing.rows[0], duplicate: true };
  }
  async list(
    principal: Principal,
    dataset: Dataset,
  ): Promise<ForecastImport[]> {
    const { rows } = await this.pool.query(
      'SELECT id,dataset,filename,location_id AS "locationId",imported_at AS "importedAt",status,error,report FROM report_workbooks WHERE organization_id=$1 AND dataset=$2 ORDER BY imported_at DESC,id DESC LIMIT 250',
      [principal.organizationId, dataset],
    );
    return rows.flatMap((r) => {
      if (principal.locations !== null) {
        if (!r.report) return [];
        if (
          r.report.kind === 'forecast' &&
          !principal.locations.includes(r.report.locationId)
        )
          return [];
        if (r.report.kind !== 'forecast') {
          const report = {
            ...r.report,
            locationIds: r.report.locationIds.filter((id: string) =>
              principal.locations!.includes(id),
            ),
            rows: r.report.rows.filter((v: { locationId: string }) =>
              principal.locations!.includes(v.locationId),
            ),
          };
          if (!report.locationIds.length) return [];
          // Multi-club cards/categories cannot be shared with a scoped manager.
          if (r.report.locationIds.length > 1) {
            report.cards = [];
            report.categories = [];
          }
          r = { ...r, report };
        }
      }
      return [
        { ...r, importedAt: r.importedAt.toISOString() } as ForecastImport,
      ];
    });
  }
  async original(org: string, id: string) {
    const { rows } = await this.pool.query(
      'SELECT filename,original FROM report_workbooks WHERE organization_id=$1 AND id=$2',
      [org, id],
    );
    return rows[0] ?? null;
  }
}
