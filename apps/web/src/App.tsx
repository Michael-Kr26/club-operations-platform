import { useQuery } from '@tanstack/react-query';
import type { HealthResponse } from '@cop/contracts';

async function fetchHealth(): Promise<HealthResponse> {
  const response = await fetch('/api/v1/health');

  if (!response.ok) {
    throw new Error('API health check failed');
  }

  return response.json() as Promise<HealthResponse>;
}

export function App() {
  const health = useQuery({
    queryFn: fetchHealth,
    queryKey: ['api-health'],
    retry: false,
  });

  const apiStatus = health.isPending
    ? 'API controleren…'
    : health.isSuccess
      ? 'API online'
      : 'API niet bereikbaar';

  return (
    <main className="shell">
      <section className="hero">
        <span className="eyebrow">Club Operations Platform</span>
        <h1>COP foundation</h1>
        <p>
          De technische basis draait. Functionele clubmodules worden pas op deze
          gecontroleerde onderlaag gebouwd.
        </p>
        <div
          className={`status ${health.isSuccess ? 'status--online' : ''}`}
          role="status"
        >
          <span className="status__dot" aria-hidden="true" />
          {apiStatus}
        </div>
      </section>

      <section className="grid" aria-label="Foundation onderdelen">
        <article>
          <span>01</span>
          <h2>Web</h2>
          <p>React, TypeScript, Vite en TanStack Query.</p>
        </article>
        <article>
          <span>02</span>
          <h2>API</h2>
          <p>NestJS en Fastify met een versieerbare REST-basis.</p>
        </article>
        <article>
          <span>03</span>
          <h2>Data</h2>
          <p>PostgreSQL en Drizzle, lokaal reproduceerbaar via Docker.</p>
        </article>
      </section>
    </main>
  );
}
