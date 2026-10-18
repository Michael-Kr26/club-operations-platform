import type { Dataset, ReportOrganization } from './reports';

export interface ForecastMonth {
  month: string;
  opening: number | null;
  joiners: number | null;
  better: number | null;
  movementIn: number | null;
  leavers: number | null;
  sick: number | null;
  movementOut: number | null;
  closing: number | null;
  net: number | null;
  indicativeChurn: number | null;
  nextOpeningDifference: number | null;
  warnings: string[];
}
export interface DewiForecast {
  kind: 'forecast';
  locationId: string;
  exportedOn: string;
  sourceSheet: string;
  months: ForecastMonth[];
  warnings: string[];
}
export interface ForecastImport {
  id: string;
  dataset: Dataset;
  filename: string;
  locationId: string | null;
  importedAt: string;
  status: 'accepted' | 'rejected';
  error: string | null;
  report: WorkbookReport | null;
}
export interface ForecastDashboard {
  organization: ReportOrganization;
  dataset: Dataset;
  imports: ForecastImport[];
  combined?: CombinedWorkbookDashboard;
  preferences?: WorkbookPreferences;
  inbox?: WorkbookInboxStatus;
}

export interface WorkbookThresholds {
  withoutAppointmentPercent: number;
  increasePercent: number;
  staleDays: number;
}
export interface WorkbookPreferences {
  mappings: Record<string, { kind: 'members' | 'finance'; locationId: string }>;
  thresholds: WorkbookThresholds;
  inboxEnabled?: boolean;
}
export interface WorkbookInboxStatus {
  available: boolean;
  enabled: boolean;
  path: string | null;
  lastScan: string | null;
  error: string | null;
  files: { filename: string; status: string; message: string }[];
}
export interface WorkbookPreview {
  filename: string;
  kind: WorkbookReport['kind'] | null;
  status: 'ready' | 'needs-context' | 'invalid';
  error: string | null;
  locationId: string | null;
  asOf: string | null;
  suggested: boolean;
  warnings: string[];
}
export interface MetricChange {
  difference: number | null;
  percent: number | null;
}
export interface WorkbookAttention {
  code: string;
  message: string;
  locationId: string | null;
  sourceId: string | null;
}

export interface WorkbookSupplement {
  kind: 'members' | 'finance' | 'healthplanner';
  locationIds: string[];
  period: string;
  warnings: string[];
  cards: { label: string; value: number | null; format?: 'money' }[];
  rows: {
    period: string;
    locationId: string;
    values: Record<string, number | null>;
  }[];
  categories: { name: string; amountCents: number; count: number | null }[];
}
export type WorkbookReport = DewiForecast | WorkbookSupplement;

export interface CombinedPeriod {
  period: string;
  type: 'week' | 'month' | 'day';
  rows: {
    locationId: string;
    values: Record<string, number | null>;
    source: { id: string; filename: string; importedAt: string } | null;
    conflict: boolean;
  }[];
  totals: Record<string, number | null>;
  comparison?: {
    previousPeriod: string;
    reason: string | null;
    totals: Record<string, MetricChange>;
    rows: { locationId: string; changes: Record<string, MetricChange> }[];
  };
  attention?: WorkbookAttention[];
}
export interface CombinedWorkbookDashboard {
  periods: CombinedPeriod[];
  supplements: ForecastImport[];
  warnings: string[];
  supplementChanges?: Record<
    string,
    {
      previousId: string | null;
      previousPeriod: string | null;
      reason: string | null;
      changes: Record<string, MetricChange>;
    }
  >;
}
