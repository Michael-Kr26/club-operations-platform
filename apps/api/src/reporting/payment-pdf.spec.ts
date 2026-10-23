import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { mkdtemp, mkdir, rm, writeFile, utimes } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { Pool } from 'pg';
import type { Principal } from '@cop/contracts';
import { startLocalDatabase } from '../../scripts/local-database.mjs';
import { ReportStore, sportSociety } from './store.js';
import { WorkbookImports } from './workbook-imports.js';
import { WorkbookInbox } from './workbook-inbox.js';
import { parsePaymentPdf, paymentRows } from './payment-pdf.js';
import { paymentPdfFixture } from './payment-pdf-fixture.js';
import { dataCatalog } from './data-catalog.js';
const header = 'ReportId Bedrag / Aantal',
  footer = 'Pagina: 1 van 1';
const principal: Principal = {
  userId: 'fixture',
  organizationId: 'sport-society',
  locations: null,
  permissions: ['reports.read', 'reports.manage'],
};
const context = {
  locationId: 'achterveld',
  scopeConfirmed: true,
  from: '2026-08-01',
  through: '2026-08-31',
  periodConfirmed: true,
};
let directory: string,
  database: Awaited<ReturnType<typeof startLocalDatabase>>,
  pool: Pool,
  imports: WorkbookImports;
beforeAll(async () => {
  directory = await mkdtemp(join(tmpdir(), 'cop-paypdf-'));
  database = await startLocalDatabase(directory, { port: 0 });
  pool = new Pool({ connectionString: database.connectionString });
  await new ReportStore(pool).seed();
  imports = new WorkbookImports(pool);
}, 60000);
afterAll(async () => {
  await pool?.end();
  await database?.close();
  if (directory) await rm(directory, { recursive: true, force: true });
});
describe('PAY.-betalingen uit PDF', () => {
  it('rekent in centen, inclusief negatieve en nulbedragen', () => {
    expect(
      paymentRows([
        [
          header,
          'RT-0001-0001-0001 € 1.234,56',
          'RT-0002-0002-0002 € -2,50',
          'RT-0003-0003-0003 € 0,00',
          footer,
        ],
      ]).map((row) => row.amountCents),
    ).toEqual([123456, -250, 0]);
    expect(() =>
      paymentRows([
        [
          header,
          'RT-0001-0001-0001 € 2,00',
          'RT-0001-0001-0001 € 2,00',
          footer,
        ],
      ]),
    ).toThrow('Dubbele');
    expect(() =>
      paymentRows([[header, 'RT-0001-0001-0001 € ?', footer]]),
    ).toThrow('volledig');
    expect(() => paymentRows([[header, 'RT-0001-0001-0001 € 2,00']])).toThrow(
      'Paginanummering',
    );
  });
  it('leest een echte tekst-PDF en vereist bevestigde club en periode', async () => {
    await expect(
      parsePaymentPdf(paymentPdfFixture(), sportSociety, {}),
    ).rejects.toThrow('club');
    await expect(
      parsePaymentPdf(paymentPdfFixture(), sportSociety, {
        locationId: 'achterveld',
        scopeConfirmed: true,
      }),
    ).rejects.toThrow('periode');
    const report = await parsePaymentPdf(
      paymentPdfFixture(),
      sportSociety,
      context,
    );
    expect(report.kind).toBe('payments');
    expect(report.rows).toEqual([]);
    expect(
      report.cards.find((card) => card.label === 'Netto transactiebedrag')
        ?.value,
    ).toBe(1000);
    expect(report.paymentTransactions).toHaveLength(2);
  });
  it('bewaart PDF-originelen, isoleert clubs/demo en telt niet als omzet of weekdekking', async () => {
    const body = {
      ...context,
      dataset: 'demo' as const,
      filename: 'transacties.pdf',
      content: paymentPdfFixture().toString('base64'),
    };
    const first = await imports.import(sportSociety, principal, body);
    expect(first.status).toBe('accepted');
    expect(
      (await imports.import(sportSociety, principal, body)).duplicate,
    ).toBe(true);
    expect(
      (await imports.original(sportSociety.id, first.id)).original,
    ).toEqual(paymentPdfFixture());
    expect(await imports.list(principal, 'real')).toEqual([]);
    expect(
      await imports.list({ ...principal, locations: ['barneveld'] }, 'demo'),
    ).toEqual([]);
    const catalog = dataCatalog(
      sportSociety,
      'demo',
      await imports.list(principal, 'demo'),
      [],
    );
    expect(
      catalog.entries.find((entry) => entry.id === 'finance-pdf')?.locations[0]
        ?.status,
    ).toBe('received');
    expect(
      catalog.entries.find((entry) => entry.id === 'revenue')?.status,
    ).toBe('missing');
  });
  it('bevestigt een gevonden PDF en hergebruikt de periode niet bij gewijzigde inhoud', async () => {
    const inbox = new WorkbookInbox(directory, imports, true);
    await imports.preferences.inbox(sportSociety.id, 'demo', 'fixture', true);
    await inbox.enable(sportSociety.id, 'demo');
    const filename = 'Omzet/Achterveld/test.pdf',
      path = join(inbox.path(sportSociety.id, 'demo'), filename);
    await mkdir(join(path, '..'), { recursive: true });
    await writeFile(path, paymentPdfFixture());
    await utimes(path, new Date(0), new Date(0));
    const now = new Date();
    await inbox.scan(sportSociety, 'demo', now);
    expect(inbox.status(sportSociety.id, 'demo', true).files[0]?.status).toBe(
      'rejected',
    );
    await expect(
      inbox.confirmPdf(
        sportSociety,
        { ...principal, locations: ['achterveld'] },
        { ...context, dataset: 'demo', filename },
      ),
    ).rejects.toThrow('toegang');
    await expect(
      inbox.confirmPdf(sportSociety, principal, {
        ...context,
        dataset: 'demo',
        filename: '../outside.pdf',
      }),
    ).rejects.toThrow();
    await inbox.confirmPdf(sportSociety, principal, {
      ...context,
      dataset: 'demo',
      filename,
    });
    await writeFile(
      path,
      Buffer.concat([paymentPdfFixture(), Buffer.from('\n%modified')]),
    );
    await utimes(path, new Date(0), new Date(0));
    // The newly written sidecar must settle before the scanner reads it.
    await utimes(path + '.cop.json', new Date(0), new Date(0));
    await inbox.scan(sportSociety, 'demo', new Date(now.getTime() + 60000));
    expect(
      inbox.status(sportSociety.id, 'demo', true).files[0]?.message,
    ).toContain('gewijzigd');
  });
});
