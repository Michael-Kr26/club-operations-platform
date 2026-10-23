import { createHash, randomUUID } from 'node:crypto';
import type { Pool } from 'pg';
import type {
  Dataset,
  ForecastImport,
  Principal,
  ReportOrganization,
  WorkbookReport,
  WorkbookPreview,
} from '@cop/contracts';
import { readImportZip } from './zip-source.js';
import { parseWorkbook, WorkbookContextError } from './workbook-source.js';
import { mappingKey, WorkbookPreferenceStore } from './workbook-preferences.js';

export class WorkbookImports {
  readonly preferences: WorkbookPreferenceStore;
  constructor(private pool: Pool) {
    this.preferences = new WorkbookPreferenceStore(pool);
  }
  async import(
    org: ReportOrganization,
    principal: Principal,
    body: {
      dataset: Dataset;
      expectedKind?: WorkbookReport['kind'];
      filename: string;
      content: string;
      locationId?: string;
      asOf?: string;
      from?: string;
      through?: string;
      periodConfirmed?: boolean;
      scopeConfirmed?: boolean;
      rememberMapping?: boolean;
      fileContexts?: Record<
        string,
        { locationId?: string; asOf?: string; scopeConfirmed?: boolean }
      >;
    },
  ) {
    if (
      !body ||
      !['real', 'demo'].includes(body.dataset) ||
      typeof body.filename !== 'string' ||
      !/\.(xlsx|eml|pdf)$/i.test(body.filename) ||
      typeof body.content !== 'string' ||
      !/^[A-Za-z0-9+/]*={0,2}$/.test(body.content) ||
      body.content.length > 7_000_000
    )
      throw new Error(
        'Gebruik een geldig XLSX-, EML- of PAY.-PDF-bestand van maximaal 5 MB en een dataset.',
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
        from: body.from,
        through: body.through,
        periodConfirmed: body.periodConfirmed,
      });
      if (body.expectedKind && report.kind !== body.expectedKind) {
        report = null;
        throw new Error(
          'Het vaste bronbestand moet een Healthplanner-updatetabel zijn.',
        );
      }
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
        : report.kind === 'payments'
          ? { kind: report.kind, locationId, period: report.period }
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
    if (
      body.rememberMapping === true &&
      body.scopeConfirmed === true &&
      report &&
      (report.kind === 'members' || report.kind === 'finance')
    ) {
      await this.preferences.remember(
        org.id,
        body.dataset,
        principal.userId,
        body.filename,
        report.kind,
        locationId!,
      );
    }
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
  async preview(
    org: ReportOrganization,
    body: Parameters<WorkbookImports['import']>[2],
  ): Promise<WorkbookPreview[]> {
    if (
      !body ||
      !['real', 'demo'].includes(body.dataset) ||
      typeof body.filename !== 'string' ||
      !/\.(zip|xlsx|eml)$/i.test(body.filename) ||
      typeof body.content !== 'string' ||
      body.content.length > 26_666_668 ||
      !/^[A-Za-z0-9+/]*={0,2}$/.test(body.content)
    )
      throw new Error('Gebruik een geldig ZIP-, XLSX- of EML-bestand.');
    const bytes = Buffer.from(body.content, 'base64');
    const files = /\.zip$/i.test(body.filename)
      ? readImportZip(bytes)
      : [{ filename: body.filename, bytes }];
    const preferences = await this.preferences.read(org.id, body.dataset);
    const results: WorkbookPreview[] = [];
    for (const file of files) {
      if (!file.bytes.length || file.bytes.length > 5_000_000)
        throw new Error('Maximaal 5 MB per bronbestand.');
      const context =
        body.fileContexts && Object.hasOwn(body.fileContexts, file.filename)
          ? body.fileContexts[file.filename]
          : undefined;
      const mapping = Object.hasOwn(
        preferences.mappings,
        mappingKey(file.filename),
      )
        ? preferences.mappings[mappingKey(file.filename)]
        : undefined;
      let locationId =
        context?.locationId || body.locationId || mapping?.locationId || null;
      const asOf = context?.asOf || body.asOf || null;
      const suggested = !context?.locationId && !body.locationId && !!mapping;
      let report: WorkbookReport | null = null,
        error: string | null = null,
        kind: WorkbookReport['kind'] | null = null,
        needs = false;
      try {
        report = await parseWorkbook(file.bytes, org, {
          filename: file.filename,
          locationId: locationId ?? undefined,
          asOf: asOf ?? undefined,
          scopeConfirmed: true,
        });
        kind = report.kind;
        // A saved proposal applies only to the confirmed source format.
        if (
          suggested &&
          (kind === 'members' || kind === 'finance') &&
          kind !== mapping?.kind
        )
          throw new Error(
            'Bestandsformaat wijkt af van de onthouden toewijzing. Kies de locatie opnieuw.',
          );
      } catch (e) {
        error = (e as Error).message.slice(0, 1000);
        if (e instanceof WorkbookContextError) {
          kind = e.kind;
          needs = true;
        }
      }
      if (
        suggested &&
        (kind === 'members' || kind === 'finance') &&
        kind !== mapping?.kind
      ) {
        locationId = null;
        error =
          'Bestandsformaat wijkt af van de onthouden toewijzing. Kies de locatie opnieuw.';
        needs = true;
      }
      results.push({
        filename: file.filename,
        kind,
        status: error ? (needs ? 'needs-context' : 'invalid') : 'ready',
        error,
        locationId:
          report?.kind === 'forecast' ? report.locationId : locationId,
        asOf,
        suggested,
        warnings: report?.warnings ?? [],
      });
    }
    return results;
  }
  async importZip(
    org: ReportOrganization,
    principal: Principal,
    body: Parameters<WorkbookImports['import']>[2],
  ) {
    if (
      !body ||
      !['real', 'demo'].includes(body.dataset) ||
      typeof body.filename !== 'string' ||
      !/\.zip$/i.test(body.filename) ||
      typeof body.content !== 'string' ||
      body.content.length > 26_666_668 ||
      !/^[A-Za-z0-9+/]*={0,2}$/.test(body.content)
    )
      throw new Error('Gebruik een ZIP-bestand van maximaal 20 MB.');
    const original = Buffer.from(body.content, 'base64');
    const files = readImportZip(original);
    if (
      body.fileContexts &&
      (typeof body.fileContexts !== 'object' ||
        Array.isArray(body.fileContexts) ||
        Object.keys(body.fileContexts).length > 50)
    )
      throw new Error('Ongeldige bestandstoewijzing.');
    // Archive first, including processing state. Replaying a package resumes safely;
    // child imports have their own tenant/dataset/content/context deduplication key.
    const hash = createHash('sha256')
      .update(original)
      .update('zip-v1')
      .digest('hex');
    const inserted = await this.pool.query(
      'INSERT INTO report_workbooks(id,organization_id,dataset,filename,hash,original,status,error,imported_by) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9) ON CONFLICT(organization_id,dataset,hash) DO NOTHING RETURNING id',
      [
        randomUUID(),
        org.id,
        body.dataset,
        body.filename.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 120),
        hash,
        original,
        'rejected',
        'ZIP-verwerking nog niet afgerond. Upload opnieuw om te hervatten.',
        principal.userId,
      ],
    );
    const parent =
      inserted.rows[0] ??
      (
        await this.pool.query(
          'SELECT id FROM report_workbooks WHERE organization_id=$1 AND dataset=$2 AND hash=$3',
          [org.id, body.dataset, hash],
        )
      ).rows[0];
    const results = [];
    for (const file of files) {
      const context =
        body.fileContexts && Object.hasOwn(body.fileContexts, file.filename)
          ? body.fileContexts[file.filename]
          : undefined;
      if (context && (typeof context !== 'object' || Array.isArray(context)))
        throw new Error('Ongeldige bestandstoewijzing.');
      const result = await this.import(org, principal, {
        ...body,
        locationId: context?.locationId ?? body.locationId,
        asOf: context?.asOf ?? body.asOf,
        scopeConfirmed: context?.scopeConfirmed ?? body.scopeConfirmed,
        filename: file.filename,
        content: file.bytes.toString('base64'),
      });
      results.push({ filename: file.filename, ...result });
    }
    const rejected = results.filter((r) => r.status === 'rejected');
    const summary = `${results.length - rejected.length}/${results.length} bestanden verwerkt. ${results.filter((r) => r.duplicate).length} al bekend.`;
    await this.pool.query(
      'UPDATE report_workbooks SET status=$1,error=$2 WHERE organization_id=$3 AND id=$4',
      [rejected.length ? 'rejected' : 'accepted', summary, org.id, parent.id],
    );
    return { id: parent.id, results, summary };
  }
  async list(
    principal: Principal,
    dataset: Dataset,
  ): Promise<ForecastImport[]> {
    const { rows } = await this.pool.query(
      'SELECT id,dataset,filename,location_id AS "locationId",imported_at AS "importedAt",status,error,report FROM report_workbooks WHERE organization_id=$1 AND dataset=$2 ORDER BY imported_at DESC,id DESC',
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
