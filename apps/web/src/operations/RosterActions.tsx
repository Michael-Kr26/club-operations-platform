import { useRef, useEffect, useState } from 'react';
import type {
  Dataset,
  RosterCopyResult,
  RosterTemplateSummary,
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
  template,
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
  template?: RosterTemplateSummary;
  copySource: ShiftRecord | null;
  closeCopy: () => void;
  refresh: () => Promise<void>;
  showWeek: (date: string) => void;
  busy: boolean;
}) {
  const [mode, setMode] = useState<'save' | 'apply' | null>(null);
  const [version, setVersion] = useState(0);
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
  const open = (next: 'save' | 'apply') => {
    closeCopy();
    setMode(next);
    setVersion(template?.version ?? 0);
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
          disabled={disabled || !location || !template}
          onClick={() => open('apply')}
        >
          Basisrooster toepassen
        </button>
      </div>
      <p className="roster-footnote">
        {!location
          ? 'Kies één locatie om een vast weekrooster te bewaren of te gebruiken.'
          : template
            ? `Vast weekrooster: ${template.shiftCount} diensten · versie ${template.version}. Je kunt hiermee tot 12 weken vooruit plannen.`
            : 'Plan eerst een basisweek en bewaar die als vast weekrooster voor deze locatie.'}
      </p>
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
                    { dataset, locationId: location, from: weekStart, version },
                    (result) =>
                      `Basisrooster bewaard met ${result.shiftCount} diensten. Toekomstige weken kun je hiervan afleiden.`,
                  );
                else
                  void request(
                    'roster-templates/apply',
                    {
                      dataset,
                      locationId: location,
                      weekStart: start,
                      weeks,
                      version,
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
              {mode === 'save' ? (
                <p>
                  De week van {weekStart}, inclusief medewerkers, tijden,
                  diensttypen en notities.{' '}
                  {template
                    ? 'Dit vervangt het bewaarde basisrooster. Eerder ingeplande weken veranderen niet.'
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
