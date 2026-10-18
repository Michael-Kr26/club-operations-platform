import { afterEach, expect, it, vi } from 'vitest';
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import type { ForecastDashboard } from '@cop/contracts';
import { WorkbookUpload, type WorkbookRequest } from './WorkbookUpload';
afterEach(cleanup);
it('controleert zonder import, toont onthouden voorstellen en vereist nieuwe controle na een gewijzigde club', async () => {
  const data = {
    dataset: 'real',
    organization: {
      locations: [
        { id: 'barneveld', name: 'Barneveld' },
        { id: 'harskamp', name: 'Harskamp' },
      ],
    },
  } as ForecastDashboard;
  const preview = {
    filename: 'omzet.xlsx',
    kind: 'finance',
    status: 'ready',
    error: null,
    locationId: 'barneveld',
    asOf: null,
    suggested: true,
    warnings: [],
  };
  const request = vi
    .fn()
    .mockResolvedValueOnce([preview])
    .mockResolvedValueOnce([
      { ...preview, locationId: 'harskamp', suggested: false },
    ])
    .mockResolvedValueOnce({
      id: 'zip',
      summary: '1/1 verwerkt.',
      results: [{ filename: 'omzet.xlsx', status: 'accepted', error: null }],
    });
  const imported = vi.fn().mockResolvedValue(undefined);
  render(
    <WorkbookUpload
      data={data}
      base="organizations/test/reports"
      request={request as WorkbookRequest}
      onImported={imported}
    />,
  );
  fireEvent.change(screen.getByLabelText('ZIP, Excel of managementmail'), {
    target: {
      files: [
        new File(['synthetic-zip'], 'pakket.zip', { type: 'application/zip' }),
      ],
    },
  });
  fireEvent.click(
    screen.getByRole('button', { name: 'Bestanden controleren' }),
  );
  await screen.findByText(/Onthouden locatie voorgesteld/);
  expect(request).toHaveBeenCalledTimes(1);
  expect(request.mock.calls[0]![0]).toBe(
    'organizations/test/reports/workbooks/preview',
  );
  expect(imported).not.toHaveBeenCalled();
  const submit = screen.getByRole('button', {
    name: 'Verwerk 1 geldige bestanden',
  });
  expect(submit).toBeDisabled();
  fireEvent.click(
    screen.getByLabelText(
      'Ik bevestig de getoonde clubs en werkelijke peildatums.',
    ),
  );
  expect(submit).toBeEnabled();
  fireEvent.change(screen.getByLabelText('Locatie voor omzet.xlsx'), {
    target: { value: 'harskamp' },
  });
  expect(submit).toBeDisabled();
  expect(
    screen.getByLabelText(
      'Ik bevestig de getoonde clubs en werkelijke peildatums.',
    ),
  ).not.toBeChecked();
  fireEvent.click(screen.getByRole('button', { name: 'Opnieuw controleren' }));
  await waitFor(() => expect(request).toHaveBeenCalledTimes(2));
  await waitFor(() =>
    expect(
      screen.getByRole('button', { name: 'Opnieuw controleren' }),
    ).toBeEnabled(),
  );
  fireEvent.click(
    screen.getByLabelText(
      'Ik bevestig de getoonde clubs en werkelijke peildatums.',
    ),
  );
  fireEvent.click(submit);
  await waitFor(() => expect(imported).toHaveBeenCalledTimes(1));
  expect(request).toHaveBeenLastCalledWith(
    'organizations/test/reports/workbooks/zip',
    expect.objectContaining({
      dataset: 'real',
      rememberMapping: true,
      fileContexts: {
        'omzet.xlsx': {
          locationId: 'harskamp',
          asOf: '',
          scopeConfirmed: true,
        },
      },
    }),
  );
});
