import { useState } from 'react';
import type {
  OperationKind,
  OperationRecord,
  OperationsWorkspace,
} from '@cop/contracts';
import { activityLabels, recordLabels, today } from './api';
function defaultData(kind: OperationKind): Record<string, unknown> {
  switch (kind) {
    case 'task':
      return {
        title: '',
        description: '',
        assigneeId: null,
        dueDate: today(),
        priority: 'normal',
        status: 'open',
      };
    case 'employee':
      return {
        name: '',
        number: '',
        locationIds: [],
        skills: [],
        contractMinutes: null,
        active: true,
      };
    case 'shift':
      return {
        employeeId: null,
        date: today(),
        start: '08:30',
        end: '12:00',
        activity: 'floor',
        status: 'draft',
        notes: '',
      };
    case 'checklist':
      return {
        title: '',
        items: [],
        cadence: 'daily',
        startDate: today(),
        assigneeId: null,
        active: true,
      };
    case 'asset':
      return {
        name: '',
        serial: '',
        status: 'operational',
        nextMaintenance: null,
        notes: '',
      };
    case 'contact':
      return {};
  }
}
export interface Editor {
  kind: OperationKind;
  record?: OperationRecord;
  locationId: string;
  assetId?: string;
  requestId?: string;
  initial?: Record<string, unknown>;
  employeeLocationsOnly?: boolean;
}
export function RecordForm({
  editor,
  workspace,
  busy,
  save,
  close,
}: {
  editor: Editor;
  workspace: OperationsWorkspace;
  busy: boolean;
  save: (locationId: string, data: Record<string, unknown>) => Promise<void>;
  close: () => void;
}) {
  const [location, setLocation] = useState(
    editor.locationId || workspace.organization.locations[0]?.id || '',
  );
  const initial = editor.record?.data as unknown as
    Record<string, unknown> | undefined;
  const [data, setData] = useState<Record<string, unknown>>(
    initial ?? {
      ...defaultData(editor.kind),
      ...(editor.kind === 'employee' ? { locationIds: [location] } : {}),
      ...editor.initial,
    },
  );
  const [items, setItems] = useState(
      Array.isArray(data.items) ? data.items.join('\n') : '',
    ),
    [hours, setHours] = useState(
      data.contractMinutes == null
        ? ''
        : String(Number(data.contractMinutes) / 60),
    );
  const set = (key: string, value: unknown) =>
    setData({ ...data, [key]: value });
  const input = (
    key: string,
    label: string,
    type = 'text',
    required = false,
  ) => (
    <label key={key}>
      {label}
      <input
        autoFocus={
          editor.kind === 'shift' && key === 'start' && !!data.employeeId
        }
        disabled={busy}
        type={type}
        required={required}
        maxLength={type === 'text' ? 200 : undefined}
        value={String(data[key] ?? '')}
        onChange={(e) => set(key, e.target.value)}
      />
    </label>
  );
  const select = (
    key: string,
    label: string,
    options: readonly (readonly [string, string])[],
  ) => (
    <label key={key}>
      {label}
      <select
        disabled={busy}
        value={String(data[key] ?? '')}
        onChange={(e) => set(key, e.target.value || null)}
      >
        {options.map(([value, text]) => (
          <option key={value} value={value}>
            {text}
          </option>
        ))}
      </select>
    </label>
  );
  const people = workspace.employees.filter(
    (e) => e.data.active && e.data.locationIds.includes(location),
  );
  const assignment = (key = 'assigneeId') =>
    select(key, key === 'employeeId' ? 'Medewerker' : 'Verantwoordelijke', [
      ['', 'Nog niet toegewezen'],
      ...people.map(
        (e) => [e.id, `${e.data.name} · ${e.data.number}`] as const,
      ),
    ]);
  const area = (key: string, label: string) => (
    <label>
      {label}
      <textarea
        rows={4}
        maxLength={3000}
        disabled={busy}
        value={String(data[key] ?? '')}
        onChange={(e) => set(key, e.target.value)}
      />
    </label>
  );
  const multi = (
    key: string,
    label: string,
    options: readonly (readonly [string, string])[],
  ) => (
    <fieldset>
      <legend>{label}</legend>
      {options.map(([value, text]) => (
        <label className="report-check" key={value}>
          <input
            disabled={busy || (key === 'locationIds' && value === location)}
            type="checkbox"
            checked={(data[key] as string[]).includes(value)}
            onChange={(e) =>
              set(
                key,
                e.target.checked
                  ? [...(data[key] as string[]), value]
                  : (data[key] as string[]).filter((v) => v !== value),
              )
            }
          />
          {text}
        </label>
      ))}
    </fieldset>
  );
  return (
    <section className="panel report-panel operation-editor">
      <h2>
        {editor.employeeLocationsOnly
          ? `Locaties koppelen: ${String(data.name)}`
          : `${editor.record ? 'Bewerken:' : 'Nieuwe'} ${recordLabels[editor.kind].toLowerCase()}`}
      </h2>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void save(location, {
            ...data,
            ...(editor.kind === 'employee'
              ? {
                  contractMinutes:
                    hours === '' ? null : Math.round(Number(hours) * 60),
                }
              : {}),
            ...(editor.kind === 'checklist'
              ? {
                  items: items
                    .split('\n')
                    .map((i) => i.trim())
                    .filter(Boolean),
                }
              : {}),
          });
        }}
      >
        <div className="report-fields">
          <label>
            {editor.kind === 'employee' ? 'Thuislocatie' : 'Locatie'}
            <select
              disabled={
                busy ||
                !!editor.assetId ||
                (!!editor.record &&
                  (editor.record.data as { source?: unknown }).source !==
                    undefined)
              }
              value={location}
              autoFocus={editor.employeeLocationsOnly}
              onChange={(e) => {
                const next = e.target.value;
                setLocation(next);
                if (editor.kind === 'employee')
                  set('locationIds', [
                    ...new Set([...(data.locationIds as string[]), next]),
                  ]);
                if (
                  editor.kind === 'shift' &&
                  data.employeeId &&
                  !workspace.employees.some(
                    (person) =>
                      person.id === data.employeeId &&
                      person.data.active &&
                      person.data.locationIds.includes(next),
                  )
                )
                  set('employeeId', null);
              }}
            >
              {workspace.organization.locations.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.name}
                </option>
              ))}
            </select>
          </label>
          {editor.kind === 'task' && !editor.assetId && (
            <>
              {input('title', 'Taak', 'text', true)}
              {assignment()}
              {input('dueDate', 'Deadline', 'date')}
              {select('priority', 'Prioriteit', [
                ['normal', 'Normaal'],
                ['high', 'Hoog'],
              ])}
              {select('status', 'Status', [
                ['open', 'Open'],
                ['in-progress', 'In behandeling'],
                ['done', 'Afgerond'],
                ['cancelled', 'Geannuleerd'],
              ])}
            </>
          )}
          {editor.assetId && (
            <>
              <p>
                {String(data.title)} · Nieuwe open onderhoudstaak met hoge
                prioriteit. Toewijzen kan na opslaan; apparaatstatus wordt
                afzonderlijk bijgewerkt.
              </p>
              {input('dueDate', 'Deadline', 'date')}
            </>
          )}
          {editor.kind === 'employee' && !editor.employeeLocationsOnly && (
            <>
              {input('name', 'Naam', 'text', true)}
              {input('number', 'Personeelsnummer', 'text', true)}
              <label>
                Contracturen per week (leeg = onbekend)
                <input
                  type="number"
                  min="0"
                  max="168"
                  step="0.25"
                  value={hours}
                  onChange={(e) => setHours(e.target.value)}
                />
              </label>
            </>
          )}
          {editor.kind === 'shift' && (
            <>
              {assignment('employeeId')}
              {input('date', 'Datum', 'date', true)}
              {input('start', 'Van', 'time', true)}
              {input('end', 'Tot', 'time', true)}
              {select(
                'activity',
                'Werkzaamheid',
                Object.entries(activityLabels),
              )}
              {select('status', 'Roosterstatus', [
                ['draft', 'Concept'],
                ['published', 'Definitief'],
                ['cancelled', 'Geannuleerd'],
              ])}
            </>
          )}
          {editor.kind === 'checklist' && (
            <>
              {input('title', 'Naam controlelijst', 'text', true)}
              {select('cadence', 'Herhaling', [
                ['daily', 'Dagelijks'],
                ['weekly', 'Wekelijks'],
                ['monthly', 'Maandelijks'],
              ])}
              {input('startDate', 'Vanaf', 'date', true)}
              {assignment()}
            </>
          )}
          {editor.kind === 'asset' && (
            <>
              {input('name', 'Apparaat / object', 'text', true)}
              {input('serial', 'Serienummer / kenmerk')}
              {select('status', 'Status', [
                ['operational', 'In gebruik'],
                ['maintenance', 'In onderhoud'],
                ['out-of-service', 'Buiten gebruik'],
              ])}
              {input('nextMaintenance', 'Volgend onderhoud', 'date')}
            </>
          )}
        </div>
        {editor.kind === 'task' &&
          area('description', 'Toelichting / voortgang')}
        {editor.kind === 'shift' && area('notes', 'Dienstnotitie')}
        {editor.kind === 'asset' && area('notes', 'Onderhoudsinformatie')}
        {editor.kind === 'checklist' && (
          <label>
            Controlepunten · één per regel
            <textarea
              required
              rows={6}
              maxLength={12000}
              value={items}
              onChange={(e) => setItems(e.target.value)}
            />
          </label>
        )}
        {editor.kind === 'employee' && (
          <>
            {multi(
              'locationIds',
              'Gekoppelde locaties',
              workspace.organization.locations.map(
                (l) => [l.id, l.name] as const,
              ),
            )}
            <p>
              De thuislocatie blijft gekoppeld. Op de gekoppelde locaties
              verschijnt deze medewerker in het rooster bij Beschikbare
              medewerkers.
            </p>
            {!editor.employeeLocationsOnly &&
              multi(
                'skills',
                'Vastgelegde vaardigheden',
                Object.entries(activityLabels),
              )}
          </>
        )}
        {((editor.kind === 'employee' && !editor.employeeLocationsOnly) ||
          editor.kind === 'checklist') && (
          <label className="report-check">
            <input
              type="checkbox"
              checked={data.active === true}
              onChange={(e) => set('active', e.target.checked)}
            />
            Actief
          </label>
        )}
        <div className="operation-actions">
          <button className="button button--primary" disabled={busy}>
            Opslaan
          </button>
          <button
            type="button"
            className="button"
            disabled={busy}
            onClick={close}
          >
            Sluiten
          </button>
        </div>
      </form>
    </section>
  );
}
