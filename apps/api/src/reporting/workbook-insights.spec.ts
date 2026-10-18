import { describe, expect, it } from 'vitest';
import type { CombinedPeriod, ForecastImport } from '@cop/contracts';
import {
  addWorkbookInsights,
  supplementChanges,
  workbookPeriod,
} from './workbook-insights.js';
const now = new Date('2026-10-18T10:00:00Z');
function period(
  label: string,
  total: number | null,
  appointments: number | null,
): CombinedPeriod {
  const values = {
    total,
    withoutAppointment: appointments,
    withoutGoal: 0,
    withoutCoach: 0,
    withoutAppointmentRatio:
      total && appointments !== null ? appointments / total : null,
  };
  return {
    period: label,
    type: label.includes('W') ? 'week' : 'month',
    totals: values,
    rows: [
      {
        locationId: 'a',
        values,
        source: {
          id: label,
          filename: 'hp.xlsx',
          importedAt: now.toISOString(),
        },
        conflict: false,
      },
    ],
  };
}
describe('kalendervergelijking en signalering', () => {
  it('handelt ISO-weekjaren, schrikkelmaand en jaarwisseling af', () => {
    expect(workbookPeriod('2027W01', 'week')).toMatchObject({
      previous: '2026W53',
      through: '2027-01-10',
    });
    expect(workbookPeriod('202601', 'month').previous).toBe('202512');
    expect(workbookPeriod('202802', 'month').through).toBe('2028-02-29');
    expect(workbookPeriod('2026-03-30', 'day').previous).toBe('2026-03-29');
  });
  it('berekent absolute en procentuele verschillen over aangrenzende afgesloten periodes', () => {
    const periods = [period('2026W40', 100, 10), period('2026W41', 120, 20)];
    addWorkbookInsights(periods, undefined, now);
    expect(periods[1]!.comparison).toMatchObject({
      reason: null,
      previousPeriod: '2026W40',
      totals: {
        total: { difference: 20, percent: 20 },
        withoutAppointment: { difference: 10, percent: 100 },
      },
    });
    expect(periods[1]!.attention?.map((a) => a.code)).toContain(
      'appointment-increase',
    );
  });
  it('gebruikt geen oudere vervanger en vergelijkt een lopende maand niet met een hele maand', () => {
    const periods = [
      period('2026W39', 10, 2),
      period('2026W41', 20, 4),
      period('202609', 10, 2),
      period('202610', 20, 4),
    ];
    addWorkbookInsights(periods, undefined, now);
    expect(periods[1]!.comparison?.reason).toContain('ontbreekt');
    expect(periods[1]!.comparison?.totals.total?.difference).toBeNull();
    expect(periods[3]!.comparison?.reason).toContain('niet afgesloten');
    expect(periods[3]!.comparison?.totals.total?.difference).toBeNull();
  });
  it('behoudt nul en onbekend en past de gekozen signaalgrenzen toe', () => {
    const periods = [period('2026W40', 100, 0), period('2026W41', 100, 30)];
    periods[1]!.rows[0]!.values.withoutCoach = null;
    addWorkbookInsights(
      periods,
      { withoutAppointmentPercent: 30, increasePercent: 20, staleDays: 7 },
      now,
    );
    expect(periods[1]!.comparison?.totals.withoutAppointment).toEqual({
      difference: 30,
      percent: null,
    });
    expect(periods[1]!.attention?.map((a) => a.code)).toEqual([
      'missing-values',
      'appointment-ratio',
    ]);
    addWorkbookInsights(
      periods,
      { withoutAppointmentPercent: 31, increasePercent: 20, staleDays: 7 },
      now,
    );
    expect(
      periods[1]!.attention?.some((a) => a.code === 'appointment-ratio'),
    ).toBe(false);
  });
  it('onderscheidt ontbrekende clubs, bronconflicten, verouderde laatste invoer en lege toekomstkolommen', () => {
    const old = period('2026W30', 10, 2);
    old.rows[0]!.conflict = true;
    old.rows.push({
      locationId: 'b',
      values: {},
      source: null,
      conflict: false,
    });
    const future = period('2027W01', null, null);
    addWorkbookInsights([old, future], undefined, now);
    expect(old.attention?.map((a) => a.code)).toEqual([
      'conflicting-source',
      'missing-source',
      'stale-source',
    ]);
    expect(future.attention).toEqual([]);
  });
  it('gebruikt Amsterdam voor het afsluiten van een week rond zomertijd', () => {
    const periods = [period('2026W12', 10, 1), period('2026W13', 11, 1)];
    addWorkbookInsights(periods, undefined, new Date('2026-03-29T21:59:00Z'));
    expect(periods[1]!.comparison?.reason).toContain('niet afgesloten');
    addWorkbookInsights(periods, undefined, new Date('2026-03-29T22:01:00Z'));
    expect(periods[1]!.comparison?.reason).toBeNull();
  });
});
function revenue(
  id: string,
  period: string,
  value: number,
  locationId = 'a',
): ForecastImport {
  return {
    id,
    dataset: 'real',
    filename: 'omzet.xlsx',
    locationId,
    importedAt: now.toISOString(),
    status: 'accepted',
    error: null,
    report: {
      kind: 'finance',
      locationIds: [locationId],
      period,
      cards: [{ label: 'Omzet', value, format: 'money' }],
      rows: [],
      categories: [],
      warnings: [],
    },
  };
}
it('vergelijkt omzet alleen met de vorige volledige maand van dezelfde club', () => {
  const august = revenue('aug', '2026-08-01 t/m 2026-08-31', 10000);
  const september = revenue('sep', '2026-09-01 t/m 2026-09-30', 10400);
  const october = revenue('oct', '2026-10-01 t/m 2026-10-31', 5000);
  const partial = revenue('part', '2026-09-01 t/m 2026-09-15', 5000);
  const other = revenue('other', '2026-09-01 t/m 2026-09-30', 10400, 'b');
  const result = supplementChanges(
    [august, september, october, partial, other],
    now,
  );
  expect(result.sep?.changes.Omzet).toEqual({ difference: 400, percent: 4 });
  expect(result.oct?.reason).toContain('niet afgesloten');
  expect(result.part?.reason).toContain('Geen volledige');
  expect(result.other?.changes.Omzet?.difference).toBeNull();
});
