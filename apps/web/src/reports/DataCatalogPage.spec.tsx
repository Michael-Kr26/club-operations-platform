import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Route, Routes } from 'react-router';
import { DataCatalogPage } from './DataCatalogPage';
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});
function setup(path = '/gegevens') {
  const location = {
    id: 'achterveld',
    name: 'Achterveld',
    status: 'missing',
    availableFields: [],
    missingFields: ['Bedrag'],
    source: null,
  };
  const base = {
    description: 'Brongegevens',
    formats: 'XLSX',
    needed: 'Bronbestand',
    note: 'Controleer de bronperiode.',
    route: 'files',
    locations: [location],
  };
  const fetcher = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
    new Response(
      JSON.stringify({
        organization: {
          id: 'sport-society',
          name: 'Sport Society',
          locations: [{ id: 'achterveld', name: 'Achterveld' }],
        },
        dataset: 'real',
        checkedAt: '2026-10-23T08:00:00Z',
        entries: [
          {
            ...base,
            id: 'omzet',
            category: 'Omzet',
            title: 'Omzetcijfers',
            status: 'missing',
          },
          {
            ...base,
            id: 'les',
            category: 'Lessen',
            title: 'Lesdeelname',
            status: 'planned',
            route: null,
            locations: [{ ...location, status: 'planned', missingFields: [] }],
          },
        ],
        unprocessedFiles: [
          {
            filename: 'Omzet/Achterveld/rapport.pdf',
            status: 'unsupported',
            message: 'PDF gevonden; nog niet verwerkt.',
          },
        ],
      }),
      { status: 200, headers: { 'content-type': 'application/json' } },
    ),
  );
  render(
    <QueryClientProvider
      client={
        new QueryClient({ defaultOptions: { queries: { retry: false } } })
      }
    >
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path="/gegevens" element={<DataCatalogPage />} />
          <Route
            path="/organisaties/:organizationSlug/gegevens"
            element={<DataCatalogPage />}
          />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
  return fetcher;
}
describe('overzicht gegevens en imports', () => {
  it('toont categorieën, gevonden maar onverwerkte PDFs en filtert categorie', async () => {
    setup();
    await screen.findByRole('heading', { name: 'Omzetcijfers' });
    expect(
      screen.getByText('Omzet/Achterveld/rapport.pdf'),
    ).toBeInTheDocument();
    expect(
      screen.getByText('PDF gevonden; nog niet verwerkt.'),
    ).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Categorie'), {
      target: { value: 'Lessen' },
    });
    expect(
      screen.getByRole('heading', { name: 'Lesdeelname' }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('heading', { name: 'Omzetcijfers' }),
    ).not.toBeInTheDocument();
  });
  it('gebruikt de organisatie en dataset van de route', async () => {
    const fetcher = setup('/organisaties/other/gegevens?dataset=demo');
    await screen.findByRole('heading', { name: 'Omzetcijfers' });
    expect(fetcher.mock.calls[0]?.[0]).toBe(
      '/api/v1/organizations/other/reports/data-catalog?dataset=demo',
    );
    expect(
      screen.getByRole('link', { name: 'Bestanden importeren' }),
    ).toHaveAttribute(
      'href',
      '/organisaties/other/rapportages/excel?dataset=demo',
    );
  });
});
