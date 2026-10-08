import { useState } from 'react';
import { useParams } from 'react-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { REPORT_RULES, REPORT_RULES_VERSION } from '@cop/contracts';
import type {
  Dataset,
  ImportSummary,
  MailPreview,
  ManagementReport,
  Metrics,
  Principal,
  ReportSettings,
  SendRun,
  Source,
} from '@cop/contracts';
import './reports.css';
import { previousAmsterdamDate } from './dates';

async function api<T>(
  path: string,
  body?: unknown,
  method = body ? 'POST' : 'GET',
): Promise<T> {
  const response = await fetch(`/api/v1/${path}`, {
    method,
    credentials: 'same-origin',
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!response.headers.get('content-type')?.includes('application/json'))
    throw new Error(
      'Backend niet bereikbaar. Start COP met pnpm.cmd dev:local.',
    );
  const result = await response.json();
  if (!response.ok)
    throw new Error(
      typeof result.message === 'string'
        ? result.message
        : `Aanvraag mislukt (${response.status})`,
    );
  return result as T;
}
const labels: Record<keyof Metrics, string> = {
  active: 'Actieve leden · Dewi',
  opening: 'Actief bij maandbegin',
  newMembers: 'Nieuwe leden',
  exits: 'Uitstroom',
  churn: 'Churn',
  paused: 'Gepauzeerd',
  frozen: 'Bevroren',
  rejoined: 'Herinschrijvingen',
  transfersIn: 'Verhuizingen in',
  transfersOut: 'Verhuizingen uit',
  revenue: 'Omzet',
  received: 'Ontvangen betalingen',
  outstanding: 'Openstaand',
  failedDebits: 'Mislukte incasso’s',
  soldMemberships: 'Verkochte lidmaatschappen (HP)',
  requestedCancellations: 'Opzeggingen gemeld (HP)',
  withoutFutureAppointment: 'Leden zonder toekomstige afspraak (HP)',
  leads: 'Leads',
  converted: 'Leads naar lid',
  conversion: 'Conversie',
  appointments: 'Afspraken',
  visitingActive: 'Bezoekend actief · HP',
  sleeping: 'Slapend · HP',
};
const fmt = (key: keyof Metrics, n: number | null) =>
  n === null
    ? 'Onbekend'
    : ['revenue', 'received', 'outstanding'].includes(key)
      ? new Intl.NumberFormat('nl-NL', {
          style: 'currency',
          currency: 'EUR',
        }).format(n / 100)
      : ['churn', 'conversion'].includes(key)
        ? new Intl.NumberFormat('nl-NL', {
            style: 'percent',
            maximumFractionDigits: 1,
          }).format(n)
        : String(n);
const timestamp = (s: string | null) =>
  s
    ? new Date(s).toLocaleString('nl-NL', { timeZone: 'Europe/Amsterdam' })
    : '—';
const yesterday = previousAmsterdamDate;

export function ReportsPage() {
  const { organizationSlug } = useParams();
  const org = organizationSlug ?? 'sport-society';
  const base = `organizations/${encodeURIComponent(org)}/reports`;
  const client = useQueryClient();
  const [dataset, setDataset] = useState<Dataset>('real'),
    [kind, setKind] = useState<'daily' | 'monthly'>('daily'),
    [date, setDate] = useState(yesterday);
  const [message, setMessage] = useState(''),
    [busy, setBusy] = useState(false),
    [email, setEmail] = useState(''),
    [password, setPassword] = useState(''),
    [name, setName] = useState(''),
    [token, setToken] = useState('');
  const [source, setSource] = useState<Source>('dewi-members'),
    [from, setFrom] = useState(yesterday),
    [through, setThrough] = useState(yesterday),
    [scope, setScope] = useState<string[]>([]),
    [complete, setComplete] = useState(false),
    [file, setFile] = useState<File | null>(null);
  const [editing, setEditing] = useState<ReportSettings | null>(null);
  const status = useQuery({
    queryKey: ['reporting-status'],
    queryFn: () =>
      api<{
        initializationError?: string | null;
        localTestMailAvailable?: boolean;
        ready: boolean;
        setupRequired: boolean;
        setupTokenFile: string | null;
        lastTick: string | null;
        schedulerError: string | null;
      }>('reporting-status'),
    retry: false,
    refetchInterval: 30000,
  });
  const access = useQuery({
    queryKey: ['reports-access', org],
    queryFn: () => api<Principal>(`${base}/access`),
    retry: false,
    enabled: status.data?.ready === true && !status.data.setupRequired,
  });
  const allowed = !!access.data && !access.error;
  const manage =
    access.data?.permissions.includes('reports.manage') &&
    access.data.locations === null;
  const sourceStatus = useQuery({
    queryKey: ['reports-source-status', org],
    queryFn: () =>
      api<{
        configured: boolean;
        error: string | null;
        lastAttempt: string | null;
        lastResult: {
          ok: boolean;
          currentReportAvailable?: boolean;
          imported?: number;
          duplicates?: number;
          error?: string;
        } | null;
      }>(`${base}/source-status`),
    enabled: !!manage,
    retry: false,
    refetchInterval: 30000,
  });
  const mailStatus = useQuery({
    queryKey: ['reports-mail-status', org],
    queryFn: () =>
      api<{
        ready: boolean;
        delivery: string;
        sender: string | null;
        error: string | null;
      }>(`${base}/mail-status`),
    enabled: !!manage,
    retry: false,
  });
  const query = `dataset=${dataset}&kind=${kind}&date=${date}`;
  const report = useQuery({
    queryKey: ['reports', org, dataset, kind, date],
    queryFn: () => api<ManagementReport>(`${base}?${query}`),
    enabled: allowed,
    retry: false,
  });
  const preview = useQuery({
    queryKey: ['reports-preview', org, dataset, kind, date],
    queryFn: () => api<MailPreview>(`${base}/preview?${query}`),
    enabled: allowed,
    retry: false,
  });
  const settings = useQuery({
    queryKey: ['reports-settings', org],
    queryFn: () => api<ReportSettings>(`${base}/settings`),
    enabled: !!manage,
    retry: false,
  });
  const imports = useQuery({
    queryKey: ['reports-imports', org, dataset],
    queryFn: () => api<ImportSummary[]>(`${base}/imports?dataset=${dataset}`),
    enabled: !!manage,
    retry: false,
  });
  const runs = useQuery({
    queryKey: ['reports-runs', org, dataset],
    queryFn: () => api<SendRun[]>(`${base}/runs?dataset=${dataset}`),
    enabled: !!manage,
    retry: false,
    refetchInterval: 30000,
  });
  const current =
    editing ??
    (settings.data
      ? {
          ...settings.data,
          rulesVersion: REPORT_RULES_VERSION,
          rulesApproved:
            settings.data.rulesApproved &&
            settings.data.rulesVersion === REPORT_RULES_VERSION,
        }
      : undefined);
  async function action(work: () => Promise<unknown>, success: string) {
    setBusy(true);
    setMessage('');
    try {
      const result = await work();
      setMessage(success);
      await client.invalidateQueries({
        predicate: (q) => String(q.queryKey[0]).startsWith('report'),
      });
      return result;
    } catch (e) {
      setMessage((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  const patch = (values: Partial<ReportSettings>) => {
    if (current) setEditing({ ...current, ...values });
  };
  return (
    <div className="cop-reports">
      <section className="page-heading">
        <div>
          <span className="page-heading__eyebrow">Management · {org}</span>
          <h1>Ochtendrapport & churn</h1>
          <p>Alle clubs naast elkaar, met controleerbare bronnen en datums.</p>
        </div>
        <span className="badge">
          {mailStatus.data?.ready
            ? 'Microsoft 365 ingesteld'
            : 'Lokale testmail'}
        </span>
      </section>
      <p className="report-notice">
        {mailStatus.data?.ready
          ? `Echte verzending is ingesteld via ${mailStatus.data.sender}. Live bronkoppelingen zijn nog niet beschikbaar.`
          : status.data?.localTestMailAvailable === false
            ? 'Lokale database zonder Docker. Mailvoorbeelden werken; lokale mailopvang is niet gestart.'
            : 'Echte mail is nog niet ingesteld. Testmails blijven in de lokale opvang.'}{' '}
        {status.data?.localTestMailAvailable !== false && (
          <a href="http://localhost:8025" target="_blank" rel="noreferrer">
            Lokale mailopvang
          </a>
        )}
        {mailStatus.data?.error}
      </p>
      {message && (
        <p role="status" className="report-notice">
          {message}
        </p>
      )}
      {(!status.data?.ready || status.error) && (
        <section className="panel report-panel">
          <h2>Lokale verwerking nog niet beschikbaar</h2>
          <p>
            Start de website en lokale database samen met{' '}
            <code>pnpm.cmd dev:local</code>.{' '}
            {status.data?.initializationError ?? status.error?.message}
          </p>
          <button
            onClick={() => void client.invalidateQueries()}
            className="button"
          >
            Opnieuw controleren
          </button>
        </section>
      )}
      {status.data?.setupRequired && (
        <form
          className="panel report-panel"
          onSubmit={(e) => {
            e.preventDefault();
            void action(
              () => api('reporting-setup', { token, email, password, name }),
              'Beheerder aangemaakt. Meld je nu aan.',
            ).then(() => {
              setToken('');
              setPassword('');
            });
          }}
        >
          <h2>Eenmalige lokale installatie</h2>
          <p>
            Lees de installatiecode op je apparaat:{' '}
            <code>{status.data.setupTokenFile}</code>. Na installatie wordt deze
            verwijderd.
          </p>
          <label>
            Installatiecode
            <input
              type="password"
              value={token}
              onChange={(e) => setToken(e.target.value)}
              autoComplete="off"
              required
            />
          </label>
          <label>
            Naam
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
            />
          </label>
          <label>
            E-mail
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </label>
          <label>
            Nieuw wachtwoord (min. 12 tekens)
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              minLength={12}
              autoComplete="new-password"
              required
            />
          </label>
          <button className="button button--primary" disabled={busy}>
            Lokale beheerder maken
          </button>
        </form>
      )}
      {status.data?.ready && !status.data.setupRequired && !allowed && (
        <form
          className="panel report-panel"
          onSubmit={(e) => {
            e.preventDefault();
            void action(
              () => api('local-auth/sign-in/email', { email, password }),
              'Aangemeld.',
            ).then(() => setPassword(''));
          }}
        >
          <h2>Aanmelden bij rapportages</h2>
          <p>
            Serverrechten bepalen toegang; de voorbeeldrol in de navigatie
            verleent geen toegang.
          </p>
          <label>
            E-mail
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="username"
              required
            />
          </label>
          <label>
            Wachtwoord
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
              required
            />
          </label>
          <button disabled={busy} className="button button--primary">
            Aanmelden
          </button>
          <p>{access.error?.message}</p>
        </form>
      )}
      {allowed && (
        <>
          <div className="page-toolbar">
            <label>
              Gegevens
              <select
                value={dataset}
                onChange={(e) => setDataset(e.target.value as Dataset)}
              >
                <option value="real">Werkelijke clubgegevens</option>
                <option value="demo">Demo · fictief</option>
              </select>
            </label>
            <label>
              Rapport
              <select
                value={kind}
                onChange={(e) => setKind(e.target.value as 'daily' | 'monthly')}
              >
                <option value="daily">Dagelijks</option>
                <option value="monthly">Maandelijks & churn</option>
              </select>
            </label>
            <label>
              {kind === 'monthly' ? 'Datum in de maand' : 'Rapportdatum'}
              <input
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
              />
            </label>
            <button
              className="button"
              onClick={() =>
                void action(async () => {
                  await api('local-auth/sign-out', {});
                  client.removeQueries({
                    predicate: (q) =>
                      String(q.queryKey[0]).startsWith('reports'),
                  });
                }, 'Afgemeld.')
              }
            >
              Afmelden
            </button>
            {dataset === 'demo' && manage && (
              <button
                className="button"
                disabled={busy}
                onClick={() =>
                  void action(
                    () => api(`${base}/demo`, { date }),
                    'Fictieve demo-imports geladen.',
                  )
                }
              >
                Demo voor deze maand laden
              </button>
            )}
          </div>
          {dataset === 'demo' && (
            <p className="report-notice">
              DEMO — fictieve cijfers, geen werkelijke Sport Society-gegevens.
            </p>
          )}
          {report.error && <p role="alert">{report.error.message}</p>}
          {report.data && (
            <>
              <p className="muted">
                Periode {report.data.from} t/m {report.data.through} · Amsterdam
                · {report.data.provisional ? 'Voorlopige' : 'Goedgekeurde'}{' '}
                definities ({report.data.rulesVersion})
              </p>
              {report.data.warnings.length > 0 && (
                <details className="report-notice" open>
                  <summary>
                    Datakwaliteit: {report.data.warnings.length} meldingen
                  </summary>
                  <ul>
                    {report.data.warnings.map((w) => (
                      <li key={w}>{w}</li>
                    ))}
                  </ul>
                </details>
              )}
              <section className="panel report-panel">
                <h2>
                  {kind === 'monthly'
                    ? 'Maandvergelijking & churn'
                    : 'Clubvergelijking'}
                </h2>
                <div className="table-scroll">
                  <table className="data-table">
                    <thead>
                      <tr>
                        <th>Cijfer</th>
                        {report.data.clubs.map((c) => (
                          <th key={c.id}>{c.name}</th>
                        ))}
                        <th>
                          {access.data.locations === null
                            ? 'Organisatietotaal'
                            : 'Toegestane scope'}
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {Object.entries(labels)
                        .filter(
                          ([key]) =>
                            kind === 'monthly' ||
                            !['opening', 'churn'].includes(key),
                        )
                        .map(([key, label]) => (
                          <tr key={key}>
                            <th scope="row">{label}</th>
                            {[
                              ...report.data!.clubs.map((c) => c.metrics),
                              report.data!.total,
                            ].map((m, i) => (
                              <td
                                key={i}
                                className={
                                  m[key as keyof Metrics] === null
                                    ? 'report-unknown'
                                    : ''
                                }
                              >
                                {fmt(
                                  key as keyof Metrics,
                                  m[key as keyof Metrics],
                                )}
                              </td>
                            ))}
                          </tr>
                        ))}
                    </tbody>
                  </table>
                </div>
              </section>
              <section className="panel report-panel">
                <h2>Bronnen & laatste succesvolle import</h2>
                {manage && (
                  <p>
                    Outlook Healthplanner:{' '}
                    {sourceStatus.data?.configured
                      ? 'ingesteld; ophalen om 08:35, alleen bij ontbreken/fouten opnieuw vóór 08:45'
                      : 'nog niet gekoppeld'}
                    . Laatste poging:{' '}
                    {timestamp(sourceStatus.data?.lastAttempt ?? null)}.{' '}
                    {sourceStatus.data?.lastResult?.ok
                      ? `${sourceStatus.data.lastResult.imported ?? 0} geïmporteerd, ${sourceStatus.data.lastResult.duplicates ?? 0} dubbel herkend. ${sourceStatus.data.lastResult.currentReportAvailable ? 'Actuele ochtendrapportage aanwezig.' : 'Actuele ochtendrapportage ontbreekt; alleen oudere mails beschikbaar.'}`
                      : sourceStatus.data?.lastResult?.error}{' '}
                    {sourceStatus.data?.error}
                  </p>
                )}
                {sourceStatus.error && (
                  <p role="alert">{sourceStatus.error.message}</p>
                )}
                <div className="table-scroll">
                  <table className="data-table">
                    <thead>
                      <tr>
                        <th>Club / bron</th>
                        <th>Status</th>
                        <th>Geïmporteerd</th>
                        <th>Bronperiode</th>
                      </tr>
                    </thead>
                    <tbody>
                      {report.data.sources.map((s) => (
                        <tr key={`${s.locationId}-${s.source}`}>
                          <th>
                            {s.locationId} / {s.source}
                          </th>
                          <td>
                            {s.status === 'ready'
                              ? 'Bruikbaar'
                              : s.status === 'missing'
                                ? 'Ontbreekt'
                                : s.status === 'stale'
                                  ? 'Verouderd'
                                  : s.status === 'invalid'
                                    ? 'Laatste poging afgewezen'
                                    : 'Onvolledig'}
                          </td>
                          <td>{timestamp(s.importedAt)}</td>
                          <td>
                            {s.from ?? '—'} / {s.through ?? '—'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>
            </>
          )}
          <section className="panel report-panel">
            <h2>Ochtendmail vóór verzending</h2>
            <p>
              Voorbeeldontvangers:{' '}
              {preview.data?.recipients.join(', ') || 'nog niet ingesteld'}.
              {mailStatus.data?.ready
                ? `Afzender: ${mailStatus.data.sender}.`
                : 'Testmail gaat naar opvang@localhost.invalid.'}
            </p>
            {preview.error && <p role="alert">{preview.error.message}</p>}
            {preview.data && (
              <>
                <p>
                  <strong>{preview.data.subject}</strong>
                </p>
                <iframe
                  title="Voorbeeld ochtendmail"
                  sandbox=""
                  srcDoc={preview.data.html}
                  className="report-mail"
                />
                <details>
                  <summary>Tekstversie</summary>
                  <pre>{preview.data.text}</pre>
                </details>
              </>
            )}
            {manage && mailStatus.data?.ready && (
              <button
                className="button button--primary"
                disabled={
                  busy ||
                  dataset !== 'real' ||
                  !preview.data ||
                  !report.data ||
                  report.data.provisional ||
                  (!!report.data.warnings.length &&
                    !(kind === 'daily' && settings.data?.allowPartialDaily))
                }
                onClick={() =>
                  void action(async () => {
                    const r = await api<{
                      duplicate?: boolean;
                      status?: string;
                    }>(`${base}/send`, { dataset, kind, date });
                    if (r.duplicate)
                      throw new Error(
                        'Deze periode is al geregistreerd; geen herverzending.',
                      );
                    if (r.status !== 'sent')
                      throw new Error(
                        'Verzending onzeker. Controleer de historie; geen automatische retry.',
                      );
                    return r;
                  }, 'Microsoft 365 heeft de mail geaccepteerd. Dit bevestigt nog geen inboxaflevering.')
                }
              >
                Echt versturen naar ingestelde ontvangers
              </button>
            )}
            {manage && status.data?.localTestMailAvailable !== false && (
              <button
                className="button button--primary"
                disabled={busy || !preview.data}
                onClick={() =>
                  void action(async () => {
                    const r = await api<{
                      duplicate?: boolean;
                      status?: string;
                    }>(`${base}/capture`, { dataset, kind, date });
                    if (r.duplicate)
                      throw new Error(
                        'Deze periode is al geregistreerd; geen herverzending. Bekijk de historie.',
                      );
                    if (r.status !== 'captured')
                      throw new Error(
                        'SMTP-opvang niet bevestigd. Controleer historie en Mailpit.',
                      );
                    return r;
                  }, 'Testmail lokaal opgevangen. Open localhost:8025.')
                }
              >
                Testmail naar lokale opvang
              </button>
            )}
          </section>
          <section className="panel report-panel">
            <h2>Definities ter review</h2>
            <ol>
              {REPORT_RULES.map((rule) => (
                <li key={rule}>{rule}</li>
              ))}
            </ol>
            <p>
              Voorstellen tot expliciete goedkeuring. Versie{' '}
              {REPORT_RULES_VERSION}.
            </p>
          </section>
          {manage && (
            <>
              <section className="panel report-panel">
                <h2>Planning & voorbeeldontvangers</h2>
                {current && (
                  <form
                    onSubmit={(e) => {
                      e.preventDefault();
                      void action(
                        () => api(`${base}/settings`, current, 'PUT'),
                        'Instellingen opgeslagen.',
                      ).then(() => setEditing(null));
                    }}
                  >
                    <div className="report-fields">
                      <label>
                        Ontvangers (komma’s)
                        <input
                          value={current.recipients.join(', ')}
                          onChange={(e) =>
                            patch({
                              recipients: e.target.value
                                .split(',')
                                .map((s) => s.trim())
                                .filter(Boolean),
                            })
                          }
                        />
                      </label>
                      <label>
                        Verzendtijd
                        <input
                          type="time"
                          value={current.time}
                          onChange={(e) => patch({ time: e.target.value })}
                        />
                      </label>
                      <label>
                        Tijdzone
                        <input value="Europe/Amsterdam" readOnly />
                      </label>
                    </div>
                    <label className="report-check">
                      <input
                        type="checkbox"
                        checked={current.rulesApproved}
                        onChange={(e) =>
                          patch({ rulesApproved: e.target.checked })
                        }
                      />
                      Ik keur deze bedrijfsregels voor deze organisatie goed.
                    </label>
                    <label className="report-check">
                      <input
                        type="checkbox"
                        checked={current.enabled}
                        onChange={(e) => patch({ enabled: e.target.checked })}
                      />
                      Automatische verzending inschakelen (Microsoft 365 indien
                      ingesteld; anders lokale testopvang).
                    </label>
                    <label className="report-check">
                      <input
                        type="checkbox"
                        checked={current.allowPartialDaily ?? false}
                        onChange={(e) =>
                          patch({ allowPartialDaily: e.target.checked })
                        }
                      />
                      Ochtendmail toestaan met complete actuele
                      Healthplanner-cijfers en ontbrekende Dewi-bronnen als
                      onbekend. Maandelijkse churn blijft geblokkeerd zonder
                      volledige bronnen.
                    </label>
                    <button className="button" disabled={busy}>
                      Opslaan
                    </button>
                  </form>
                )}
                <p>
                  Dagelijks: gisteren. Op de eerste dag: vorige kalendermaand.
                  Computer en COP moeten draaien. Geen inhaalmail. Controle elke
                  30 seconden; laatst:{' '}
                  {timestamp(status.data?.lastTick ?? null)}.
                </p>
                {status.data?.schedulerError && (
                  <p role="alert">{status.data.schedulerError}</p>
                )}
              </section>
              <section className="panel report-panel">
                <h2>CSV / Excel / Healthplanner-mail import</h2>
                <p>
                  Een Healthplanner .eml-mail bepaalt zelf de dag (gisteren) en
                  alle clubs; kies Healthplanner als bron. Maandkolommen worden
                  bewaard, maar hun periode is nog niet bevestigd. Sjablonen
                  staan in <code>docs/reporting/templates</code>. Ruwe
                  Dewi/HP-ledenlijsten missen historie en worden met uitleg
                  afgewezen. Een complete import vervangt eerdere imports voor
                  zijn scope en periode.
                </p>
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    void action(async () => {
                      if (!file) throw new Error('Selecteer een bestand.');
                      if (file.size > 5000000)
                        throw new Error('Maximaal 5 MB.');
                      const bytes = new Uint8Array(await file.arrayBuffer());
                      let binary = '';
                      for (const b of bytes) binary += String.fromCharCode(b);
                      const r = await api<{
                        status: string;
                        duplicate: boolean;
                        error: string | null;
                      }>(`${base}/imports`, {
                        filename: file.name,
                        content: btoa(binary),
                        meta: {
                          source,
                          dataset,
                          from,
                          through,
                          locations: scope,
                          complete,
                        },
                      });
                      if (r.status === 'rejected')
                        throw new Error(r.error ?? 'Import afgewezen.');
                      if (r.duplicate)
                        throw new Error(
                          'Dubbele import herkend; bestaande import behouden.',
                        );
                      return r;
                    }, 'Import verwerkt; origineel lokaal bewaard.');
                  }}
                >
                  <div className="report-fields">
                    <label>
                      Bron
                      <select
                        value={source}
                        onChange={(e) => setSource(e.target.value as Source)}
                      >
                        <option value="dewi-members">
                          Dewi · abonnementhistorie
                        </option>
                        <option value="dewi-finance">
                          Dewi · financiële events
                        </option>
                        <option value="healthplanner">
                          Healthplanner · dagrapporten
                        </option>
                      </select>
                    </label>
                    <label>
                      Gedekt vanaf
                      <input
                        type="date"
                        value={from}
                        onChange={(e) => setFrom(e.target.value)}
                        required
                      />
                    </label>
                    <label>
                      Gedekt t/m
                      <input
                        type="date"
                        value={through}
                        onChange={(e) => setThrough(e.target.value)}
                        required
                      />
                    </label>
                    <label>
                      Bestand
                      <input
                        type="file"
                        accept=".csv,.xlsx,.eml"
                        onChange={(e) => setFile(e.target.files?.[0] ?? null)}
                        required
                      />
                    </label>
                  </div>
                  <fieldset>
                    <legend>Clubs in de import</legend>
                    {report.data?.organization.locations.map((l) => (
                      <label className="report-check" key={l.id}>
                        <input
                          type="checkbox"
                          checked={scope.includes(l.id)}
                          onChange={(e) =>
                            setScope(
                              e.target.checked
                                ? [...scope, l.id]
                                : scope.filter((id) => id !== l.id),
                            )
                          }
                        />
                        {l.name}
                      </label>
                    ))}
                  </fieldset>
                  <label className="report-check">
                    <input
                      type="checkbox"
                      checked={complete}
                      onChange={(e) => setComplete(e.target.checked)}
                    />
                    Volledige dekking bevestigd, inclusief beëindigde
                    abonnementen / nul-dagen / saldosnapshots. Onvolledig blijft
                    onbekend.
                  </label>
                  <button className="button" disabled={busy}>
                    Importeer in{' '}
                    {dataset === 'demo' ? 'DEMO' : 'werkelijke gegevens'}
                  </button>
                </form>
              </section>
              <section className="panel report-panel">
                <h2>Importhistorie</h2>
                <div className="table-scroll">
                  <table className="data-table">
                    <thead>
                      <tr>
                        <th>Bestand</th>
                        <th>Status</th>
                        <th>Moment / periode</th>
                        <th>Rijen</th>
                        <th>Controle</th>
                      </tr>
                    </thead>
                    <tbody>
                      {imports.data?.map((i) => (
                        <tr key={i.id}>
                          <td>
                            <a
                              href={`/api/v1/${base}/imports/${i.id}/original`}
                            >
                              {i.filename}
                            </a>
                          </td>
                          <td>
                            {i.status === 'accepted'
                              ? 'Geaccepteerd'
                              : 'Afgewezen'}
                          </td>
                          <td>
                            {timestamp(i.importedAt)}
                            <br />
                            {i.from} / {i.through}
                          </td>
                          <td>{i.rowCount}</td>
                          <td>
                            {i.error ??
                              `${i.complete ? 'Volledig' : 'Onvolledig'} · SHA256 ${i.hash.slice(0, 12)}`}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {!imports.data?.length && <p>Nog geen imports.</p>}
              </section>
              <section className="panel report-panel">
                <h2>Verzend- en runhistorie</h2>
                <p>
                  Elke organisatie / dataset / periode is uniek. ‘Onzeker’ wordt
                  nooit opnieuw verstuurd. Oudere gemiste perioden herken je aan
                  gaten in de datums; de laatst gemiste dag en maand worden
                  expliciet vastgelegd.
                </p>
                <div className="table-scroll">
                  <table className="data-table">
                    <thead>
                      <tr>
                        <th>Rapport</th>
                        <th>Status</th>
                        <th>Moment</th>
                        <th>Toelichting</th>
                      </tr>
                    </thead>
                    <tbody>
                      {runs.data?.map((r) => (
                        <tr key={r.id}>
                          <td>
                            {r.kind} · {r.reportDate}
                          </td>
                          <td>
                            {
                              {
                                claimed: 'Bezig',
                                captured: 'Lokaal opgevangen',
                                sent: 'Door mailprovider geaccepteerd',
                                missed: 'Gemist',
                                blocked: 'Geblokkeerd',
                                uncertain: 'Onzeker',
                              }[r.status]
                            }
                          </td>
                          <td>{timestamp(r.completedAt ?? r.createdAt)}</td>
                          <td>
                            {r.reason ??
                              (r.status === 'sent'
                                ? 'Microsoft 365 · inboxaflevering niet bevestigd'
                                : 'Lokale testmail')}
                            {r.preview && (
                              <details>
                                <summary>Opgeslagen mail</summary>
                                <pre>{r.preview.text}</pre>
                              </details>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {!runs.data?.length && <p>Nog geen runs.</p>}
              </section>
            </>
          )}
        </>
      )}
    </div>
  );
}
