import { expect, it } from 'vitest';
import type { CombinedPeriod, ForecastDashboard } from '@cop/contracts';
import { workbookCsv } from './workbook-export';
it('exporteert geselecteerde bronwaarden met nul/onbekend, demo-label en onschadelijke Excel-tekst', () => {
  const data = {
    dataset: 'demo',
    organization: {
      name: 'Test; organisatie',
      locations: [{ id: 'a', name: 'Club A' }],
    },
  } as ForecastDashboard;
  const period = {
    period: '202609',
    type: 'month',
    rows: [
      {
        locationId: 'a',
        values: { total: 0, withoutAppointment: null },
        source: {
          id: 'src',
          filename: '=HYPERLINK("test")',
          importedAt: '2026-10-18',
        },
        conflict: false,
      },
    ],
    totals: { total: 0, withoutAppointment: null },
  } as CombinedPeriod;
  const csv = workbookCsv(data, period, [
    ['total', 'Leden'],
    ['withoutAppointment', 'Zonder afspraak'],
  ]);
  expect(csv.startsWith('\uFEFF')).toBe(true);
  expect(csv).toContain('"DEMO";"202609";"Club A";0;');
  expect(csv).toContain('"Test; organisatie"');
  expect(csv).toContain('"\'=HYPERLINK(""test"")"');
  expect(csv).toContain('"Onbekend"');
  expect(csv).toContain('Som clubregistraties (geen unieke leden)');
});
