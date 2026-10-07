export type Dataset = 'real' | 'demo';
export type Source = 'dewi-members' | 'dewi-finance' | 'healthplanner';
export type Permission = 'reports.read' | 'reports.manage';
export interface ReportOrganization {
  id: string;
  name: string;
  locations: { id: string; name: string }[];
}
export interface Principal {
  userId: string;
  organizationId: string;
  permissions: Permission[];
  locations: string[] | null;
}
export interface MembershipRow {
  subscriptionId: string;
  memberId: string;
  locationId: string;
  startDate: string;
  endDate: string | null;
  cancellationRequestedDate: string | null;
  pauseStart: string | null;
  pauseEnd: string | null;
  pauseKind: 'paused' | 'frozen' | null;
}
export interface FinanceRow {
  eventId: string;
  locationId: string;
  date: string;
  kind: 'revenue' | 'payment' | 'outstanding' | 'failed_debit';
  amountCents: number;
}
export interface HealthplannerRow {
  locationId: string;
  date: string;
  leads: number | null;
  converted: number | null;
  appointments: number | null;
  visitingActive: number | null;
  sleeping: number | null;
}
export interface ImportMeta {
  source: Source;
  dataset: Dataset;
  from: string;
  through: string;
  locations: string[];
  complete: boolean;
}
export interface StoredImport extends ImportMeta {
  id: string;
  importedAt: string;
  filename: string;
  hash: string;
  status: 'accepted' | 'rejected';
  error: string | null;
  rows: (MembershipRow | FinanceRow | HealthplannerRow)[];
}
export interface ImportSummary extends Omit<StoredImport, 'rows'> {
  rowCount: number;
}
export interface ReportSettings {
  recipients: string[];
  time: string;
  timezone: 'Europe/Amsterdam';
  enabled: boolean;
  rulesApproved: boolean;
  rulesVersion: string;
}
export interface Metrics {
  active: number | null;
  paused: number | null;
  frozen: number | null;
  newMembers: number | null;
  exits: number | null;
  rejoined: number | null;
  transfersIn: number | null;
  transfersOut: number | null;
  opening: number | null;
  churn: number | null;
  revenue: number | null;
  received: number | null;
  outstanding: number | null;
  failedDebits: number | null;
  leads: number | null;
  converted: number | null;
  conversion: number | null;
  appointments: number | null;
  visitingActive: number | null;
  sleeping: number | null;
}
export interface ManagementReport {
  organization: ReportOrganization;
  dataset: Dataset;
  kind: 'daily' | 'monthly';
  from: string;
  through: string;
  rulesVersion: string;
  provisional: boolean;
  generatedAt: string;
  warnings: string[];
  clubs: { id: string; name: string; metrics: Metrics }[];
  total: Metrics;
  sources: {
    source: Source;
    locationId: string;
    status: 'missing' | 'partial' | 'stale' | 'invalid' | 'ready';
    importId: string | null;
    importedAt: string | null;
    from: string | null;
    through: string | null;
  }[];
}
export interface MailPreview {
  subject: string;
  text: string;
  html: string;
  recipients: string[];
  delivery: 'local-test-only' | 'microsoft365';
}
export interface SendRun {
  id: string;
  kind: 'daily' | 'monthly';
  reportDate: string;
  dataset: Dataset;
  status: 'claimed' | 'captured' | 'sent' | 'missed' | 'blocked' | 'uncertain';
  createdAt: string;
  completedAt: string | null;
  reason: string | null;
  preview: MailPreview | null;
}
export const REPORT_RULES_VERSION = 'proposal-1';
export const REPORT_RULES = [
  'Dewi actief = unieke leden met een geldig abonnement; gepauzeerd en bevroren worden apart getoond en tellen niet mee als actief. Healthplanner bezoekend actief is een andere maatstaf.',
  'startDate telt inclusief. endDate is de eerste dag zonder abonnement (exclusief); controleer de betekenis van een Dewi einddatum vóór mapping.',
  'Uitstroom gebruikt de effectieve einddatum, niet de aanvraagdatum. Geen uitstroom bij een ander doorlopend abonnement in dezelfde club.',
  'Churn = unieke uitgestroomde leden in de maand / unieke actieve leden bij aanvang van de eerste dag. Bij nul beginleden is churn onbekend.',
  'Een aansluitend abonnement in een andere club is een verhuizing: apart geteld, geen opzegging. Organisatietotalen ontdubbelen memberId over alle clubs.',
  'Pauze of bevriezing is geen opzegging. Herinschrijving na een gat wordt apart geteld; nieuwe leden hebben geen eerder abonnement in de organisatie.',
  'Financiële events zijn afzonderlijke omzet, ontvangen betaling en saldo. Openstaand en mislukte incasso zijn snapshots op de einddatum; geen optelling van dagelijkse saldi.',
  'Conversie = som geconverteerde leads / som leads. Percentages worden niet opgeteld; dit vereist dezelfde leadcohortdefinitie bij alle clubs.',
  'Onvolledige of ontbrekende gegevens blijven onbekend. Berekeningen zijn voorstellen totdat een beheerder deze versie goedkeurt.',
] as const;
