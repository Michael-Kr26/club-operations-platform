import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import type { ForecastDashboard } from '@cop/contracts';
import { PaymentPdfUpload } from './PaymentPdfUpload';
afterEach(cleanup);
describe('PDF bevestigen vanuit importmap', () => {
  it('vereist club en periode en verstuurt de bevestigde context', async () => {
    const request = vi.fn().mockResolvedValue({ status: 'accepted' }),
      updated = vi.fn().mockResolvedValue(undefined);
    const data: ForecastDashboard = {
      organization: {
        id: 'sport-society',
        name: 'Sport Society',
        locations: [{ id: 'achterveld', name: 'Achterveld' }],
      },
      dataset: 'real',
      imports: [],
      inbox: {
        available: true,
        enabled: true,
        path: 'imports',
        lastScan: null,
        error: null,
        files: [
          {
            filename: 'Omzet/Achterveld/augustus.pdf',
            status: 'rejected',
            message: 'Bevestig de periode.',
          },
        ],
      },
    };
    render(
      <PaymentPdfUpload
        data={data}
        base="organizations/sport-society/reports"
        request={request}
        onImported={updated}
      />,
    );
    expect(
      screen.getByRole('button', { name: 'PDF importeren' }),
    ).toBeDisabled();
    fireEvent.change(screen.getByLabelText('PDF uit importmap'), {
      target: { value: 'Omzet/Achterveld/augustus.pdf' },
    });
    fireEvent.change(screen.getByLabelText('Locatie'), {
      target: { value: 'achterveld' },
    });
    fireEvent.change(screen.getByLabelText('Vanaf (inclusief)'), {
      target: { value: '2026-08-01' },
    });
    fireEvent.change(screen.getByLabelText('T/m (inclusief)'), {
      target: { value: '2026-08-31' },
    });
    fireEvent.click(screen.getByRole('checkbox'));
    fireEvent.click(screen.getByRole('button', { name: 'PDF importeren' }));
    await vi.waitFor(() => expect(updated).toHaveBeenCalledOnce());
    expect(request).toHaveBeenCalledWith(
      'organizations/sport-society/reports/workbooks/inbox/confirm-pdf',
      {
        dataset: 'real',
        filename: 'Omzet/Achterveld/augustus.pdf',
        locationId: 'achterveld',
        from: '2026-08-01',
        through: '2026-08-31',
        scopeConfirmed: true,
        periodConfirmed: true,
      },
    );
  });
});
