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
