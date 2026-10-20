import { describe, it, expect } from 'vitest';
import type { ForecastDashboard } from '@cop/contracts';
import { calculateReport, reportPeriod } from './calculation.js';
import { previewMail } from './mail.js';
import { dueRuns, canDeliverReport } from './delivery.js';
import { defaultSettings } from './store.js';
const org = {
  id: 'fixture',
  name: 'Voorbeeld <script>alert(1)</script>',
  locations: [
    { id: 'a', name: 'Club A' },
    { id: 'b', name: 'Club B' },
  ],
};
function fixture(kind: 'daily' | 'weekly' | 'monthly' = 'daily') {
  return calculateReport(
    org,
    [],
    'demo',
    kind,
    '2026-10-18',
    defaultSettings,
    new Date('2026-10-20T06:45:00Z'),
  );
}
describe('vastgesteld blauw/oranje mailontwerp', () => {
  it('maakt de aanhef instelbaar zonder HTML-injectie', () => {
    const p = previewMail(fixture(), [], 'local-test-only', {
      greetingName: 'Chico <script>',
    });
    expect(p.html).toContain('Goedemorgen, Chico &lt;script&gt;.');
    expect(p.html).not.toContain('<script>');
  });
  it('gebruikt echte HTML-tabellen, beide kleuren, veilige tekst, scoped CTA en geen dagelijkse/maandelijkse omzet', () => {
    for (const kind of ['daily', 'monthly'] as const) {
      const r = fixture(kind);
      r.clubs.forEach((c) => {
        c.metrics.revenue = 123456;
        c.metrics.withoutFutureAppointment = 0;
      });
      r.total.revenue = 246912;
      const p = previewMail(r, ['fixture@example.invalid']);
      expect(p.html).toContain('#235ee8');
      expect(p.html).toContain('#fff0e3');
      expect(p.html).toContain('Georgia');
      expect(p.html).toContain('scope="col"');
      expect(p.html).not.toContain('<script>');
      expect(p.html).not.toContain('1.234,56');
      expect(p.text).not.toContain('2.469,12');
      expect(p.text).toContain('uitsluitend in het weekrapport');
      expect(p.html).toContain(
        '/organisaties/fixture/rapportages/excel?dataset=demo',
      );
      expect(p.text).toContain('Onbekend');
    }
  });
  it('vult alleen ontbrekende dagvelden uit dezelfde HP-periode en houdt Dewi-selectie afzonderlijk', () => {
    const dashboard = {
      organization: org,
      dataset: 'demo',
      imports: [
        {
          id: 'hp',
          status: 'accepted',
          importedAt: '2026-10-19T07:00:00Z',
          filename: 'dag.eml',
          locationId: null,
          report: {
            kind: 'healthplanner',
            rows: [
              {
                period: '2026-10-18',
                locationId: 'a',
                values: {
                  sold: 3,
                  leads: 5,
                  appointments: 4,
                  withoutAppointment: 12,
                },
              },
              { period: '2026-10-17', locationId: 'b', values: { sold: 9999 } },
            ],
          },
        },
        {
          id: 'm',
          status: 'accepted',
          importedAt: '2026-10-19T07:01:00Z',
          filename: 'leden.xlsx',
          locationId: 'a',
          report: {
            kind: 'members',
            period: '2026-10-18',
            rows: [{ locationId: 'a', values: { total: 314 } }],
          },
        },
        {
          id: 'future',
          status: 'accepted',
          importedAt: '2026-10-19T07:02:00Z',
          filename: 'toekomst.xlsx',
          locationId: 'a',
          report: {
            kind: 'members',
            period: '2026-10-19',
            rows: [{ locationId: 'a', values: { total: 9998 } }],
          },
        },
      ],
    } as unknown as ForecastDashboard;
    const r = fixture();
    r.clubs[0]!.metrics.leads = 7;
    const p = previewMail(r, [], 'local-test-only', { dashboard });
    expect(p.text).toContain('Club A | 7 | 3 | 4');
    expect(p.text).toContain('Club A | 314 | 2026-10-18');
    expect(p.text).not.toContain('9999');
    expect(p.text).not.toContain('9998');
    expect(p.text).toContain('selectie bewijst geen volledig actief');
    const foreign = previewMail(r, [], 'local-test-only', {
      dashboard: { ...dashboard, organization: { ...org, id: 'ander' } },
    });
    expect(foreign.text).not.toContain('314');
    const scoped = {
      ...r,
      organization: { ...org, locations: [org.locations[0]!] },
      clubs: [r.clubs[0]!],
    };
    expect(
      previewMail(scoped, [], 'local-test-only', { dashboard }).text,
    ).not.toContain('Club B');
  });
  it('toont weekomzet afzonderlijk, blokkeert open/onvolledige weken en berekent weekgrenzen rond jaarwisseling', () => {
    expect(reportPeriod('weekly', '2027-01-01')).toEqual({
      from: '2026-12-28',
      through: '2027-01-03',
    });
    const r = fixture('weekly');
    r.provisional = false;
    r.clubs.forEach((c) => {
      c.metrics.revenue = 123456;
    });
    r.sources
      .filter((s) => s.source === 'dewi-finance')
      .forEach((s) => (s.status = 'ready'));
    const settings = {
      ...defaultSettings,
      rulesApproved: true,
      recipients: ['fixture@example.invalid'],
    };
    expect(canDeliverReport(r, settings)).toBe(true);
    expect(previewMail(r, []).text).toContain('1.234,56');
    expect(previewMail(r, []).text).not.toContain('Verkoop, afspraken');
    r.clubs[1]!.metrics.revenue = null;
    expect(canDeliverReport(r, settings)).toBe(false);
    r.clubs[1]!.metrics.revenue = 123456;
    r.through = '2026-10-25';
    expect(canDeliverReport(r, settings)).toBe(false);
  });
  it('plant weekmail alleen op de gekozen dag voor de vorige volledige week en registreert gemiste runs', () => {
    expect(
      dueRuns(new Date('2026-10-20T06:45:00Z'), '08:45').some(
        (r) => r.kind === 'weekly',
      ),
    ).toBe(false);
    expect(
      dueRuns(new Date('2026-10-20T06:45:00Z'), '08:45', 2).find(
        (r) => r.kind === 'weekly',
      ),
    ).toEqual({ kind: 'weekly', date: '2026-10-18', missed: false });
    expect(
      dueRuns(new Date('2026-10-21T06:45:00Z'), '08:45', 2).find(
        (r) => r.kind === 'weekly',
      )?.missed,
    ).toBe(true);
    expect(
      dueRuns(new Date('2026-10-27T07:45:00Z'), '08:45', 2).find(
        (r) => r.kind === 'weekly',
      ),
    ).toEqual({ kind: 'weekly', date: '2026-10-25', missed: false });
  });
});
