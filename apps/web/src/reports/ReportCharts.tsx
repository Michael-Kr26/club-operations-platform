import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useSearchParams } from 'react-router';
import type { ForecastDashboard, ManagementReport } from '@cop/contracts';
import {
  buildChartRows,
  chartMetrics,
  closedWeekEnd,
  type ChartGroup,
  type Grain,
} from './chart-model';
import { previousAmsterdamDate } from './dates';
import './management-design.css';
const colors = ['#235ee8', '#157a93', '#6555b4', '#9b5b88', '#4c6d37'];
export function ReportCharts({ data }: { data: ForecastDashboard }) {
  const [params] = useSearchParams();
  const [group, setGroup] = useState<ChartGroup>(
      params.get('view') === 'finance' ? 'finance' : 'hp',
    ),
    [metric, setMetric] = useState(
      params.get('view') === 'finance' ? 'revenue' : 'withoutAppointment',
    ),
    [grain, setGrain] = useState<Grain>(
      params.get('interval') === 'day'
        ? 'day'
        : params.get('interval') === 'month'
          ? 'month'
          : 'week',
    ),
    [location, setLocation] = useState('all'),
    [date, setDate] = useState(
      /^\d{4}-\d{2}-\d{2}$/.test(params.get('date') ?? '')
        ? params.get('date')!
        : previousAmsterdamDate(),
    ),
    [count, setCount] = useState(12),
    [hover, setHover] = useState<string>('');
  const cutoff = group === 'finance' ? closedWeekEnd(date) : date;
  const seriesEnabled =
    group === 'finance' || (group === 'hp' && grain === 'day');
  const weekly = useQuery({
    queryKey: [
      'weekly-chart',
      data.organization.id,
      data.dataset,
      cutoff,
      count,
      group === 'finance' ? 'weekly' : 'daily',
    ],
    enabled: seriesEnabled,
    retry: false,
    queryFn: async () => {
      const r = await fetch(
        `/api/v1/organizations/${encodeURIComponent(data.organization.id)}/reports/${group === 'finance' ? 'weekly' : 'daily'}-series?dataset=${data.dataset}&date=${cutoff}&count=${count}`,
        { credentials: 'same-origin' },
      );
      if (!r.headers.get('content-type')?.includes('application/json'))
        throw new Error('Backend niet bereikbaar.');
      const body = await r.json();
      if (!r.ok)
        throw new Error(body.message ?? 'Weekcijfers niet beschikbaar.');
      return body as { reports: ManagementReport[] };
    },
  });
  const actualGrain =
    group === 'members'
      ? 'day'
      : group === 'forecast'
        ? 'month'
        : group === 'finance'
          ? 'week'
          : grain;
  const rows = buildChartRows(
    data,
    group,
    metric,
    actualGrain,
    cutoff,
    count,
    weekly.data?.reports,
  );
  const places =
    location === 'all'
      ? data.organization.locations
      : data.organization.locations.filter((l) => l.id === location);
  const money = group === 'finance';
  const format = (n: number | null | undefined) =>
    n == null
      ? 'Onbekend'
      : money
        ? new Intl.NumberFormat('nl-NL', {
            style: 'currency',
            currency: 'EUR',
            maximumFractionDigits: 2,
          }).format(n / 100)
        : n.toLocaleString('nl-NL');
  const title =
    chartMetrics[group][metric as keyof (typeof chartMetrics)[typeof group]] ??
    metric;
  const values = rows
      .flatMap((r) => places.map((l) => r.values[l.id]))
      .filter((v): v is number => v != null),
    min = Math.min(0, ...values),
    max = Math.max(1, ...values),
    span = max - min;
  const x = (i: number) => 65 + (i * 660) / Math.max(1, rows.length - 1),
    y = (v: number) => 205 - ((v - min) / span) * 155;
  const current = rows.at(-1);
  const point = (
    period: string,
    name: string,
    value: number | null | undefined,
    source: string | undefined,
  ) => `${name} · ${period} · ${format(value)} · ${source ?? 'Bron ontbreekt'}`;
  const changeGroup = (g: ChartGroup) => {
    setGroup(g);
    setMetric(Object.keys(chartMetrics[g])[0]!);
    setHover('');
  };
  return (
    <section
      className="management-design report-graphs panel report-panel"
      aria-label="Grafisch managementoverzicht"
    >
      <header className="management-heading">
        <div>
          <span className="management-eyebrow">
            {data.organization.name} ·{' '}
            {data.dataset === 'demo' ? 'DEMO' : 'Brongegevens'}
          </span>
          <h2>Jouw clubs in beeld</h2>
          <p>
            Lijnen met meetpunten voor ontwikkeling, staven voor
            locatievergelijking.
          </p>
        </div>
      </header>
      <div className="report-fields">
        <label>
          Gegevensbron
          <select
            value={group}
            onChange={(e) => changeGroup(e.target.value as ChartGroup)}
          >
            <option value="hp">Healthplanner</option>
            <option value="members">Dewi-ledenexport</option>
            <option value="forecast">Dewi-forecast</option>
            <option value="finance">Omzet · weekrapport</option>
          </select>
        </label>
        <label>
          Meetwaarde
          <select
            value={metric}
            onChange={(e) => {
              setMetric(e.target.value);
              setHover('');
            }}
          >
            {Object.entries(chartMetrics[group]).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </select>
        </label>
        <label>
          Locatie
          <select
            value={location}
            onChange={(e) => {
              setLocation(e.target.value);
              setHover('');
            }}
          >
            <option value="all">Alle toegankelijke locaties</option>
            {data.organization.locations.map((l) => (
              <option value={l.id} key={l.id}>
                {l.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          Interval
          <select
            value={actualGrain}
            disabled={group !== 'hp'}
            onChange={(e) => {
              setGrain(e.target.value as Grain);
              setHover('');
            }}
          >
            <option value="day">Dag</option>
            <option value="week">Week</option>
            <option value="month">Maand</option>
          </select>
        </label>
        <label>
          Tot en met
          <input
            type="date"
            value={date}
            max={previousAmsterdamDate()}
            onChange={(e) => {
              if (e.target.value) {
                setDate(e.target.value);
                setHover('');
              }
            }}
          />
        </label>
        <label>
          Aantal perioden
          <select
            value={count}
            onChange={(e) => setCount(Number(e.target.value))}
          >
            <option value={6}>6</option>
            <option value={12}>12</option>
            <option value={16}>16</option>
          </select>
        </label>
      </div>
      {weekly.error && seriesEnabled && (
        <p role="alert">{weekly.error.message}</p>
      )}
      {weekly.isFetching && seriesEnabled && (
        <p role="status">
          {group === 'finance' ? 'Weekcijfers' : 'Dagcijfers'} laden…
        </p>
      )}
      <p className="management-note">
        {group === 'members'
          ? 'Een Dewi-selectie of status Actief is geen bewezen actief abonnementenbestand. Dagen niet bezocht horen bij de peildatum van de export.'
          : group === 'forecast'
            ? 'Forecast = bronbeeld, met mogelijk ingeplande mutaties in de lopende maand. Geen bewezen historische ledenstand of churn.'
            : group === 'finance'
              ? 'Alleen volledige kalenderweken uit financiële events. Een maandexport wordt nooit over weken verdeeld. Omzet, ontvangen betalingen en saldi blijven verschillende cijfers.'
              : 'Healthplanner-bezoek is geen Dewi-abonnement. Week-/maandmetingen uit de updatetabel zijn bronwaarden, geen optelsom van dagcijfers.'}
      </p>
      {!values.length && (
        <p className="management-attention" role="status">
          Geen meetwaarden voor deze bron, periode en locatie. Kies een andere
          periode of importeer een passende bron. Ontbrekende gegevens zijn geen
          nul.
        </p>
      )}
      <div className="management-legend">
        {places.map((l, i) => (
          <span key={l.id}>
            <i style={{ background: colors[i % colors.length] }} />
            {l.name} ({i + 1})
          </span>
        ))}
      </div>
      <div className="management-chart-grid">
        <figure>
          <figcaption>{title} · ontwikkeling</figcaption>
          <svg
            viewBox="0 0 780 270"
            role="group"
            aria-label={`Lijngrafiek met meetpunten: ${title}`}
          >
            {[0, 0.5, 1].map((f) => {
              const v = min + span * f;
              return (
                <g key={f}>
                  <line x1={65} x2={735} y1={y(v)} y2={y(v)} stroke="#dbe4f0" />
                  <text x={58} y={y(v) + 4} textAnchor="end">
                    {format(v)}
                  </text>
                </g>
              );
            })}
            {rows.map((r, i) => (
              <text
                key={r.period}
                x={x(i)}
                y={232}
                textAnchor="end"
                transform={`rotate(-30 ${x(i)} 232)`}
              >
                {r.period}
              </text>
            ))}
            {places.map((l, j) => {
              let d = '';
              let prior = false;
              rows.forEach((r, i) => {
                const v = r.values[l.id];
                if (v == null) {
                  prior = false;
                  return;
                }
                d += `${prior ? 'L' : 'M'} ${x(i)} ${y(v)} `;
                prior = true;
              });
              return (
                <g key={l.id}>
                  <path
                    d={d}
                    fill="none"
                    stroke={colors[j % colors.length]}
                    strokeWidth={2.5}
                    strokeDasharray={j % 2 ? '6 3' : undefined}
                  />
                  {rows.map((r, i) => {
                    const v = r.values[l.id];
                    if (v == null) return null;
                    const label = point(r.period, l.name, v, r.sources[l.id]);
                    return (
                      <circle
                        key={r.period}
                        cx={x(i)}
                        cy={y(v)}
                        r={5}
                        fill={colors[j % colors.length]}
                        stroke="white"
                        strokeWidth={1}
                        tabIndex={0}
                        role="button"
                        aria-label={label}
                        onMouseEnter={() => setHover(label)}
                        onFocus={() => setHover(label)}
                        onClick={() => setHover(label)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' || e.key === ' ') {
                            e.preventDefault();
                            setHover(label);
                          }
                        }}
                      >
                        <title>{label}</title>
                      </circle>
                    );
                  })}
                </g>
              );
            })}
          </svg>
          <small>
            Onderbreking = meting ontbreekt. Eén punt vormt geen trend.
          </small>
        </figure>
        <figure>
          <figcaption>
            {title} · {current?.period ?? 'geen periode'}
          </figcaption>
          <svg
            viewBox="0 0 780 270"
            role="group"
            aria-label={`Staafdiagram per locatie: ${title}`}
          >
            {[0, 0.5, 1].map((f) => {
              const v = min + span * f;
              return (
                <g key={f}>
                  <line x1={65} x2={735} y1={y(v)} y2={y(v)} stroke="#dbe4f0" />
                  <text x={58} y={y(v) + 4} textAnchor="end">
                    {format(v)}
                  </text>
                </g>
              );
            })}
            {places.map((l, i) => {
              const step = 650 / Math.max(1, places.length),
                left = 75 + i * step,
                width = Math.min(65, step * 0.6),
                v = current?.values[l.id],
                label = point(
                  current?.period ?? '',
                  l.name,
                  v,
                  current?.sources[l.id],
                );
              return (
                <g key={l.id}>
                  {v != null ? (
                    <rect
                      x={left}
                      y={Math.min(y(v), y(0))}
                      width={width}
                      height={Math.max(2, Math.abs(y(v) - y(0)))}
                      fill={colors[i % colors.length]}
                      tabIndex={0}
                      role="button"
                      aria-label={label}
                      onMouseEnter={() => setHover(label)}
                      onFocus={() => setHover(label)}
                      onClick={() => setHover(label)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault();
                          setHover(label);
                        }
                      }}
                    >
                      <title>{label}</title>
                    </rect>
                  ) : (
                    <text x={left + width / 2} y={190} textAnchor="middle">
                      Onbekend
                    </text>
                  )}
                  <text
                    x={left + width / 2}
                    y={v != null ? Math.min(y(v), y(0)) - 9 : 174}
                    textAnchor="middle"
                  >
                    {v != null ? format(v) : '—'}
                  </text>
                  <text x={left} y={235} transform={`rotate(-20 ${left} 235)`}>
                    {l.name}
                  </text>
                </g>
              );
            })}
          </svg>
          <small>
            Vergelijking van dezelfde bronperiode. Leden worden niet tussen
            systemen gekoppeld.
          </small>
        </figure>
      </div>
      <p className="management-point" role="status" aria-live="polite">
        {hover ||
          'Wijs een meetpunt of staaf aan, of gebruik Tab en Enter voor de exacte waarde en bron.'}
      </p>
      <details>
        <summary>Alle exacte waarden en bronnen</summary>
        <div className="table-scroll">
          <table className="data-table">
            <caption>
              {title} · {actualGrain}
            </caption>
            <thead>
              <tr>
                <th>Periode</th>
                {places.map((l) => (
                  <th key={l.id}>{l.name}</th>
                ))}
                <th>Som clubregistraties</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.period}>
                  <th scope="row">
                    {r.period}
                    {r.through > date ? ' · periode nog niet afgesloten' : ''}
                  </th>
                  {places.map((l) => (
                    <td key={l.id}>
                      {format(r.values[l.id])}
                      <small className="workbook-cell-detail">
                        {r.sources[l.id] ?? 'Bron ontbreekt'}
                      </small>
                    </td>
                  ))}
                  <td>
                    {format(
                      places.length &&
                        places.every((l) => r.values[l.id] != null)
                        ? places.reduce((n, l) => n + r.values[l.id]!, 0)
                        : null,
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p>
          Een som van clubregistraties bewijst geen unieke organisatiebrede
          telling. Ontbreekt één clubwaarde, dan blijft de som onbekend.
        </p>
      </details>
    </section>
  );
}
