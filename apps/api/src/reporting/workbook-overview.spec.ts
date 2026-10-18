import { describe, expect, it } from 'vitest';
import type { ForecastImport } from '@cop/contracts';
import { workbookOverview } from './workbook-overview.js';
import { sportSociety } from './store.js';
function source(
  id: string,
  total: number | null,
  withoutAppointment: number | null,
  date = '2026-10-18T10:00:00Z',
): ForecastImport {
  return {
    id,
    filename: id + '.xlsx',
    dataset: 'real',
    locationId: null,
    importedAt: date,
    status: 'accepted',
    error: null,
    report: {
      kind: 'healthplanner',
      locationIds: sportSociety.locations.map((l) => l.id),
      period: '2026W42',
      warnings: [],
      cards: [],
      categories: [],
      rows: sportSociety.locations.map((l, i) => ({
        locationId: l.id,
        period: '2026W42',
        values: {
          total: i === 0 ? total : 10,
          withoutAppointment: i === 0 ? withoutAppointment : 2,
          withoutAppointmentRatio: 0.5,
        },
      })),
    },
  };
}
describe('gezamenlijke bronprojectie', () => {
  it('berekent percentages uit aantallen, behoudt nul en telt geen imports dubbel', () => {
    const model = workbookOverview(sportSociety, [
      source('new', 100, 0),
      source('old', 200, 5, '2026-10-17T10:00:00Z'),
    ]);
    const p = model.periods[0]!;
    expect(p.totals.total).toBe(140);
    expect(p.totals.withoutAppointment).toBe(8);
    expect(p.totals.withoutAppointmentRatio).toBe(8 / 140);
    expect(p.rows[0]!.values.withoutAppointment).toBe(0);
    expect(p.rows[0]!.conflict).toBe(true);
  });
  it('vult ontbrekende recente waarden niet met oudere gegevens en isoleert clubs', () => {
    const model = workbookOverview(sportSociety, [
      source('new', null, null),
      source('old', 200, 5, '2026-10-17T10:00:00Z'),
    ]);
    expect(model.periods[0]!.totals.total).toBeNull();
    expect(model.periods[0]!.totals.withoutAppointmentRatio).toBeNull();
    const scoped = {
      ...sportSociety,
      locations: sportSociety.locations.slice(1, 2),
    };
    const view = workbookOverview(scoped, [source('new', 100, 2)]);
    expect(view.periods[0]!.rows).toHaveLength(1);
    expect(view.periods[0]!.totals.total).toBe(10);
    expect(workbookOverview(sportSociety, []).periods).toHaveLength(0);
  });
});
