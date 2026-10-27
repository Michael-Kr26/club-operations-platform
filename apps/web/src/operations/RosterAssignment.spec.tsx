import { MemoryRouter, Routes, Route } from 'react-router';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  render,
  screen,
  fireEvent,
  cleanup,
  waitFor,
  within,
} from '@testing-library/react';
import { afterEach, it, expect, vi } from 'vitest';
import type { EmployeeRecord, OperationsWorkspace } from '@cop/contracts';
import { OperationsPage } from './OperationsPage';
import { workspaceFixture } from './fixtures';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
function employee(
  id: string,
  locationIds = ['achterveld'],
  active = true,
): EmployeeRecord {
  return {
    id,
    kind: 'employee',
    dataset: 'demo',
    locationId: locationIds[0]!,
    version: 2,
    createdAt: '2026-10-01T00:00:00Z',
    updatedAt: '2026-10-01T00:00:00Z',
    updatedBy: 'fixture',
    data: {
      name: id,
      number: `P-${id}`,
      locationIds,
      skills: ['floor'],
      active,
      contractMinutes: 1200,
    },
  };
}
function setup(
  path = '/planning?dataset=demo&location=achterveld',
  readOnly = false,
  shifts: OperationsWorkspace['shifts'] = [],
) {
  const workspace: OperationsWorkspace = {
    ...workspaceFixture(),
    dataset: 'demo',
    shifts,
    employees: [
      employee('Eva'),
      employee('Noor', ['barneveld']),
      employee('Sam', ['achterveld'], false),
    ],
  };
  if (readOnly) workspace.principal.permissions = ['operations.read'];
  const fetcher = vi
    .spyOn(globalThis, 'fetch')
    .mockImplementation(async (_url, options) => {
      const body = options?.body ? JSON.parse(String(options.body)) : null;
      if (body?.kind === 'employee') {
        const person = workspace.employees.find((e) => e.id === body.id)!;
        Object.assign(person, {
          data: body.data,
          locationId: body.locationId,
          version: person.version + 1,
        });
      }
      if (body?.kind === 'shift')
        workspace.shifts.push({
          ...body,
          id: 'new-shift',
          version: 1,
          createdAt: '',
          updatedAt: '',
          updatedBy: 'fixture',
        });
      return new Response(
        JSON.stringify(body ? { duplicate: false } : workspace),
        { headers: { 'content-type': 'application/json' } },
      );
    });
  render(
    <MemoryRouter initialEntries={[path]}>
      <QueryClientProvider
        client={
          new QueryClient({ defaultOptions: { queries: { retry: false } } })
        }
      >
        <Routes>
          <Route
            path="/planning"
            element={<OperationsPage mode="planning" />}
          />
          <Route path="/team" element={<OperationsPage mode="team" />} />
        </Routes>
      </QueryClientProvider>
    </MemoryRouter>,
  );
  return { workspace, fetcher };
}
function dragData(overrides = {}) {
  const data = new Map<string, string>();
  data.set(
    'application/x-cop-employee',
    JSON.stringify({
      employeeId: 'Eva',
      organizationId: 'sport-society',
      dataset: 'demo',
      ...overrides,
    }),
  );
  return {
    types: ['application/x-cop-employee'],
    setData: (type: string, value: string) => data.set(type, value),
    getData: (type: string) => data.get(type) ?? '',
    effectAllowed: '',
    dropEffect: '',
  };
}
async function week() {
  fireEvent.change(await screen.findByLabelText('Week van'), {
    target: { value: '2026-11-02' },
  });
}
it('koppelt vanuit Team een locatie, bewaart de overige personeelsgegevens en toont die medewerker in het locatierooster', async () => {
  const { fetcher } = setup('/team?dataset=demo');
  await screen.findByText('P-Eva');
  const row = screen.getByText('P-Eva').closest('tr')!;
  fireEvent.click(
    within(row).getByRole('button', { name: 'Locaties koppelen' }),
  );
  expect(
    screen.getByRole('heading', { name: 'Locaties koppelen: Eva' }),
  ).toBeInTheDocument();
  expect(screen.getByRole('checkbox', { name: 'Achterveld' })).toBeDisabled();
  fireEvent.click(screen.getByRole('checkbox', { name: 'Barneveld' }));
  fireEvent.click(screen.getByRole('button', { name: 'Opslaan' }));
  await screen.findByText('Opgeslagen op dit apparaat.');
  const saved = JSON.parse(
    String(
      fetcher.mock.calls.find(([, options]) => options?.method === 'POST')?.[1]
        ?.body,
    ),
  );
  expect(saved).toMatchObject({
    kind: 'employee',
    id: 'Eva',
    version: 2,
    dataset: 'demo',
    locationId: 'achterveld',
    data: {
      name: 'Eva',
      number: 'P-Eva',
      skills: ['floor'],
      contractMinutes: 1200,
      active: true,
      locationIds: ['achterveld', 'barneveld'],
    },
  });
  fireEvent.click(screen.getByRole('link', { name: 'Roostereditor' }));
  await screen.findByLabelText('Week van');
  fireEvent.change(screen.getByRole('combobox', { name: 'Locatie' }), {
    target: { value: 'barneveld' },
  });
  expect(
    await screen.findByRole('button', {
      name: 'Eva selecteren voor een dienst',
    }),
  ).toBeInTheDocument();
});
it('toont uitsluitend actieve gekoppelde medewerkers en ververst het overzicht bij een andere locatie', async () => {
  setup();
  await week();
  const pool = screen.getByRole('region', { name: 'Beschikbare medewerkers' });
  expect(
    within(pool).getByRole('button', {
      name: 'Eva selecteren voor een dienst',
    }),
  ).toHaveAttribute('draggable', 'true');
  expect(
    within(pool).queryByRole('button', { name: /Noor|Sam/ }),
  ).not.toBeInTheDocument();
  fireEvent.change(screen.getByRole('combobox', { name: 'Locatie' }), {
    target: { value: 'barneveld' },
  });
  expect(
    within(pool).getByRole('button', {
      name: 'Noor selecteren voor een dienst',
    }),
  ).toBeInTheDocument();
  expect(
    within(pool).queryByRole('button', { name: /Eva|Sam/ }),
  ).not.toBeInTheDocument();
});
it('vult na slepen de juiste medewerker, locatie en dag in en bewaart pas na ingevulde tijden', async () => {
  const { fetcher } = setup();
  await week();
  const card = screen.getByRole('button', {
    name: 'Eva selecteren voor een dienst',
  });
  const target = screen.getByRole('group', {
    name: 'Roostervak Achterveld 2026-11-03 met Eva',
  });
  const dataTransfer = dragData();
  fireEvent.dragStart(card, { dataTransfer });
  fireEvent.dragOver(target, { dataTransfer });
  fireEvent.drop(target, { dataTransfer });
  expect(screen.getByRole('combobox', { name: 'Medewerker' })).toHaveValue(
    'Eva',
  );
  expect(screen.getByLabelText('Datum')).toHaveValue('2026-11-03');
  expect(
    screen.getAllByRole('combobox', { name: 'Locatie' }).at(-1),
  ).toHaveValue('achterveld');
  expect(
    fetcher.mock.calls.every(([, options]) => options?.method !== 'POST'),
  ).toBe(true);
  fireEvent.change(screen.getByLabelText('Van'), {
    target: { value: '09:15' },
  });
  fireEvent.change(screen.getByLabelText('Tot'), {
    target: { value: '13:45' },
  });
  fireEvent.change(screen.getByLabelText('Diensttype'), {
    target: { value: 'internship' },
  });
  fireEvent.click(screen.getByRole('button', { name: 'Opslaan' }));
  await screen.findByText('Opgeslagen op dit apparaat.');
  const saved = JSON.parse(
    String(
      fetcher.mock.calls.find(([, options]) => options?.method === 'POST')?.[1]
        ?.body,
    ),
  );
  expect(saved).toMatchObject({
    kind: 'shift',
    locationId: 'achterveld',
    dataset: 'demo',
    data: {
      employeeId: 'Eva',
      date: '2026-11-03',
      start: '09:15',
      end: '13:45',
      shiftType: 'internship',
    },
  });
  expect(screen.getByRole('button', { name: /09:15–13:45/ })).toHaveTextContent(
    'Stage',
  );
});
it('ondersteunt inplannen zonder slepen en initialiseert een volgende dienst opnieuw', async () => {
  setup();
  await week();
  fireEvent.click(
    screen.getByRole('button', { name: 'Eva selecteren voor een dienst' }),
  );
  fireEvent.click(
    screen.getByRole('button', {
      name: 'Dienst plannen voor Achterveld op 2026-11-02 met Eva',
    }),
  );
  expect(screen.getByLabelText('Datum')).toHaveValue('2026-11-02');
  fireEvent.change(screen.getByLabelText('Van'), {
    target: { value: '11:00' },
  });
  fireEvent.click(
    screen.getByRole('button', {
      name: 'Dienst plannen voor Achterveld op 2026-11-04 met Eva',
    }),
  );
  expect(screen.getByLabelText('Datum')).toHaveValue('2026-11-04');
  expect(screen.getByLabelText('Van')).toHaveValue('08:30');
});
it('weigert verkeerde locatie, andere dataset en onbekende of inactieve medewerkers bij neerzetten', async () => {
  const { fetcher } = setup();
  await week();
  const target = screen.getByRole('group', {
    name: 'Roostervak Achterveld 2026-11-03 met Eva',
  });
  for (const overrides of [
    { employeeId: 'Noor' },
    { employeeId: 'Sam' },
    { employeeId: 'missing' },
    { dataset: 'real' },
    { organizationId: 'other' },
  ]) {
    fireEvent.drop(target, { dataTransfer: dragData(overrides) });
    expect(
      screen.queryByRole('heading', { name: 'Nieuwe dienst' }),
    ).not.toBeInTheDocument();
  }
  expect(await screen.findByRole('alert')).toHaveTextContent('kan hier niet');
  expect(
    fetcher.mock.calls.every(([, options]) => options?.method !== 'POST'),
  ).toBe(true);
});
it('biedt bij leesrechten geen sleep- of dienstactie en negeert een geforceerde drop', async () => {
  const { fetcher } = setup(undefined, true);
  await week();
  const card = screen.getByRole('button', {
    name: 'Eva selecteren voor een dienst',
  });
  expect(card).toBeDisabled();
  expect(card).toHaveAttribute('draggable', 'false');
  fireEvent.drop(
    screen.getByRole('group', {
      name: 'Roostervak Achterveld 2026-11-03 met Eva',
    }),
    { dataTransfer: dragData() },
  );
  expect(
    screen.queryByRole('button', { name: /Dienst plannen|Dienst toevoegen/ }),
  ).not.toBeInTheDocument();
  expect(
    screen.queryByRole('heading', { name: 'Nieuwe dienst' }),
  ).not.toBeInTheDocument();
  expect(
    fetcher.mock.calls.every(([, options]) => options?.method !== 'POST'),
  ).toBe(true);
});
it('behoudt bij een serverconflict de ingevulde tijden om die te kunnen aanpassen', async () => {
  const { fetcher } = setup();
  await week();
  fireEvent.click(
    screen.getByRole('button', { name: 'Eva selecteren voor een dienst' }),
  );
  fireEvent.click(
    screen.getByRole('button', {
      name: 'Dienst plannen voor Achterveld op 2026-11-02 met Eva',
    }),
  );
  fireEvent.change(screen.getByLabelText('Van'), {
    target: { value: '10:15' },
  });
  fetcher.mockResolvedValueOnce(
    new Response(
      JSON.stringify({
        message: 'Deze medewerker heeft al een overlappende dienst.',
      }),
      { status: 409, headers: { 'content-type': 'application/json' } },
    ),
  );
  fireEvent.click(screen.getByRole('button', { name: 'Opslaan' }));
  await waitFor(() =>
    expect(screen.getByRole('alert')).toHaveTextContent('overlappende dienst'),
  );
  expect(screen.getByLabelText('Van')).toHaveValue('10:15');
});

it('neemt een nieuwe thuislocatie op en laat daarna de oude locatie loskoppelen', async () => {
  const { fetcher } = setup('/team?dataset=demo');
  const row = (await screen.findByText('P-Eva')).closest('tr')!;
  fireEvent.click(
    within(row).getByRole('button', { name: 'Locaties koppelen' }),
  );
  fireEvent.change(screen.getByRole('combobox', { name: 'Thuislocatie' }), {
    target: { value: 'barneveld' },
  });
  expect(screen.getByRole('checkbox', { name: 'Barneveld' })).toBeChecked();
  expect(screen.getByRole('checkbox', { name: 'Barneveld' })).toBeDisabled();
  fireEvent.click(screen.getByRole('checkbox', { name: 'Achterveld' }));
  fireEvent.click(screen.getByRole('button', { name: 'Opslaan' }));
  await screen.findByText('Opgeslagen op dit apparaat.');
  const saved = JSON.parse(
    String(
      fetcher.mock.calls.find(([, options]) => options?.method === 'POST')?.[1]
        ?.body,
    ),
  );
  expect(saved).toMatchObject({
    locationId: 'barneveld',
    data: { locationIds: ['barneveld'] },
  });
});

it('wist de medewerker als de dienst naar een niet-gekoppelde locatie wordt gewijzigd', async () => {
  setup();
  await week();
  fireEvent.click(
    screen.getByRole('button', { name: 'Eva selecteren voor een dienst' }),
  );
  fireEvent.click(
    screen.getByRole('button', {
      name: 'Dienst plannen voor Achterveld op 2026-11-02 met Eva',
    }),
  );
  const location = screen.getAllByRole('combobox', { name: 'Locatie' }).at(-1)!;
  fireEvent.change(location, { target: { value: 'barneveld' } });
  expect(screen.getByRole('combobox', { name: 'Medewerker' })).toHaveValue('');
  expect(
    within(screen.getByRole('combobox', { name: 'Medewerker' })).queryByRole(
      'option',
      { name: /Eva/ },
    ),
  ).not.toBeInTheDocument();
});

it('toont op mobiel een agenda met definitieve diensttypen en leesbare details zonder schrijfrechten', async () => {
  vi.stubGlobal(
    'matchMedia',
    vi.fn(() => ({
      matches: true,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    })),
  );
  const base = workspaceFixture().shifts[0]!;
  const { fetcher } = setup(undefined, true, [
    {
      ...base,
      id: 'published',
      data: {
        ...base.data,
        date: '2026-11-02',
        employeeId: 'Eva',
        shiftType: 'internship',
        status: 'published',
        start: '09:00',
        end: '12:00',
        notes: 'Neem je stageboek mee.',
      },
    },
    {
      ...base,
      id: 'draft',
      data: {
        ...base.data,
        date: '2026-11-02',
        employeeId: 'Eva',
        shiftType: 'clubmanager',
        status: 'draft',
        start: '13:00',
        end: '17:00',
      },
    },
  ]);
  await week();
  expect(screen.queryByRole('table')).not.toBeInTheDocument();
  expect(
    screen.queryByRole('region', { name: 'Beschikbare medewerkers' }),
  ).not.toBeInTheDocument();
  fireEvent.change(screen.getByLabelText('Medewerker in agenda'), {
    target: { value: 'Eva' },
  });
  expect(screen.queryByText('13:00–17:00')).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: /09:00–12:00 Stage/ }));
  expect(
    within(screen.getByRole('region', { name: 'Dienstdetails' })).getByText(
      'Neem je stageboek mee.',
    ),
  ).toBeInTheDocument();
  expect(
    fetcher.mock.calls.every(([, options]) => options?.method !== 'POST'),
  ).toBe(true);
});
