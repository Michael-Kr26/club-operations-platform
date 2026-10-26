import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Route, Routes } from 'react-router';
import { InventoryPage } from './InventoryPage';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});
function setup(path = '/voorraad', canWrite = true) {
  const sizes = { S: null, M: null, L: null, XL: null, XXL: null };
  const overview = {
    items: [
      {
        id: 'shirt',
        name: 'Werkshirts',
        category: 'shirts',
        quantities: { ...sizes, M: 2, L: 2, XL: 3 },
      },
      { id: 'vest', name: 'Vesten', category: 'vests', quantities: sizes },
      {
        id: 'sweater',
        name: 'Truien',
        category: 'sweaters',
        quantities: sizes,
      },
      {
        id: 'bag',
        name: 'Tassen',
        category: 'bags',
        quantities: { total: null },
      },
    ],
    version: 1,
    updatedAt: null,
    canWrite,
  };
  const fetcher = vi
    .spyOn(globalThis, 'fetch')
    .mockImplementation(async (_url, init) => {
      const saved = init?.body ? JSON.parse(String(init.body)) : null;
      return new Response(
        JSON.stringify(
          saved ? { ...overview, items: saved.items, version: 2 } : overview,
        ),
        { status: 200, headers: { 'content-type': 'application/json' } },
      );
    });
  render(
    <QueryClientProvider
      client={
        new QueryClient({ defaultOptions: { queries: { retry: false } } })
      }
    >
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path="/voorraad" element={<InventoryPage />} />
          <Route
            path="/organisaties/:organizationSlug/voorraad"
            element={<InventoryPage />}
          />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
  return fetcher;
}
describe('voorraadbeheer', () => {
  it('slaat onbekend en nul met de huidige versie afzonderlijk op', async () => {
    const fetcher = setup();
    expect(await screen.findByLabelText('Werkshirts M')).toHaveValue(2);
    expect(screen.getByLabelText('Werkshirts XL')).toHaveValue(3);
    expect(screen.getByLabelText('Werkshirts S')).toHaveValue(null);
    expect(screen.getByLabelText('Werkshirts XXL')).toHaveValue(null);
    expect(screen.getByLabelText('Tassen aantal')).toHaveValue(null);
    fireEvent.change(screen.getByLabelText('Werkshirts S'), {
      target: { value: '0' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Voorraad opslaan' }));
    await screen.findByText('Voorraad opgeslagen op dit apparaat.');
    const saved = JSON.parse(
      String(
        fetcher.mock.calls.find(([, init]) => init?.method === 'POST')?.[1]
          ?.body,
      ),
    );
    expect(saved).toMatchObject({
      dataset: 'real',
      version: 1,
      items: [
        { quantities: { S: 0, M: 2, L: 2, XL: 3, XXL: null } },
        {},
        {},
        {},
      ],
    });
    await waitFor(() =>
      expect(
        screen.getByRole('button', { name: 'Voorraad opslaan' }),
      ).toBeDisabled(),
    );
  });
  it('begint met lege merchandise en voegt een artikel zonder maat toe', async () => {
    const fetcher = setup();
    await screen.findByLabelText('Werkshirts M');
    fireEvent.click(screen.getByRole('button', { name: 'Merchandise' }));
    expect(
      screen.getByText('Nog geen artikelen in merchandise.'),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Artikel toevoegen' }));
    fireEvent.change(screen.getByLabelText('Artikelnaam'), {
      target: { value: 'Sportfles' },
    });
    fireEvent.change(screen.getByLabelText('Kleur (optioneel)'), {
      target: { value: 'Blauw' },
    });
    fireEvent.click(
      screen.getByRole('button', { name: 'Artikel toevoegen aan overzicht' }),
    );
    expect(screen.getByLabelText('Sportfles aantal')).toHaveValue(null);
    expect(screen.getByLabelText('Sportfles kleur')).toHaveValue('Blauw');
    fireEvent.change(screen.getByLabelText('Sportfles kleur'), {
      target: { value: 'Zwart/oranje' },
    });
    fireEvent.change(screen.getByLabelText('Sportfles aantal'), {
      target: { value: '5' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Voorraad opslaan' }));
    await screen.findByText('Voorraad opgeslagen op dit apparaat.');
    const saved = JSON.parse(
      String(
        fetcher.mock.calls.find(([, init]) => init?.method === 'POST')?.[1]
          ?.body,
      ),
    );
    expect(saved.items).toContainEqual(
      expect.objectContaining({
        name: 'Sportfles',
        category: 'merch',
        color: 'Zwart/oranje',
        quantities: { total: 5 },
      }),
    );
    expect(screen.getByLabelText('Sportfles kleur')).toHaveValue(
      'Zwart/oranje',
    );
  });
  it('gebruikt organisatie en dataset uit de route en respecteert leesrechten', async () => {
    const fetcher = setup('/organisaties/other/voorraad?dataset=demo', false);
    expect(await screen.findByLabelText('Werkshirts M')).toBeDisabled();
    expect(fetcher.mock.calls[0]?.[0]).toBe(
      '/api/v1/organizations/other/operations/inventory?dataset=demo',
    );
    expect(screen.getByText('Je hebt alleen leesrechten.')).toBeInTheDocument();
  });
});
