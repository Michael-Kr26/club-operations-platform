import { afterEach, it, expect } from 'vitest';
import { cleanup, render, screen, fireEvent } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router';
import { ReportCharts } from './ReportCharts';
import { chartFixture } from './chart-fixtures';
afterEach(cleanup);
it('toont toegankelijke lijnen, staven, focuswaarden en filters zonder meetgaten te overbruggen', () => {
  render(
    <MemoryRouter initialEntries={['/?date=2026-10-18']}>
      <QueryClientProvider client={new QueryClient()}>
        <ReportCharts data={chartFixture()} />
      </QueryClientProvider>
    </MemoryRouter>,
  );
  expect(
    screen.getByRole('group', { name: /Lijngrafiek met meetpunten/ }),
  ).toBeInTheDocument();
  expect(
    screen.getByRole('group', { name: /Staafdiagram per locatie/ }),
  ).toBeInTheDocument();
  const buttons = screen.getAllByRole('button', {
    name: /Club A · 2026W42 · 0/,
  });
  fireEvent.focus(buttons[0]!);
  expect(screen.getByRole('status')).toHaveTextContent('nieuwste.xlsx');
  const path = document.querySelector('svg path')!;
  expect(path.getAttribute('d')?.match(/M/g)?.length).toBe(2);
  expect(path.getAttribute('d')).not.toContain('L');
  fireEvent.change(screen.getByLabelText('Locatie'), {
    target: { value: 'a' },
  });
  expect(screen.queryByText('Club B (2)')).not.toBeInTheDocument();
  expect(screen.getByText(/Som van clubregistraties/i)).toBeInTheDocument();
});
