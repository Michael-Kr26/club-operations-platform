import type { ForecastDashboard } from '@cop/contracts';
export function chartFixture(): ForecastDashboard {
  return {
    organization: {
      id: 'fixture',
      name: 'Voorbeeld',
      locations: [
        { id: 'a', name: 'Club A' },
        { id: 'b', name: 'Club B' },
      ],
    },
    dataset: 'demo',
    imports: [],
    combined: {
      supplements: [],
      warnings: [],
      periods: [
        {
          period: '2026W40',
          type: 'week',
          totals: {},
          rows: [
            {
              locationId: 'a',
              values: { withoutAppointment: 10 },
              source: {
                id: '1',
                filename: 'eerste.xlsx',
                importedAt: '2026-10-02',
              },
              conflict: false,
            },
          ],
        },
        {
          period: '2026W42',
          type: 'week',
          totals: {},
          rows: [
            {
              locationId: 'a',
              values: { withoutAppointment: 0 },
              source: {
                id: '2',
                filename: 'nieuwste.xlsx',
                importedAt: '2026-10-18',
              },
              conflict: false,
            },
            {
              locationId: 'secret',
              values: { withoutAppointment: 500 },
              source: null,
              conflict: false,
            },
          ],
        },
      ],
    },
  };
}
