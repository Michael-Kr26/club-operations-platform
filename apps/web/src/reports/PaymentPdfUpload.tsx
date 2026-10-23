import { useState } from 'react';
import type { ForecastDashboard } from '@cop/contracts';
import type { WorkbookRequest } from './WorkbookUpload';
export function PaymentPdfUpload({
  data,
  base,
  request,
  onImported,
}: {
  data: ForecastDashboard;
  base: string;
  request: WorkbookRequest;
  onImported: () => Promise<void>;
}) {
  const [file, setFile] = useState<File | null>(null),
    [inbox, setInbox] = useState(''),
    [location, setLocation] = useState(''),
    [from, setFrom] = useState(''),
    [through, setThrough] = useState(''),
    [confirmed, setConfirmed] = useState(false),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState('');
  const pending = (data.inbox?.files ?? []).filter((item) =>
    /\.pdf$/i.test(item.filename),
  );
  async function save() {
    setBusy(true);
    setMessage('');
    try {
      const metadata = {
        dataset: data.dataset,
        locationId: location,
        from,
        through,
        scopeConfirmed: confirmed,
        periodConfirmed: confirmed,
      };
      let result: { status: string; error?: string; duplicate?: boolean };
      if (inbox)
        result = await request(`${base}/workbooks/inbox/confirm-pdf`, {
          ...metadata,
          filename: inbox,
        });
      else {
        if (!file || file.size > 5000000)
          throw new Error('Kies een PDF van maximaal 5 MB.');
        const bytes = new Uint8Array(await file.arrayBuffer());
        let text = '';
        for (let i = 0; i < bytes.length; i += 8192)
          text += String.fromCharCode(...bytes.subarray(i, i + 8192));
        result = await request(`${base}/workbooks`, {
          ...metadata,
          filename: file.name,
          content: btoa(text),
        });
      }
      if (result.status !== 'accepted')
        throw new Error(result.error ?? 'PDF niet verwerkt.');
      await onImported();
      setMessage(
        result.duplicate
          ? 'PDF was al verwerkt; geen dubbeltelling.'
          : 'PDF verwerkt als betalingenoverzicht. Open het bronbestand hieronder om de bedragen te bekijken.',
      );
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : 'PDF-import mislukt.',
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <section
      id="payment-pdf-import"
      className="panel report-panel"
      aria-label="PAY. PDF import"
    >
      <span className="panel__eyebrow">Financiën · PDF</span>
      <h2>PAY. betalingenoverzicht importeren</h2>
      <p>
        Gebruik dit in plaats van de financiële CSV voor dit rapporttype. COP
        berekent positieve, negatieve en netto transactiebedragen. Het zijn
        betalingen; omzet, btw, mislukte incasso’s en dag-/weekdatums staan niet
        in dit rapport.
      </p>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          void save();
        }}
      >
        <fieldset disabled={busy} style={{ border: 0, padding: 0 }}>
          <div className="report-fields">
            <label>
              PDF uit de importmap
              <select
                aria-label="PDF uit importmap"
                value={inbox}
                onChange={(event) => {
                  setInbox(event.target.value);
                  setFile(null);
                  setConfirmed(false);
                }}
              >
                <option value="">Zelf een PDF kiezen</option>
                {pending.map((item) => (
                  <option key={item.filename} value={item.filename}>
                    {item.filename}
                  </option>
                ))}
              </select>
            </label>
            {!inbox && (
              <label>
                PDF-bestand
                <input
                  type="file"
                  accept=".pdf,application/pdf"
                  required
                  onChange={(event) => {
                    setFile(event.target.files?.[0] ?? null);
                    setConfirmed(false);
                  }}
                />
              </label>
            )}
            <label>
              Locatie
              <select
                required
                value={location}
                onChange={(event) => {
                  setLocation(event.target.value);
                  setConfirmed(false);
                }}
              >
                <option value="">Kies de juiste club</option>
                {data.organization.locations.map((loc) => (
                  <option key={loc.id} value={loc.id}>
                    {loc.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Vanaf (inclusief)
              <input
                required
                type="date"
                value={from}
                onChange={(event) => {
                  setFrom(event.target.value);
                  setConfirmed(false);
                }}
              />
            </label>
            <label>
              T/m (inclusief)
              <input
                required
                type="date"
                min={from || undefined}
                value={through}
                onChange={(event) => {
                  setThrough(event.target.value);
                  setConfirmed(false);
                }}
              />
            </label>
          </div>
          <p>
            De tabel vermeldt geen club of transactiedatums. Controleer de
            exportinstellingen: een bestandsnaam met 1 september als grens kan
            betekenen dat augustus is geselecteerd. Vul de werkelijke eerste en
            laatste inbegrepen dag in.
          </p>
          <label>
            <input
              type="checkbox"
              required
              checked={confirmed}
              onChange={(event) => setConfirmed(event.target.checked)}
            />{' '}
            Ik heb club en rapportageperiode gecontroleerd en bevestig deze
            toewijzing.
          </label>
          <p>
            <button
              type="submit"
              className="button button--primary"
              disabled={!confirmed || (!file && !inbox)}
            >
              {busy ? 'PDF verwerken…' : 'PDF importeren'}
            </button>
          </p>
          {inbox && (
            <p>
              De bevestiging geldt alleen voor deze bestandsinhoud. Een
              gewijzigde PDF vraagt opnieuw om controle.
            </p>
          )}
        </fieldset>
      </form>
      {message && <p role="status">{message}</p>}
    </section>
  );
}
