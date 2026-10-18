import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import type { DewiForecast, WorkbookSupplement } from '@cop/contracts';
import { ForecastView, SupplementView } from './WorkbookDashboard';
afterEach(cleanup);
const report: DewiForecast = {
  kind: 'forecast',
  locationId: 'barneveld',
  exportedOn: '2026-10-12',
  sourceSheet: 'Forecast KPI Ja',
  warnings: ['Bronbeeld, geen definitieve churn.'],
  months: ['2026-09', '2026-10', '2026-11'].map((month) => ({
    month,
    opening: 100,
    joiners: 0,
    better: 0,
    movementIn: 0,
    leavers: 2,
    sick: 0,
    movementOut: 2,
    closing: 98,
    net: -2,
    indicativeChurn: 0.02,
    nextOpeningDifference: 2,
    warnings: [],
  })),
};
describe('Excel-dashboard bronweergaven', () => {
  it('toont actuele exportmaand en maakt de vooruitblik herkenbaar', () => {
    render(<ForecastView report={report} />);
    expect(screen.getByLabelText('Forecastmaand')).toHaveValue('2026-10');
    expect(screen.getByText('Beginstand volgens bron')).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Forecastmaand'), {
      target: { value: '2026-11' },
    });
    expect(screen.getByText(/nov.*2026 — Vooruitblik/)).toBeInTheDocument();
    expect(screen.getByRole('img')).toBeInTheDocument();
  });
  it('behoudt nul en laat ontbrekende velden als onbekend zien', () => {
    const r = {
      ...report,
      months: [
        {
          ...report.months[1]!,
          opening: null,
          closing: null,
          net: null,
          indicativeChurn: null,
        },
      ],
    };
    render(<ForecastView report={r} />);
    expect(screen.getAllByText('Onbekend').length).toBeGreaterThan(0);
    expect(screen.getAllByText('0').length).toBeGreaterThan(0);
  });
  it('berekent niets bij een ontbrekende HP-invoer en toont de clubnaam', () => {
    const hp: WorkbookSupplement = {
      kind: 'healthplanner',
      locationIds: ['barneveld'],
      period: '2026W39',
      warnings: [],
      cards: [],
      categories: [],
      rows: [
        {
          period: '2026W39',
          locationId: 'barneveld',
          values: {
            total: 10,
            withoutAppointment: null,
            withoutAppointmentRatio: null,
          },
        },
      ],
    };
    render(
      <SupplementView
        report={hp}
        locations={[{ id: 'barneveld', name: 'Barneveld' }]}
      />,
    );
    expect(screen.getAllByText('Barneveld').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Onbekend').length).toBeGreaterThan(0);
    expect(screen.queryByText('0%')).not.toBeInTheDocument();
  });
});
