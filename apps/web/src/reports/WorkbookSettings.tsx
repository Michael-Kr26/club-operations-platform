import { ImportFolders } from './ImportFolders';
import { useState } from 'react';
import type { ForecastDashboard, WorkbookPreferences } from '@cop/contracts';
import type { WorkbookRequest } from './WorkbookUpload';
export function WorkbookSettings({
  data,
  base,
  request,
  onSaved,
}: {
  data: ForecastDashboard;
  base: string;
  request: WorkbookRequest;
  onSaved: () => Promise<void>;
}) {
  const preferences = data.preferences!;
  const [values, setValues] = useState(preferences.thresholds),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState('');
  async function save(forgetFilename?: string, inboxEnabled?: boolean) {
    setBusy(true);
    setMessage('');
    try {
      const result = await request<WorkbookPreferences>(
        `${base}/workbooks/preferences`,
        {
          dataset: data.dataset,
          ...(typeof inboxEnabled === 'boolean'
            ? { inboxEnabled }
            : forgetFilename
              ? { forgetFilename }
              : { thresholds: values }),
        },
      );
      setValues(result.thresholds);
      await onSaved();
      setMessage(
        typeof inboxEnabled === 'boolean'
          ? 'Mapimport bijgewerkt.'
          : forgetFilename
            ? 'Toewijzing vergeten.'
            : 'Signaleringsgrenzen opgeslagen.',
      );
    } catch (error) {
      setMessage((error as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function scan() {
    setBusy(true);
    setMessage('');
    try {
      await request(`${base}/workbooks/inbox`, { dataset: data.dataset });
      await onSaved();
      setMessage('Importmap gecontroleerd.');
    } catch (error) {
      setMessage((error as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <details
      id="workbook-settings"
      className="panel report-panel workbook-settings"
    >
      <summary>Importmap, signaleringsgrenzen en clubtoewijzingen</summary>
      <p>
        Gelden voor deze organisatie en dataset. Dit zijn instelbare signalen;
        ze bepalen geen definitieve bedrijfsregels of automatische acties.
      </p>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void save();
        }}
      >
        <div className="report-fields">
          <label>
            Signaal vanaf % zonder afspraak
            <input
              aria-label="Grens zonder afspraak"
              type="number"
              min="0"
              max="100"
              step="0.1"
              required
              value={values.withoutAppointmentPercent}
              onChange={(e) =>
                setValues({
                  ...values,
                  withoutAppointmentPercent: Number(e.target.value),
                })
              }
            />
          </label>
          <label>
            Stijging zonder afspraak vanaf %
            <input
              aria-label="Grens stijging"
              type="number"
              min="0.1"
              max="1000"
              step="0.1"
              required
              value={values.increasePercent}
              onChange={(e) =>
                setValues({
                  ...values,
                  increasePercent: Number(e.target.value),
                })
              }
            />
          </label>
          <label>
            Extra dagen speling op bronverversing
            <input
              type="number"
              min="1"
              max="90"
              step="1"
              required
              value={values.staleDays}
              onChange={(e) =>
                setValues({ ...values, staleDays: Number(e.target.value) })
              }
            />
          </label>
        </div>
        <button className="button" disabled={busy}>
          Grenswaarden opslaan
        </button>
      </form>
      <h3>Onthouden toewijzingen</h3>
      {Object.entries(preferences.mappings).map(([name, mapping]) => (
        <div key={name} className="workbook-toolbar">
          <p>
            {name} →{' '}
            {data.organization.locations.find(
              (l) => l.id === mapping.locationId,
            )?.name ?? 'Locatie niet meer beschikbaar'}{' '}
            ({mapping.kind === 'members' ? 'Ledenexport' : 'Omzet'})
          </p>
          <button
            className="button"
            disabled={busy}
            onClick={() => void save(name)}
          >
            Vergeten
          </button>
        </div>
      ))}
      {!Object.keys(preferences.mappings).length && (
        <p>Nog geen toewijzingen onthouden. Bevestig ze bij een import.</p>
      )}
      <h3>Vaste lokale importmap</h3>
      {data.inbox?.available ? (
        <>
          <ImportFolders root={data.inbox.path} />
          <p>
            COP controleert deze map ongeveer elke 30 seconden zolang het
            programma draait. Originelen blijven in de map. Inschakelen staat
            toe dat eerder bevestigde clubtoewijzingen voor hetzelfde formaat
            automatisch worden hergebruikt. Nieuwe peildatums worden niet
            geraden.
          </p>
          <p>
            Mist een export een club of peildatum? Gebruik daarvoor de
            uploadcontrole hierboven.
          </p>
          <button
            type="button"
            className="button"
            disabled={busy}
            onClick={() => void save(undefined, !data.inbox?.enabled)}
          >
            {data.inbox.enabled
              ? 'Automatische mapimport uitschakelen'
              : 'Automatische mapimport inschakelen'}
          </button>
          {data.inbox.enabled && (
            <button
              type="button"
              className="button"
              disabled={busy}
              onClick={() => void scan()}
            >
              Map nu controleren
            </button>
          )}
          <p>
            Laatste controle:{' '}
            {data.inbox.lastScan
              ? new Date(data.inbox.lastScan).toLocaleString('nl-NL')
              : 'Nog niet gecontroleerd'}
            .
          </p>
          {data.inbox.error && <p role="alert">{data.inbox.error}</p>}
          {data.inbox.files.map((f) => (
            <p key={f.filename}>
              <strong>{f.filename}</strong> ·{' '}
              {f.status === 'accepted'
                ? 'Verwerkt'
                : f.status === 'partial'
                  ? 'Gedeeltelijk verwerkt'
                  : 'Aandacht nodig'}
              : {f.message}
            </p>
          ))}
        </>
      ) : (
        <p>Beschikbaar bij de lokale start met pnpm.cmd dev:local.</p>
      )}
      {message && <p role="status">{message}</p>}
    </details>
  );
}
