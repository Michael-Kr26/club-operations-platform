import { useState } from 'react';
import type { CombinedPeriod, ForecastDashboard } from '@cop/contracts';
const count = (v: number | null | undefined) =>
  v == null
    ? 'Onbekend'
    : new Intl.NumberFormat('nl-NL', { maximumFractionDigits: 1 }).format(v);
const ratio = (v: number | null | undefined) =>
  v == null
    ? 'Onbekend'
    : new Intl.NumberFormat('nl-NL', {
        style: 'percent',
        maximumFractionDigits: 1,
      }).format(v);
const fields = [
  ['total', 'Leden in HP-bron'],
  ['withoutGoal', 'Zonder doel'],
  ['withoutAppointment', 'Zonder afspraak'],
  ['withoutCoach', 'Zonder coach'],
] as const;
const dailyFields = [
  ['active', 'Bezoekend actief (HP)'],
  ['sleeping', 'Slapend (HP)'],
  ['withoutAppointment', 'Zonder afspraak'],
  ['leads', 'Leads'],
  ['sold', 'Verkochte lidmaatschappen'],
  ['appointments', 'Afgeronde afspraken'],
] as const;
export function WorkbookOverview({
  data,
  selectSource,
}: {
  data: ForecastDashboard;
  selectSource: (id: string) => void;
}) {
  const [mode, setMode] = useState<CombinedPeriod['type']>('week'),
    [chosen, setChosen] = useState('');
  const model = data.combined;
  if (!model) return null;
  const periods = model.periods.filter((p) => p.type === mode);
  const filled = periods.filter((p) =>
    p.rows.some((r) => Object.values(r.values).some((v) => v !== null)),
  );
  const current =
    periods.find((p) => p.period === chosen) ?? filled.at(-1) ?? periods.at(-1);
  const prior = current
    ? filled.filter((p) => p.period < current.period).at(-1)
    : undefined;
  const columns = mode === 'day' ? dailyFields : fields;
  return (
    <>
      <section className="panel report-panel workbook-toolbar">
        <div>
          <span className="page-heading__eyebrow">Managementoverzicht</span>
          <h2>Alle clubs naast elkaar</h2>
          <p>Healthplanner-invoer · met bron en rapportageperiode</p>
        </div>
        <label>
          Weergave
          <select
            aria-label="Overzichtsperiode"
            value={mode}
            onChange={(e) => {
              setMode(e.target.value as CombinedPeriod['type']);
              setChosen('');
            }}
          >
            <option value="week">Wekelijks</option>
            <option value="month">Maandelijks</option>
            <option value="day">Dagelijks</option>
          </select>
        </label>
        <label>
          Periode
          <select
            aria-label="Gezamenlijke bronperiode"
            value={current?.period ?? ''}
            onChange={(e) => setChosen(e.target.value)}
          >
            {!periods.length && <option value="">Nog geen bron</option>}
            {periods.map((p) => (
              <option key={p.period}>{p.period}</option>
            ))}
          </select>
        </label>
      </section>
      {current ? (
        <>
          <div className="workbook-cards">
            {columns.map(([key, label]) => (
              <article className="panel workbook-card" key={key}>
                <span>{label} · som clubregistraties</span>
                <strong>{count(current.totals[key])}</strong>
                {key !== 'total' && key + 'Ratio' in current.totals && (
                  <small>{ratio(current.totals[key + 'Ratio'])}</small>
                )}
              </article>
            ))}
          </div>
          <section className="panel report-panel">
            <h2>Locatievergelijking · {current.period}</h2>
            <div className="table-scroll">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Locatie</th>
                    {columns.map(([key, label]) => (
                      <th key={key}>{label}</th>
                    ))}
                    <th>Verschil leden t.o.v. {prior?.period ?? 'onbekend'}</th>
                    <th>Bron</th>
                  </tr>
                </thead>
                <tbody>
                  {current.rows.map((r) => {
                    const previous = prior?.rows.find(
                      (p) => p.locationId === r.locationId,
                    );
                    const key = mode === 'day' ? 'active' : 'total';
                    const delta =
                      r.values[key] != null && previous?.values[key] != null
                        ? r.values[key]! - previous.values[key]!
                        : null;
                    return (
                      <tr key={r.locationId}>
                        <th>
                          {
                            data.organization.locations.find(
                              (l) => l.id === r.locationId,
                            )?.name
                          }
                        </th>
                        {columns.map(([k]) => (
                          <td key={k}>
                            {count(r.values[k])}
                            {k + 'Ratio' in r.values && (
                              <small className="workbook-cell-detail">
                                {ratio(r.values[k + 'Ratio'])}
                              </small>
                            )}
                          </td>
                        ))}
                        <td>
                          {delta === null
                            ? 'Onbekend'
                            : `${delta > 0 ? '+' : ''}${count(delta)}`}
                        </td>
                        <td>
                          {r.source ? (
                            <>
                              <button
                                type="button"
                                className="button"
                                onClick={() => selectSource(r.source!.id)}
                              >
                                {r.source.filename}
                              </button>
                              <small className="workbook-cell-detail">
                                Import{' '}
                                {new Date(r.source.importedAt).toLocaleString(
                                  'nl-NL',
                                )}
                              </small>
                              {r.conflict && (
                                <strong className="workbook-cell-detail">
                                  Afwijkende oudere bron aanwezig
                                </strong>
                              )}
                            </>
                          ) : (
                            'Bron ontbreekt'
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </section>
          <section className="panel report-panel">
            <h2>Trend · leden zonder afspraak</h2>
            <p>
              Aantallen per bronperiode; ontbrekende waarden blijven onbekend.
            </p>
            <div className="table-scroll">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Periode</th>
                    {data.organization.locations.map((l) => (
                      <th key={l.id}>{l.name}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {periods.map((p) => (
                    <tr key={p.period}>
                      <th>{p.period}</th>
                      {data.organization.locations.map((l) => {
                        const value = p.rows.find((r) => r.locationId === l.id)
                          ?.values.withoutAppointment;
                        return (
                          <td key={l.id}>
                            <span>{count(value)}</span>
                            {value != null && (
                              <meter
                                aria-label={`${l.name} ${p.period}`}
                                min={0}
                                max={Math.max(
                                  1,
                                  ...periods.flatMap((v) =>
                                    v.rows.map(
                                      (r) => r.values.withoutAppointment ?? 0,
                                    ),
                                  ),
                                )}
                                value={value}
                              />
                            )}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </>
      ) : (
        <p className="report-notice">
          Upload een ZIP met het Healthplanner leden updates-bestand voor het
          week- en maandoverzicht. Managementmails verschijnen onder Dagelijks.
        </p>
      )}
      <section className="panel report-panel">
        <h2>Dewi en omzet · eigen bronperiodes</h2>
        <div className="workbook-cards">
          {model.supplements.map((i) => {
            const r = i.report!;
            const loc = r.kind === 'forecast' ? [r.locationId] : r.locationIds;
            return (
              <article className="panel workbook-card" key={i.id}>
                <span>
                  {loc
                    .map(
                      (id) =>
                        data.organization.locations.find((l) => l.id === id)
                          ?.name,
                    )
                    .join(', ')}
                </span>
                <h3>
                  {r.kind === 'forecast'
                    ? 'Dewi ledenontwikkeling'
                    : r.kind === 'members'
                      ? 'Dewi ledenexport'
                      : 'Omzet kasstelsel'}
                </h3>
                <p>
                  {r.kind === 'forecast' ? `Export ${r.exportedOn}` : r.period}
                </p>
                {r.kind !== 'forecast' &&
                  r.cards.slice(0, 3).map((c) => (
                    <p key={c.label}>
                      {c.label}:{' '}
                      <strong>
                        {c.format === 'money' && c.value != null
                          ? new Intl.NumberFormat('nl-NL', {
                              style: 'currency',
                              currency: 'EUR',
                            }).format(c.value / 100)
                          : count(c.value)}
                      </strong>
                    </p>
                  ))}
                <button
                  type="button"
                  className="button"
                  onClick={() => selectSource(i.id)}
                >
                  Cijfers en bron bekijken
                </button>
              </article>
            );
          })}
        </div>
        {!model.supplements.length && (
          <p>Nog geen verwerkte Dewi- of omzetbestanden.</p>
        )}
      </section>
      <details className="panel report-panel">
        <summary>Definities van het gezamenlijke overzicht</summary>
        <ul>
          {model.warnings.map((w) => (
            <li key={w}>{w}</li>
          ))}
        </ul>
      </details>
    </>
  );
}
