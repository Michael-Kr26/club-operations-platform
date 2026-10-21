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
        ? step.status === 'Gebouwd'
        : step.status !== 'Gebouwd'),
  );
  return (
    <div className="implementation">
      <section className="page-heading">
        <div>
          <span className="page-heading__eyebrow">
            COP · Ontwikkelplan · Bijgewerkt 21 oktober 2026
          </span>
          <h1>Implementatie</h1>
          <p>
            Van werkende lokale basis naar een betrouwbare dagelijkse
            clubupdate.
          </p>
        </div>
      </section>
      <div className="implementation__intro">
        <span className="implementation__label">Eerstvolgende stap</span>
        <h2>Het nieuwe overzicht in de praktijk controleren</h2>
        <p>
          Bekijk de ochtendmail en grafieken op je laptop. Daarna richten we de
          brongegevens, dagelijkse ontvangst en echte verzending in, in die
          volgorde.
        </p>
        <Link className="button button--primary" to={`${base}/rapportages`}>
          Open de rapportages
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
          <strong>01 · Basis</strong>
          <span>Lokale modules zijn gebouwd</span>
        </div>
        <div>
          <strong>02–04 · Cijfers</strong>
          <span>Ontwerp controleren en definities vastleggen</span>
        </div>
        <div>
          <strong>05–08 · Dagelijks gebruik</strong>
          <span>Ontvangst, verzending, churn en continuïteit</span>
        </div>
        <div>
          <strong>09–10 · Uitbreiden</strong>
          <span>Rooster en overige inzichten</span>
        </div>
      </section>
      <div className="implementation__toolbar">
        <h2>Stappen in volgorde</h2>
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
            <details open={step.number === '02'}>
              <summary>
                <span className="implementation__number">{step.number}</span>
                <span className="implementation__title">
                  <small>{step.phase}</small>
                  <strong>{step.title}</strong>
                </span>
                <span
                  className={`implementation__status ${step.status === 'Gebouwd' ? 'implementation__status--built' : ''}`}
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
        Geen vaste opleverdatums: toegang tot bronnen, voorbeeldbestanden en
        praktijkcontroles bepalen het tempo. We werken eerst ochtendmail en
        maandchurn af; de overige uitbreidingen volgen daarna. Statuswijzigingen
        worden in dit ontwikkelplan bijgewerkt.
      </p>
    </div>
  );
}
