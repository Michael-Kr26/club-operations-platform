import {
  render,
  screen,
  fireEvent,
  cleanup,
  waitFor,
} from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import type { RosterTemplateSummary } from '@cop/contracts';
import { RosterActions } from './RosterActions';
import { workspaceFixture } from './fixtures';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});
const template: RosterTemplateSummary = {
  id: 'basis',
  locationId: 'achterveld',
  slot: 'A',
  version: 3,
  sourceWeek: '2026-10-26',
  shiftCount: 5,
  updatedAt: '',
};
function props() {
  return {
    root: 'organizations/sport-society/operations',
    dataset: 'demo' as const,
    location: 'achterveld',
    weekStart: '2026-10-26',
    templates: [template],
    copySource: null,
    closeCopy: vi.fn(),
    refresh: vi.fn(async () => {}),
    showWeek: vi.fn(),
    busy: false,
  };
}
function respond(value: unknown, status = 200) {
  return new Response(JSON.stringify(value), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}
it('kopieert pas na bevestiging, met bronversie en dataset, en opent daarna de doelweek', async () => {
  const input = { ...props(), copySource: workspaceFixture().shifts[0]! };
  const fetcher = vi
    .spyOn(globalThis, 'fetch')
    .mockResolvedValue(respond({ created: 1, skipped: 0 }));
  render(<RosterActions {...input} />);
  expect(fetcher).not.toHaveBeenCalled();
  fireEvent.change(screen.getByLabelText('Naar dag'), {
    target: { value: '2026-11-04' },
  });
  fireEvent.click(screen.getByRole('button', { name: 'Kopie opslaan' }));
  await screen.findByText(/Dienst als concept gekopieerd/);
  expect(JSON.parse(String(fetcher.mock.calls[0]?.[1]?.body))).toEqual({
    dataset: 'demo',
    id: input.copySource.id,
    version: input.copySource.version,
    date: '2026-11-04',
  });
  expect(String(fetcher.mock.calls[0]?.[0])).toBe(
    '/api/v1/organizations/sport-society/operations/shifts/copy',
  );
  expect(input.showWeek).toHaveBeenCalledWith('2026-11-04');
  expect(input.refresh).toHaveBeenCalled();
});
it('behoudt de gekozen datum bij een overlapmelding', async () => {
  const input = { ...props(), copySource: workspaceFixture().shifts[0]! };
  vi.spyOn(globalThis, 'fetch').mockResolvedValue(
    respond({ message: 'Deze medewerker heeft een overlappende dienst.' }, 409),
  );
  render(<RosterActions {...input} />);
  fireEvent.change(screen.getByLabelText('Naar dag'), {
    target: { value: '2026-11-04' },
  });
  fireEvent.click(screen.getByRole('button', { name: 'Kopie opslaan' }));
  expect(await screen.findByRole('alert')).toHaveTextContent('overlappende');
  expect(screen.getByLabelText('Naar dag')).toHaveValue('2026-11-04');
  expect(input.closeCopy).not.toHaveBeenCalled();
});
it('bewaart de zichtbare basisweek met de versie die bij openen is bekeken', async () => {
  const input = props();
  const fetcher = vi
    .spyOn(globalThis, 'fetch')
    .mockResolvedValue(respond({ shiftCount: 5, version: 4 }));
  const view = render(<RosterActions {...input} />);
  fireEvent.click(screen.getByRole('button', { name: 'Basisrooster bewaren' }));
  view.rerender(
    <RosterActions {...input} templates={[{ ...template, version: 4 }]} />,
  );
  fireEvent.click(screen.getByRole('button', { name: 'Bewaar deze week' }));
  await screen.findByText(/Basisweek A bewaard met 5 diensten/);
  expect(JSON.parse(String(fetcher.mock.calls[0]?.[1]?.body))).toEqual({
    dataset: 'demo',
    locationId: 'achterveld',
    from: '2026-10-26',
    version: 3,
    slot: 'A',
  });
});
it('plant het basisrooster meerdere weken vooruit als expliciete actie', async () => {
  const input = props();
  const fetcher = vi
    .spyOn(globalThis, 'fetch')
    .mockResolvedValue(respond({ created: 15, skipped: 5 }));
  render(<RosterActions {...input} />);
  fireEvent.click(
    screen.getByRole('button', { name: 'Basisrooster toepassen' }),
  );
  expect(screen.getByLabelText('Vanaf maandag')).toHaveValue('2026-11-02');
  fireEvent.change(screen.getByLabelText('Aantal weken'), {
    target: { value: '4' },
  });
  fireEvent.click(screen.getByRole('button', { name: 'Weken klaarzetten' }));
  await screen.findByText(
    /15 diensten als concept toegevoegd; 5 al bestaande kopieën behouden/,
  );
  expect(JSON.parse(String(fetcher.mock.calls[0]?.[1]?.body))).toEqual({
    dataset: 'demo',
    locationId: 'achterveld',
    weekStart: '2026-11-02',
    weeks: 4,
    version: 3,
    slot: 'A',
    alternate: false,
  });
  expect(input.showWeek).toHaveBeenCalledWith('2026-11-02');
});
it('vereist een concrete locatie en een bestaand basisrooster voor toepassen', () => {
  const input = props();
  const view = render(<RosterActions {...input} location="" />);
  expect(
    screen.getByRole('button', { name: 'Basisrooster bewaren' }),
  ).toBeDisabled();
  expect(
    screen.getByRole('button', { name: 'Basisrooster toepassen' }),
  ).toBeDisabled();
  view.rerender(<RosterActions {...input} templates={[]} />);
  expect(
    screen.getByRole('button', { name: 'Basisrooster bewaren' }),
  ).toBeEnabled();
  expect(
    screen.getByRole('button', { name: 'Basisrooster toepassen' }),
  ).toBeDisabled();
});
it('meldt een geslaagde write ook als het ophalen van het overzicht mislukt', async () => {
  const input = {
    ...props(),
    refresh: vi.fn(async () => {
      throw new Error('offline');
    }),
  };
  vi.spyOn(globalThis, 'fetch').mockResolvedValue(
    respond({ created: 5, skipped: 0 }),
  );
  render(<RosterActions {...input} />);
  fireEvent.click(
    screen.getByRole('button', { name: 'Basisrooster toepassen' }),
  );
  fireEvent.click(screen.getByRole('button', { name: 'Weken klaarzetten' }));
  await waitFor(() =>
    expect(screen.getByRole('alert')).toHaveTextContent('Opgeslagen, maar'),
  );
  expect(screen.getByRole('status')).toHaveTextContent(
    '5 diensten als concept toegevoegd',
  );
});

const templateB: RosterTemplateSummary = {
  ...template,
  id: 'basis-b',
  slot: 'B',
  version: 7,
  shiftCount: 6,
};
it('bewaart week B apart en vergelijkt de versie van B, ook na opnieuw ophalen', async () => {
  const input = { ...props(), templates: [template, templateB] };
  const fetcher = vi
    .spyOn(globalThis, 'fetch')
    .mockResolvedValue(respond({ shiftCount: 5, version: 8 }));
  const view = render(<RosterActions {...input} />);
  fireEvent.click(screen.getByRole('button', { name: 'Basisrooster bewaren' }));
  fireEvent.change(
    screen.getByRole('combobox', { name: 'Bewaren als basisweek' }),
    { target: { value: 'B' } },
  );
  expect(
    screen.getByText(/Dit vervangt alleen basisweek B/),
  ).toBeInTheDocument();
  view.rerender(
    <RosterActions
      {...input}
      templates={[template, { ...templateB, version: 8 }]}
    />,
  );
  fireEvent.click(screen.getByRole('button', { name: 'Bewaar deze week' }));
  await screen.findByText(/Basisweek B bewaard/);
  expect(JSON.parse(String(fetcher.mock.calls[0]?.[1]?.body))).toMatchObject({
    slot: 'B',
    version: 7,
  });
});
it('toont de afwisseling vanaf de gekozen eerste week en stuurt beide bekeken versies mee', async () => {
  const input = { ...props(), templates: [template, templateB] };
  const fetcher = vi
    .spyOn(globalThis, 'fetch')
    .mockResolvedValue(respond({ created: 22, skipped: 0 }));
  const view = render(<RosterActions {...input} />);
  fireEvent.click(
    screen.getByRole('button', { name: 'Basisrooster toepassen' }),
  );
  expect(
    screen.getByRole('checkbox', { name: 'Week A en B afwisselen' }),
  ).toBeChecked();
  fireEvent.change(screen.getByRole('combobox', { name: 'Eerste basisweek' }), {
    target: { value: 'B' },
  });
  fireEvent.change(screen.getByLabelText('Aantal weken'), {
    target: { value: '4' },
  });
  expect(
    screen.getByRole('list', { name: 'Geplande weekvolgorde' }).textContent,
  ).toBe(
    'Vanaf 2026-11-02: week BVanaf 2026-11-09: week AVanaf 2026-11-16: week BVanaf 2026-11-23: week A',
  );
  view.rerender(
    <RosterActions
      {...input}
      templates={[
        { ...template, version: 4 },
        { ...templateB, version: 8 },
      ]}
    />,
  );
  fireEvent.click(screen.getByRole('button', { name: 'Weken klaarzetten' }));
  await screen.findByText(/22 diensten als concept toegevoegd/);
  expect(JSON.parse(String(fetcher.mock.calls[0]?.[1]?.body))).toMatchObject({
    slot: 'B',
    version: 7,
    otherVersion: 3,
    alternate: true,
    weeks: 4,
  });
});
it('kan alleen B herhalen en schakelt afwisselen uit zolang A ontbreekt', async () => {
  const fetcher = vi
    .spyOn(globalThis, 'fetch')
    .mockResolvedValue(respond({ created: 6, skipped: 0 }));
  render(<RosterActions {...props()} templates={[templateB]} />);
  fireEvent.click(
    screen.getByRole('button', { name: 'Basisrooster toepassen' }),
  );
  expect(
    screen.getByRole('combobox', { name: 'Eerste basisweek' }),
  ).toHaveValue('B');
  expect(
    screen.getByRole('checkbox', { name: 'Week A en B afwisselen' }),
  ).toBeDisabled();
  fireEvent.click(screen.getByRole('button', { name: 'Weken klaarzetten' }));
  await screen.findByText(/6 diensten als concept toegevoegd/);
  expect(JSON.parse(String(fetcher.mock.calls[0]?.[1]?.body))).toMatchObject({
    slot: 'B',
    version: 7,
    alternate: false,
  });
});
