import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ReportsPage } from './ReportsPage';
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});
describe('rapportages zonder lokale aanmelding', () => {
  it('toont geen installatie-, aanmeld- of afmeldscherm wanneer de lokale eigenaar toegang heeft', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: string) => {
        if (input.endsWith('/reporting-status'))
          return Response.json({
            ready: true,
            setupRequired: false,
            localReportAccess: true,
            localAccessOrganization: 'sport-society',
            localTestMailAvailable: false,
            lastTick: null,
          });
        if (input.endsWith('/access'))
          return Response.json({
            userId: 'local-device-owner',
            organizationId: 'sport-society',
            locations: null,
            permissions: ['reports.read'],
          });
        return Response.json(null);
      }),
    );
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    render(
      <MemoryRouter>
        <QueryClientProvider client={client}>
          <ReportsPage />
        </QueryClientProvider>
      </MemoryRouter>,
    );
    expect(
      await screen.findByText(/Lokale toegang: rapportages en Excel-bestanden/),
    ).toBeInTheDocument();
    expect(await screen.findByLabelText('Gegevens')).toBeInTheDocument();
    expect(
      screen.queryByRole('heading', { name: 'Aanmelden bij rapportages' }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('heading', { name: 'Eenmalige lokale installatie' }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Afmelden' }),
    ).not.toBeInTheDocument();
    client.clear();
  });
});
