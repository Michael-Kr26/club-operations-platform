import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import type { ForecastDashboard } from '@cop/contracts';
import { WorkbookOverview } from './WorkbookOverview';
afterEach(cleanup);
it('toont gezamenlijke clubcijfers, onbekende waarden, nul, bronconflicten en periodekeuze', () => {
  const select = vi.fn();
  const data = {
    organization: {
      id: 'test',
      name: 'Test',
      locations: [
        { id: 'a', name: 'Club A' },
        { id: 'b', name: 'Club B' },
      ],
    },
    dataset: 'real',
    imports: [],
    combined: {
      supplements: [],
      warnings: ['Geen unieke organisatietelling'],
      periods: [
        {
          period: '2026W42',
          type: 'week',
          rows: [
            {
              locationId: 'a',
              values: {
                total: 10,
                withoutAppointment: 0,
                withoutAppointmentRatio: 0,
              },
              source: {
                id: 'source',
                filename: 'hp.xlsx',
                importedAt: '2026-10-18T10:00:00Z',
              },
              conflict: true,
            },
            { locationId: 'b', values: {}, source: null, conflict: false },
          ],
          totals: { total: null, withoutAppointment: null },
        },
        { period: '202610', type: 'month', rows: [], totals: {} },
      ],
    },
  } as unknown as ForecastDashboard;
  render(<WorkbookOverview data={data} selectSource={select} />);
  expect(screen.getAllByText('Onbekend').length).toBeGreaterThan(1);
  expect(screen.getByText('0%')).toBeInTheDocument();
  expect(
    screen.getByText('Afwijkende oudere bron aanwezig'),
  ).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'hp.xlsx' }));
  expect(select).toHaveBeenCalledWith('source');
  const print = vi.spyOn(window, 'print').mockImplementation(() => {});
  fireEvent.click(screen.getByRole('button', { name: 'Opslaan als PDF' }));
  expect(print).toHaveBeenCalledTimes(1);
  print.mockRestore();
  fireEvent.change(screen.getByLabelText('Overzichtsperiode'), {
    target: { value: 'month' },
  });
  expect(screen.getByLabelText('Gezamenlijke bronperiode')).toHaveValue(
    '202610',
  );
});
