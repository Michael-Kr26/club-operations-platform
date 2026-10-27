import { useRef, useEffect, useState } from 'react';
import type {
  Dataset,
  RosterCopyResult,
  RosterTemplateSummary,
  RosterWeek,
  ShiftRecord,
} from '@cop/contracts';
import { activityLabels, operationsApi, shiftTypeLabels } from './api';

const nextDay = (date: string, days: number) =>
  new Date(Date.parse(date + 'T00:00:00Z') + days * 86400000)
    .toISOString()
    .slice(0, 10);
export function RosterActions({
  root,
  dataset,
  location,
  weekStart,
  templates,
  copySource,
  closeCopy,
  refresh,
  showWeek,
  busy,
}: {
  root: string;
  dataset: Dataset;
  location: string;
  weekStart: string;
  templates: RosterTemplateSummary[];
  copySource: ShiftRecord | null;
  closeCopy: () => void;
  refresh: () => Promise<void>;
  showWeek: (date: string) => void;
  busy: boolean;
}) {
  const [mode, setMode] = useState<'save' | 'apply' | null>(null);
  const [versions, setVersions] = useState<Partial<Record<RosterWeek, number>>>(
    {},
  );
  const [slot, setSlot] = useState<RosterWeek>('A');
  const [alternate, setAlternate] = useState(false);
  const [start, setStart] = useState(nextDay(weekStart, 7));
  const [weeks, setWeeks] = useState(1);
  const [working, setWorking] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const panel = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (copySource || mode)
      panel.current?.scrollIntoView?.({ block: 'center', behavior: 'smooth' });
  }, [copySource, mode]);
  const disabled = busy || working;
  const template = templates.find((t) => (t.slot ?? 'A') === slot);
  const hasBoth = ['A', 'B'].every((s) =>
    templates.some((t) => (t.slot ?? 'A') === s),
  );
  const otherSlot = slot === 'A' ? 'B' : 'A';
  const open = (next: 'save' | 'apply') => {
    closeCopy();
    setMode(next);
    setVersions(
      Object.fromEntries(templates.map((t) => [t.slot ?? 'A', t.version])),
    );
    setSlot(
      next === 'apply' && !templates.some((t) => (t.slot ?? 'A') === 'A')
        ? 'B'
        : 'A',
    );
    setAlternate(next === 'apply' && hasBoth);
    setStart(nextDay(weekStart, 7));
    setError('');
    setMessage('');
  };
  async function request(
    path: string,
    body: unknown,
    success: (result: RosterCopyResult & { shiftCount?: number }) => string,
    target?: string,
  ) {
    if (disabled) return;
    setWorking(true);
    setError('');
    setMessage('');
    let result: RosterCopyResult & { shiftCount?: number };
    try {
      result = await operationsApi(`${root}/${path}`, body);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Opslaan mislukt.');
      setWorking(false);
      return;
    }
    // The write has succeeded even if refreshing the overview fails.
    setMessage(success(result));
    setMode(null);
    closeCopy();
    if (target) showWeek(target);
    try {
      await refresh();
    } catch {
      setError(
        'Opgeslagen, maar het overzicht kon niet worden ververst. Vernieuw de pagina.',
      );
    } finally {
      setWorking(false);
    }
  }
  return (
    <section className="roster-actions" aria-label="Kopiëren en basisrooster">
      <div className="operation-actions">
        <button
          className="button"
          disabled={disabled || !location}
          onClick={() => open('save')}
        >
          Basisrooster bewaren
        </button>
        <button
          className="button"
          disabled={disabled || !location || !templates.length}
          onClick={() => open('apply')}
        >
          Basisrooster toepassen
        </button>
      </div>
      <p className="roster-footnote">
        {!location
          ? 'Kies één locatie om een vast weekrooster te bewaren of te gebruiken.'
          : 'Bewaar week A en week B voor deze locatie. Je kunt ze afwisselend tot 12 weken vooruit plannen.'}
      </p>
      {location && (
        <ul className="roster-basis-summary" aria-label="Bewaarde basisweken">
          {(['A', 'B'] as const).map((s) => {
            const saved = templates.find((t) => (t.slot ?? 'A') === s);
            return (
              <li key={s}>
                Week {s}:{' '}
                {saved
                  ? `${saved.shiftCount} diensten · versie ${saved.version} · bronweek ${saved.sourceWeek}`
                  : 'nog niet bewaard'}
              </li>
            );
          })}
        </ul>
      )}
      <div ref={panel}>
        {copySource ? (
          <CopyShiftForm
            key={copySource.id}
            source={copySource}
            disabled={disabled}
            close={() => {
              setMode(null);
              setError('');
              closeCopy();
            }}
            submit={(date) =>
              request(
                'shifts/copy',
                {
                  dataset,
                  id: copySource.id,
                  version: copySource.version,
                  date,
                },
                (result) =>
                  result.created
                    ? 'Dienst als concept gekopieerd. Je kunt de kopie nu apart aanpassen.'
                    : 'Deze dienst was al naar die dag gekopieerd. De bestaande kopie is behouden.',
                date,
              )
            }
          />
        ) : (
          mode && (
            <form
              className="roster-action-form"
              aria-label={
                mode === 'save' ? 'Basisweek bewaren' : 'Basisweek toepassen'
              }
              onSubmit={(event) => {
                event.preventDefault();
                if (mode === 'save')
                  void request(
                    'roster-templates/save',
                    {
                      dataset,
                      locationId: location,
                      from: weekStart,
                      slot,
                      version: versions[slot] ?? 0,
                    },
                    (result) =>
                      `Basisweek ${slot} bewaard met ${result.shiftCount} diensten. Eerder ingeplande weken blijven behouden.`,
                  );
                else
                  void request(
                    'roster-templates/apply',
                    {
                      dataset,
                      locationId: location,
                      weekStart: start,
                      weeks,
                      slot,
                      version: versions[slot] ?? 0,
                      alternate,
                      ...(alternate
                        ? { otherVersion: versions[otherSlot] ?? 0 }
                        : {}),
                    },
                    (result) =>
                      `${result.created} diensten als concept toegevoegd; ${result.skipped} al bestaande kopieën behouden.`,
                    start,
                  );
              }}
            >
              <h3>
                {mode === 'save'
                  ? 'Deze week als vast rooster bewaren'
                  : 'Vast weekrooster gebruiken'}
              </h3>
              <label>
                {mode === 'save' ? 'Bewaren als basisweek' : 'Eerste basisweek'}
                <select
                  value={slot}
                  disabled={disabled}
                  onChange={(event) =>
                    setSlot(event.target.value as RosterWeek)
                  }
                >
                  {(['A', 'B'] as const).map((s) => (
                    <option
                      key={s}
                      value={s}
                      disabled={
                        mode === 'apply' &&
                        !templates.some((t) => (t.slot ?? 'A') === s)
                      }
                    >
                      Week {s}
                    </option>
                  ))}
                </select>
              </label>
              {mode === 'save' ? (
                <p>
                  De week van {weekStart}, inclusief medewerkers, tijden,
                  diensttypen en notities.{' '}
                  {template
                    ? `Dit vervangt alleen basisweek ${slot}. Eerder ingeplande weken veranderen niet.`
                    : 'Geannuleerde diensten worden niet meegenomen.'}
                </p>
              ) : (
                <>
                  <div className="report-fields">
                    <label>
                      Vanaf maandag
                      <input
                        type="date"
                        required
                        value={start}
                        disabled={disabled}
                        onChange={(event) => setStart(event.target.value)}
                      />
                    </label>
                    <label>
                      Aantal weken
                      <input
                        type="number"
                        min="1"
                        max="12"
                        step="1"
                        required
                        value={weeks}
                        disabled={disabled}
                        onChange={(event) =>
                          setWeeks(Number(event.target.value))
                        }
                      />
                    </label>
                  </div>
                  <label className="report-check">
                    <input
                      type="checkbox"
                      checked={alternate}
                      disabled={disabled || !hasBoth}
                      onChange={(event) => setAlternate(event.target.checked)}
                    />
                    Week A en B afwisselen
                  </label>
                  {!hasBoth && (
                    <p>
                      Bewaar beide basisweken om ze af te wisselen. Nu wordt
                      week {slot} iedere week gebruikt.
                    </p>
                  )}
                  {start &&
                    /^\d{4}-\d{2}-\d{2}$/.test(start) &&
                    Number.isFinite(Date.parse(start + 'T00:00:00Z')) &&
                    Number.isInteger(weeks) &&
                    weeks >= 1 &&
                    weeks <= 12 && (
                      <ol
                        className="roster-sequence"
                        aria-label="Geplande weekvolgorde"
                      >
                        {Array.from({ length: weeks }, (_, index) => (
                          <li key={index}>
                            Vanaf {nextDay(start, index * 7)}: week{' '}
                            {alternate && index % 2 === 1 ? otherSlot : slot}
                          </li>
                        ))}
                      </ol>
                    )}
                  <p>
                    Nieuwe diensten worden concepten in lege weken. Weken die al
                    volledig uit dit basisrooster zijn gemaakt, worden
                    overgeslagen. Andere bestaande diensten worden niet
                    overschreven. Bij een conflict wordt niets toegevoegd.
                  </p>
                </>
              )}
              <div className="operation-actions">
                <button
                  className="button button--primary"
                  disabled={disabled}
                  type="submit"
                >
                  {working
                    ? 'Bezig…'
                    : mode === 'save'
                      ? 'Bewaar deze week'
                      : 'Weken klaarzetten'}
                </button>
                <button
                  className="button"
                  disabled={disabled}
                  type="button"
                  onClick={() => {
                    setMode(null);
                    setError('');
                  }}
                >
                  Annuleren
                </button>
              </div>
            </form>
          )
        )}
      </div>
      {error && (
        <p className="report-error" role="alert">
          {error}
        </p>
      )}
      {message && (
        <p className="operation-notice" role="status">
          {message}
        </p>
      )}
    </section>
  );
}
function CopyShiftForm({
  source,
  disabled,
  submit,
  close,
}: {
  source: ShiftRecord;
  disabled: boolean;
  submit: (date: string) => Promise<void>;
  close: () => void;
}) {
  const [date, setDate] = useState(nextDay(source.data.date, 1));
  return (
    <form
      className="roster-action-form"
      aria-label="Dienst kopiëren"
      onSubmit={(event) => {
        event.preventDefault();
        void submit(date);
      }}
    >
      <h3>Dienst naar een andere dag kopiëren</h3>
      <p>
        {source.data.date} · {source.data.start}–{source.data.end} ·{' '}
        {shiftTypeLabels[source.data.shiftType ?? 'allround']} ·{' '}
        {activityLabels[source.data.activity]}
      </p>
      <label>
        Naar dag
        <input
          autoFocus
          type="date"
          required
          disabled={disabled}
          value={date}
          onChange={(event) => setDate(event.target.value)}
        />
      </label>
      <p>
        Medewerker, locatie, tijden, diensttype en notitie worden overgenomen.
        De kopie wordt een concept. De oorspronkelijke dienst blijft staan.
      </p>
      <div className="operation-actions">
        <button
          className="button button--primary"
          type="submit"
          disabled={disabled}
        >
          Kopie opslaan
        </button>
        <button
          className="button"
          type="button"
          disabled={disabled}
          onClick={close}
        >
          Annuleren
        </button>
      </div>
    </form>
  );
}
