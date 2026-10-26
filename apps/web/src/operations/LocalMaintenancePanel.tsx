import { useState } from 'react';
import { useParams } from 'react-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { LocalMaintenanceStatus } from '@cop/contracts';
import { operationsApi } from './api';

export function LocalMaintenancePanel() {
  const { organizationSlug = 'sport-society' } = useParams();
  const path = `organizations/${encodeURIComponent(organizationSlug)}/operations/local-maintenance`;
  const client = useQueryClient();
  const queryKey = ['local-maintenance', organizationSlug];
  const query = useQuery({
    queryKey,
    queryFn: () => operationsApi<LocalMaintenanceStatus>(path),
    retry: false,
    refetchOnWindowFocus: false,
  });
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  async function backup() {
    setBusy(true);
    setError('');
    setMessage('');
    try {
      client.setQueryData(
        queryKey,
        await operationsApi<LocalMaintenanceStatus>(`${path}/backup`, {}),
      );
      setMessage('Back-up opgeslagen.');
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Back-up mislukt.');
    } finally {
      setBusy(false);
    }
  }
  return (
    <section id="lokaal-beheer" className="panel report-panel">
      <h2>Back-ups en lokaal opstarten</h2>
      <p>
        Bij de bijgewerkte lokale start maakt COP automatisch een
        databaseback-up zodra de vorige automatische back-up minstens 24 uur oud
        is. De laatste 14 automatische back-ups blijven bewaard; handmatige
        back-ups blijven staan.
      </p>
      <p>
        Een back-up bevat de opgeslagen gegevens en geïmporteerde originelen van
        alle organisaties op dit apparaat. Mailtoegang en nog niet geïmporteerde
        bestanden vallen hierbuiten.
      </p>
      {query.isPending && <p role="status">Back-ups laden…</p>}
      {query.error && <p role="alert">{query.error.message}</p>}
      {query.data && Array.isArray(query.data.backups) && (
        <>
          <p>
            Back-uplocatie: <code>{query.data.directory}</code>
          </p>
          {query.data.error && <p role="alert">{query.data.error}</p>}
          <button
            className="button button--primary"
            disabled={busy}
            onClick={() => void backup()}
          >
            {busy ? 'Back-up maken…' : 'Nu back-up maken'}
          </button>{' '}
          <button
            className="button"
            disabled={busy}
            onClick={() => void query.refetch()}
          >
            Vernieuwen
          </button>
          <ul>
            {query.data.backups.slice(0, 14).map((entry) => (
              <li key={entry.name}>
                {new Intl.DateTimeFormat('nl-NL', {
                  dateStyle: 'medium',
                  timeStyle: 'short',
                  timeZone: 'Europe/Amsterdam',
                }).format(new Date(entry.createdAt))}{' '}
                · {entry.kind === 'automatic' ? 'Automatisch' : 'Handmatig'} ·{' '}
                {Math.ceil(entry.bytes / 1024)} KB
              </li>
            ))}
          </ul>
          {!query.data.backups.length && <p>Nog geen back-ups beschikbaar.</p>}
        </>
      )}
      {error && <p role="alert">{error}</p>}
      {message && <p role="status">{message}</p>}
      <h3>Herstellen</h3>
      <p>
        Herstel werkt via het lokale hulpprogramma naar een nieuwe gegevensmap.
        Het controleert de back-up en behoudt de bestaande gegevensmap.
      </p>
      <h3>Starten bij aanmelden</h3>
      <p>
        Het Windows-startscript en de installatiehulp staan klaar. Automatisch
        starten is nog niet ingeschakeld. De laptop moet aanstaan; slaapstand
        onderbreekt de uitvoering.
      </p>
    </section>
  );
}
