import { MemoryRouter } from 'react-router';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { App } from './App';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('App', () => {
  it('renders the application shell and online API status', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify({
          service: 'cop-api',
          status: 'ok',
          timestamp: new Date().toISOString(),
        }),
        { status: 200 },
      ),
    );
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });

    render(
      <MemoryRouter>
        <QueryClientProvider client={queryClient}>
          <App />
        </QueryClientProvider>
      </MemoryRouter>,
    );

    expect(await screen.findByText('API online')).toBeInTheDocument();
    expect(
      screen.getByRole('heading', { name: 'Goedemiddag, Michael' }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('navigation', { name: 'Hoofdnavigatie' }),
    ).toBeInTheDocument();
  });
});

describe('module navigation', () => {
  function renderPage(path: string) {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ status: 'ok' }), { status: 200 }),
    );
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    return render(
      <MemoryRouter initialEntries={[path]}>
        <QueryClientProvider client={client}>
          <App />
        </QueryClientProvider>
      </MemoryRouter>,
    );
  }
  it.each([
    ['/organisaties', 'Organisaties'],
    ['/organisaties/sport-society', 'Sport Society'],
    ['/organisaties/sport-society/locaties/wekerom', 'Wekerom'],
    ['/organisaties/onbekend/team', 'Organisatie niet gevonden'],
    ['/leden', 'Leden'],
    ['/team', 'Team'],
    ['/planning', 'Planning'],
    ['/taken', 'Taken'],
    ['/locaties', 'Locaties'],
    ['/rapportages', 'Ochtendrapport & churn'],
    ['/instellingen', 'Instellingen'],
    ['/locaties/achterveld', 'Achterveld'],
    ['/locaties/onbekend', 'Pagina niet gevonden'],
    ['/onbekend', 'Pagina niet gevonden'],
  ])('opens %s directly', (path, title) => {
    renderPage(path);
    expect(
      screen.getByRole('heading', { level: 1, name: title }),
    ).toBeInTheDocument();
  });
  it('navigates from the sidebar and marks the active page', () => {
    renderPage('/');
    fireEvent.click(screen.getByRole('link', { name: 'Leden' }));
    expect(
      screen.getByRole('heading', { level: 1, name: 'Leden' }),
    ).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Leden' })).toHaveAttribute(
      'aria-current',
      'page',
    );
  });
  it('filters the test shifts by location', () => {
    renderPage('/planning');
    expect(screen.getByText('16:00–21:30')).toBeInTheDocument();
    expect(screen.getByText('07:00–13:00')).toBeInTheDocument();
    fireEvent.change(screen.getByRole('combobox', { name: 'Locatie' }), {
      target: { value: 'achterveld' },
    });
    expect(screen.getByText('16:00–21:30')).toBeInTheDocument();
    expect(screen.queryByText('07:00–13:00')).not.toBeInTheDocument();
  });
});
