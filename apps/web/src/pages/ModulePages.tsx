import { useState, type ReactNode } from 'react';
import { Link, useParams } from 'react-router';
import { organizationPreviews } from '../organizations/mockOrganizations';
import { mockShifts } from '../planning/mockPlanningData';

function useOrganizationPreview() {
  const { organizationSlug } = useParams();
  return organizationPreviews.find(
    (organization) =>
      organization.slug === (organizationSlug ?? 'sport-society'),
  );
}

function useWorkspaceBase() {
  const { organizationSlug } = useParams();
  return organizationSlug ? `/organisaties/${organizationSlug}` : '';
}

function Page({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: ReactNode;
}) {
  const organization = useOrganizationPreview();
  const { organizationSlug } = useParams();
  if (organizationSlug && !organization)
    return (
      <section className="page-heading">
        <div>
          <h1>Organisatie niet gevonden</h1>
          <Link to="/organisaties">Terug naar organisaties</Link>
        </div>
      </section>
    );
  return (
    <>
      <section className="page-heading">
        <div>
          <span className="page-heading__eyebrow">
            {organization?.name ?? 'COP'} · Werkruimte
          </span>
          <h1>{title}</h1>
          <p>{description}</p>
        </div>
        <span className="badge">Paginaopzet</span>
      </section>
      {children}
    </>
  );
}

function Metrics({ labels }: { labels: string[] }) {
  return (
    <section className="metrics-grid" aria-label="Kengetallen">
      {labels.map((label) => (
        <article className="metric-card" key={label}>
          <span className="metric-card__label">{label}</span>
          <strong>—</strong>
          <small>Nog geen gegevens gekoppeld</small>
        </article>
      ))}
    </section>
  );
}

function Empty({ title, description }: { title: string; description: string }) {
  return (
    <div className="empty-state">
      <span className="empty-state__mark" aria-hidden="true">
        ◇
      </span>
      <h3>{title}</h3>
      <p>{description}</p>
    </div>
  );
}

function Table({
  headers,
  title,
  description,
}: {
  headers: string[];
  title: string;
  description: string;
}) {
  return (
    <section className="panel template-panel">
      <div className="table-scroll">
        <table className="data-table">
          <thead>
            <tr>
              {headers.map((header) => (
                <th key={header} scope="col">
                  {header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            <tr>
              <td colSpan={headers.length}>
                <Empty title={title} description={description} />
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </section>
  );
}

function LocationFilter({
  value,
  onChange,
}: {
  value: string;
  onChange: (value: string) => void;
}) {
  const locations =
    useOrganizationPreview()?.locations.map((location) => location.name) ?? [];
  return (
    <label className="field">
      Locatie
      <select value={value} onChange={(event) => onChange(event.target.value)}>
        <option value="all">Alle locaties</option>
        {locations.map((name) => (
          <option key={name} value={name.toLowerCase()}>
            {name}
          </option>
        ))}
      </select>
    </label>
  );
}

export function MembersPage() {
  const [location, setLocation] = useState('all');
  const [query, setQuery] = useState('');
  return (
    <Page
      title="Leden"
      description="Bekijk leden per locatie en volg afspraken en contactmomenten op."
    >
      <Metrics
        labels={[
          'Actieve leden',
          'Zonder afspraak',
          'Slapende leden',
          'Opvolging nodig',
        ]}
      />
      <div className="page-toolbar">
        <label className="field">
          Lid zoeken
          <input
            placeholder="Naam of lidnummer…"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
        </label>
        <LocationFilter value={location} onChange={setLocation} />
      </div>
      <Table
        headers={[
          'Lid',
          'Locatie',
          'Abonnement',
          'Laatste bezoek',
          'Volgende afspraak',
        ]}
        title="Ledenoverzicht staat klaar"
        description="Na koppeling van een gecontroleerde ledenexport verschijnen hier de leden voor je selectie."
      />
    </Page>
  );
}

export function TeamPage() {
  const workspaceBase = useWorkspaceBase();
  const [location, setLocation] = useState('all');
  return (
    <Page
      title="Team"
      description="Medewerkers, inzetbaarheid en beschikbaarheid op één plek."
    >
      <Metrics
        labels={['Medewerkers', 'Vandaag ingepland', 'In opleiding', 'Afwezig']}
      />
      <div className="page-toolbar">
        <LocationFilter value={location} onChange={setLocation} />
        <Link
          className="button button--primary"
          to={`${workspaceBase}/planning`}
        >
          Bekijk planning
        </Link>
      </div>
      <Table
        headers={[
          'Medewerker',
          'Locatie',
          'Functie',
          'Inzetbaarheid',
          'Contracturen',
        ]}
        title="Je team komt hier in beeld"
        description="Personeelsgegevens worden later gekoppeld. Namen en contracturen zijn nog niet ingevuld."
      />
      <div className="foundation-note template-note">
        <span className="foundation-note__icon">i</span>
        <p>
          Een medewerker kan ingepland zijn voor vloer, groepsles, PT, intake,
          opleiding of administratie. Aanwezigheid en vloerbeschikbaarheid
          worden afzonderlijk beoordeeld.
        </p>
      </div>
    </Page>
  );
}

export function PlanningTemplatePage() {
  const organization = useOrganizationPreview();
  const locations =
    organization?.locations.map((location) => location.name) ?? [];
  const [location, setLocation] = useState('all');
  const shifts = (
    organization?.slug === 'sport-society' ? mockShifts : []
  ).filter((shift) => location === 'all' || shift.locationSlug === location);
  const days = [
    'Ma 5 okt',
    'Di 6 okt',
    'Wo 7 okt',
    'Do 8 okt',
    'Vr 9 okt',
    'Za 10 okt',
    'Zo 11 okt',
  ];
  return (
    <Page
      title="Planning"
      description="Een eerste weekoverzicht van diensten en de inzet per locatie."
    >
      <Metrics
        labels={[
          'Geplande aanwezigheid',
          'Beschikbaar op vloer',
          'Andere werkzaamheden',
          'Te beoordelen',
        ]}
      />
      <div className="page-toolbar">
        <LocationFilter value={location} onChange={setLocation} />
        <span className="badge">Voorbeeldweek · 5–11 oktober 2026</span>
      </div>
      <section className="panel template-panel">
        <div className="panel__heading">
          <h2>Weekplanning</h2>
          <span className="badge">Testdiensten</span>
        </div>
        <div className="week-scroll">
          <div className="week-grid">
            {days.map((day, index) => (
              <section className="week-day" key={day}>
                <h3>{day}</h3>
                {index === 0 && shifts.length > 0 ? (
                  shifts.map((shift) => (
                    <article
                      className={`shift-preview shift-preview--${shift.locationSlug}`}
                      key={shift.id}
                    >
                      <strong>
                        {shift.startTime}–{shift.endTime}
                      </strong>
                      <span>
                        {locations.find(
                          (name) => name.toLowerCase() === shift.locationSlug,
                        )}
                      </span>
                      <small>{shift.employeeNumber}</small>
                      <small>Werkzaamheid nog niet ingevuld</small>
                    </article>
                  ))
                ) : (
                  <p className="muted">Geen testdiensten</p>
                )}
              </section>
            ))}
          </div>
        </div>
      </section>
      <div className="foundation-note template-note">
        <span className="foundation-note__icon">i</span>
        <p>
          Dit zijn de bestaande testdiensten. Diensten bewerken, afwezigheid en
          bezettingsberekeningen volgen na beoordeling van deze paginaopzet.
        </p>
      </div>
    </Page>
  );
}

export function TasksPage() {
  const [view, setView] = useState('Open');
  return (
    <Page
      title="Taken"
      description="Dagelijkse acties, controles en opvolging voor de cluboperatie."
    >
      <Metrics labels={['Open acties', 'Vandaag', 'Over datum', 'Afgerond']} />
      <div className="page-toolbar">
        <div className="view-tabs" aria-label="Taakstatus">
          {['Open', 'Afgerond'].map((status) => (
            <button
              type="button"
              className={
                view === status ? 'view-tab view-tab--active' : 'view-tab'
              }
              aria-pressed={view === status}
              key={status}
              onClick={() => setView(status)}
            >
              {status}
            </button>
          ))}
        </div>
      </div>
      <Table
        headers={['Taak', 'Locatie', 'Verantwoordelijke', 'Deadline', 'Status']}
        title={
          view === 'Open'
            ? 'Nog geen open taken gekoppeld'
            : 'Nog geen afgeronde taken gekoppeld'
        }
        description="Hier komen handmatige acties en later de opvolgtaken vanuit leden- en bezoekersgegevens."
      />
      <section className="panel template-panel">
        <div className="panel__heading">
          <h2>Geplande automatisering</h2>
          <span className="badge">Dewi</span>
        </div>
        <div className="panel-body">
          <p>
            Excelrapport ontvangen → gegevens controleren → cijfers bijwerken →
            opvolgtaken aanmaken.
          </p>
          <p className="muted">
            De automatische aanlevering en het bestandsformaat moeten nog worden
            bevestigd.
          </p>
        </div>
      </section>
    </Page>
  );
}

export function LocationsPage() {
  const organization = useOrganizationPreview();
  const locations =
    organization?.locations.map((location) => location.name) ?? [];
  const workspaceBase = useWorkspaceBase();
  return (
    <Page
      title="Locaties"
      description="Bekijk de werkruimte en operationele onderdelen van iedere vestiging."
    >
      <div className="location-overview-grid">
        {locations.map((name) => (
          <article className="panel location-overview" key={name}>
            <span className="page-heading__eyebrow">Sport Society</span>
            <h2>{name}</h2>
            <p>Planning, team en clubcijfers</p>
            <Link
              className="button button--primary"
              to={`${workspaceBase}/locaties/${name.toLowerCase()}`}
            >
              Bekijk locatie
            </Link>
          </article>
        ))}
      </div>
    </Page>
  );
}

export function LocationDetailPage() {
  const organization = useOrganizationPreview();
  const locations =
    organization?.locations.map((location) => location.name) ?? [];
  const workspaceBase = useWorkspaceBase();
  const { slug } = useParams();
  const name = locations.find((location) => location.toLowerCase() === slug);
  if (!name) return <NotFoundPage />;
  return (
    <Page title={name} description={`De dagelijkse cluboperatie van ${name}.`}>
      <Link className="back-link" to={`${workspaceBase}/locaties`}>
        ← Alle locaties
      </Link>
      <Metrics
        labels={['Actieve leden', 'Team vandaag', 'Open acties', 'Bezoekers']}
      />
      <div className="location-overview-grid template-panel">
        {[
          {
            title: 'Planning',
            description: 'Diensten en werkzaamheden per week',
            to: '/planning',
          },
          {
            title: 'Team',
            description: 'Medewerkers en inzetbaarheid',
            to: '/team',
          },
          {
            title: 'Taken',
            description: 'Operationele acties en opvolging',
            to: '/taken',
          },
        ].map((item) => (
          <article className="panel location-overview" key={item.title}>
            <h2>{item.title}</h2>
            <p>{item.description}</p>
            <Link className="back-link" to={`${workspaceBase}${item.to}`}>
              Open {item.title.toLowerCase()} →
            </Link>
          </article>
        ))}
      </div>
      <section className="panel template-panel">
        <div className="panel__heading">
          <h2>Bezetting en aandachtspunten</h2>
        </div>
        <Empty
          title="Locatienormen worden later gekoppeld"
          description="De gedeelde bezettingsvoorkeuren vormen de basis. Tijdvensters en minimumnormen worden eerst vastgesteld."
        />
      </section>
    </Page>
  );
}

export function ReportsPage() {
  const [location, setLocation] = useState('all');
  return (
    <Page
      title="Rapportages"
      description="Inzicht in leden, bezoeken en personeelsinzet per locatie."
    >
      <div className="page-toolbar">
        <LocationFilter value={location} onChange={setLocation} />
        <span className="badge">Nog geen brondata gekoppeld</span>
      </div>
      <Metrics
        labels={[
          'Actieve leden',
          'Bezoeken',
          'Ingeplande uren',
          'Vloerbezetting',
        ]}
      />
      <div className="report-grid">
        {[
          {
            title: 'Bezoekers per tijdvak',
            description:
              'Na koppeling van Dewi tonen we bezoeken per dag en uur.',
          },
          {
            title: 'Leden en afspraken',
            description:
              'Ledenexport en afspraakgegevens worden eerst gecontroleerd en gekoppeld.',
          },
          {
            title: 'Personeelsinzet',
            description:
              'Vergelijk aanwezigheid, werkzaamheden en beschikbare vloerbezetting.',
          },
          {
            title: 'Datakwaliteit',
            description:
              'Laatste import, ontbrekende gegevens en afgewezen rijen.',
          },
        ].map((item) => (
          <section className="panel template-panel" key={item.title}>
            <div className="panel__heading">
              <h2>{item.title}</h2>
            </div>
            <Empty
              title="Rapport staat klaar voor gegevens"
              description={item.description}
            />
          </section>
        ))}
      </div>
    </Page>
  );
}

export function SettingsPage() {
  const organization = useOrganizationPreview();
  return (
    <Page
      title="Instellingen"
      description="De basisinstellingen voor je organisatie en de koppelingen."
    >
      <div className="report-grid">
        {[
          {
            title: 'Organisatie',
            rows: [
              ['Naam', organization?.name ?? '—'],
              [
                'Locaties',
                `${organization?.locations.length ?? 0} vestigingen`,
              ],
            ],
          },
          {
            title: 'Rollen en toegang',
            rows: [
              ['Beheerder', 'Organisatiebreed'],
              ['Locatiemanager', 'Eigen locatie'],
              ['Medewerker', 'Eigen werkomgeving'],
            ],
          },
          {
            title: 'Gegevenskoppelingen',
            rows: [
              ['Dewi', 'Aanlevering onderzoeken'],
              ['Healthplanner', 'Nog niet gekoppeld'],
            ],
          },
          {
            title: 'Bezettingsnormen',
            rows: [
              ['Weekpatronen', 'Nog vast te stellen'],
              ['Uitzonderingen', 'Opleiding en tijdelijke inzet'],
            ],
          },
        ].map((item) => (
          <section className="panel template-panel" key={item.title}>
            <div className="panel__heading">
              <h2>{item.title}</h2>
            </div>
            <dl className="settings-list">
              {item.rows.map(([label, value]) => (
                <div key={label}>
                  <dt>{label}</dt>
                  <dd>{value}</dd>
                </div>
              ))}
            </dl>
          </section>
        ))}
      </div>
      <p className="muted">
        Instellingen zijn in deze paginaopzet alleen ter inzage; wijzigen en
        opslaan volgen later.
      </p>
    </Page>
  );
}

export function NotFoundPage() {
  return (
    <Page
      title="Pagina niet gevonden"
      description="Deze pagina bestaat niet in COP."
    >
      <Link className="button button--primary" to="/">
        Terug naar overzicht
      </Link>
    </Page>
  );
}

export function OrganizationsPage() {
  return (
    <>
      <section className="page-heading">
        <div>
          <span className="page-heading__eyebrow">COP · Platformopzet</span>
          <h1>Organisaties</h1>
          <p>
            Open een organisatie om haar locaties en cluboperatie te bekijken.
          </p>
        </div>
        <span className="badge">Paginaopzet</span>
      </section>
      <div className="location-overview-grid">
        {organizationPreviews.map((organization) => (
          <article className="panel location-overview" key={organization.id}>
            <span className="page-heading__eyebrow">Organisatie</span>
            <h2>{organization.name}</h2>
            <p>{organization.locations.length} locaties · Voorbeeldomgeving</p>
            <Link
              className="button button--primary"
              to={`/organisaties/${organization.slug}`}
            >
              Open organisatie
            </Link>
          </article>
        ))}
      </div>
      <div className="foundation-note template-note">
        <span className="foundation-note__icon">i</span>
        <p>
          Deze opzet gebruikt één bekende organisatie. Andere bedrijven krijgen
          later hun eigen gegevens en locaties. Platformtoegang en
          gegevensscheiding worden via de backend afgedwongen.
        </p>
      </div>
    </>
  );
}

export function OrganizationOverviewPage() {
  const organization = useOrganizationPreview();
  const workspaceBase = useWorkspaceBase();
  if (!organization)
    return (
      <Page
        title="Organisatie niet gevonden"
        description="Kies een bestaande organisatie."
      >
        <Link to="/organisaties">Alle organisaties</Link>
      </Page>
    );
  return (
    <Page
      title={organization.name}
      description="Organisatiebreed overzicht van locaties en operationele processen."
    >
      <Link className="back-link" to="/organisaties">
        ← Alle organisaties
      </Link>
      <section className="metrics-grid">
        <article className="metric-card">
          <span className="metric-card__label">Locaties</span>
          <strong>{organization.locations.length}</strong>
          <small>Vestigingen binnen deze organisatie</small>
        </article>
        {['Actieve leden', 'Team vandaag', 'Open acties'].map((label) => (
          <article className="metric-card" key={label}>
            <span className="metric-card__label">{label}</span>
            <strong>—</strong>
            <small>Nog geen gegevens gekoppeld</small>
          </article>
        ))}
      </section>
      <section className="locations-section">
        <h2>Locaties</h2>
        <div className="location-overview-grid">
          {organization.locations.map((location) => (
            <Link
              className="location-card"
              key={location.slug}
              to={`${workspaceBase}/locaties/${location.slug}`}
            >
              <strong>{location.name}</strong>
              <span aria-hidden="true">→</span>
            </Link>
          ))}
        </div>
      </section>
      <section className="panel template-panel">
        <div className="panel__heading">
          <h2>Organisatiebeheer</h2>
        </div>
        <div className="organization-actions">
          {[
            { name: 'Leden', path: 'leden' },
            { name: 'Team', path: 'team' },
            { name: 'Planning', path: 'planning' },
            { name: 'Taken', path: 'taken' },
            { name: 'Rapportages', path: 'rapportages' },
            { name: 'Instellingen', path: 'instellingen' },
          ].map((item) => (
            <Link
              className="button"
              key={item.path}
              to={`${workspaceBase}/${item.path}`}
            >
              {item.name} →
            </Link>
          ))}
        </div>
      </section>
    </Page>
  );
}
