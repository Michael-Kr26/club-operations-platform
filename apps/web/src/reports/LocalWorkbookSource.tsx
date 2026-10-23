import { useState } from 'react';
import type { LocalWorkbookFileStatus } from '@cop/contracts';
import type { WorkbookRequest } from './WorkbookUpload';

const time = (value: string | null) =>
  value
    ? new Intl.DateTimeFormat('nl-NL', {
        dateStyle: 'short',
        timeStyle: 'short',
        timeZone: 'Europe/Amsterdam',
      }).format(new Date(value))
    : 'Nog niet';
export function LocalWorkbookSource({
  source,
  base,
  request,
  onUpdated,
}: {
  source: LocalWorkbookFileStatus;
  base: string;
  request: WorkbookRequest;
  onUpdated: () => Promise<void>;
}) {
  const [busy, setBusy] = useState(false),
    [error, setError] = useState('');
  async function refresh() {
    setBusy(true);
    setError('');
    try {
      await request(`${base}/workbooks/local-file`, {});
      await onUpdated();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Ophalen mislukt.');
    } finally {
      setBusy(false);
    }
  }
  return (
    <section
      className="panel report-panel"
      aria-label="Vast Healthplanner-bestand"
    >
      <span className="panel__eyebrow">Lokale bron · Automatische import</span>
      <h2>Vast Healthplanner-bestand</h2>
      <p style={{ overflowWrap: 'anywhere' }}>{source.path}</p>
      <p>
        Wordt bij het opstarten en daarna elke minuut gecontroleerd zolang COP
        draait. Alleen gewijzigde inhoud wordt opnieuw verwerkt.
        Rapportageperioden komen uit het bestand.
      </p>
      <p
        role={
          source.status === 'error' || source.status === 'rejected'
            ? 'alert'
            : 'status'
        }
      >
        {source.message}
      </p>
      <p>
        Laatste controle: {time(source.lastCheckedAt)} · Laatste succesvolle
        import: {time(source.lastImportedAt)}
      </p>
      <button
        type="button"
        className="button button--primary"
        disabled={busy}
        onClick={() => void refresh()}
      >
        {busy ? 'Ophalen…' : 'Nu ophalen'}
      </button>
      {error && <p role="alert">{error}</p>}
    </section>
  );
}
