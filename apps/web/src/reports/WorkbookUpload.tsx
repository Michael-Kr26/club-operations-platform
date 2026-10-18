import { useState } from 'react';
import type { ForecastDashboard, WorkbookPreview } from '@cop/contracts';

type Context = { locationId?: string; asOf?: string };
export type WorkbookRequest = <T>(path: string, body?: unknown) => Promise<T>;
const kinds = {
  members: 'Dewi ledenexport',
  finance: 'Omzet',
  forecast: 'Dewi forecast',
  healthplanner: 'Healthplanner',
};
export function WorkbookUpload({
  data,
  base,
  request,
  onImported,
}: {
  data: ForecastDashboard;
  base: string;
  request: WorkbookRequest;
  onImported: (id?: string) => Promise<void>;
}) {
  const [file, setFile] = useState<File | null>(null),
    [source, setSource] = useState<{
      filename: string;
      content: string;
    } | null>(null);
  const [contexts, setContexts] = useState<Record<string, Context>>({}),
    [preview, setPreview] = useState<WorkbookPreview[] | null>(null);
  const [reviewed, setReviewed] = useState(false),
    [confirmed, setConfirmed] = useState(false),
    [remember, setRemember] = useState(true),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState('');
  const ready = preview?.filter((p) => p.status === 'ready') ?? [];
  const needsConfirmation = ready.some(
    (p) => p.kind === 'members' || p.kind === 'finance',
  );
  const body = (input: { filename: string; content: string }) => ({
    ...input,
    dataset: data.dataset,
    rememberMapping: remember,
    fileContexts: Object.fromEntries(
      Object.entries(contexts).map(([name, c]) => [
        name,
        { ...c, scopeConfirmed: confirmed },
      ]),
    ),
  });
  const changeContext = (name: string, value: Context) => {
    setContexts({ ...contexts, [name]: value });
    setReviewed(false);
    setConfirmed(false);
  };
  async function inspect() {
    setBusy(true);
    setMessage('');
    setReviewed(false);
    try {
      if (!file) throw new Error('Kies een ZIP-, XLSX- of EML-bestand.');
      if (file.size > (/\.zip$/i.test(file.name) ? 20_000_000 : 5_000_000))
        throw new Error('Maximaal 20 MB ZIP en 5 MB per bronbestand.');
      const input = source ?? {
        filename: file.name,
        content: await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(String(reader.result).split(',')[1]!);
          reader.onerror = () => reject(new Error('Bestand lezen mislukt.'));
          reader.readAsDataURL(file);
        }),
      };
      setSource(input);
      const results = await request<WorkbookPreview[]>(
        `${base}/workbooks/preview`,
        body(input),
      );
      setPreview(results);
      const proposals = { ...contexts };
      for (const r of results)
        if (r.kind === 'members' || r.kind === 'finance')
          proposals[r.filename] = {
            locationId: r.locationId ?? '',
            asOf: r.asOf ?? '',
          };
      setContexts(proposals);
      setReviewed(true);
      setMessage(
        `${results.filter((r) => r.status === 'ready').length}/${results.length} bestanden klaar. Er is nog niets geïmporteerd.`,
      );
    } catch (error) {
      setMessage((error as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function commit() {
    if (
      !source ||
      !reviewed ||
      !ready.length ||
      (needsConfirmation && !confirmed)
    )
      return;
    setBusy(true);
    setMessage('');
    try {
      const isZip = /\.zip$/i.test(source.filename);
      // A standalone file uses the same explicit context as its preview.
      const context = contexts[source.filename];
      const result = await request<{
        id: string;
        status?: string;
        error?: string;
        duplicate?: boolean;
        summary?: string;
        results?: { filename: string; status: string; error: string | null }[];
      }>(`${base}/workbooks${isZip ? '/zip' : ''}`, {
        ...body(source),
        ...(!isZip ? { ...context, scopeConfirmed: confirmed } : {}),
      });
      if (result.status === 'rejected')
        throw new Error(result.error ?? 'Import afgewezen.');
      await onImported(isZip ? undefined : result.id);
      setMessage(
        result.summary ??
          (result.duplicate
            ? 'Al bekend; niets dubbel geteld.'
            : 'Import verwerkt. Het dashboard is bijgewerkt.'),
      );
      if (result.results)
        setMessage(
          `${result.summary} ${result.results
            .filter((r) => r.status === 'rejected')
            .map((r) => `${r.filename}: ${r.error}`)
            .join(' ')}`,
        );
      setReviewed(false);
    } catch (error) {
      setMessage((error as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="panel report-panel workbook-upload">
      <h2>Alles in één ZIP uploaden</h2>
      <p>
        Eerst controleren, daarna verwerken. Maximaal 20 MB ZIP, 50 bestanden en
        5 MB per bronbestand. XLSX en Healthplanner-mails (.eml) worden herkend;
        losse bestanden kunnen ook.
      </p>
      <label>
        ZIP, Excel of managementmail
        <input
          type="file"
          accept=".zip,.xlsx,.eml"
          disabled={busy}
          onChange={(e) => {
            setFile(e.target.files?.[0] ?? null);
            setSource(null);
            setContexts({});
            setPreview(null);
            setReviewed(false);
            setConfirmed(false);
            setMessage('');
          }}
        />
      </label>
      {preview && (
        <div className="workbook-upload-results">
          <h3>Controle vóór verwerking</h3>
          {preview.map((r) => (
            <article className="panel report-panel" key={r.filename}>
              <strong>{r.filename}</strong>
              <p>
                {r.kind ? kinds[r.kind] : 'Onbekend formaat'} ·{' '}
                {r.status === 'ready'
                  ? 'Klaar voor verwerking'
                  : r.status === 'needs-context'
                    ? 'Toewijzing nodig'
                    : 'Controle mislukt'}
              </p>
              {r.error && <p>{r.error}</p>}
              {r.suggested && (
                <p className="report-notice">
                  Onthouden locatie voorgesteld. Controleer of dit bestand nog
                  bij dezelfde club hoort.
                </p>
              )}
              {(r.kind === 'members' || r.kind === 'finance') && (
                <div className="report-fields">
                  <label>
                    Locatie voor {r.filename}
                    <select
                      disabled={busy}
                      value={contexts[r.filename]?.locationId ?? ''}
                      onChange={(e) =>
                        changeContext(r.filename, {
                          ...contexts[r.filename],
                          locationId: e.target.value,
                        })
                      }
                    >
                      <option value="">Kies de juiste club</option>
                      {data.organization.locations.map((l) => (
                        <option key={l.id} value={l.id}>
                          {l.name}
                        </option>
                      ))}
                    </select>
                  </label>
                  {r.kind === 'members' && (
                    <label>
                      Peildatum van {r.filename}
                      <input
                        disabled={busy}
                        type="date"
                        value={contexts[r.filename]?.asOf ?? ''}
                        onChange={(e) =>
                          changeContext(r.filename, {
                            ...contexts[r.filename],
                            asOf: e.target.value,
                          })
                        }
                      />
                    </label>
                  )}
                </div>
              )}
              <details>
                <summary>Brondefinities ({r.warnings.length})</summary>
                <ul>
                  {r.warnings.map((w) => (
                    <li key={w}>{w}</li>
                  ))}
                </ul>
              </details>
            </article>
          ))}
        </div>
      )}
      <div className="workbook-upload-actions">
        <button
          type="button"
          className="button"
          disabled={!file || busy}
          onClick={() => void inspect()}
        >
          {busy
            ? 'Bezig…'
            : preview
              ? 'Opnieuw controleren'
              : 'Bestanden controleren'}
        </button>
        {preview && (
          <>
            <label className="report-check">
              <input
                type="checkbox"
                disabled={busy}
                checked={remember}
                onChange={(e) => setRemember(e.target.checked)}
              />
              Bevestigde clubtoewijzingen onthouden voor dezelfde bestandsnaam
              en hetzelfde formaat. Peildatums worden nooit onthouden.
            </label>
            {needsConfirmation && (
              <label className="report-check">
                <input
                  type="checkbox"
                  disabled={busy}
                  checked={confirmed}
                  onChange={(e) => setConfirmed(e.target.checked)}
                />
                Ik bevestig de getoonde clubs en werkelijke peildatums.
              </label>
            )}
            <p>
              Bestanden met fouten worden bij verwerking afgewezen en bewaard in
              de historie; geldige bestanden worden verwerkt.
            </p>
            <button
              type="button"
              className="button button--primary"
              disabled={
                busy ||
                !reviewed ||
                !ready.length ||
                (needsConfirmation && !confirmed)
              }
              onClick={() => void commit()}
            >
              Verwerk {ready.length} geldige bestanden
            </button>
          </>
        )}
      </div>
      {message && <p role="status">{message}</p>}
    </section>
  );
}
