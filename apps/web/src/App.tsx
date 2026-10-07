import type { UserRole } from './auth/types';
import { currentRoleAssignment } from './auth/mockCurrentUser';
import { Link, NavLink, Routes, Route, useLocation } from 'react-router';
import { organizationPreviews } from './organizations/mockOrganizations';
import { useState } from 'react';
import {
  OrganizationsPage,
  OrganizationOverviewPage,
  MembersPage,
  TeamPage,
  PlanningTemplatePage,
  TasksPage,
  LocationsPage,
  LocationDetailPage,
  SettingsPage,
  NotFoundPage,
} from './pages/ModulePages';
import { ReportsPage } from './reports/ReportsPage';
import { useQuery } from '@tanstack/react-query';
import type { HealthResponse } from '@cop/contracts';
import type { ReactNode } from 'react';

const roleLabels: Record<UserRole, string> = {
  admin: 'Beheerder',
  manager: 'Locatiemanager',
  employee: 'Medewerker',
};

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

const locations = organizationPreviews[0]?.locations ?? [];

const primaryNavigation: Array<{
  icon: IconName;
  label: string;
  to: string;
}> = [
  { icon: 'dashboard', label: 'Overzicht', to: '/' },
  { icon: 'members', label: 'Leden', to: '/leden' },
  { icon: 'team', label: 'Team', to: '/team' },
  { icon: 'calendar', label: 'Planning', to: '/planning' },
  { icon: 'clipboard', label: 'Taken', to: '/taken' },
];

const managementNavigation: Array<{
  icon: IconName;
  label: string;
  to: string;
}> = [
  { icon: 'building', label: 'Locaties', to: '/locaties' },
  { icon: 'activity', label: 'Rapportages', to: '/rapportages' },
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

type LocationCardProps = {
  name: string;
  slug: string;
};

function LocationCard({ name, slug }: LocationCardProps) {
  return (
    <Link className="location-card" to={`/locaties/${slug}`}>
      <Icon name="building" />
      <strong>{name}</strong>
      <Icon name="chevron" size={17} />
    </Link>
  );
}

export function App() {
  const [menuOpen, setMenuOpen] = useState(false);
  const { pathname } = useLocation();
  const activeOrganization = organizationPreviews.find((organization) =>
    pathname.startsWith(`/organisaties/${organization.slug}`),
  );
  const workspaceBase = activeOrganization
    ? `/organisaties/${activeOrganization.slug}`
    : '';
  const isAdmin = currentRoleAssignment.role === 'admin';
  const assignedLocationSlug =
    currentRoleAssignment.role === 'manager'
      ? currentRoleAssignment.locationSlug
      : undefined;

  const assignedLocation =
    assignedLocationSlug !== undefined
      ? locations.find((location) => location.slug === assignedLocationSlug)
      : undefined;

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
      <aside className={`sidebar ${menuOpen ? 'sidebar--open' : ''}`}>
        <div className="brand">
          <span className="brand__mark">C</span>
          <span className="brand__name">COP</span>
        </div>

        <Link className="club-switcher" to="/organisaties">
          <span className="club-switcher__avatar">SS</span>
          <span>
            <small>Clubomgeving</small>
            <strong>{activeOrganization?.name ?? 'Sport Society'}</strong>
          </span>
        </Link>

        <nav aria-label="Hoofdnavigatie" className="navigation">
          <span className="navigation__label">Platformopzet</span>
          <NavLink
            to="/organisaties"
            end
            className={({ isActive }) =>
              isActive
                ? 'navigation__item navigation__item--active'
                : 'navigation__item'
            }
            onClick={() => setMenuOpen(false)}
          >
            <Icon name="building" />
            Organisaties
          </NavLink>
          <span className="navigation__label navigation__label--spaced">
            Werkruimte
          </span>
          {primaryNavigation.map((item) => (
            <NavLink
              className={({ isActive }) =>
                isActive
                  ? 'navigation__item navigation__item--active'
                  : 'navigation__item'
              }
              to={`${workspaceBase}${item.to === '/' ? '' : item.to}` || '/'}
              end={item.to === '/'}
              key={item.label}
              onClick={() => setMenuOpen(false)}
            >
              <Icon name={item.icon} />
              {item.label}
            </NavLink>
          ))}
          <span className="navigation__label navigation__label--spaced">
            Beheer
          </span>
          {managementNavigation.map((item) => (
            <NavLink
              className={({ isActive }) =>
                isActive
                  ? 'navigation__item navigation__item--active'
                  : 'navigation__item'
              }
              to={`${workspaceBase}${item.to === '/' ? '' : item.to}` || '/'}
              key={item.label}
              onClick={() => setMenuOpen(false)}
            >
              <Icon name={item.icon} />
              {item.label}
            </NavLink>
          ))}
        </nav>

        <div className="sidebar__footer">
          <NavLink
            className={({ isActive }) =>
              isActive
                ? 'navigation__item navigation__item--active'
                : 'navigation__item'
            }
            to={`${workspaceBase}/instellingen`}
            onClick={() => setMenuOpen(false)}
          >
            <Icon name="settings" />
            Instellingen
          </NavLink>
          <div className="profile">
            <span className="profile__avatar">MK</span>
            <span>
              <strong>Michael</strong>
              <small>{roleLabels[currentRoleAssignment.role]}</small>
              {assignedLocation && <small>{assignedLocation.name}</small>}
            </span>
          </div>
        </div>
      </aside>

      <main className="workspace">
        <header className="topbar">
          <div className="topbar__mobile-brand">
            <button
              aria-label={menuOpen ? 'Menu sluiten' : 'Menu openen'}
              aria-expanded={menuOpen}
              onClick={() => setMenuOpen(!menuOpen)}
              className="icon-button"
              type="button"
            >
              <Icon name="menu" />
            </button>
            <span className="brand__mark brand__mark--small">C</span>
            <strong>COP</strong>
          </div>
          <span className="muted">Club Operations Platform</span>
          <div
            className={`api-pill ${health.isSuccess ? 'api-pill--online' : ''}`}
            role="status"
          >
            <span className="api-pill__dot" />
            API {apiStatus.toLowerCase()}
          </div>
        </header>

        <div className="content">
          <Routes>
            <Route path="/organisaties" element={<OrganizationsPage />} />
            <Route
              path="/organisaties/:organizationSlug"
              element={<OrganizationOverviewPage />}
            />
            <Route
              path="/organisaties/:organizationSlug/leden"
              element={<MembersPage />}
            />
            <Route
              path="/organisaties/:organizationSlug/team"
              element={<TeamPage />}
            />
            <Route
              path="/organisaties/:organizationSlug/planning"
              element={<PlanningTemplatePage />}
            />
            <Route
              path="/organisaties/:organizationSlug/taken"
              element={<TasksPage />}
            />
            <Route
              path="/organisaties/:organizationSlug/locaties"
              element={<LocationsPage />}
            />
            <Route
              path="/organisaties/:organizationSlug/locaties/:slug"
              element={<LocationDetailPage />}
            />
            <Route
              path="/organisaties/:organizationSlug/rapportages"
              element={<ReportsPage />}
            />
            <Route
              path="/organisaties/:organizationSlug/instellingen"
              element={<SettingsPage />}
            />
            <Route
              path="/"
              element={
                <>
                  <section className="page-heading">
                    <div>
                      <span className="page-heading__eyebrow">
                        {currentDate}
                      </span>
                      <h1>Goedemiddag, Michael</h1>
                      <p>
                        Dit wordt jouw centrale plek voor de dagelijkse
                        cluboperatie.
                      </p>
                    </div>
                    <Link className="button button--primary" to="/taken">
                      Bekijk taken
                    </Link>
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
                      <strong>{locations.length}</strong>
                      <small>Nog geen clubdata gekoppeld</small>
                    </article>
                    <article className="metric-card metric-card--accent">
                      <span className="metric-card__label">Systeemstatus</span>
                      <strong className="metric-card__status">
                        <span
                          className={
                            health.isSuccess
                              ? 'live-dot live-dot--online'
                              : 'live-dot'
                          }
                        />
                        {apiStatus}
                      </strong>
                      <small>Live gecontroleerd via de API</small>
                    </article>
                  </section>
                  {isAdmin && (
                    <section className="locations-section">
                      <h2>Locaties</h2>

                      <div className="locations-grid">
                        {locations.map((location) => (
                          <LocationCard
                            key={location.slug}
                            name={location.name}
                            slug={location.slug}
                          />
                        ))}
                      </div>
                    </section>
                  )}
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
                          <Link
                            className="module-row"
                            key={module.title}
                            to={
                              primaryNavigation.find(
                                (item) => item.icon === module.icon,
                              )?.to ?? '/'
                            }
                          >
                            <span className="module-row__icon">
                              <Icon name={module.icon} />
                            </span>
                            <span className="module-row__copy">
                              <strong>{module.title}</strong>
                              <small>{module.description}</small>
                            </span>
                            <span className="module-row__state">
                              Paginaopzet
                            </span>
                            <Icon name="chevron" size={17} />
                          </Link>
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
                          De interface staat klaar. Gegevens verschijnen zodra
                          de eerste module wordt gekoppeld.
                        </p>
                      </div>
                    </aside>
                  </div>{' '}
                </>
              }
            />
            <Route path="/leden" element={<MembersPage />} />
            <Route path="/team" element={<TeamPage />} />
            <Route path="/planning" element={<PlanningTemplatePage />} />
            <Route path="/taken" element={<TasksPage />} />
            <Route path="/locaties" element={<LocationsPage />} />
            <Route path="/locaties/:slug" element={<LocationDetailPage />} />
            <Route path="/rapportages" element={<ReportsPage />} />
            <Route path="/instellingen" element={<SettingsPage />} />
            <Route path="*" element={<NotFoundPage />} />
          </Routes>
        </div>
      </main>
    </div>
  );
}
