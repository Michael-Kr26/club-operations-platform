import 'reflect-metadata';
import { describe, expect, it } from 'vitest';
import type { ForecastImport, StoredImport, Principal } from '@cop/contracts';
import { dataCatalog } from './data-catalog.js';
import { sportSociety } from './store.js';
import { ReportingService } from './service.js';
const workbook = (
  id: string,
  values: Record<string, number | null>,
  date = '2026-10-20T10:00:00Z',
): ForecastImport => ({
  id,
  dataset: 'real',
  filename: `${id}.xlsx`,
  locationId: 'achterveld',
  importedAt: date,
  status: 'accepted',
  error: null,
  report: {
    kind: 'healthplanner',
    locationIds: ['achterveld'],
    period: '202610',
    warnings: [],
    cards: [],
    categories: [],
    rows: [{ locationId: 'achterveld', period: '202610', values }],
  },
});
const entry = (id: string, files: ForecastImport[], raw: StoredImport[] = []) =>
  dataCatalog(sportSociety, 'real', files, raw).entries.find(
    (e) => e.id === id,
  )!;
const raw: StoredImport = {
  id: 'csv',
  filename: 'finance.csv',
  hash: 'fixture',
  dataset: 'real',
  status: 'accepted',
  error: null,
  importedAt: '2026-10-20T10:00:00Z',
  source: 'dewi-finance',
  from: '2026-10-12',
  through: '2026-10-18',
  locations: ['achterveld'],
  complete: false,
  rows: [
    {
      eventId: '1',
      locationId: 'achterveld',
      kind: 'revenue',
      date: '2026-10-12',
      amountCents: 0,
    },
  ],
};
describe('gegevenscatalogus op basis van echte imports', () => {
  it('onderscheidt nul, onbekende velden, ontbrekende clubs en nog te bouwen imports', () => {
    const e = entry('hp-update', [
      workbook('hp', {
        total: 0,
        withoutGoal: null,
        withoutAppointment: 0,
        withoutCoach: null,
      }),
    ]);
    expect(e.status).toBe('partial');
    expect(e.locations[0]).toMatchObject({
      status: 'partial',
      availableFields: ['Totaal leden', 'Zonder afspraak'],
      missingFields: ['Zonder doel', 'Zonder coach'],
    });
    expect(e.locations[1]?.status).toBe('missing');
    expect(entry('classes', []).status).toBe('planned');
    expect(entry('finance-pdf', []).status).toBe('planned');
    expect(
      entry('subscriptions', [workbook('hp', { total: 100 })]).status,
    ).toBe('missing');
  });
  it('vult ontbrekende waarden niet terug uit oudere bestanden of demogegevens', () => {
    const old = workbook('old', {
      total: 10,
      withoutGoal: 0,
      withoutAppointment: 1,
      withoutCoach: 0,
    });
    const latest = workbook(
      'latest',
      {
        total: 10,
        withoutGoal: null,
        withoutAppointment: null,
        withoutCoach: null,
      },
      '2026-10-21T10:00:00Z',
    );
    const demo = {
      ...old,
      id: 'demo',
      dataset: 'demo' as const,
      importedAt: '2026-10-22T10:00:00Z',
    };
    const rejected = {
      ...demo,
      id: 'bad',
      dataset: 'real' as const,
      status: 'rejected' as const,
    };
    const location = entry('hp-update', [old, latest, demo, rejected])
      .locations[0]!;
    expect(location.availableFields).toEqual(['Totaal leden']);
    expect(location.source?.filename).toBe('latest.xlsx');
  });
  it('houdt financiële bronnen en volledige dekking apart', () => {
    expect(entry('revenue', [], [raw]).locations[0]?.status).toBe('partial');
    expect(entry('payment', [], [raw]).status).toBe('missing');
    expect(entry('monthly-finance', [], [raw]).status).toBe('missing');
    expect(
      entry('revenue', [], [{ ...raw, complete: true }]).locations[0]?.status,
    ).toBe('received');
  });
  it('gebruikt geen incompatibele HP-updatetabel om dagelijkse indicatoren te overschrijven', () => {
    const daily = workbook('daily', { active: 30, sleeping: 0 });
    if (daily.report?.kind === 'healthplanner')
      daily.report.rows[0]!.period = '2026-10-20';
    const newer = workbook('weekly', { total: 50 }, '2026-10-23T10:00:00Z');
    expect(
      entry('visiting', [daily, newer]).locations[0]?.availableFields,
    ).toEqual(['Bezoekend actief', 'Slapend']);
    expect(
      entry('hp-update', [daily, newer]).locations[0]?.source?.filename,
    ).toBe('weekly.xlsx');
  });
  it('weigert toegang zonder rapportagerecht en houdt locaties, tenantquery en demo gescheiden in de service', async () => {
    const service = Object.create(
      ReportingService.prototype,
    ) as ReportingService;
    const calls: string[] = [];
    Object.assign(service, {
      organization: async () => sportSociety,
      store: {
        imports: async (org: string, dataset: string) => {
          calls.push(`${org}:${dataset}`);
          return [raw];
        },
      },
      workbooks: { list: async () => [workbook('hp', { total: 10 })] },
    });
    const principal: Principal = {
      userId: 'reader',
      organizationId: 'sport-society',
      locations: ['barneveld'],
      permissions: ['reports.read'],
    };
    const result = await service.dataCatalog(principal, 'real');
    expect(calls).toEqual(['sport-society:real']);
    expect(result.organization.locations.map((l) => l.id)).toEqual([
      'barneveld',
    ]);
    expect(JSON.stringify(result)).not.toContain('finance.csv');
    expect(JSON.stringify(result)).not.toContain('hp.xlsx');
    expect(result.unprocessedFiles).toBeUndefined();
    await expect(
      service.dataCatalog({ ...principal, permissions: [] }, 'real'),
    ).rejects.toThrow();
    await expect(
      service.dataCatalog(principal, 'bad' as 'real'),
    ).rejects.toThrow('dataset');
  });
});
