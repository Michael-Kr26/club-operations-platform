import { useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  Dataset,
  OperationsWorkspace,
  OperationRecord,
  TaskRecord,
  TaskData,
  MemberDirectory,
  DirectoryMember,
} from '@cop/contracts';
import { operationsApi, today, activityLabels } from './api';
import { RecordForm, type Editor } from './RecordForm';
import '../reports/reports.css';
import './operations.css';

type Mode =
  | 'locations'
  | 'location'
  | 'tasks'
  | 'members'
  | 'team'
  | 'planning'
  | 'checks';
const titles: Record<Mode, string> = {
  locations: 'Locaties',
  location: 'Locatieoverzicht',
  tasks: 'Taken',
  members: 'Leden & opvolging',
  team: 'Team',
  planning: 'Roostereditor',
  checks: 'Controles & onderhoud',
};
const statusLabels: Record<string, string> = {
  open: 'Open',
  'in-progress': 'In behandeling',
  done: 'Afgerond',
  cancelled: 'Geannuleerd',
  draft: 'Concept',
  published: 'Definitief',
  operational: 'In gebruik',
  maintenance: 'In onderhoud',
  'out-of-service': 'Buiten gebruik',
};
const open = (t: TaskRecord) =>
  t.data.status === 'open' || t.data.status === 'in-progress';
const fmt = (n: number | null | undefined) =>
  n == null ? 'Onbekend' : n.toLocaleString('nl-NL');
export function OperationsPage({ mode }: { mode: Mode }) {
  const { organizationSlug = 'sport-society', slug } = useParams();
  const [params, setParams] = useSearchParams(),
    dataset: Dataset = params.get('dataset') === 'demo' ? 'demo' : 'real';
  const root = `organizations/${encodeURIComponent(organizationSlug)}/operations`,
    base = useParams().organizationSlug
      ? `/organisaties/${organizationSlug}`
      : '';
  const link = (path: string) => `${base}/${path}?dataset=${dataset}`;
  const cache = useQueryClient(),
    query = useQuery({
      queryKey: ['operations', organizationSlug, dataset],
      queryFn: () =>
        operationsApi<OperationsWorkspace>(`${root}?dataset=${dataset}`),
      retry: false,
      refetchInterval: 60000,
    });
  const [editor, setEditor] = useState<Editor | null>(null),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState(''),
    [error, setError] = useState('');
  const w = query.data,
    canWrite = w?.principal.permissions.includes('operations.manage') ?? false;
  const location =
    mode === 'location' ? (slug ?? '') : (params.get('location') ?? '');
  const visible = (r: { locationId: string }) =>
    !location || r.locationId === location;
  const locName = (id: string) =>
    w?.organization.locations.find((l) => l.id === id)?.name ?? id;
  async function mutate(path: string, body: unknown) {
    setBusy(true);
    setError('');
    setMessage('');
    try {
      const result = await operationsApi<{ duplicate?: boolean }>(
        `${root}/${path}`,
        body,
      );
      await cache.invalidateQueries({
        queryKey: ['operations', organizationSlug],
      });
      await cache.invalidateQueries({
        queryKey: ['members', organizationSlug],
      });
      setMessage(
        result.duplicate
          ? 'Bestond al; het bestaande record is behouden.'
          : 'Opgeslagen op dit apparaat.',
      );
      setEditor(null);
      return true;
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Opslaan mislukt.');
      return false;
    } finally {
      setBusy(false);
    }
  }
  async function update(task: TaskRecord, data: TaskData) {
    await mutate('records', {
      dataset,
      kind: 'task',
      locationId: task.locationId,
      id: task.id,
      version: task.version,
      data,
    });
  }
  const edit = (record: OperationRecord) =>
    setEditor({ kind: record.kind, record, locationId: record.locationId });
  const create = (kind: Editor['kind'], initial?: Record<string, unknown>) =>
    setEditor({
      kind,
      locationId: location || w?.organization.locations[0]?.id || '',
      initial,
    });
  const createShift = (
    date: string,
    locationId: string,
    employeeId: string | null = null,
  ) =>
    setEditor({
      kind: 'shift',
      locationId,
      requestId: crypto.randomUUID(),
      initial: { date, employeeId },
    });
  if (query.isPending)
    return (
      <main className="cop-reports">
        <h1>{titles[mode]}</h1>
        <p role="status">Werkruimte laden…</p>
      </main>
    );
  if (!w)
    return (
      <main className="cop-reports">
        <h1>{titles[mode]}</h1>
        <p role="alert">
          {query.error?.message ?? 'Werkruimte niet beschikbaar.'}
        </p>
        <Link to={`${base}/rapportages`}>
          Toegang en rapportage-instellingen
        </Link>
        <button className="button" onClick={() => void query.refetch()}>
          Opnieuw proberen
        </button>
      </main>
    );
  if (location && !w.organization.locations.some((l) => l.id === location))
    return (
      <main className="cop-reports">
        <h1>Locatie niet beschikbaar</h1>
        <Link to={link('locaties')}>Naar mijn locaties</Link>
      </main>
    );
  const tasks = w.tasks.filter(visible),
    employees = w.employees.filter(
      (e) => !location || e.data.locationIds.includes(location),
    ),
    assets = w.assets.filter(visible);
  return (
    <main className="cop-reports operations-page">
      <header className="operation-heading">
        <div>
          <span className="page-heading__eyebrow">
            {w.organization.name} ·{' '}
            {dataset === 'demo' ? 'DEMO' : 'Werkelijke gegevens'}
          </span>
          <h1>{mode === 'location' ? locName(location) : titles[mode]}</h1>
          <p>
            Lokale werkruimte · wijzigingen blijven bewaard na opnieuw starten.
          </p>
        </div>
        <label>
          Gegevens
          <select
            value={dataset}
            disabled={busy}
            onChange={(e) => {
              setEditor(null);
              setParams({ dataset: e.target.value });
            }}
          >
            <option value="real">Werkelijk</option>
            <option value="demo">Demo</option>
          </select>
        </label>
      </header>
      <nav className="operation-tabs" aria-label="Operationele modules">
        {(
          [
            'locations',
            'members',
            'team',
            'planning',
            'tasks',
            'checks',
          ] as const
        ).map((m, i) => (
          <Link
            key={m}
            aria-current={mode === m ? 'page' : undefined}
            to={link(
              ['locaties', 'leden', 'team', 'planning', 'taken', 'controles'][
                i
              ]!,
            )}
          >
            {titles[m]}
          </Link>
        ))}
      </nav>
      {mode !== 'location' && (
        <label className="operation-filter">
          Locatie
          <select
            value={location}
            disabled={busy}
            onChange={(e) => {
              setEditor(null);
              const p = new URLSearchParams(params);
              p.set('location', e.target.value);
              setParams(p);
            }}
          >
            <option value="">Alle toegankelijke locaties</option>
            {w.organization.locations.map((l) => (
              <option value={l.id} key={l.id}>
                {l.name}
              </option>
            ))}
          </select>
        </label>
      )}
      {!canWrite && (
        <p className="operation-notice">
          Je hebt leesrechten. Bewerken is niet beschikbaar voor dit account.
        </p>
      )}
      {message && (
        <p role="status" className="operation-notice">
          {message}
        </p>
      )}
      {error && (
        <p role="alert" className="report-error">
          {error}
        </p>
      )}
      {editor && (
        <RecordForm
          key={`${editor.kind}:${editor.record?.id ?? editor.requestId ?? 'new'}:${editor.employeeLocationsOnly ? 'locations' : 'full'}`}
          editor={editor}
          workspace={w}
          busy={busy}
          close={() => setEditor(null)}
          save={async (locationId, data) => {
            await mutate(
              editor.assetId ? 'asset-task' : 'records',
              editor.assetId
                ? {
                    dataset,
                    assetId: editor.assetId,
                    requestId: editor.requestId,
                    description: data.description,
                    dueDate: data.dueDate,
                  }
                : {
                    dataset,
                    kind: editor.kind,
                    locationId,
                    data,
                    ...(editor.record
                      ? { id: editor.record.id, version: editor.record.version }
                      : {}),
                  },
            );
          }}
        />
      )}
      {(mode === 'locations' || mode === 'location') && (
        <>
          <div className="operation-location-grid">
            {w.organization.locations
              .filter((l) => !location || l.id === location)
              .map((l) => {
                const sources = w.reports?.imports
                  .filter(
                    (i) =>
                      i.status === 'accepted' &&
                      i.locationId === l.id &&
                      i.report?.kind === 'members',
                  )
                  .sort((a, b) =>
                    (b.report?.kind === 'members'
                      ? b.report.period
                      : ''
                    ).localeCompare(
                      a.report?.kind === 'members' ? a.report.period : '',
                    ),
                  );
                const source = sources?.[0],
                  report = source?.report;
                return (
                  <section className="panel report-panel" key={l.id}>
                    <h2>
                      <Link to={link(`locaties/${l.id}`)}>{l.name}</Link>
                    </h2>
                    <dl className="operation-numbers">
                      <div>
                        <dt>Leden in Dewi-selectie</dt>
                        <dd>
                          {report?.kind === 'members'
                            ? fmt(
                                report.cards.find(
                                  (c) => c.label === 'Leden in export',
                                )?.value ?? report.rows[0]?.values.total,
                              )
                            : 'Onbekend'}
                        </dd>
                      </div>
                      <div>
                        <dt>Open taken</dt>
                        <dd>
                          {
                            w.tasks.filter(
                              (t) => t.locationId === l.id && open(t),
                            ).length
                          }
                        </dd>
                      </div>
                      <div>
                        <dt>Diensten vandaag</dt>
                        <dd>
                          {
                            w.shifts.filter(
                              (s) =>
                                s.locationId === l.id &&
                                s.data.date === today() &&
                                s.data.status !== 'cancelled',
                            ).length
                          }
                        </dd>
                      </div>
                    </dl>
                    <p>
                      {source && report?.kind === 'members'
                        ? `Bron: ${source.filename} · peildatum ${report.period}`
                        : 'Nog geen bevestigde Dewi-ledenbron.'}
                    </p>
                    <small>
                      Een exportselectie is geen bewezen aantal actieve
                      abonnementen.
                    </small>
                  </section>
                );
              })}
          </div>
          {mode === 'location' && (
            <>
              <LocationReports
                workspace={w}
                location={location}
                canWrite={canWrite}
                busy={busy}
                act={(period, code) =>
                  void mutate('report-task', {
                    dataset,
                    period,
                    code,
                    locationId: location,
                  })
                }
              />
              <h2>Open taken</h2>
              {tasks.filter(open).map((t) => (
                <TaskCard
                  key={t.id}
                  task={t}
                  workspace={w}
                  canWrite={canWrite}
                  busy={busy}
                  update={update}
                  edit={edit}
                />
              ))}
              {!tasks.some(open) && <p>Geen open taken voor deze locatie.</p>}
              <Link to={`${link('planning')}&location=${location}`}>
                Rooster van {locName(location)}
              </Link>
            </>
          )}
        </>
      )}
      {mode === 'tasks' && (
        <TasksView
          tasks={tasks}
          workspace={w}
          canWrite={canWrite}
          busy={busy}
          create={() => create('task')}
          edit={edit}
          update={update}
        />
      )}
      {mode === 'members' && (
        <MembersView
          root={root}
          organization={organizationSlug}
          dataset={dataset}
          location={location}
          workspace={w}
          busy={busy}
          canWrite={canWrite}
          mutate={mutate}
        />
      )}
      {mode === 'team' && (
        <>
          <div className="operation-heading">
            <h2>Medewerkers · {employees.length}</h2>
            {canWrite && w.principal.locations === null && (
              <button
                className="button button--primary"
                onClick={() => create('employee')}
              >
                Medewerker toevoegen
              </button>
            )}
          </div>
          <p>
            Koppel medewerkers aan één of meer locaties. Actieve medewerkers
            verschijnen daar in het rooster bij Beschikbare medewerkers.
          </p>
          {w.principal.locations !== null && (
            <p>Personeelsgegevens wijzigen vereist organisatierechten.</p>
          )}
          <div className="table-scroll">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Medewerker</th>
                  <th>Inzetbare locaties</th>
                  <th>Vaardigheden</th>
                  <th>Contract / week</th>
                  <th>Status</th>
                  <th>Actie</th>
                </tr>
              </thead>
              <tbody>
                {employees.map((e) => (
                  <tr key={e.id}>
                    <td>
                      {e.data.name}
                      <small className="operation-detail">
                        {e.data.number}
                      </small>
                    </td>
                    <td>{e.data.locationIds.map(locName).join(', ')}</td>
                    <td>
                      {e.data.skills.map((s) => activityLabels[s]).join(', ') ||
                        'Nog niet vastgelegd'}
                    </td>
                    <td>
                      {e.data.contractMinutes == null
                        ? 'Onbekend'
                        : `${fmt(e.data.contractMinutes / 60)} uur`}
                    </td>
                    <td>{e.data.active ? 'Actief' : 'Inactief'}</td>
                    <td>
                      {canWrite && w.principal.locations === null && (
                        <div className="operation-actions">
                          <button
                            className="button"
                            onClick={() =>
                              setEditor({
                                kind: 'employee',
                                record: e,
                                locationId: e.locationId,
                                employeeLocationsOnly: true,
                              })
                            }
                          >
                            Locaties koppelen
                          </button>
                          <button className="button" onClick={() => edit(e)}>
                            Bewerken
                          </button>
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {!employees.length && <p>Er zijn nog geen medewerkers ingevoerd.</p>}
        </>
      )}
      {mode === 'planning' && (
        <PlanningView
          workspace={w}
          location={location}
          canWrite={canWrite}
          busy={busy}
          edit={edit}
          create={createShift}
          teamLink={link('team')}
        />
      )}
      {mode === 'checks' && (
        <>
          <div className="operation-actions">
            {canWrite && (
              <>
                <button
                  className="button button--primary"
                  onClick={() => create('checklist')}
                >
                  Controlelijst toevoegen
                </button>
                <button
                  className="button"
                  disabled={busy}
                  onClick={() =>
                    void mutate('checklists/generate', { dataset })
                  }
                >
                  Controles voor huidige periode klaarzetten
                </button>
                <button className="button" onClick={() => create('asset')}>
                  Apparaat toevoegen
                </button>
              </>
            )}
          </div>
          <p>
            Herhalingen worden tijdens het draaien van COP aangemaakt, één keer
            per dag/week/maand. Gemiste periodes worden niet achteraf ingevuld.
            Aangepaste controlepunten gelden voor nieuwe taken.
          </p>
          <div className="operation-location-grid">
            {w.checklists.filter(visible).map((c) => (
              <section className="panel report-panel" key={c.id}>
                <h2>{c.data.title}</h2>
                <p>
                  {locName(c.locationId)} ·{' '}
                  {
                    {
                      daily: 'Dagelijks',
                      weekly: 'Wekelijks',
                      monthly: 'Maandelijks',
                    }[c.data.cadence]
                  }{' '}
                  · {c.data.active ? 'Actief' : 'Gepauzeerd'}
                </p>
                <ul>
                  {c.data.items.map((v, i) => (
                    <li key={i}>{v}</li>
                  ))}
                </ul>
                {canWrite && (
                  <button className="button" onClick={() => edit(c)}>
                    Bewerken
                  </button>
                )}
              </section>
            ))}
          </div>
          <h2>Uit te voeren controles</h2>
          {tasks
            .filter((t) => t.data.source?.type === 'checklist' && open(t))
            .map((t) => (
              <TaskCard
                key={t.id}
                task={t}
                workspace={w}
                canWrite={canWrite}
                busy={busy}
                update={update}
                edit={edit}
              />
            ))}
          <h2>Apparaten & onderhoud</h2>
          <div className="operation-location-grid">
            {assets.map((a) => (
              <section key={a.id} className="panel report-panel">
                <h3>{a.data.name}</h3>
                <p>
                  {locName(a.locationId)} · {statusLabels[a.data.status]}
                </p>
                <p>
                  Kenmerk: {a.data.serial || 'Onbekend'} · Onderhoud:{' '}
                  {a.data.nextMaintenance ?? 'Onbekend'}
                </p>
                <p className="operation-pre">{a.data.notes}</p>
                <p>
                  {
                    tasks.filter(
                      (t) => t.data.source?.assetId === a.id && open(t),
                    ).length
                  }{' '}
                  open onderhoudstaken
                </p>
                {canWrite && (
                  <div className="operation-actions">
                    <button className="button" onClick={() => edit(a)}>
                      Apparaat bewerken
                    </button>
                    <button
                      className="button"
                      onClick={() =>
                        setEditor({
                          kind: 'task',
                          locationId: a.locationId,
                          assetId: a.id,
                          requestId: crypto.randomUUID(),
                          initial: {
                            title: `Onderhoud: ${a.data.name}`,
                            priority: 'high',
                          },
                        })
                      }
                    >
                      Onderhoudstaak maken
                    </button>
                  </div>
                )}
              </section>
            ))}
          </div>
          {!assets.length && <p>Nog geen apparaten geregistreerd.</p>}
        </>
      )}
    </main>
  );
}

function TaskCard({
  task: t,
  workspace: w,
  canWrite,
  busy,
  update,
  edit,
}: {
  task: TaskRecord;
  workspace: OperationsWorkspace;
  canWrite: boolean;
  busy: boolean;
  update: (t: TaskRecord, d: TaskData) => Promise<void>;
  edit: (t: OperationRecord) => void;
}) {
  return (
    <article className="panel report-panel operation-task">
      <div className="operation-heading">
        <div>
          <span className="operation-badge">
            {statusLabels[t.data.status]} ·{' '}
            {t.data.priority === 'high' ? 'Hoge prioriteit' : 'Normaal'}
          </span>
          <h3>{t.data.title}</h3>
        </div>
        {canWrite && (
          <button className="button" disabled={busy} onClick={() => edit(t)}>
            Bewerken
          </button>
        )}
      </div>
      <p>
        {w.organization.locations.find((l) => l.id === t.locationId)?.name} ·{' '}
        {w.employees.find((e) => e.id === t.data.assigneeId)?.data.name ??
          'Niet toegewezen'}{' '}
        · Deadline: {t.data.dueDate ?? 'Niet ingesteld'}
      </p>
      <p className="operation-pre">{t.data.description}</p>
      {t.data.checks?.map((c, i) => (
        <label className="report-check" key={i}>
          <input
            type="checkbox"
            checked={c.done}
            disabled={!canWrite || busy || !open(t)}
            onChange={(e) =>
              void update(t, {
                ...t.data,
                checks: t.data.checks!.map((v, j) =>
                  j === i ? { ...v, done: e.target.checked } : v,
                ),
              })
            }
          />
          {c.label}
        </label>
      ))}
      {canWrite && (
        <div className="operation-actions">
          {t.data.status === 'open' && (
            <button
              className="button"
              disabled={busy}
              onClick={() =>
                void update(t, { ...t.data, status: 'in-progress' })
              }
            >
              Starten
            </button>
          )}
          {open(t) ? (
            <button
              className="button"
              disabled={busy || t.data.checks?.some((c) => !c.done)}
              onClick={() => void update(t, { ...t.data, status: 'done' })}
            >
              Afronden
            </button>
          ) : (
            <button
              className="button"
              disabled={busy}
              onClick={() => void update(t, { ...t.data, status: 'open' })}
            >
              Heropenen
            </button>
          )}
        </div>
      )}
      <small>
        Bijgewerkt: {new Date(t.updatedAt).toLocaleString('nl-NL')} · v
        {t.version}
        {t.data.source
          ? ` · Bron: ${{ report: 'rapportagesignaal', member: 'ledenopvolging', checklist: 'periodieke controle', asset: 'apparaat' }[t.data.source.type]}`
          : ''}
      </small>
    </article>
  );
}
function TasksView({
  tasks,
  create,
  ...props
}: Omit<Parameters<typeof TaskCard>[0], 'task'> & {
  tasks: TaskRecord[];
  create: () => void;
}) {
  const [status, setStatus] = useState('open'),
    [person, setPerson] = useState('');
  const shown = tasks.filter(
    (t) =>
      (status === 'all' ||
        (status === 'open' ? open(t) : t.data.status === status)) &&
      (!person ||
        (person === 'unassigned'
          ? !t.data.assigneeId
          : t.data.assigneeId === person)),
  );
  return (
    <>
      <div className="operation-heading">
        <h2>Taken · {shown.length}</h2>
        {props.canWrite && (
          <button className="button button--primary" onClick={create}>
            Taak toevoegen
          </button>
        )}
      </div>
      <div className="report-fields">
        <label>
          Status
          <select value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="open">Open en in behandeling</option>
            <option value="all">Alle</option>
            <option value="done">Afgerond</option>
            <option value="cancelled">Geannuleerd</option>
          </select>
        </label>
        <label>
          Verantwoordelijke
          <select value={person} onChange={(e) => setPerson(e.target.value)}>
            <option value="">Iedereen</option>
            <option value="unassigned">Niet toegewezen</option>
            {props.workspace.employees.map((e) => (
              <option key={e.id} value={e.id}>
                {e.data.name}
              </option>
            ))}
          </select>
        </label>
      </div>
      {shown.map((t) => (
        <TaskCard key={t.id} task={t} {...props} />
      ))}
      {!shown.length && <p>Geen taken voor deze selectie.</p>}
    </>
  );
}
function LocationReports({
  workspace: w,
  location,
  canWrite,
  busy,
  act,
}: {
  workspace: OperationsWorkspace;
  location: string;
  canWrite: boolean;
  busy: boolean;
  act: (period: string, code: string) => void;
}) {
  const [chosen, setChosen] = useState('');
  const periods =
    w.reports?.combined?.periods.filter((p) =>
      p.rows.some((r) => r.locationId === location && r.source),
    ) ?? [];
  const current =
      periods.find((p) => p.period === chosen) ??
      periods
        .filter((p) =>
          p.rows.some(
            (r) =>
              r.locationId === location &&
              Object.values(r.values).some((v) => v !== null),
          ),
        )
        .at(-1) ??
      periods.at(-1),
    row = current?.rows.find((r) => r.locationId === location);
  const columns: [string, string][] =
    current?.type === 'day'
      ? [
          ['active', 'Bezoekend actief (HP)'],
          ['sleeping', 'Slapend (HP)'],
          ['withoutAppointment', 'Zonder afspraak'],
          ['leads', 'Leads'],
          ['sold', 'Lidmaatschappen verkocht'],
        ]
      : [
          ['total', 'Leden in HP-bron'],
          ['withoutGoal', 'Zonder doel'],
          ['withoutAppointment', 'Zonder afspraak'],
          ['withoutCoach', 'Zonder coach'],
        ];
  return (
    <section className="panel report-panel">
      <h2>Healthplanner · cijfers en opvolging</h2>
      {current && (
        <label>
          Rapportageperiode
          <select
            value={current.period}
            onChange={(e) => setChosen(e.target.value)}
          >
            {periods.map((p) => (
              <option key={p.period} value={p.period}>
                {p.period}
              </option>
            ))}
          </select>
        </label>
      )}
      <dl className="operation-numbers">
        {columns.map(([key, label]) => (
          <div key={key}>
            <dt>{label}</dt>
            <dd>{fmt(row?.values[key])}</dd>
          </div>
        ))}
      </dl>
      <p>
        {row?.source
          ? `${row.source.filename} · ${current?.period}`
          : 'Nog geen Healthplanner-bron voor deze locatie.'}
      </p>
      {row?.conflict && (
        <p role="alert">
          Meerdere bronnen: controleer de geselecteerde import in Rapportages.
        </p>
      )}
      <p>
        Dewi-abonnementen en Healthplanner-bezoek zijn verschillende definities.
        Personen worden hier niet tussen systemen gekoppeld.
      </p>
      {current?.attention
        ?.filter((a) => a.locationId === location)
        .map((a) => (
          <div key={a.code} className="operation-signal">
            <p>{a.message}</p>
            {canWrite && (
              <button
                className="button"
                disabled={busy}
                onClick={() => act(current.period, a.code)}
              >
                Opvolgtaak maken
              </button>
            )}
          </div>
        ))}
    </section>
  );
}
function PlanningView({
  workspace: w,
  location,
  canWrite,
  busy,
  edit,
  create,
  teamLink,
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
}) {
  const [anchor, setAnchor] = useState(today());
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [dropTarget, setDropTarget] = useState<string | null>(null);
  const [dropError, setDropError] = useState('');
  const employeeDragType = 'application/x-cop-employee';
  const people = w.employees
    .filter(
      (person) =>
        person.data.active &&
        person.data.locationIds.some((id) =>
          w.organization.locations.some((l) => l.id === id),
        ) &&
        (!location || person.data.locationIds.includes(location)),
    )
    .sort((a, b) => a.data.name.localeCompare(b.data.name, 'nl'));
  const selected = people.find((person) => person.id === selectedId);
  const dragging = people.find((person) => person.id === draggingId);
  const stamp = Date.parse(anchor || today()),
    weekday = new Date(stamp).getUTCDay() || 7,
    monday = stamp - (weekday - 1) * 86400000;
  const days = Array.from({ length: 7 }, (_, i) =>
    new Date(monday + i * 86400000).toISOString().slice(0, 10),
  );
  const shifts = w.shifts.filter(
    (s) =>
      days.includes(s.data.date) &&
      s.data.status !== 'cancelled' &&
      (!location || s.locationId === location),
  );
  const minutes = (start: string, end: string) =>
    Number(end.slice(0, 2)) * 60 +
    Number(end.slice(3)) -
    (Number(start.slice(0, 2)) * 60 + Number(start.slice(3)));
  const floor = shifts
    .filter(
      (s) =>
        s.data.activity === 'floor' &&
        s.data.status === 'published' &&
        s.data.employeeId,
    )
    .reduce((sum, s) => sum + minutes(s.data.start, s.data.end), 0);
  return (
    <>
      <div className="operation-heading">
        <div>
          <h2>
            {location
              ? `Rooster ${w.organization.locations.find((l) => l.id === location)?.name}`
              : 'Vijf locaties, één rooster'}
          </h2>
          <p>
            {days[0]} t/m {days[6]}
          </p>
        </div>
        {canWrite && (
          <button
            className="button button--primary"
            disabled={busy || !w.organization.locations.length}
            onClick={() =>
              create(
                anchor,
                location ||
                  selected?.data.locationIds.find((id) =>
                    w.organization.locations.some((l) => l.id === id),
                  ) ||
                  w.organization.locations[0]?.id ||
                  '',
                selected?.id,
              )
            }
          >
            Dienst toevoegen
          </button>
        )}
      </div>
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
      </div>
      <div className="operation-roster-workspace">
        <section
          className="operation-employee-pool"
          aria-label="Beschikbare medewerkers"
        >
          <div className="operation-heading">
            <div>
              <h3>Beschikbare medewerkers · {people.length}</h3>
              <p>
                {location
                  ? 'Actief en gekoppeld aan deze locatie.'
                  : 'Kies een locatie om het overzicht te beperken.'}
              </p>
            </div>
          </div>
          <p>
            Sleep naar een dag. Of klik op een medewerker en daarna op Dienst
            plannen.
          </p>
          <div className="operation-employee-cards">
            {people.map((person) => (
              <button
                type="button"
                key={person.id}
                className={`operation-employee-card ${selected?.id === person.id ? 'operation-employee-card--selected' : ''}`}
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
                    employeeDragType,
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
                  setDropTarget(null);
                }}
              >
                <strong>{person.data.name}</strong>
                <span>{person.data.number}</span>
                <small>
                  {person.data.locationIds
                    .map(
                      (id) =>
                        w.organization.locations.find((l) => l.id === id)
                          ?.name ?? id,
                    )
                    .join(' · ')}
                </small>
              </button>
            ))}
          </div>
          <Link className="operation-team-link" to={teamLink}>
            Medewerkers en locaties beheren
          </Link>
          {!people.length && (
            <p>
              Nog geen actieve medewerkers aan deze selectie gekoppeld. Voeg ze
              toe of koppel locaties via Team.
            </p>
          )}
          {selected && (
            <p role="status">
              {selected.data.name} geselecteerd. Kies hieronder een dag om de
              diensttijden in te vullen.
            </p>
          )}
          {dropError && (
            <p role="alert" className="report-error">
              {dropError}
            </p>
          )}
        </section>
        <div className="operation-roster-board">
          <p>
            {shifts.filter((s) => s.data.employeeId === null).length} open
            diensten · {fmt(floor / 60)} definitief ingeplande vloeruren in deze
            selectie.
          </p>
          {w.warnings.map((v) => (
            <p className="operation-notice" key={v}>
              {v}
            </p>
          ))}
          <div className="operation-roster-scroll">
            <table className="operation-roster">
              <thead>
                <tr>
                  <th>Locatie</th>
                  {days.map((d) => (
                    <th key={d}>
                      {new Date(`${d}T12:00:00Z`).toLocaleDateString('nl-NL', {
                        weekday: 'short',
                        day: 'numeric',
                        month: 'short',
                        timeZone: 'Europe/Amsterdam',
                      })}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {w.organization.locations
                  .filter((l) => !location || l.id === location)
                  .map((l) => (
                    <tr key={l.id}>
                      <th>{l.name}</th>
                      {days.map((d) => (
                        <td key={d}>
                          <div
                            role="group"
                            aria-label={`Roostervak ${l.name} ${d}`}
                            className={`operation-dropzone ${dropTarget === `${l.id}:${d}` ? 'operation-dropzone--over' : ''} ${canWrite && (dragging ?? selected)?.data.locationIds.includes(l.id) ? 'operation-dropzone--ready' : ''}`}
                            onDragOver={(event) => {
                              if (
                                !canWrite ||
                                busy ||
                                !event.dataTransfer.types.includes(
                                  employeeDragType,
                                )
                              )
                                return;
                              if (
                                dragging &&
                                !dragging.data.locationIds.includes(l.id)
                              )
                                return;
                              event.preventDefault();
                              event.dataTransfer.dropEffect = 'copy';
                              setDropTarget(`${l.id}:${d}`);
                            }}
                            onDragLeave={() => setDropTarget(null)}
                            onDrop={(event) => {
                              event.preventDefault();
                              setDropTarget(null);
                              setDraggingId(null);
                              if (!canWrite || busy) return;
                              try {
                                const payload: unknown = JSON.parse(
                                  event.dataTransfer.getData(employeeDragType),
                                );
                                if (
                                  !payload ||
                                  typeof payload !== 'object' ||
                                  !('organizationId' in payload) ||
                                  payload.organizationId !==
                                    w.organization.id ||
                                  !('dataset' in payload) ||
                                  payload.dataset !== w.dataset ||
                                  !('employeeId' in payload)
                                )
                                  throw new Error('selection');
                                const person = people.find(
                                  (entry) => entry.id === payload.employeeId,
                                );
                                if (
                                  !person ||
                                  !person.data.locationIds.includes(l.id)
                                )
                                  throw new Error('location');
                                setDropError('');
                                setSelectedId(person.id);
                                create(d, l.id, person.id);
                              } catch {
                                setDropError(
                                  'Deze medewerker kan hier niet worden ingepland. Controleer de actieve status en gekoppelde locaties via Team.',
                                );
                              }
                            }}
                          >
                            {shifts
                              .filter(
                                (s) =>
                                  s.locationId === l.id && s.data.date === d,
                              )
                              .sort((a, b) =>
                                a.data.start.localeCompare(b.data.start),
                              )
                              .map((s) => (
                                <button
                                  className={`operation-shift operation-shift--${s.data.status}`}
                                  disabled={busy || !canWrite}
                                  key={s.id}
                                  onClick={() => edit(s)}
                                >
                                  <strong>
                                    {s.data.start}–{s.data.end}
                                  </strong>
                                  <span>
                                    {w.employees.find(
                                      (e) => e.id === s.data.employeeId,
                                    )?.data.name ?? 'Open dienst'}
                                  </span>
                                  <small>
                                    {activityLabels[s.data.activity]} ·{' '}
                                    {statusLabels[s.data.status]}
                                  </small>
                                  {s.data.notes && (
                                    <small>{s.data.notes}</small>
                                  )}
                                </button>
                              ))}
                            {canWrite && (
                              <button
                                type="button"
                                className="operation-add-shift"
                                disabled={
                                  busy ||
                                  (!!selected &&
                                    !selected.data.locationIds.includes(l.id))
                                }
                                aria-label={`Dienst plannen voor ${l.name} op ${d}${selected ? ` met ${selected.data.name}` : ''}`}
                                onClick={() => create(d, l.id, selected?.id)}
                              >
                                {selected
                                  ? `+ Plan ${selected.data.name}`
                                  : '+ Dienst plannen'}
                              </button>
                            )}
                          </div>
                        </td>
                      ))}
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
      <h3>Ingeplande uren per medewerker</h3>
      <p>
        Contracturen zijn een weekreferentie; afwezigheid, pauzes en reistijd
        worden nog niet automatisch verrekend.
      </p>
      <div className="operation-location-grid">
        {w.employees
          .filter((e) => !location || e.data.locationIds.includes(location))
          .map((e) => {
            const assigned = shifts.filter((s) => s.data.employeeId === e.id),
              total = assigned.reduce(
                (sum, s) => sum + minutes(s.data.start, s.data.end),
                0,
              );
            return (
              <section className="panel report-panel" key={e.id}>
                <strong>{e.data.name}</strong>
                <p>
                  {fmt(total / 60)} uur in zichtbare diensten · contract{' '}
                  {e.data.contractMinutes === null
                    ? 'onbekend'
                    : `${fmt(e.data.contractMinutes / 60)} uur`}
                </p>
                {e.data.contractMinutes !== null &&
                  total > e.data.contractMinutes && (
                    <p role="status">
                      Meer gepland dan de vastgelegde contracturen.
                    </p>
                  )}
              </section>
            );
          })}
      </div>
    </>
  );
}
function MembersView({
  root,
  organization,
  dataset,
  location,
  workspace: w,
  canWrite,
  busy,
  mutate,
}: {
  root: string;
  organization: string;
  dataset: Dataset;
  location: string;
  workspace: OperationsWorkspace;
  canWrite: boolean;
  busy: boolean;
  mutate: (path: string, body: unknown) => Promise<boolean>;
}) {
  const [source, setSource] = useState(''),
    [search, setSearch] = useState(''),
    [filter, setFilter] = useState('all'),
    [selected, setSelected] = useState<string | null>(null),
    [note, setNote] = useState(''),
    [next, setNext] = useState('');
  const allowed = w.principal.permissions.includes('members.read');
  const query = useQuery({
    queryKey: ['members', organization, dataset, source],
    queryFn: () =>
      operationsApi<MemberDirectory>(
        `${root}/members?dataset=${dataset}${source ? `&sourceId=${encodeURIComponent(source)}` : ''}`,
      ),
    enabled: allowed,
    retry: false,
  });
  const members =
    query.data?.members.filter(
      (m) =>
        (!location || m.locationId === location) &&
        `${m.name} ${m.number} ${m.email ?? ''}`
          .toLowerCase()
          .includes(search.toLowerCase()) &&
        (filter === 'all' ||
          (filter === 'unknown'
            ? m.inactiveDays === null
            : m.status.toLowerCase() === 'actief' &&
              m.inactiveDays !== null &&
              m.inactiveDays >= Number(filter))),
    ) ?? [];
  const member = members.find((m) => m.key === selected);
  if (!allowed)
    return (
      <p role="alert">
        Dit account heeft geen leesrecht voor persoonsgegevens van leden.
      </p>
    );
  const locName = (id: string) =>
    w.organization.locations.find((l) => l.id === id)?.name ?? id;
  const pick = (m: DirectoryMember) => {
    setSelected(m.key);
    setNote('');
    setNext('');
  };
  return (
    <>
      <h2>Dewi-leden · {members.length}</h2>
      {query.isPending && <p role="status">Ledenbron laden…</p>}
      {query.error && <p role="alert">{query.error.message}</p>}
      {query.data?.warnings.map((v) => (
        <p key={v} className="operation-notice">
          {v}
        </p>
      ))}
      <div className="report-fields">
        <label>
          Zoeken
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Naam, klantnummer of e-mail"
          />
        </label>
        <label>
          Selectie
          <select value={filter} onChange={(e) => setFilter(e.target.value)}>
            <option value="all">Alle leden</option>
            <option value="14">Actief, minstens 14 dagen niet geweest</option>
            <option value="30">Actief, minstens 30 dagen niet geweest</option>
            <option value="unknown">Bezoekdatum onbekend / toekomstig</option>
          </select>
        </label>
        <label>
          Bron
          <select
            value={source}
            onChange={(e) => {
              setSource(e.target.value);
              setSelected(null);
            }}
          >
            <option value="">Nieuwste peildatum per locatie</option>
            {query.data?.sources.map((s) => (
              <option key={s.id} value={s.id}>
                {locName(s.locationId)} · {s.asOf} · {s.filename}
              </option>
            ))}
          </select>
        </label>
      </div>
      {member && (
        <section className="panel report-panel">
          <div className="operation-heading">
            <h2>
              {member.name} · {member.number}
            </h2>
            <button className="button" onClick={() => setSelected(null)}>
              Dossier sluiten
            </button>
          </div>
          <p>
            {locName(member.locationId)} · {member.status} · peildatum{' '}
            {member.asOf}
          </p>
          <p>
            E-mail: {member.email ?? 'Onbekend'} · Telefoon:{' '}
            {member.phone ?? 'Onbekend'}
          </p>
          <p>
            Laatste bezoek: {member.lastVisit ?? 'Onbekend'} ·{' '}
            {member.inactiveDays === null
              ? 'Aantal dagen onbekend'
              : `${member.inactiveDays} dagen op peildatum`}
          </p>
          <h3>Contacthistorie</h3>
          {query.data?.contacts
            .filter((c) => c.data.memberKey === member.key)
            .map((c) => (
              <article key={c.id} className="operation-contact">
                <p className="operation-pre">{c.data.note}</p>
                <small>
                  {new Date(c.createdAt).toLocaleString('nl-NL')} ·
                  Vervolgdatum: {c.data.nextContact ?? 'Niet ingesteld'}
                </small>
              </article>
            ))}
          {canWrite && (
            <form
              onSubmit={async (e) => {
                e.preventDefault();
                if (
                  await mutate('records', {
                    dataset,
                    kind: 'contact',
                    locationId: member.locationId,
                    data: {
                      memberKey: member.key,
                      sourceId: member.sourceId,
                      note,
                      nextContact: next || null,
                    },
                  })
                )
                  setNote('');
              }}
            >
              <label>
                Nieuwe contactnotitie
                <textarea
                  required
                  maxLength={3000}
                  rows={3}
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                />
              </label>
              <label>
                Vervolgdatum
                <input
                  type="date"
                  value={next}
                  onChange={(e) => setNext(e.target.value)}
                />
              </label>
              <div className="operation-actions">
                <button className="button button--primary" disabled={busy}>
                  Notitie bewaren
                </button>
                <button
                  type="button"
                  className="button"
                  disabled={busy}
                  onClick={() =>
                    void mutate('member-task', {
                      dataset,
                      memberKey: member.key,
                      sourceId: member.sourceId,
                      dueDate: next || today(),
                    })
                  }
                >
                  Opvolgtaak maken
                </button>
              </div>
            </form>
          )}
          <small>
            Notities blijven in de historie. Voeg bij een fout een correctie
            toe. Er wordt geen bericht naar het lid verstuurd.
          </small>
        </section>
      )}
      <div className="table-scroll">
        <table className="data-table">
          <thead>
            <tr>
              <th>Lid</th>
              <th>Locatie</th>
              <th>Status</th>
              <th>Laatste bezoek</th>
              <th>Dagen op peildatum</th>
              <th>Bronpeildatum</th>
              <th>Dossier</th>
            </tr>
          </thead>
          <tbody>
            {members.slice(0, 500).map((m) => (
              <tr key={m.key}>
                <td>
                  {m.name}
                  <small className="operation-detail">{m.number}</small>
                </td>
                <td>{locName(m.locationId)}</td>
                <td>{m.status || 'Onbekend'}</td>
                <td>{m.lastVisit ?? 'Onbekend'}</td>
                <td>{fmt(m.inactiveDays)}</td>
                <td>{m.asOf}</td>
                <td>
                  <button className="button" onClick={() => pick(m)}>
                    Bekijken
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {members.length > 500 && (
        <p>
          De eerste 500 leden worden getoond. Verfijn je zoekopdracht om de
          overige leden te vinden.
        </p>
      )}
      {!query.isPending && !members.length && (
        <p>
          Geen leden in deze selectie. Importeer eerst een Dewi-ledenexport via
          Rapportages → Excel/ZIP en bevestig locatie en peildatum.
        </p>
      )}
    </>
  );
}
