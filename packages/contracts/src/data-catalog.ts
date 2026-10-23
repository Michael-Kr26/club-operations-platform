import type { Dataset, ReportOrganization } from './reports';
export type CatalogStatus = 'received' | 'partial' | 'missing' | 'planned';
export interface CatalogLocation {
  id: string;
  name: string;
  status: CatalogStatus;
  availableFields: string[];
  missingFields: string[];
  source: {
    filename: string;
    importedAt: string;
    period: string;
    complete: boolean;
  } | null;
}
export interface CatalogEntry {
  id: string;
  category: string;
  title: string;
  description: string;
  formats: string;
  needed: string;
  note: string;
  route: 'files' | 'csv' | null;
  status: CatalogStatus;
  locations: CatalogLocation[];
}
export interface DataCatalog {
  organization: ReportOrganization;
  dataset: Dataset;
  checkedAt: string;
  entries: CatalogEntry[];
  unprocessedFiles?: { filename: string; status: string; message: string }[];
}
