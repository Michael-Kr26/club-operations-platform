import { MemoryRouter, Routes, Route } from 'react-router';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  render,
  screen,
  fireEvent,
  cleanup,
  waitFor,
} from '@testing-library/react';
import { afterEach, it, expect, vi } from 'vitest';
import { OperationsPage } from './OperationsPage';
import { workspaceFixture } from './fixtures';
import type { TaskRecord } from '@cop/contracts';
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});
function renderPage(
  mode: Parameters<typeof OperationsPage>[0]['mode'],
  workspace = workspaceFixture(),
) {
  const fetch = vi
    .spyOn(globalThis, 'fetch')
    .mockImplementation(async (url, options) => {
      const body = options?.body ? JSON.parse(String(options.body)) : null;
      if (body?.kind === 'task') {
        const r = workspace.tasks.find((t) => t.id === body.id);
        if (r) {
          r.data = body.data;
          r.version++;
        }
      }
      return new Response(
        JSON.stringify(
          String(url).includes('/members')
            ? {
                members: [
                  {
                    key: 'achterveld:1',
                    number: '1',
                    name: 'Voorbeeldlid',
                    status: 'Actief',
                    locationId: 'achterveld',
                    sourceId: 'source',
                    asOf: '2026-10-01',
                    lastVisit: null,
                    inactiveDays: null,
                    email: null,
                    phone: null,
                  },
                ],
                sources: [],
                contacts: [],
                warnings: [],
              }
            : options?.method === 'POST'
              ? { duplicate: false }
              : workspace,
        ),
        { headers: { 'content-type': 'application/json' } },
      );
    });
  render(
    <MemoryRouter initialEntries={['/taken']}>
      <QueryClientProvider
        client={
          new QueryClient({ defaultOptions: { queries: { retry: false } } })
        }
      >
        <Routes>
          <Route path="*" element={<OperationsPage mode={mode} />} />
        </Routes>
      </QueryClientProvider>
    </MemoryRouter>,
  );
  return fetch;
}
it('verbergt schrijfknoppen bij leesrechten en houdt ontbrekende cijfers onbekend', async () => {
  const w = workspaceFixture();
  w.principal.permissions = ['operations.read'];
  renderPage('locations', w);
  expect(
    await screen.findByRole('heading', { name: 'Locaties', level: 1 }),
  ).toBeInTheDocument();
  expect(await screen.findAllByText('Onbekend')).toHaveLength(5);
  expect(screen.getByText(/Je hebt leesrechten/)).toBeInTheDocument();
});
it('laat een controle pas afronden na afvinken en bewaart een versienummer', async () => {
  const w = workspaceFixture();
  w.tasks = [
    {
      id: 'task',
      kind: 'task',
      dataset: 'real',
      locationId: 'achterveld',
      version: 1,
      createdAt: '2026-10-01T00:00:00Z',
      updatedAt: '2026-10-01T00:00:00Z',
      updatedBy: 'fixture',
      data: {
        title: 'Openingscontrole',
        description: '',
        assigneeId: null,
        dueDate: null,
        status: 'open',
        priority: 'normal',
        source: { type: 'checklist', key: 'check' },
        checks: [{ label: 'Nooduitgang vrij', done: false }],
      },
    } satisfies TaskRecord,
  ];
  const fetch = renderPage('tasks', w);
  expect(
    await screen.findByRole('button', { name: 'Afronden' }),
  ).toBeDisabled();
  fireEvent.click(screen.getByRole('checkbox', { name: 'Nooduitgang vrij' }));
  await waitFor(() =>
    expect(screen.getByRole('button', { name: 'Afronden' })).toBeEnabled(),
  );
  const request = fetch.mock.calls.find(
    ([, options]) => options?.method === 'POST',
  );
  expect(JSON.parse(String(request?.[1]?.body))).toMatchObject({
    id: 'task',
    version: 1,
    data: { checks: [{ label: 'Nooduitgang vrij', done: true }] },
  });
});
it('toont onbekende bezoekdata en maakt geen kunstmatige Healthplanner-ledenlijst', async () => {
  renderPage('members');
  expect(await screen.findByText('Voorbeeldlid')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Bekijken' }));
  expect(screen.getByText(/Aantal dagen onbekend/)).toBeInTheDocument();
  fireEvent.change(screen.getByRole('combobox', { name: 'Selectie' }), {
    target: { value: '30' },
  });
  expect(screen.queryByText('Voorbeeldlid')).not.toBeInTheDocument();
});
it('verbergt persoonsgegevens wanneer dat afzonderlijke recht ontbreekt', async () => {
  const w = workspaceFixture();
  w.principal.permissions = ['operations.read'];
  const fetch = renderPage('members', w);
  expect(await screen.findByRole('alert')).toHaveTextContent('geen leesrecht');
  expect(
    fetch.mock.calls.every(([url]) => !String(url).includes('/members')),
  ).toBe(true);
});
