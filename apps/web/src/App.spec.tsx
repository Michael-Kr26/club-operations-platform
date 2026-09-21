import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { App } from './App';

afterEach(() => {
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
      <QueryClientProvider client={queryClient}>
        <App />
      </QueryClientProvider>,
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
