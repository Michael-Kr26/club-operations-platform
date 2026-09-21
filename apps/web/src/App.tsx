import { useQuery } from '@tanstack/react-query';
import type { HealthResponse } from '@cop/contracts';
import type { ReactNode } from 'react';

async function fetchHealth(): Promise<HealthResponse> {
  const response = await fetch('/api/v1/health');

  if (!response.ok) {
    throw new Error('API health check failed');
  }

  return response.json() as Promise<HealthResponse>;
}

type IconName =
  | 'activity'
  | 'building'
  | 'calendar'
  | 'chevron'
  | 'clipboard'
  | 'dashboard'
  | 'members'
  | 'menu'
  | 'search'
  | 'settings'
  | 'team';

function Icon({ name, size = 20 }: { name: IconName; size?: number }) {
  const paths: Record<IconName, ReactNode> = {
    activity: <path d="M4 12h3l2-6 4 12 2-6h5" />,
    building: (
      <>
        <path d="M4 21V5a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v16" />
        <path d="M9 21v-4h3v4M8 7h1M12 7h1M8 11h1M12 11h1M3 21h18" />
      </>
    ),
    calendar: (
      <>
        <rect x="3" y="5" width="18" height="16" rx="2" />
        <path d="M16 3v4M8 3v4M3 10h18" />
      </>
    ),
    chevron: <path d="m9 18 6-6-6-6" />,
    clipboard: (
      <>
        <rect x="5" y="4" width="14" height="17" rx="2" />
        <path d="M9 4.5V3h6v1.5M9 10h6M9 14h6M9 18h4" />
      </>
    ),
    dashboard: (
      <>
        <rect x="3" y="3" width="7" height="7" rx="1" />
        <rect x="14" y="3" width="7" height="7" rx="1" />
        <rect x="3" y="14" width="7" height="7" rx="1" />
        <rect x="14" y="14" width="7" height="7" rx="1" />
      </>
    ),
    members: (
      <>
        <circle cx="9" cy="8" r="4" />
        <path d="M3 21v-2a6 6 0 0 1 12 0v2M16 3.2a4 4 0 0 1 0 7.6M19 21v-2a6 6 0 0 0-2-4.5" />
      </>
    ),
    menu: <path d="M4 7h16M4 12h16M4 17h16" />,
    search: (
      <>
        <circle cx="11" cy="11" r="7" />
        <path d="m20 20-4-4" />
      </>
    ),
    settings: (
      <>
        <circle cx="12" cy="12" r="3" />
        <path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1-2.8 2.8-.1-.1a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.6v.2h-4V21a1.7 1.7 0 0 0-1-1.6 1.7 1.7 0 0 0-1.9.3l-.1.1L4.2 17l.1-.1a1.7 1.7 0 0 0 .3-1.9A1.7 1.7 0 0 0 3 14H2.8v-4H3a1.7 1.7 0 0 0 1.6-1 1.7 1.7 0 0 0-.3-1.9L4.2 7 7 4.2l.1.1A1.7 1.7 0 0 0 9 4.6a1.7 1.7 0 0 0 1-1.6v-.2h4V3a1.7 1.7 0 0 0 1 1.6 1.7 1.7 0 0 0 1.9-.3l.1-.1L19.8 7l-.1.1a1.7 1.7 0 0 0-.3 1.9 1.7 1.7 0 0 0 1.6 1h.2v4H21a1.7 1.7 0 0 0-1.6 1Z" />
      </>
    ),
    team: (
      <>
        <circle cx="8" cy="8" r="4" />
        <circle cx="17" cy="9" r="3" />
        <path d="M2 21v-2a6 6 0 0 1 12 0v2M14 16a5 5 0 0 1 8 4v1" />
      </>
    ),
  };

  return (
    <svg
      aria-hidden="true"
      className="icon"
      fill="none"
      height={size}
      viewBox="0 0 24 24"
      width={size}
    >
      <g
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.8"
      >
        {paths[name]}
      </g>
    </svg>
  );
}

const primaryNavigation: Array<{
  icon: IconName;
  label: string;
  active?: boolean;
}> = [
  { icon: 'dashboard', label: 'Overzicht', active: true },
  { icon: 'members', label: 'Leden' },
  { icon: 'team', label: 'Team' },
  { icon: 'calendar', label: 'Planning' },
  { icon: 'clipboard', label: 'Taken' },
];

const managementNavigation: Array<{ icon: IconName; label: string }> = [
  { icon: 'building', label: 'Locaties' },
  { icon: 'activity', label: 'Rapportages' },
];

const modules: Array<{ description: string; icon: IconName; title: string }> = [
  {
    description: 'Profielen, abonnementen en contactmomenten',
    icon: 'members',
    title: 'Ledenbeheer',
  },
  {
    description: 'Medewerkers, rollen en beschikbaarheid',
    icon: 'team',
    title: 'Team & rollen',
  },
  {
    description: 'Diensten, lessen en locatiebezetting',
    icon: 'calendar',
    title: 'Planning',
  },
  {
    description: 'Acties, controles en opvolging',
    icon: 'clipboard',
    title: 'Operationele taken',
  },
];

export function App() {
  const health = useQuery({
    queryFn: fetchHealth,
    queryKey: ['api-health'],
    retry: false,
  });
  const apiStatus = health.isPending
    ? 'Controleren…'
    : health.isSuccess
      ? 'Online'
      : 'Niet bereikbaar';
  const currentDate = new Intl.DateTimeFormat('nl-NL', {
    day: 'numeric',
    month: 'long',
    weekday: 'long',
  }).format(new Date());

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <span className="brand__mark">C</span>
          <span className="brand__name">COP</span>
        </div>

        <button className="club-switcher" type="button">
          <span className="club-switcher__avatar">SS</span>
          <span>
            <small>Clubomgeving</small>
            <strong>Sport Society</strong>
          </span>
          <Icon name="chevron" size={16} />
        </button>

        <nav aria-label="Hoofdnavigatie" className="navigation">
          <span className="navigation__label">Werkruimte</span>
          {primaryNavigation.map((item) => (
            <a
              className={
                item.active
                  ? 'navigation__item navigation__item--active'
                  : 'navigation__item'
              }
              href="#"
              key={item.label}
              onClick={(event) => event.preventDefault()}
            >
              <Icon name={item.icon} />
              {item.label}
            </a>
          ))}
          <span className="navigation__label navigation__label--spaced">
            Beheer
          </span>
          {managementNavigation.map((item) => (
            <a
              className="navigation__item"
              href="#"
              key={item.label}
              onClick={(event) => event.preventDefault()}
            >
              <Icon name={item.icon} />
              {item.label}
            </a>
          ))}
        </nav>

        <div className="sidebar__footer">
          <a
            className="navigation__item"
            href="#"
            onClick={(event) => event.preventDefault()}
          >
            <Icon name="settings" />
            Instellingen
          </a>
          <div className="profile">
            <span className="profile__avatar">MK</span>
            <span>
              <strong>Michael</strong>
              <small>Beheerder</small>
            </span>
          </div>
        </div>
      </aside>

      <main className="workspace">
        <header className="topbar">
          <div className="topbar__mobile-brand">
            <button
              aria-label="Menu openen"
              className="icon-button"
              type="button"
            >
              <Icon name="menu" />
            </button>
            <span className="brand__mark brand__mark--small">C</span>
            <strong>COP</strong>
          </div>
          <label className="search">
            <Icon name="search" size={18} />
            <span className="sr-only">Zoeken</span>
            <input
              aria-label="Zoeken"
              placeholder="Zoeken in COP…"
              type="search"
            />
            <kbd>⌘ K</kbd>
          </label>
          <div
            className={`api-pill ${health.isSuccess ? 'api-pill--online' : ''}`}
            role="status"
          >
            <span className="api-pill__dot" />
            API {apiStatus.toLowerCase()}
          </div>
        </header>

        <div className="content">
          <section className="page-heading">
            <div>
              <span className="page-heading__eyebrow">{currentDate}</span>
              <h1>Goedemiddag, Michael</h1>
              <p>
                Dit wordt jouw centrale plek voor de dagelijkse cluboperatie.
              </p>
            </div>
            <button className="button button--primary" type="button">
              <span aria-hidden="true">＋</span>Nieuwe actie
            </button>
          </section>

          <section aria-label="Overzicht" className="metrics-grid">
            <article className="metric-card">
              <span className="metric-card__label">Open acties</span>
              <strong>—</strong>
              <small>Beschikbaar na takenmodule</small>
            </article>
            <article className="metric-card">
              <span className="metric-card__label">Team vandaag</span>
              <strong>—</strong>
              <small>Beschikbaar na planning</small>
            </article>
            <article className="metric-card">
              <span className="metric-card__label">Locaties</span>
              <strong>—</strong>
              <small>Nog geen clubdata gekoppeld</small>
            </article>
            <article className="metric-card metric-card--accent">
              <span className="metric-card__label">Systeemstatus</span>
              <strong className="metric-card__status">
                <span
                  className={
                    health.isSuccess ? 'live-dot live-dot--online' : 'live-dot'
                  }
                />
                {apiStatus}
              </strong>
              <small>Live gecontroleerd via de API</small>
            </article>
          </section>

          <div className="dashboard-grid">
            <section className="panel panel--modules">
              <div className="panel__heading">
                <div>
                  <span className="panel__eyebrow">Werkruimte</span>
                  <h2>Modules</h2>
                </div>
                <span className="badge">Foundation</span>
              </div>
              <div className="module-list">
                {modules.map((module) => (
                  <button
                    className="module-row"
                    key={module.title}
                    type="button"
                  >
                    <span className="module-row__icon">
                      <Icon name={module.icon} />
                    </span>
                    <span className="module-row__copy">
                      <strong>{module.title}</strong>
                      <small>{module.description}</small>
                    </span>
                    <span className="module-row__state">Gepland</span>
                    <Icon name="chevron" size={17} />
                  </button>
                ))}
              </div>
            </section>

            <aside className="panel progress-panel">
              <div className="panel__heading">
                <div>
                  <span className="panel__eyebrow">Implementatie</span>
                  <h2>Opbouw COP</h2>
                </div>
                <span className="progress-panel__count">1/3</span>
              </div>
              <ol className="timeline">
                <li className="timeline__item timeline__item--complete">
                  <span className="timeline__marker">✓</span>
                  <div>
                    <strong>Technische basis</strong>
                    <small>Web, API en database</small>
                  </div>
                </li>
                <li className="timeline__item timeline__item--current">
                  <span className="timeline__marker">2</span>
                  <div>
                    <strong>Identiteit & toegang</strong>
                    <small>Accounts, clubs en rollen</small>
                  </div>
                </li>
                <li className="timeline__item">
                  <span className="timeline__marker">3</span>
                  <div>
                    <strong>Operationele modules</strong>
                    <small>Per proces gecontroleerd bouwen</small>
                  </div>
                </li>
              </ol>
              <div className="foundation-note">
                <span className="foundation-note__icon">i</span>
                <p>
                  De interface staat klaar. Gegevens verschijnen zodra de eerste
                  module wordt gekoppeld.
                </p>
              </div>
            </aside>
          </div>
        </div>
      </main>
    </div>
  );
}
