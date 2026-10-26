import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { LocalMaintenancePanel } from './LocalMaintenancePanel';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});
describe('lokale back-upbediening', () => {
  it('vraagt een kopie aan en toont alleen na succes de opgeslagen status', async () => {
    const fetcher = vi.spyOn(globalThis, 'fetch').mockImplementation(
      async (_url, init) =>
        new Response(
          JSON.stringify({
            directory: 'test/backups',
            error: null,
            backups:
              init?.method === 'POST'
                ? [
                    {
                      name: 'test.copbackup',
                      createdAt: '2026-10-26T10:00:00Z',
                      bytes: 2048,
                      kind: 'manual',
                    },
                  ]
                : [],
          }),
          { headers: { 'content-type': 'application/json' } },
        ),
    );
    render(
      <MemoryRouter>
        <QueryClientProvider
          client={
            new QueryClient({ defaultOptions: { queries: { retry: false } } })
          }
        >
          <LocalMaintenancePanel />
        </QueryClientProvider>
      </MemoryRouter>,
    );
    await screen.findByText('Nog geen back-ups beschikbaar.');
    fireEvent.click(screen.getByRole('button', { name: 'Nu back-up maken' }));
    await screen.findByText('Back-up opgeslagen.');
    expect(screen.getByText(/Handmatig · 2 KB/)).toBeInTheDocument();
    expect(
      fetcher.mock.calls.some(
        ([url, init]) =>
          String(url).endsWith('/local-maintenance/backup') &&
          init?.method === 'POST',
      ),
    ).toBe(true);
  });
});
