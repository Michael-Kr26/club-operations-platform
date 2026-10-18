import type { Pool } from 'pg';
import type {
  Dataset,
  WorkbookPreferences,
  WorkbookThresholds,
} from '@cop/contracts';

export const workbookDefaults: WorkbookThresholds = {
  withoutAppointmentPercent: 30,
  increasePercent: 20,
  staleDays: 7,
};
// Exact, case-insensitive archive path. Do not guess dates, clubs or common
// filename stems; different locations often export identically named files.
export const mappingKey = (filename: string) =>
  filename.normalize('NFC').toLowerCase();

export class WorkbookPreferenceStore {
  constructor(private pool: Pool) {}
  async read(org: string, dataset: Dataset): Promise<WorkbookPreferences> {
    const { rows } = await this.pool.query(
      'SELECT settings FROM report_workbook_preferences WHERE organization_id=$1 AND dataset=$2',
      [org, dataset],
    );
    return (
      rows[0]?.settings ?? { mappings: {}, thresholds: { ...workbookDefaults } }
    );
  }
  private async ensure(org: string, dataset: Dataset, user: string) {
    await this.pool.query(
      'INSERT INTO report_workbook_preferences(organization_id,dataset,settings,updated_by) VALUES($1,$2,$3,$4) ON CONFLICT DO NOTHING',
      [
        org,
        dataset,
        JSON.stringify({ mappings: {}, thresholds: workbookDefaults }),
        user,
      ],
    );
  }
  async thresholds(
    org: string,
    dataset: Dataset,
    user: string,
    values: WorkbookThresholds,
  ) {
    if (
      !values ||
      !Number.isFinite(values.withoutAppointmentPercent) ||
      values.withoutAppointmentPercent < 0 ||
      values.withoutAppointmentPercent > 100 ||
      !Number.isFinite(values.increasePercent) ||
      values.increasePercent <= 0 ||
      values.increasePercent > 1000 ||
      !Number.isInteger(values.staleDays) ||
      values.staleDays < 1 ||
      values.staleDays > 90
    )
      throw new Error(
        'Gebruik 0–100% zonder afspraak, een stijgingsgrens groter dan 0 t/m 1000% en 1–90 dagen speling.',
      );
    await this.ensure(org, dataset, user);
    await this.pool.query(
      "UPDATE report_workbook_preferences SET settings=jsonb_set(settings,'{thresholds}',$1::jsonb),updated_at=now(),updated_by=$2 WHERE organization_id=$3 AND dataset=$4",
      [JSON.stringify(values), user, org, dataset],
    );
    return this.read(org, dataset);
  }
  async remember(
    org: string,
    dataset: Dataset,
    user: string,
    filename: string,
    kind: 'members' | 'finance',
    locationId: string,
  ) {
    if (filename.length > 240) return;
    await this.ensure(org, dataset, user);
    // A single JSON path update preserves concurrent changes to other mappings
    // and thresholds. Never save an export date as a reusable preference.
    await this.pool.query(
      'UPDATE report_workbook_preferences SET settings=jsonb_set(settings,$1::text[],$2::jsonb),updated_at=now(),updated_by=$3 WHERE organization_id=$4 AND dataset=$5',
      [
        ['mappings', mappingKey(filename)],
        JSON.stringify({ kind, locationId }),
        user,
        org,
        dataset,
      ],
    );
  }
  async inbox(org: string, dataset: Dataset, user: string, enabled: boolean) {
    await this.ensure(org, dataset, user);
    await this.pool.query(
      "UPDATE report_workbook_preferences SET settings=jsonb_set(settings,'{inboxEnabled}',$1::jsonb),updated_at=now(),updated_by=$2 WHERE organization_id=$3 AND dataset=$4",
      [JSON.stringify(enabled), user, org, dataset],
    );
    return this.read(org, dataset);
  }
  async forget(org: string, dataset: Dataset, user: string, filename: string) {
    await this.pool.query(
      'UPDATE report_workbook_preferences SET settings=settings #- $1::text[],updated_at=now(),updated_by=$2 WHERE organization_id=$3 AND dataset=$4',
      [['mappings', mappingKey(filename)], user, org, dataset],
    );
    return this.read(org, dataset);
  }
}
