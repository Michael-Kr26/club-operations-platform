import { useQuery } from '@tanstack/react-query';
import { Link, useParams, useSearchParams } from 'react-router';
import type { CatalogStatus, DataCatalog } from '@cop/contracts';
import { operationsApi } from '../operations/api';
import './reports.css';
import './data-catalog.css';
const labels: Record<CatalogStatus, string> = {
  received: 'Aangeleverd',
  partial: 'Deels aangeleverd',
  missing: 'Nog aanleveren',
  planned: 'Import nog te bouwen',
};
const date = (text: string) =>
  new Intl.DateTimeFormat('nl-NL', {
    dateStyle: 'short',
    timeStyle: 'short',
    timeZone: 'Europe/Amsterdam',
  }).format(new Date(text));
export function DataCatalogPage() {
  const { organizationSlug } = useParams();
  const org = organizationSlug ?? 'sport-society',
    workspace = organizationSlug
      ? `/organisaties/${encodeURIComponent(org)}`
      : '';
  const [params, setParams] = useSearchParams();
  const dataset = params.get('dataset') === 'demo' ? 'demo' : 'real',
    category = params.get('categorie') ?? '',
    state = params.get('status') ?? '',
    location = params.get('locatie') ?? '';
  function select(key: string, value: string) {
    const next = new URLSearchParams(params);
    if (value) next.set(key, value);
    else next.delete(key);
    setParams(next, { replace: true });
  }
  const query = useQuery({
    queryKey: ['data-catalog', org, dataset],
    queryFn: () =>
      operationsApi<DataCatalog>(
        `organizations/${encodeURIComponent(org)}/reports/data-catalog?dataset=${dataset}`,
      ),
    retry: false,
    refetchInterval: 30000,
  });
  const data = query.data;
  const entries =
    data?.entries.map((entry) => {
      const locations = location
        ? entry.locations.filter((loc) => loc.id === location)
        : entry.locations;
      const status =
        entry.status === 'planned'
          ? 'planned'
          : !locations.length ||
              locations.every((loc) => loc.status === 'missing')
            ? 'missing'
            : locations.every((loc) => loc.status === 'received')
              ? 'received'
              : 'partial';
      return { ...entry, locations, status };
    }) ?? [];
  const categories = [...new Set(data?.entries.map((entry) => entry.category))];
  const filtered = entries.filter(
    (entry) =>
      (!category || entry.category === category) &&
      (!state || entry.status === state),
  );
  return (
    <main className="cop-reports data-catalog">
      <header className="page-heading">
        <div>
          <span className="page-heading__eyebrow">
            {data?.organization.name ?? 'COP'} · Bronoverzicht
          </span>
          <h1>Gegevens & imports</h1>
          <p>Wat kun je aanleveren, wat is verwerkt en wat ontbreekt er nog?</p>
        </div>
        <Link
          className="button button--primary"
          to={`${workspace}/rapportages/excel?dataset=${dataset}`}
        >
          Bestanden importeren
        </Link>
      </header>
      <p className="catalog-intro">
        De API controleert opgeslagen, geaccepteerde imports. Aangeleverd
        betekent dat de gegevens in een bronperiode beschikbaar zijn; het zegt
        niet dat alle perioden volledig of actueel zijn. Bekijk per locatie de
        bron, periode en ontbrekende velden. Een nul telt als gegevens; een lege
        waarde niet.
      </p>
      {dataset === 'demo' && (
        <p className="report-notice">
          Demo: deze status zegt niets over jouw echte clubgegevens.
        </p>
      )}
      <div className="catalog-filters">
        <label>
          Gegevens
          <select
            value={dataset}
            onChange={(event) => select('dataset', event.target.value)}
          >
            <option value="real">Werkelijk</option>
            <option value="demo">Demo</option>
          </select>
        </label>
        <label>
          Categorie
          <select
            value={category}
            onChange={(event) => select('categorie', event.target.value)}
          >
            <option value="">Alle categorieën</option>
            {categories.map((c) => (
              <option key={c}>{c}</option>
            ))}
          </select>
        </label>
        <label>
          Locatie
          <select
            value={location}
            onChange={(event) => select('locatie', event.target.value)}
          >
            <option value="">Alle toegankelijke locaties</option>
            {data?.organization.locations.map((loc) => (
              <option key={loc.id} value={loc.id}>
                {loc.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          Status
          <select
            value={state}
            onChange={(event) => select('status', event.target.value)}
          >
            <option value="">Alle statussen</option>
            {Object.entries(labels).map(([key, label]) => (
              <option key={key} value={key}>
                {label}
              </option>
            ))}
          </select>
        </label>
      </div>
      <div className="catalog-summary">
        {Object.entries(labels).map(([status, label]) => (
          <button
            type="button"
            key={status}
            aria-pressed={state === status}
            onClick={() => select('status', state === status ? '' : status)}
          >
            <strong>
              {entries.filter((entry) => entry.status === status).length}
            </strong>
            <span>{label}</span>
          </button>
        ))}
      </div>
      <p className="catalog-update">
        {data
          ? `Laatst gecontroleerd: ${date(data.checkedAt)}`
          : 'Status laden…'}{' '}
        <button
          type="button"
          className="button"
          disabled={query.isFetching}
          onClick={() => void query.refetch()}
        >
          Status vernieuwen
        </button>
      </p>
      {query.error && <p role="alert">{query.error.message}</p>}
      {data?.unprocessedFiles?.length ? (
        <section className="catalog-pending">
          <h2>Gevonden, maar nog niet verwerkt</h2>
          {data.unprocessedFiles.map((file) => (
            <p key={file.filename}>
              <strong>{file.filename}</strong>
              <br />
              {file.message}
            </p>
          ))}
          <Link to={`${workspace}/rapportages/excel?dataset=${dataset}`}>
            Naar importcontrole en bestandsstatus
          </Link>
        </section>
      ) : null}
      {categories
        .filter((c) => filtered.some((entry) => entry.category === c))
        .map((c) => (
          <section key={c} className="catalog-category">
            <h2>{c}</h2>
            <div className="catalog-grid">
              {filtered
                .filter((entry) => entry.category === c)
                .map((entry) => (
                  <article key={entry.id} className="catalog-card">
                    <div>
                      <span
                        className={`catalog-status catalog-status--${entry.status}`}
                      >
                        {labels[entry.status as CatalogStatus]}
                      </span>
                      <h3>{entry.title}</h3>
                      <p>{entry.description}</p>
                    </div>
                    <dl>
                      <dt>Wat kan COP lezen?</dt>
                      <dd>{entry.formats}</dd>
                      <dt>Hiervoor aanleveren</dt>
                      <dd>{entry.needed}</dd>
                    </dl>
                    <p className="catalog-note">{entry.note}</p>
                    <details>
                      <summary>
                        Bronnen en ontbrekende gegevens per locatie
                      </summary>
                      {entry.locations.map((loc) => (
                        <div className="catalog-location" key={loc.id}>
                          <strong>{loc.name}</strong> · {labels[loc.status]}
                          {loc.availableFields.length > 0 && (
                            <p>
                              Beschikbaar: {loc.availableFields.join(', ')}.
                            </p>
                          )}
                          {loc.missingFields.length > 0 && (
                            <p>Nog nodig: {loc.missingFields.join(', ')}.</p>
                          )}
                          {loc.source && (
                            <p>
                              Bron: {loc.source.filename}
                              <br />
                              Periode: {loc.source.period}
                              <br />
                              Import: {date(loc.source.importedAt)}
                              {!loc.source.complete && (
                                <>
                                  <br />
                                  Volledigheid van deze bron is niet bevestigd.
                                </>
                              )}
                            </p>
                          )}
                        </div>
                      ))}
                    </details>
                    {entry.route && (
                      <Link
                        to={`${workspace}/rapportages${entry.route === 'files' ? '/excel' : ''}?dataset=${dataset}${entry.id === 'finance-pdf' ? '#payment-pdf-import' : ''}`}
                      >
                        {entry.route === 'files'
                          ? 'Bestand aanleveren'
                          : 'Naar standaard CSV-import'}{' '}
                        →
                      </Link>
                    )}
                  </article>
                ))}
            </div>
          </section>
        ))}
      {data && !filtered.length && (
        <p>Geen gegevenssoorten binnen dit filter.</p>
      )}
    </main>
  );
}
