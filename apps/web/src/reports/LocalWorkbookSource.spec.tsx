import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { LocalWorkbookSource } from './LocalWorkbookSource';
afterEach(cleanup);
describe('vaste lokale bronstatus', () => {
  it('toont bronfouten en laat opnieuw ophalen zonder een pad naar de server te sturen', async () => {
    const request = vi.fn().mockResolvedValue({});
    const updated = vi.fn().mockResolvedValue(undefined);
    render(
      <LocalWorkbookSource
        source={{
          enabled: true,
          path: 'C:\\local\\Healthplanner_leden_updates.xlsx',
          lastCheckedAt: null,
          lastImportedAt: null,
          status: 'error',
          message: 'Bronbestand niet gevonden.',
        }}
        base="organizations/sport-society/reports"
        request={request}
        onUpdated={updated}
      />,
    );
    expect(screen.getByRole('alert')).toHaveTextContent(
      'Bronbestand niet gevonden.',
    );
    fireEvent.click(screen.getByRole('button', { name: 'Nu ophalen' }));
    await vi.waitFor(() => expect(updated).toHaveBeenCalledOnce());
    expect(request).toHaveBeenCalledWith(
      'organizations/sport-society/reports/workbooks/local-file',
      {},
    );
  });
});
