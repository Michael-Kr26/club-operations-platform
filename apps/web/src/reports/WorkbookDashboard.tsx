import { useState } from 'react';
import { Link, useParams } from 'react-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  Dataset,
  DewiForecast,
  ForecastDashboard,
  ForecastMonth,
  Principal,
  WorkbookSupplement,
} from '@cop/contracts';
import { WorkbookOverview } from './WorkbookOverview';
import './reports.css';
import './workbooks.css';

async function api<T>(path: string, body?: unknown): Promise<T> {
  const response = await fetch(`/api/v1/${path}`, {
    credentials: 'same-origin',
    method: body ? 'POST' : 'GET',
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!response.headers.get('content-type')?.includes('application/json'))
    throw new Error(
      'Backend niet bereikbaar. Start COP met pnpm.cmd dev:local.',
    );
  const value = await response.json();
  if (!response.ok)
    throw new Error(
      typeof value.message === 'string'
        ? value.message
        : `Aanvraag mislukt (${response.status})`,
    );
  return value;
}
const number = (v: number | null | undefined) =>
  v == null
    ? 'Onbekend'
    : new Intl.NumberFormat('nl-NL', { maximumFractionDigits: 1 }).format(v);
const money = (v: number | null) =>
  v == null
    ? 'Onbekend'
    : new Intl.NumberFormat('nl-NL', {
        style: 'currency',
        currency: 'EUR',
      }).format(v / 100);
const percent = (v: number | null) =>
  v == null
    ? 'Onbekend'
    : new Intl.NumberFormat('nl-NL', {
        style: 'percent',
        maximumFractionDigits: 1,
      }).format(v);
const monthLabel = (v: string) =>
  new Intl.DateTimeFormat('nl-NL', { month: 'short', year: 'numeric' }).format(
    new Date(`${v}-01T12:00:00Z`),
  );
const kindLabel = {
  forecast: 'Ledenontwikkeling',
  members: 'Ledenexport',
  finance: 'Omzet',
  healthplanner: 'Healthplanner',
};
function Cards({ items }: { items: { label: string; value: string }[] }) {
  return (
    <div className="workbook-cards">
      {items.map((item) => (
        <article className="panel workbook-card" key={item.label}>
          <span>{item.label}</span>
          <strong>{item.value}</strong>
        </article>
      ))}
    </div>
  );
}
function Notes({ notes }: { notes: string[] }) {
  return (
    <details className="panel report-panel workbook-notes">
      <summary>Brondefinities en aandachtspunten ({notes.length})</summary>
      <ul>
        {notes.map((n, i) => (
          <li key={i}>{n}</li>
        ))}
      </ul>
    </details>
  );
}
export function ForecastView({ report }: { report: DewiForecast }) {
  const [chosen, setChosen] = useState(''),
    [future, setFuture] = useState(false);
  const selected =
    report.months.find((m) => m.month === chosen) ??
    report.months.find((m) => m.month === report.exportedOn.slice(0, 7)) ??
    report.months.at(-1)!;
  const visible = report.months.filter(
    (m) => future || m.month <= report.exportedOn.slice(0, 7),
  );
  const phase = (m: ForecastMonth) =>
    m.month < report.exportedOn.slice(0, 7)
      ? 'Historisch bronbeeld'
      : m.month === report.exportedOn.slice(0, 7)
        ? 'Lopende maand · mogelijk ingepland'
        : 'Vooruitblik · bekende mutaties';
  const max = Math.max(
    1,
    ...visible.flatMap((m) => [m.joiners ?? 0, m.leavers ?? 0]),
  );
  const high =
    Math.ceil(Math.max(1, ...visible.map((m) => m.closing ?? 0)) / 100) * 100;
  const x = (i: number) => 55 + (i * 690) / Math.max(1, visible.length - 1),
    y = (v: number) => 210 - (v / high) * 175;
  return (
    <>
      <section className="panel report-panel workbook-toolbar">
        <div>
          <h2>Ledenontwikkeling</h2>
          <p>
            Exportdatum {report.exportedOn}. Alle cijfers blijven gekoppeld aan
            dit bronbestand.
          </p>
        </div>
        <label>
          Maand
          <select
            aria-label="Forecastmaand"
            value={selected.month}
            onChange={(e) => setChosen(e.target.value)}
          >
            {report.months.map((m) => (
              <option key={m.month} value={m.month}>
                {monthLabel(m.month)} · {phase(m)}
              </option>
            ))}
          </select>
        </label>
      </section>
      <p className="report-notice">
        {monthLabel(selected.month)} — {phase(selected)}. De berekende eindstand
        is geen actuele ledenstand op de exportdag.
      </p>
      <Cards
        items={[
          { label: 'Beginstand volgens bron', value: number(selected.opening) },
          { label: 'Instroom · Joiners', value: number(selected.joiners) },
          { label: 'Uitstroom · Leavers', value: number(selected.leavers) },
          {
            label: 'Netto mutatie incl. ziek/beter',
            value:
              selected.net === null
                ? 'Onbekend'
                : `${selected.net > 0 ? '+' : ''}${number(selected.net)}`,
          },
          { label: 'Berekende eindstand', value: number(selected.closing) },
          {
            label: 'Indicatieve uitstroomratio',
            value: percent(selected.indicativeChurn),
          },
        ]}
      />
      <div className="workbook-visuals">
        <section className="panel report-panel">
          <h2>Ontwikkeling berekende eindstand</h2>
          <label className="report-check">
            <input
              type="checkbox"
              checked={future}
              onChange={(e) => setFuture(e.target.checked)}
            />
            Vooruitblik tonen
          </label>
          <div className="workbook-chart-scroll">
            <svg
              className="workbook-line"
              viewBox="0 0 800 260"
              role="img"
              aria-label="Ledenontwikkeling per maand; tabel eronder bevat alle waarden"
            >
              <title>Berekende eindstanden volgens Dewi-forecast</title>
              {[0, high / 2, high].map((v) => (
                <g key={v}>
                  <line x1="50" x2="755" y1={y(v)} y2={y(v)} stroke="#e2e8f0" />
                  <text x="8" y={y(v) + 4}>
                    {number(v)}
                  </text>
                </g>
              ))}
              {visible.map((m, i) => {
                const prev = visible[i - 1];
                return (
                  <g key={m.month}>
                    {prev?.closing != null && m.closing !== null && (
                      <line
                        x1={x(i - 1)}
                        y1={y(prev.closing)}
                        x2={x(i)}
                        y2={y(m.closing)}
                        stroke="#2563eb"
                        strokeWidth="3"
                        strokeDasharray={
                          m.month > report.exportedOn.slice(0, 7)
                            ? '6 5'
                            : undefined
                        }
                      />
                    )}{' '}
                    {m.closing !== null && (
                      <circle cx={x(i)} cy={y(m.closing)} r="4" fill="#2563eb">
                        <title>
                          {monthLabel(m.month)}: {m.closing} · {phase(m)}
                        </title>
                      </circle>
                    )}
                    <text x={x(i)} y="240" textAnchor="middle" fontSize="14">
                      {m.month.slice(5)}/{m.month.slice(2, 4)}
                    </text>
                  </g>
                );
              })}
            </svg>
          </div>
          <p className="workbook-muted">
            Stippellijn = vooruitblik. Ontbrekende waarden onderbreken de lijn.
          </p>
        </section>
        <section className="panel report-panel">
          <h2>Instroom en uitstroom</h2>
          <p className="workbook-legend">
            <span>● Instroom</span>
            <span>● Uitstroom</span>
          </p>
          <div className="workbook-bars">
            {visible.map((m) => (
              <div className="workbook-bar-row" key={m.month}>
                <span>{monthLabel(m.month)}</span>
                <div>
                  {[
                    ['joiners', 'in'],
                    ['leavers', 'out'],
                  ].map(([key, cls]) => {
                    const v = m[key as 'joiners' | 'leavers'];
                    return (
                      <div key={key} className="workbook-bar-track">
                        <i
                          className={cls}
                          style={{ width: `${((v ?? 0) / max) * 100}%` }}
                        />
                        <small>{number(v)}</small>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        </section>
      </div>
      <section className="panel report-panel">
        <h2>Maandcijfers en aansluiting</h2>
        <div className="table-scroll">
          <table className="data-table">
            <thead>
              <tr>
                {[
                  'Maand',
                  'Bronperiode',
                  'Begin',
                  'Instroom',
                  'Beter',
                  'Uitstroom',
                  'Ziek',
                  'Netto',
                  'Eind',
                  'Verschil volgende beginstand',
                ].map((t) => (
                  <th key={t}>{t}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {report.months.map((m) => (
                <tr
                  key={m.month}
                  className={
                    m.month === selected.month ? 'workbook-selected' : ''
                  }
                >
                  <th>{monthLabel(m.month)}</th>
                  <td>{phase(m)}</td>
                  {[
                    m.opening,
                    m.joiners,
                    m.better,
                    m.leavers,
                    m.sick,
                    m.net,
                    m.closing,
                    m.nextOpeningDifference,
                  ].map((v, i) => (
                    <td key={i}>{number(v)}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
      <Notes
        notes={[
          ...report.warnings,
          ...report.months.flatMap((m) =>
            m.warnings.map((w) => `${monthLabel(m.month)}: ${w}`),
          ),
        ]}
      />
    </>
  );
}
const labels: Record<string, string> = {
  total: 'Totaal in bron',
  active: 'Actief (bron)',
  inactive14: '≥14 dagen niet bezocht',
  inactive30: '≥30 dagen niet bezocht',
  unknownVisit: 'Bezoekdatum onbekend',
  futureVisit: 'Bezoek na peildatum',
  withoutGoal: 'Zonder doel',
  withoutAppointment: 'Zonder afspraak',
  withoutCoach: 'Zonder coach',
  withoutGoalRatio: '% zonder doel',
  withoutAppointmentRatio: '% zonder afspraak',
  withoutCoachRatio: '% zonder coach',
  leads: 'Leads',
  sold: 'Verkochte lidmaatschappen',
  cancellations: 'Gemelde opzeggingen',
  appointments: 'Afgeronde afspraken',
  sleeping: 'Slapend (HP)',
};
export function SupplementView({
  report,
  locations,
}: {
  report: WorkbookSupplement;
  locations: { id: string; name: string }[];
}) {
  const [period, setPeriod] = useState('');
  const [club, setClub] = useState('');
  const periods = [...new Set(report.rows.map((r) => r.period))].sort();
  const available = periods.filter((p) =>
    report.rows.some(
      (r) => r.period === p && Object.values(r.values).some((v) => v !== null),
    ),
  );
  const selected = periods.includes(period)
    ? period
    : (available.at(-1) ?? periods.at(-1) ?? '');
  const rows = report.rows.filter(
    (r) => r.period === selected && (!club || r.locationId === club),
  );
  const maxWithoutAppointment = Math.max(
    1,
    ...rows.map((r) => r.values.withoutAppointment ?? 0),
  );
  const keys = [...new Set(rows.flatMap((r) => Object.keys(r.values)))];
  const maximum = Math.max(
    1,
    ...report.categories.map((c) => Math.abs(c.amountCents)),
  );
  return (
    <>
      <section className="panel report-panel workbook-toolbar">
        <div>
          <h2>{kindLabel[report.kind]}</h2>
          <p>{report.period}</p>
        </div>
        {report.locationIds.length > 1 && (
          <label>
            Locatie
            <select
              aria-label="Dashboardlocatie"
              value={club}
              onChange={(e) => setClub(e.target.value)}
            >
              <option value="">Alle toegestane locaties</option>
              {locations
                .filter((l) => report.locationIds.includes(l.id))
                .map((l) => (
                  <option value={l.id} key={l.id}>
                    {l.name}
                  </option>
                ))}
            </select>
          </label>
        )}
        {periods.length > 1 && (
          <label>
            Bronperiode
            <select
              aria-label="Bronperiode"
              value={selected}
              onChange={(e) => setPeriod(e.target.value)}
            >
              {periods.map((p) => (
                <option key={p}>{p}</option>
              ))}
            </select>
          </label>
        )}
      </section>
      <Cards
        items={report.cards.map((c) => ({
          label: c.label,
          value: c.format === 'money' ? money(c.value) : number(c.value),
        }))}
      />
      {report.rows.length > 0 && (
        <section className="panel report-panel">
          <h2>Cijfers per locatie · {selected}</h2>
          <div className="table-scroll">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Locatie</th>
                  {keys.map((k) => (
                    <th key={k}>{labels[k] ?? k}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.locationId}>
                    <th>
                      {locations.find((l) => l.id === r.locationId)?.name ??
                        r.locationId}
                    </th>
                    {keys.map((k) => (
                      <td key={k}>
                        {k.endsWith('Ratio')
                          ? percent(r.values[k] ?? null)
                          : number(r.values[k])}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
      {report.kind === 'healthplanner' &&
        keys.includes('withoutAppointment') && (
          <section className="panel report-panel">
            <h2>Leden zonder afspraak · {selected}</h2>
            <div className="workbook-bars">
              {rows.map((r) => (
                <div className="workbook-bar-row" key={r.locationId}>
                  <span>
                    {locations.find((l) => l.id === r.locationId)?.name ??
                      r.locationId}
                  </span>
                  <div className="workbook-bar-track">
                    <i
                      className="in"
                      style={{
                        width: `${'withoutAppointmentRatio' in r.values ? (r.values.withoutAppointmentRatio ?? 0) * 100 : ((r.values.withoutAppointment ?? 0) / maxWithoutAppointment) * 100}%`,
                      }}
                    />
                    <small>
                      {r.values.withoutAppointmentRatio != null
                        ? percent(r.values.withoutAppointmentRatio)
                        : number(r.values.withoutAppointment)}
                    </small>
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}
      {report.categories.length > 0 && (
        <section className="panel report-panel">
          <h2>
            {report.kind === 'finance'
              ? 'Omzetverdeling per artikel (incl. BTW)'
              : 'Statusverdeling in de selectie'}
          </h2>
          <div className="workbook-bars">
            {report.categories.map((c, i) => (
              <div className="workbook-category" key={i}>
                <span>{c.name}</span>
                {report.kind === 'finance' && (
                  <div className="workbook-bar-track">
                    <i
                      className={c.amountCents < 0 ? 'out' : 'in'}
                      style={{
                        width: `${(Math.abs(c.amountCents) / maximum) * 100}%`,
                      }}
                    />
                  </div>
                )}
                <strong>
                  {report.kind === 'finance'
                    ? money(c.amountCents)
                    : number(c.count)}
                </strong>
              </div>
            ))}
          </div>
        </section>
      )}
      <Notes notes={report.warnings} />
    </>
  );
}
export function WorkbookDashboard() {
  const { organizationSlug } = useParams();
  const org = organizationSlug ?? 'sport-society';
  const base = `organizations/${encodeURIComponent(org)}/reports`;
  const home = organizationSlug
    ? `/organisaties/${encodeURIComponent(org)}/rapportages`
    : '/rapportages';
  const client = useQueryClient();
  const [dataset, setDataset] = useState<Dataset>('real'),
    [selected, setSelected] = useState(''),
    [location, setLocation] = useState(''),
    [asOf, setAsOf] = useState(''),
    [confirmed, setConfirmed] = useState(false),
    [file, setFile] = useState<File | null>(null),
    [message, setMessage] = useState(''),
    [busy, setBusy] = useState(false),
    [detail, setDetail] = useState(false),
    [zipResults, setZipResults] = useState<
      {
        filename: string;
        status: string;
        error: string | null;
        duplicate: boolean;
      }[]
    >([]),
    [contexts, setContexts] = useState<
      Record<string, { locationId?: string; asOf?: string }>
    >({});
  const access = useQuery({
    queryKey: ['reports-access', org],
    queryFn: () => api<Principal>(`${base}/access`),
    retry: false,
  });
  const data = useQuery({
    queryKey: ['report-workbooks', org, dataset],
    queryFn: () =>
      api<ForecastDashboard>(`${base}/workbooks?dataset=${dataset}`),
    enabled: !!access.data && !access.error,
    retry: false,
  });
  const manage =
    access.data?.permissions.includes('reports.manage') &&
    access.data.locations === null;
  const accepted =
    data.data?.imports.filter((i) => i.status === 'accepted' && i.report) ?? [];
  const item = accepted.find((i) => i.id === selected) ?? accepted[0];
  const report = item?.report;
  return (
    <div className="cop-reports workbook-dashboard">
      <section className="page-heading">
        <div>
          <span className="page-heading__eyebrow">Rapportages · bestanden</span>
          <h1>Managementdashboard</h1>
          <p>
            Van bronbestand naar overzicht. Lokaal opgeslagen, per organisatie
            en locatie.
          </p>
        </div>
        <Link className="button" to={home}>
          Ochtendrapport & churn
        </Link>
      </section>
      {access.data?.userId === 'local-device-owner' && (
        <p className="report-notice">
          Lokale toegang op dit apparaat: geen aanmelding nodig voor dit
          dashboard.
        </p>
      )}
      {access.isPending && <p role="status">Toegang controleren…</p>}
      {access.error && (
        <p className="report-notice" role="alert">
          {access.error.message} <Link to={home}>Log in bij Rapportages</Link>.
        </p>
      )}
      {data.error && (
        <p className="report-notice" role="alert">
          {data.error.message} Herstart COP om de databasemigraties uit te
          voeren.
        </p>
      )}
      {access.data && !access.error && (
        <>
          {data.data && (
            <WorkbookOverview
              data={data.data}
              selectSource={(id) => {
                setSelected(id);
                setDetail(true);
              }}
            />
          )}
          <button className="button" onClick={() => setDetail(!detail)}>
            {detail
              ? 'Bronweergave sluiten'
              : 'Afzonderlijk bronbestand bekijken'}
          </button>
          <section className="panel report-panel workbook-toolbar">
            <label>
              Gegevens
              <select
                aria-label="Dataset"
                value={dataset}
                onChange={(e) => {
                  setDataset(e.target.value as Dataset);
                  setSelected('');
                  setZipResults([]);
                  setContexts({});
                  setMessage('');
                }}
              >
                <option value="real">Werkelijke bronbestanden</option>
                <option value="demo">DEMO · apart opgeslagen</option>
              </select>
            </label>
            <label>
              Dashboard / bronbestand
              <select
                aria-label="Dashboardbron"
                value={item?.id ?? ''}
                onChange={(e) => {
                  setSelected(e.target.value);
                  setDetail(true);
                }}
              >
                <option value="" disabled>
                  Nog geen geldig bronbestand
                </option>
                {accepted.map((i) => (
                  <option key={i.id} value={i.id}>
                    {kindLabel[i.report!.kind]} · {i.filename} ·{' '}
                    {new Date(i.importedAt).toLocaleString('nl-NL')}
                  </option>
                ))}
              </select>
            </label>
          </section>
          {dataset === 'demo' && (
            <p className="report-notice">
              DEMO — deze imports blijven gescheiden van de werkelijke gegevens.
              Er worden geen fictieve gegevens automatisch aangemaakt.
            </p>
          )}
          {detail && report?.kind === 'forecast' && (
            <ForecastView key={item!.id} report={report} />
          )}
          {detail && report && report.kind !== 'forecast' && (
            <SupplementView
              key={item!.id}
              report={report}
              locations={data.data!.organization.locations}
            />
          )}
          {!report && !data.isPending && (
            <section className="panel report-panel">
              <h2>Begin met een bronbestand</h2>
              <p>
                Upload de Dewi-forecast voor ledenontwikkeling, een ledenexport,
                omzetrapport of Healthplanner-update. Een
                Healthplanner-managementmail (.eml) wordt ook herkend.
              </p>
            </section>
          )}
          {manage && (
            <section className="panel report-panel">
              <h2>Alles in één ZIP uploaden</h2>
              <p>
                Voeg alle XLSX-bestanden en Healthplanner-mails (.eml) toe aan
                één ZIP. Maximaal 20 MB ZIP, 50 bestanden en 5 MB per
                bronbestand. COP herkent de inhoud, bewaart de originelen en
                werkt het gezamenlijke dashboard bij. Zonder clubinformatie
                blijft een bestand onverwerkt tot je de locatie bevestigt. Je
                kunt het ZIP dan opnieuw verwerken; bekende bestanden worden
                niet dubbel geteld.
              </p>
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  void (async () => {
                    setBusy(true);
                    setMessage('');
                    try {
                      if (!file) throw new Error('Selecteer een bestand.');
                      const isZip = /\.zip$/i.test(file.name);
                      if (file.size > (isZip ? 20_000_000 : 5_000_000))
                        throw new Error(
                          isZip ? 'Maximaal 20 MB ZIP.' : 'Maximaal 5 MB.',
                        );
                      const content = await new Promise<string>(
                        (resolve, reject) => {
                          const reader = new FileReader();
                          reader.onload = () =>
                            resolve(String(reader.result).split(',')[1]!);
                          reader.onerror = () =>
                            reject(
                              new Error('Bestand kon niet worden gelezen.'),
                            );
                          reader.readAsDataURL(file);
                        },
                      );
                      const result = await api<{
                        id: string;
                        duplicate: boolean;
                        status: string;
                        error: string | null;
                        results?: typeof zipResults;
                        summary?: string;
                      }>(`${base}/workbooks${isZip ? '/zip' : ''}`, {
                        filename: file.name,
                        content,
                        dataset,
                        locationId: location || undefined,
                        asOf: asOf || undefined,
                        scopeConfirmed: confirmed,
                        fileContexts: Object.fromEntries(
                          Object.entries(contexts).map(([name, c]) => [
                            name,
                            { ...c, scopeConfirmed: confirmed },
                          ]),
                        ),
                      });
                      await client.invalidateQueries({
                        queryKey: ['report-workbooks', org, dataset],
                      });
                      if (result.results) {
                        setZipResults(result.results);
                        setMessage(result.summary ?? 'ZIP verwerkt.');
                        return;
                      }
                      if (result.status === 'rejected')
                        throw new Error(result.error ?? 'Import afgewezen.');
                      setSelected(result.id);
                      setMessage(
                        result.duplicate
                          ? 'Dit bestand was al verwerkt; geen dubbeltelling.'
                          : 'Import verwerkt. Het dashboard staat hierboven.',
                      );
                    } catch (error) {
                      setMessage((error as Error).message);
                    } finally {
                      setBusy(false);
                    }
                  })();
                }}
              >
                <div className="report-fields">
                  <label>
                    ZIP, Excel of managementmail
                    <input
                      type="file"
                      accept=".zip,.xlsx,.eml"
                      required
                      onChange={(e) => {
                        setFile(e.target.files?.[0] ?? null);
                        setZipResults([]);
                        setContexts({});
                      }}
                    />
                  </label>
                  <label>
                    Standaardlocatie voor bestanden zonder club
                    <select
                      value={location}
                      onChange={(e) => setLocation(e.target.value)}
                    >
                      <option value="">Kies indien nodig</option>
                      {data.data?.organization.locations.map((l) => (
                        <option key={l.id} value={l.id}>
                          {l.name}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    Peildatum van ledenexport
                    <input
                      type="date"
                      value={asOf}
                      onChange={(e) => setAsOf(e.target.value)}
                    />
                  </label>
                </div>
                <label className="report-check">
                  <input
                    type="checkbox"
                    checked={confirmed}
                    onChange={(e) => setConfirmed(e.target.checked)}
                  />
                  Ik bevestig de gekozen locaties voor bestanden zonder club en
                  de werkelijke peildatums van ledenexports. De standaardlocatie
                  geldt voor alle bestanden zonder eigen toewijzing.
                </label>
                <button className="button button--primary" disabled={busy}>
                  {busy
                    ? 'Bestanden verwerken…'
                    : 'Importeren en dashboard openen'}
                </button>
              </form>
              {message && <p role="status">{message}</p>}
              {zipResults.length > 0 && (
                <>
                  <h3>Resultaat per bestand</h3>
                  <p>
                    Vul bij ontbrekende clubinformatie de toewijzing hieronder
                    in, bevestig die hierboven en klik opnieuw op Importeren.
                    Verwerkte bestanden blijven behouden.
                  </p>
                  {zipResults.map((r) => (
                    <div className="panel report-panel" key={r.filename}>
                      <strong>{r.filename}</strong>
                      <p>
                        {r.status === 'accepted'
                          ? r.duplicate
                            ? 'Al bekend'
                            : 'Verwerkt'
                          : r.error}
                      </p>
                      {r.status === 'rejected' && (
                        <div className="report-fields">
                          <label>
                            Locatie voor {r.filename}
                            <select
                              value={contexts[r.filename]?.locationId ?? ''}
                              onChange={(e) =>
                                setContexts({
                                  ...contexts,
                                  [r.filename]: {
                                    ...contexts[r.filename],
                                    locationId: e.target.value,
                                  },
                                })
                              }
                            >
                              <option value="">Geen toewijzing</option>
                              {data.data?.organization.locations.map((l) => (
                                <option key={l.id} value={l.id}>
                                  {l.name}
                                </option>
                              ))}
                            </select>
                          </label>
                          <label>
                            Peildatum ledenexport
                            <input
                              type="date"
                              value={contexts[r.filename]?.asOf ?? ''}
                              onChange={(e) =>
                                setContexts({
                                  ...contexts,
                                  [r.filename]: {
                                    ...contexts[r.filename],
                                    asOf: e.target.value,
                                  },
                                })
                              }
                            />
                          </label>
                        </div>
                      )}
                    </div>
                  ))}
                </>
              )}
            </section>
          )}
          <section className="panel report-panel">
            <h2>Importhistorie</h2>
            <p>
              Nieuwe uploads overschrijven geen originele bestanden. Kies
              desgewenst een bronbestand voor details. Het gezamenlijke
              overzicht gebruikt de nieuwste import per club en bronperiode; een
              ZIP telt zelf niet als extra bron.
            </p>
            <div className="table-scroll">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Bestand</th>
                    <th>Importmoment</th>
                    <th>Status</th>
                    <th>Toelichting</th>
                    {manage && <th>Origineel</th>}
                  </tr>
                </thead>
                <tbody>
                  {data.data?.imports.map((i) => (
                    <tr key={i.id}>
                      <td>{i.filename}</td>
                      <td>{new Date(i.importedAt).toLocaleString('nl-NL')}</td>
                      <td>
                        {i.status === 'accepted' ? 'Verwerkt' : 'Afgewezen'}
                      </td>
                      <td>{i.error ?? 'Bronbestand bewaard'}</td>
                      {manage && (
                        <td>
                          <a
                            href={`/api/v1/${base}/workbooks/${encodeURIComponent(i.id)}/original`}
                          >
                            Download
                          </a>
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </>
      )}
    </div>
  );
}
