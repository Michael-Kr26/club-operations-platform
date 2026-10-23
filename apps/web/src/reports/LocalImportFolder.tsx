import { useState } from 'react';
import type { WorkbookInboxStatus } from '@cop/contracts';
import type { WorkbookRequest } from './WorkbookUpload';
export function LocalImportFolder({
  inbox,
  base,
  request,
  onUpdated,
}: {
  inbox: WorkbookInboxStatus;
  base: string;
  request: WorkbookRequest;
  onUpdated: () => Promise<void>;
}) {
  const [busy, setBusy] = useState(false),
    [message, setMessage] = useState('');
  async function scan() {
    setBusy(true);
    setMessage('');
    try {
      await request(`${base}/workbooks/inbox`, { dataset: 'real' });
      await onUpdated();
      setMessage('Importmap gecontroleerd.');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Controle mislukt.');
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="panel report-panel" aria-label="Automatische importmap">
      <span className="panel__eyebrow">Dewi & Healthplanner</span>
      <h2>Downloaden → opslaan → dashboard</h2>
      <p>
        Sla ondersteunde XLSX-, EML-, PAY.-PDF- of ZIP-rapportages op in deze
        map of in submappen zoals Omzet/Achterveld. COP controleert de map
        ongeveer elke 30 seconden zolang het draait en bewaart de originelen.
      </p>
      <p style={{ overflowWrap: 'anywhere' }}>
        <code>{inbox.path}</code>
      </p>
      <p>
        {inbox.enabled
          ? 'Automatische mapimport staat aan.'
          : 'Automatische mapimport staat uit. Je kunt deze onder Importinstellingen inschakelen.'}
      </p>
      <p>
        Herkenbare clubs en perioden worden overgenomen. Ontbreekt de club of
        peildatum? Bevestig die bij de uploadcontrole; COP raadt ze niet. Oude
        XLS-bestanden en willekeurige CSV-indelingen worden hier nog niet
        verwerkt.
      </p>
      {inbox.enabled && (
        <button
          type="button"
          className="button"
          disabled={busy}
          onClick={() => void scan()}
        >
          {busy ? 'Controleren…' : 'Map nu controleren'}
        </button>
      )}
      <p>
        <a href="#workbook-settings">Importinstellingen en bestandsstatus</a>
      </p>
      {inbox.error && <p role="alert">{inbox.error}</p>}
      {message && <p role="status">{message}</p>}
    </section>
  );
}
