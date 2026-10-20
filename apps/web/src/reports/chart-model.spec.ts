import { it, expect } from 'vitest';
import type { ManagementReport } from '@cop/contracts';
import { buildChartRows, closedWeekEnd, periodBounds } from './chart-model';
import { chartFixture } from './chart-fixtures';
it('gebruikt canonieke HP-dagimports en bewaart een nieuwere onbekende werkboekwaarde', () => {
  const data = chartFixture();
  data.combined!.periods = [];
  const report = {
    organization: data.organization,
    dataset: 'demo',
    kind: 'daily',
    from: '2026-10-18',
    through: '2026-10-18',
    clubs: [{ id: 'a', metrics: { appointments: 7 } }],
    sources: [
      {
        source: 'healthplanner',
        locationId: 'a',
        status: 'ready',
        importedAt: '2026-10-18T08:33:00Z',
        importId: 'canonical',
      },
    ],
  } as ManagementReport;
  expect(
    buildChartRows(data, 'hp', 'appointments', 'day', '2026-10-18', 1, [
      report,
    ])[0]!.values.a,
  ).toBe(7);
  data.combined!.periods = [
    {
      period: '2026-10-18',
      type: 'day',
      totals: {},
      rows: [
        {
          locationId: 'a',
          values: { appointments: null },
          source: {
            id: 'new',
            filename: 'nieuwer.eml',
            importedAt: '2026-10-19T08:33:00Z',
          },
          conflict: false,
        },
      ],
    },
  ];
  const point = buildChartRows(
    data,
    'hp',
    'appointments',
    'day',
    '2026-10-18',
    1,
    [report],
  )[0]!;
  expect(point.values.a).toBeNull();
  expect(point.sources.a).toContain('nieuwer.eml');
});
it('behoudt kalendergaten, nul, bronperioden en locatiescope', () => {
  const data = chartFixture();
  const rows = buildChartRows(
    data,
    'hp',
    'withoutAppointment',
    'week',
    '2026-10-18',
    3,
  );
  expect(rows.map((r) => r.period)).toEqual(['2026W40', '2026W41', '2026W42']);
  expect(rows[0]!.values.a).toBe(10);
  expect(rows[1]!.values.a).toBeUndefined();
  expect(rows[2]!.values.a).toBe(0);
  expect(rows.every((r) => r.values.secret === undefined)).toBe(true);
  expect(rows[2]!.sources.a).toContain('nieuwste.xlsx');
});
it('verdeelt geen maandexport over weken en verwerpt vreemde tenants/datasets', () => {
  const data = chartFixture();
  data.imports = [
    {
      id: 'maand',
      dataset: 'demo',
      status: 'accepted',
      filename: 'omzet.xlsx',
      locationId: 'a',
      importedAt: '2026-10-18',
      error: null,
      report: {
        kind: 'finance',
        period: '2026-09-01 t/m 2026-09-30',
        locationIds: ['a'],
        cards: [{ label: 'Omzet', value: 100000, format: 'money' }],
        rows: [],
        categories: [],
        warnings: [],
      },
    },
  ];
  expect(
    buildChartRows(data, 'finance', 'revenue', 'week', '2026-10-18', 3).every(
      (r) => r.values.a === undefined,
    ),
  ).toBe(true);
  const other = {
    organization: { ...data.organization, id: 'ander' },
    dataset: 'demo',
    kind: 'weekly',
    from: '2026-10-12',
    through: '2026-10-18',
    clubs: [{ id: 'a', metrics: { revenue: 100 } }],
  } as ManagementReport;
  expect(
    buildChartRows(data, 'finance', 'revenue', 'week', '2026-10-18', 1, [
      other,
    ])[0]!.values.a,
  ).toBeUndefined();
});
it('kiest gesloten weken en correcte ISO-weken over jaargrenzen', () => {
  expect(closedWeekEnd('2026-10-20')).toBe('2026-10-18');
  expect(closedWeekEnd('2026-10-18')).toBe('2026-10-18');
  expect(periodBounds('2026W53')).toMatchObject({
    start: '2026-12-28',
    through: '2027-01-03',
  });
});
