import { useState } from 'react';
import { Link, useParams } from 'react-router';
import { implementationPlan } from './implementation-plan';
import './implementation.css';

export function ImplementationPage() {
  const { organizationSlug } = useParams();
  const base = organizationSlug ? `/organisaties/${organizationSlug}` : '';
  const [filter, setFilter] = useState('Alles');
  const shown = implementationPlan.filter(
    (step) =>
      filter === 'Alles' ||
      (filter === 'Basis beschikbaar'
        ? step.status.startsWith('Gebouwd')
        : !step.status.startsWith('Gebouwd')),
  );
  return (
    <div className="implementation">
      <section className="page-heading">
        <div>
          <span className="page-heading__eyebrow">
            COP · Ontwikkelplan · Bijgewerkt 26 oktober 2026
          </span>
          <h1>Implementatie</h1>
          <p>
            Rooster en dagelijkse werkprocessen eerst. Imports en lokaal beheer
            ondersteunen het dagelijkse gebruik.
          </p>
        </div>
      </section>
      <div className="implementation__intro">
        <span className="implementation__label">Eerstvolgende stap</span>
        <h2>Rooster en dagelijkse opvolging uitbreiden</h2>
        <p>
          De planning heeft hoge prioriteit. Daarnaast controleren we de
          bronbestanden en bouwen we lokaal beheer uit. Echte mailverzending en
          maandchurn volgen veel later.
        </p>
        <Link className="button button--primary" to={`${base}/planning`}>
          Open het rooster
        </Link>
      </div>
      <p className="implementation__notice">
        Dit is een vastgelegd ontwikkelplan, geen live controle van jouw
        installatie. Gebouwd betekent dat de functie in de code beschikbaar is.
        Automatische ontvangst en echte verzending zijn nog niet als werkende
        koppeling bevestigd. Het plan geldt voor COP als product; de Sport
        Society-pilot is de eerste praktijkcontrole.
      </p>
      <section aria-label="Mijlpalen" className="implementation__milestones">
        <div>
          <strong>09 · Hoge prioriteit</strong>
          <span>Rooster en dagelijkse opvolging</span>
        </div>
        <div>
          <strong>02–04 & 08 · Nu</strong>
          <span>Bestanden, Dewi, PDF’s en lokaal beheer</span>
        </div>
        <div>
          <strong>05–07 · Later</strong>
          <span>Ontvangst regelen; verzending en churn veel later</span>
        </div>
        <div>
          <strong>10 · Lange termijn</strong>
          <span>Meer inzichten en andere organisaties</span>
        </div>
      </section>
      <div className="implementation__toolbar">
        <h2>Stappen op prioriteit</h2>
        <label>
          Toon{' '}
          <select
            value={filter}
            onChange={(event) => setFilter(event.target.value)}
          >
            <option>Alles</option>
            <option>Basis beschikbaar</option>
            <option>Open stappen</option>
          </select>
        </label>
      </div>
      <ol className="implementation__steps">
        {shown.map((step) => (
          <li key={step.number}>
            <details open={step.number === '02' || step.number === '09'}>
              <summary>
                <span className="implementation__number">{step.number}</span>
                <span className="implementation__title">
                  <small>{step.phase}</small>
                  <strong>{step.title}</strong>
                </span>
                <span
                  className={`implementation__status ${step.status.startsWith('Gebouwd') ? 'implementation__status--built' : ''}`}
                >
                  {step.status}
                </span>
              </summary>
              <div className="implementation__body">
                <p>{step.goal}</p>
                <h3>Wat we gaan doen</h3>
                <ul>
                  {step.actions.map((action) => (
                    <li key={action}>{action}</li>
                  ))}
                </ul>
                <div className="implementation__criteria">
                  <div>
                    <h3>Hiervoor nodig</h3>
                    <p>{step.needed}</p>
                  </div>
                  <div>
                    <h3>Klaar wanneer</h3>
                    <p>{step.done}</p>
                  </div>
                </div>
                <Link to={`${base}${step.link}` || '/'}>
                  Naar de bijbehorende pagina →
                </Link>
              </div>
            </details>
          </li>
        ))}
      </ol>
      <p className="implementation__notice">
        De oorspronkelijke stapnummers zijn behouden. De volgorde volgt jouw
        prioriteiten: rooster eerst, automatische mail en maandchurn veel later.
        Gebouwd betekent beschikbaar in de code; praktijkcontroles blijven
        apart.
      </p>
    </div>
  );
}
