import {
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type DragEvent,
} from 'react';
import { Link } from 'react-router';
import type {
  EmployeeRecord,
  OperationRecord,
  OperationsWorkspace,
  ShiftRecord,
} from '@cop/contracts';
import { activityLabels, shiftTypeLabels, today } from './api';
import './planning.css';
import { RosterActions } from './RosterActions';

const dragType = 'application/x-cop-employee';
const hours = (minutes: number) =>
  (minutes / 60).toLocaleString('nl-NL', { maximumFractionDigits: 2 });
const duration = (shift: ShiftRecord) => {
  const time = (v: string) => Number(v.slice(0, 2)) * 60 + Number(v.slice(3));
  return time(shift.data.end) - time(shift.data.start);
};
const dayLabel = (date: string) =>
  new Date(`${date}T12:00:00Z`).toLocaleDateString('nl-NL', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    timeZone: 'Europe/Amsterdam',
  });
const mobileQuery = '(max-width: 700px)';
function subscribeMobile(callback: () => void) {
  const query = window.matchMedia?.(mobileQuery);
  query?.addEventListener('change', callback);
  return () => query?.removeEventListener('change', callback);
}
const getMobile = () => window.matchMedia?.(mobileQuery).matches ?? false;

export function PlanningView({
  workspace: w,
  location,
  canWrite,
  busy,
  edit,
  create,
  teamLink,
  root,
  refresh,
}: {
  workspace: OperationsWorkspace;
  location: string;
  canWrite: boolean;
  busy: boolean;
  edit: (r: OperationRecord) => void;
  create: (
    date: string,
    locationId: string,
    employeeId?: string | null,
  ) => void;
  teamLink: string;
  root: string;
  refresh: () => Promise<void>;
}) {
  const [anchor, setAnchor] = useState(today());
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [dropTarget, setDropTarget] = useState('');
  const [dropError, setDropError] = useState('');
  const [view, setView] = useState<'week' | 'agenda'>('week');
  const [agendaId, setAgendaId] = useState('');
  const [publishedOnly, setPublishedOnly] = useState(!canWrite);
  const [detail, setDetail] = useState<ShiftRecord | null>(null);
  const [copySource, setCopySource] = useState<ShiftRecord | null>(null);
  const detailRef = useRef<HTMLElement>(null);
  useEffect(() => {
    if (detail) detailRef.current?.scrollIntoView?.({ block: 'center' });
  }, [detail]);
  const mobile = useSyncExternalStore(subscribeMobile, getMobile, () => false);
  const agenda = mobile || view === 'agenda';
  const stamp = Date.parse(anchor),
    weekday = new Date(stamp).getUTCDay() || 7;
  const monday = stamp - (weekday - 1) * 86400000;
  const days = Array.from({ length: 7 }, (_, i) =>
    new Date(monday + i * 86400000).toISOString().slice(0, 10),
  );
  const weekShifts = w.shifts.filter(
    (s) => days.includes(s.data.date) && s.data.status !== 'cancelled',
  );
  const shifts = weekShifts.filter(
    (s) => !location || s.locationId === location,
  );
  const locations = w.organization.locations.filter(
    (l) => !location || l.id === location,
  );
  const people = w.employees
    .filter(
      (e) =>
        e.data.active &&
        e.data.locationIds.some((id) =>
          w.organization.locations.some((l) => l.id === id),
        ) &&
        (!location || e.data.locationIds.includes(location)),
    )
    .sort((a, b) => a.data.name.localeCompare(b.data.name, 'nl'));
  const selected = people.find((e) => e.id === selectedId);
  const agendaPeople = w.employees.filter(
    (e) => people.includes(e) || shifts.some((s) => s.data.employeeId === e.id),
  );
  const personHours = (id: string) =>
    weekShifts
      .filter((s) => s.data.employeeId === id)
      .reduce((sum, s) => sum + duration(s), 0);
  const locName = (id: string) =>
    w.organization.locations.find((l) => l.id === id)?.name ?? id;
  const pickShift = (shift: ShiftRecord) =>
    canWrite ? edit(shift) : setDetail(shift);
  const shiftCard = (s: ShiftRecord) => (
    <div key={s.id} className="roster-shift-card">
      <button
        type="button"
        className={`roster-shift roster-shift--${s.data.status} ${s.data.employeeId === null ? 'roster-shift--open' : ''}`}
        disabled={busy}
        aria-label={`${s.data.start}–${s.data.end} ${shiftTypeLabels[s.data.shiftType ?? 'allround']} ${activityLabels[s.data.activity]} ${s.data.status === 'published' ? 'Definitief' : 'Concept'} ${locName(s.locationId)}`}
        onClick={() => pickShift(s)}
      >
        <strong>
          {s.data.start}–{s.data.end}
        </strong>
        <span className="roster-shift-type">
          {shiftTypeLabels[s.data.shiftType ?? 'allround']}
        </span>
        <small>
          {activityLabels[s.data.activity]} ·{' '}
          {s.data.status === 'published' ? 'Definitief' : 'Concept'}
        </small>
        {(!location || agenda) && <small>{locName(s.locationId)}</small>}
        {s.data.employeeId === null && <small>Open dienst</small>}
      </button>
      {canWrite && (
        <button
          className="roster-copy-shift"
          type="button"
          disabled={busy}
          aria-label={`Dienst kopiëren: ${s.data.start}–${s.data.end} op ${s.data.date} voor ${w.employees.find((e) => e.id === s.data.employeeId)?.data.name ?? 'open dienst'}`}
          onClick={() => {
            setCopySource(s);
            setDetail(null);
          }}
        >
          Kopiëren
        </button>
      )}
    </div>
  );
  function drop(
    event: DragEvent,
    date: string,
    locationId: string,
    rowId: string | null,
  ) {
    event.preventDefault();
    setDropTarget('');
    setDraggingId(null);
    if (!canWrite || busy) return;
    try {
      const payload: unknown = JSON.parse(event.dataTransfer.getData(dragType));
      if (
        !payload ||
        typeof payload !== 'object' ||
        !('organizationId' in payload) ||
        payload.organizationId !== w.organization.id ||
        !('dataset' in payload) ||
        payload.dataset !== w.dataset ||
        !('employeeId' in payload)
      )
        throw new Error('selection');
      const person = people.find((e) => e.id === payload.employeeId);
      if (
        !person ||
        !person.data.locationIds.includes(locationId) ||
        (rowId !== null && rowId !== person.id)
      )
        throw new Error('location');
      setSelectedId(person.id);
      setDropError('');
      create(date, locationId, person.id);
    } catch {
      setDropError(
        'Deze medewerker kan hier niet worden ingepland. Kies de eigen rij en controleer de actieve status en gekoppelde locaties via Team.',
      );
    }
  }
  function cell(
    date: string,
    locationId: string,
    person: EmployeeRecord | undefined,
    rowId: string | null,
  ) {
    const key = `${locationId}:${rowId}:${date}`;
    const targetId = rowId ?? selected?.id ?? null;
    const target = rowId === null ? selected : person;
    return (
      <td key={date}>
        <div
          role="group"
          aria-label={`Roostervak ${locName(locationId)} ${date}${rowId ? ` met ${person?.data.name ?? 'onbekende medewerker'}` : ' open diensten'}`}
          className={`roster-dropzone ${dropTarget === key ? 'roster-dropzone--over' : ''}`}
          onDragOver={(event) => {
            if (
              !canWrite ||
              busy ||
              !event.dataTransfer.types.includes(dragType)
            )
              return;
            const dragging = people.find((p) => p.id === draggingId);
            if (
              dragging &&
              (!dragging.data.locationIds.includes(locationId) ||
                (rowId && rowId !== dragging.id))
            )
              return;
            event.preventDefault();
            event.dataTransfer.dropEffect = 'copy';
            setDropTarget(key);
          }}
          onDragLeave={() => setDropTarget('')}
          onDrop={(event) => drop(event, date, locationId, rowId)}
        >
          {shifts
            .filter(
              (s) =>
                s.locationId === locationId &&
                s.data.date === date &&
                s.data.employeeId === rowId,
            )
            .sort((a, b) => a.data.start.localeCompare(b.data.start))
            .map(shiftCard)}
          {canWrite && (
            <button
              type="button"
              className="roster-add"
              disabled={
                busy ||
                (!!targetId &&
                  (!target?.data.active ||
                    !target.data.locationIds.includes(locationId)))
              }
              aria-label={`Dienst plannen voor ${locName(locationId)} op ${date}${target ? ` met ${target.data.name}` : ' open dienst'}${rowId === null ? ' in open rij' : ''}`}
              onClick={() => create(date, locationId, targetId)}
            >
              +<span className="sr-only"> Dienst plannen</span>
            </button>
          )}
        </div>
      </td>
    );
  }
  const chosenAgendaId = agendaPeople.some((e) => e.id === agendaId)
    ? agendaId
    : '';
  const agendaShifts = shifts
    .filter(
      (s) =>
        (chosenAgendaId ? s.data.employeeId === chosenAgendaId : true) &&
        (!publishedOnly || s.data.status === 'published'),
    )
    .sort((a, b) =>
      `${a.data.date}${a.data.start}`.localeCompare(
        `${b.data.date}${b.data.start}`,
      ),
    );
  return (
    <section className="roster-page" aria-label="Weekrooster">
      <div className="operation-heading">
        <div>
          <h2>
            {location
              ? `Rooster ${locName(location)}`
              : 'Rooster alle locaties'}
          </h2>
          <p className="roster-period">
            {dayLabel(days[0]!)} – {dayLabel(days[6]!)}
          </p>
        </div>
        {canWrite && (
          <button
            className="button button--primary"
            disabled={busy || !locations.length}
            onClick={() =>
              create(
                anchor,
                location ||
                  selected?.data.locationIds.find((id) =>
                    locations.some((l) => l.id === id),
                  ) ||
                  locations[0]?.id ||
                  '',
                selected?.id,
              )
            }
          >
            Dienst toevoegen
          </button>
        )}
      </div>
      <div className="roster-toolbar">
        <div className="operation-actions">
          <button
            className="button"
            onClick={() =>
              setAnchor(
                new Date(monday - 7 * 86400000).toISOString().slice(0, 10),
              )
            }
          >
            Vorige week
          </button>
          <label>
            Week van
            <input
              type="date"
              value={anchor}
              onChange={(e) => {
                if (e.target.value) setAnchor(e.target.value);
              }}
            />
          </label>
          <button
            className="button"
            onClick={() =>
              setAnchor(
                new Date(monday + 7 * 86400000).toISOString().slice(0, 10),
              )
            }
          >
            Volgende week
          </button>
          <button className="button" onClick={() => setAnchor(today())}>
            Vandaag
          </button>
        </div>
        {!mobile && (
          <div className="roster-view-switch" aria-label="Roosterweergave">
            <button
              type="button"
              aria-pressed={!agenda}
              onClick={() => setView('week')}
            >
              Weekoverzicht
            </button>
            <button
              type="button"
              aria-pressed={agenda}
              onClick={() => setView('agenda')}
            >
              Agenda
            </button>
          </div>
        )}
      </div>
      {canWrite && (
        <RosterActions
          key={`${root}:${w.dataset}:${location}`}
          root={root}
          dataset={w.dataset}
          location={location}
          weekStart={days[0]!}
          templates={(w.rosterTemplates ?? []).filter(
            (t) => t.locationId === location,
          )}
          copySource={
            copySource && shifts.some((s) => s.id === copySource.id)
              ? copySource
              : null
          }
          closeCopy={() => setCopySource(null)}
          refresh={refresh}
          showWeek={setAnchor}
          busy={busy}
        />
      )}
      {!agenda && (
        <section className="roster-pool" aria-label="Beschikbare medewerkers">
          <div className="operation-heading">
            <h3>Beschikbare medewerkers · {people.length}</h3>
            <Link to={teamLink}>Medewerkers en locaties beheren</Link>
          </div>
          <p>
            Actief en gekoppeld aan de locatie. Sleep naar de eigen rij of kies
            een medewerker en plan een dienst.
          </p>
          <div className="roster-people">
            {people.map((person) => (
              <button
                key={person.id}
                type="button"
                className="roster-person"
                aria-label={`${person.data.name} selecteren voor een dienst`}
                aria-pressed={selected?.id === person.id}
                disabled={!canWrite || busy}
                draggable={canWrite && !busy}
                onClick={() => {
                  setSelectedId(selected?.id === person.id ? null : person.id);
                  setDropError('');
                }}
                onDragStart={(event) => {
                  if (!canWrite || busy) {
                    event.preventDefault();
                    return;
                  }
                  event.dataTransfer.setData(
                    dragType,
                    JSON.stringify({
                      employeeId: person.id,
                      organizationId: w.organization.id,
                      dataset: w.dataset,
                    }),
                  );
                  event.dataTransfer.effectAllowed = 'copy';
                  setDraggingId(person.id);
                  setDropError('');
                }}
                onDragEnd={() => {
                  setDraggingId(null);
                  setDropTarget('');
                }}
              >
                <span className="roster-avatar" aria-hidden="true">
                  {person.data.name.slice(0, 1)}
                </span>
                <span>
                  <strong>{person.data.name}</strong>
                  <small>
                    {hours(personHours(person.id))} /{' '}
                    {person.data.contractMinutes === null
                      ? '—'
                      : hours(person.data.contractMinutes)}{' '}
                    uur
                  </small>
                </span>
              </button>
            ))}
          </div>
          {!people.length && (
            <p>
              Nog geen actieve medewerkers gekoppeld. Voeg ze toe of koppel
              locaties via Team.
            </p>
          )}
          {selected && (
            <p role="status">
              {selected.data.name} geselecteerd. Kies een dag om de diensttijden
              in te vullen.
            </p>
          )}
        </section>
      )}
      {dropError && (
        <p role="alert" className="report-error">
          {dropError}
        </p>
      )}
      {agenda ? (
        <div className="roster-agenda">
          <div className="roster-agenda-filters">
            <label>
              Medewerker in agenda
              <select
                value={chosenAgendaId}
                onChange={(e) => setAgendaId(e.target.value)}
              >
                <option value="">Alle medewerkers</option>
                {agendaPeople.map((e) => (
                  <option key={e.id} value={e.id}>
                    {e.data.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="report-check">
              <input
                type="checkbox"
                checked={publishedOnly}
                onChange={(e) => setPublishedOnly(e.target.checked)}
              />
              Alleen definitieve diensten
            </label>
          </div>
          {agendaShifts.length ? (
            days.map((date) => {
              const daily = agendaShifts.filter((s) => s.data.date === date);
              return daily.length ? (
                <section className="roster-agenda-day" key={date}>
                  <h3>{dayLabel(date)}</h3>
                  {daily.map((s) => (
                    <article className="roster-agenda-item" key={s.id}>
                      <p>
                        {w.employees.find((e) => e.id === s.data.employeeId)
                          ?.data.name ?? 'Open dienst'}
                      </p>
                      {shiftCard(s)}
                    </article>
                  ))}
                </section>
              ) : null;
            })
          ) : (
            <p className="operation-notice">
              Geen diensten voor deze week en selectie.
            </p>
          )}
        </div>
      ) : (
        <>
          {locations.map((loc) => {
            const rowIds = [
              ...new Set([
                ...people
                  .filter((p) => p.data.locationIds.includes(loc.id))
                  .map((p) => p.id),
                ...shifts
                  .filter(
                    (s) =>
                      s.locationId === loc.id && s.data.employeeId !== null,
                  )
                  .map((s) => s.data.employeeId!),
              ]),
            ];
            return (
              <section className="roster-location" key={loc.id}>
                <h3>
                  {loc.name}
                  <small>
                    {
                      shifts.filter(
                        (s) =>
                          s.locationId === loc.id && s.data.employeeId === null,
                      ).length
                    }{' '}
                    open diensten
                  </small>
                </h3>
                <div className="roster-table-scroll">
                  <table className="roster-table">
                    <caption className="sr-only">
                      Weekrooster {loc.name}, {days[0]} tot {days[6]}
                    </caption>
                    <thead>
                      <tr>
                        <th scope="col">Medewerker</th>
                        {days.map((date) => (
                          <th scope="col" key={date}>
                            {dayLabel(date)}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {rowIds.map((id) => {
                        const person = w.employees.find((e) => e.id === id),
                          total = personHours(id);
                        return (
                          <tr key={id}>
                            <th scope="row">
                              <strong>
                                {person?.data.name ?? 'Onbekende medewerker'}
                              </strong>
                              <small>
                                {hours(total)} /{' '}
                                {person?.data.contractMinutes == null
                                  ? '—'
                                  : hours(person.data.contractMinutes)}{' '}
                                uur
                              </small>
                              {person?.data.contractMinutes != null &&
                                total > person.data.contractMinutes && (
                                  <small className="roster-over-hours">
                                    Boven contract
                                  </small>
                                )}
                              {person && !person.data.active && (
                                <small>Niet actief</small>
                              )}
                            </th>
                            {days.map((date) => cell(date, loc.id, person, id))}
                          </tr>
                        );
                      })}
                      <tr className="roster-open-row">
                        <th scope="row">Open diensten</th>
                        {days.map((date) =>
                          cell(date, loc.id, undefined, null),
                        )}
                      </tr>
                    </tbody>
                  </table>
                </div>
              </section>
            );
          })}
          <p className="roster-footnote">
            Concepten hebben een stippellijn; definitieve diensten een
            doorgetrokken lijn. Contracturen tellen de hele week over alle
            toegankelijke locaties. Pauzes, afwezigheid en reistijd zijn nog
            niet verrekend.
          </p>
        </>
      )}
      {w.warnings.length > 0 && (
        <details className="roster-notes">
          <summary>Toelichting bij het rooster</summary>
          {w.warnings.map((v) => (
            <p key={v}>{v}</p>
          ))}
        </details>
      )}
      {detail && shifts.some((s) => s.id === detail.id) && (
        <section
          ref={detailRef}
          className="panel report-panel"
          role="region"
          aria-label="Dienstdetails"
        >
          <h3>{shiftTypeLabels[detail.data.shiftType ?? 'allround']}</h3>
          <p>
            {dayLabel(detail.data.date)} · {detail.data.start}–{detail.data.end}
          </p>
          <p>
            {locName(detail.locationId)} ·{' '}
            {activityLabels[detail.data.activity]} ·{' '}
            {detail.data.status === 'published' ? 'Definitief' : 'Concept'}
          </p>
          {detail.data.notes && (
            <p className="operation-pre">{detail.data.notes}</p>
          )}
          <button className="button" onClick={() => setDetail(null)}>
            Details sluiten
          </button>
        </section>
      )}
    </section>
  );
}
