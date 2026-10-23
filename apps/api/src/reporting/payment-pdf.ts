import { Worker } from 'node:worker_threads';
import type { ReportOrganization, WorkbookSupplement } from '@cop/contracts';
import { dateOnly } from './calculation.js';
export type PaymentContext = {
  locationId?: string;
  scopeConfirmed?: boolean;
  from?: string;
  through?: string;
  periodConfirmed?: boolean;
};
export function paymentRows(pages: string[][]) {
  const rows: { reportId: string; amountCents: number }[] = [];
  const ids = new Set<string>();
  if (!pages.length || pages.length > 100)
    throw new Error('Ongeldig aantal PDF-pagina’s.');
  for (let index = 0; index < pages.length; index++) {
    const lines = pages[index]!;
    if (!lines.some((line) => /ReportId\s+Bedrag\s*\/\s*Aantal/i.test(line)))
      throw new Error('Dit is geen ondersteund PAY.-transactieoverzicht.');
    if (
      !lines.some((line) =>
        new RegExp(
          `Pagina:\\s*${index + 1}\\s+van\\s+${pages.length}\\b`,
          'i',
        ).test(line),
      )
    )
      throw new Error('Paginanummering ontbreekt of is onvolledig.');
    let count = 0;
    for (const line of lines) {
      const match =
        /^(RT-\d{4}-\d{4}-\d{4})\s+€\s*(-?\s*(?:\d{1,3}(?:\.\d{3})*|\d+),\d{2})$/.exec(
          line,
        );
      if (!match) {
        if (/^RT-|€/.test(line))
          throw new Error('Transactieregel is niet volledig leesbaar.');
        continue;
      }
      if (ids.has(match[1]!))
        throw new Error(
          'Dubbele ReportId in de PDF; controleer het bronbestand.',
        );
      ids.add(match[1]!);
      const amount = match[2]!.replace(/\s|\./g, '').replace(',', '');
      const amountCents = Number(amount);
      if (
        !Number.isSafeInteger(amountCents) ||
        Math.abs(amountCents) > 1000000000
      )
        throw new Error('Ongeldig bedrag in PDF.');
      rows.push({ reportId: match[1]!, amountCents });
      count++;
    }
    if (!count || rows.length > 10000)
      throw new Error('Geen leesbare transacties of te veel regels.');
  }
  return rows;
}
async function readPages(bytes: Buffer): Promise<string[][]> {
  if (
    !bytes.subarray(0, 5).equals(Buffer.from('%PDF-')) ||
    bytes.length > 5000000
  )
    throw new Error('Gebruik een PDF van maximaal 5 MB.');
  return new Promise((resolve, reject) => {
    const worker = new Worker(
      new URL('../../scripts/payment-pdf-worker.mjs', import.meta.url),
      {
        workerData: new Uint8Array(bytes),
        execArgv: [],
        resourceLimits: { maxOldGenerationSizeMb: 256 },
      },
    );
    const timeout = setTimeout(() => {
      void worker.terminate();
      reject(
        new Error(
          'PDF-verwerking duurt te lang. Gebruik een kleiner origineel tekst-PDF.',
        ),
      );
    }, 20000);
    worker.once(
      'message',
      (result: { pages?: string[][]; error?: boolean }) => {
        clearTimeout(timeout);
        void worker.terminate();
        if (result.pages) resolve(result.pages);
        else
          reject(
            new Error(
              'PDF niet leesbaar. Gebruik het originele PAY.-transactieoverzicht; scans en beveiligde PDF’s worden niet ondersteund.',
            ),
          );
      },
    );
    worker.once('error', () => {
      clearTimeout(timeout);
      reject(new Error('PDF-verwerking mislukt.'));
    });
    worker.once('exit', () => {
      clearTimeout(timeout);
      reject(new Error('PDF-verwerking onderbroken.'));
    });
  });
}
export async function parsePaymentPdf(
  bytes: Buffer,
  org: ReportOrganization,
  context: PaymentContext,
): Promise<WorkbookSupplement> {
  if (
    context.scopeConfirmed !== true ||
    !org.locations.some((loc) => loc.id === context.locationId)
  )
    throw new Error('Kies en bevestig de club voor deze PDF.');
  if (context.periodConfirmed !== true || !context.from || !context.through)
    throw new Error(
      'Bevestig de werkelijke rapportageperiode; de PDF noemt geen datums per transactie.',
    );
  const from = dateOnly(context.from),
    through = dateOnly(context.through);
  if (from > through) throw new Error('Einddatum ligt vóór de begindatum.');
  const transactions = paymentRows(await readPages(bytes));
  const positive = transactions.filter((row) => row.amountCents > 0),
    negative = transactions.filter((row) => row.amountCents < 0);
  const sum = (rows: typeof transactions) =>
    rows.reduce((total, row) => total + row.amountCents, 0);
  const net = sum(transactions);
  if (!Number.isSafeInteger(net))
    throw new Error('Totaalbedrag buiten bereik.');
  return {
    kind: 'payments',
    locationIds: [context.locationId!],
    period: `${from} t/m ${through}`,
    rows: [],
    paymentTransactions: transactions,
    cards: [
      {
        label: 'Positieve transactiebedragen',
        value: sum(positive),
        format: 'money',
      },
      {
        label: 'Negatieve transactiebedragen',
        value: sum(negative),
        format: 'money',
      },
      { label: 'Netto transactiebedrag', value: net, format: 'money' },
      { label: 'Transactieregels', value: transactions.length },
    ],
    categories: [
      {
        name: 'Positieve transacties',
        amountCents: sum(positive),
        count: positive.length,
      },
      {
        name: 'Negatieve transacties',
        amountCents: sum(negative),
        count: negative.length,
      },
    ],
    warnings: [
      'PAY.-transactieoverzicht: betalingen, geen bewijs van geboekte omzet of btw. Negatieve bedragen zijn broncorrecties/terugbetalingen; de PDF vermeldt geen reden of betaalstatus.',
      'Club en periode zijn door de gebruiker bevestigd. De PDF bevat geen datums per transactie: geen dag/weektoerekening en geen automatische weekmaildekking.',
      'Het netto bedrag is de berekende som van alle leesbare regels. De bron heeft geen leesbaar numeriek eindtotaal voor een onafhankelijke totaalcontrole.',
      'Overlappende overzichten mogen niet worden opgeteld. Dit overzicht blijft een afzonderlijke bron; ReportId wordt alleen binnen dit document op dubbelen gecontroleerd.',
    ],
  };
}
