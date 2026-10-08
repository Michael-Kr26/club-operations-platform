import { describe, expect, it, vi, afterEach } from 'vitest';
import type { StoredImport } from '@cop/contracts';
import {
  parseHealthplannerMail,
  HP_SENDER,
  HP_SUBJECT,
} from './healthplanner-mail.js';
import { sportSociety, defaultSettings } from './store.js';
import { calculateReport } from './calculation.js';
import { canDeliverReport, dueRuns } from './delivery.js';
import { collectOutlookMails, outlookSlot } from './outlook-source.js';

const labels = [
  'Aantal verkochte lidmaatschappen',
  'Totaal aantal potentiële klanten',
  'Aantal afgeronde afspraken',
  'Actieve leden',
  'Slapende leden',
  'Aantal opzeggingen',
  'Aantal leden zonder een afspraak in de toekomst',
];
const order = ['Wekerom', 'Achterveld', 'Harskamp', 'Voorthuizen', 'Barneveld'];
function mail({
  date = 'Wed, 07 Oct 2026 06:33:07 +0000',
  heading = 'Woensdag 7 Oktober',
  names = order,
  omit = '',
  sender = HP_SENDER,
  encoding = 'base64',
  joined = false,
} = {}) {
  const table = (ls: string[]) =>
    `<table><tr><th></th>${names.map((n) => `<th colspan="2">Sport Society ${n}</th>`).join('')}</tr><tr><td>${ls.includes(labels[0]!) ? 'Verkoop' : 'Ledenbehoud'}</td>${names.map(() => '<td>Gisteren</td><td>Maand</td>').join('')}</tr>${ls
      .filter((l) => l !== omit)
      .map(
        (l, i) =>
          `<tr><td>${l}</td>${names.map((_, j) => `<td>${i + j + 1}</td><td>${100 + i + j}</td>`).join('')}</tr>`,
      )
      .join('')}</table>`;
  const html = `<h2>${heading}</h2>${table(labels.slice(0, 2)).replace('</table>', `<tr><th></th>${names.map((n) => `<th colspan="2">Sport Society ${n}</th>`).join('')}</tr></table>`)}${table(labels.slice(2))}`;
  const body = joined ? html.replace('</table><table>', '') : html;
  return Buffer.from(
    `From: ${sender}\r\nSubject: ${HP_SUBJECT}\r\nDate: ${date}\r\nMIME-Version: 1.0\r\nContent-Type: text/html; charset=utf-8\r\nContent-Transfer-Encoding: ${encoding}\r\n\r\n${encoding === 'base64' ? Buffer.from(body).toString('base64') : body.replaceAll('=', '=3D')}`,
  );
}
const settings = {
  ...defaultSettings,
  rulesApproved: true,
  recipients: ['test@example.com'],
  allowPartialDaily: true,
};
async function stored(bytes = mail(), id = 'one'): Promise<StoredImport> {
  const p = await parseHealthplannerMail(bytes, sportSociety);
  return {
    ...p.meta,
    rows: p.rows,
    id,
    importedAt: '2026-10-07T06:34:00Z',
    filename: 'test.eml',
    hash: id,
    status: 'accepted',
    error: null,
  };
}
afterEach(() => vi.unstubAllGlobals());
describe('Healthplanner dagelijkse bronmail', () => {
  it('haalt op vanaf 08:35 met begrensde retries en Amsterdam zomer/wintertijd', () => {
    expect(outlookSlot(new Date('2026-10-08T06:33:00Z'))).toBeNull();
    expect(outlookSlot(new Date('2026-10-08T06:35:00Z'))?.slot).toBe('08:35');
    expect(outlookSlot(new Date('2026-10-08T06:41:00Z'))?.slot).toBe('08:41');
    expect(outlookSlot(new Date('2026-10-08T06:45:00Z'))).toBeNull();
    expect(outlookSlot(new Date('2026-12-08T07:35:00Z'))?.slot).toBe('08:35');
  });
  it('leest MIME en matcht clubs op kop, niet op vaste positie; bewaart maandwaarden zonder conversies of churn te verzinnen', async () => {
    const p = await parseHealthplannerMail(mail(), sportSociety);
    expect(p.meta.from).toBe('2026-10-06');
    expect(
      p.rows.find((r) => r.locationId === 'barneveld')?.soldMemberships,
    ).toBe(5);
    expect(p.rows[0]?.converted).toBeNull();
    expect(
      p.rows[0]?.managementMail?.values['aantal verkochte lidmaatschappen']
        ?.month,
    ).toBe('101');
    expect(p.rows[0]?.managementMail?.monthPeriodUnconfirmed).toBe(true);
  });
  it('ondersteunt de werkelijke enkele tabel met herhaalde koppen en twee secties', async () => {
    const p = await parseHealthplannerMail(
      mail({ joined: true }),
      sportSociety,
    );
    expect(p.rows).toHaveLength(5);
    expect(p.rows[0]?.soldMemberships).toBe(2);
  });
  it('leest quoted-printable en bepaalt gisteren correct rond jaargrens', async () => {
    const p = await parseHealthplannerMail(
      mail({
        date: 'Fri, 01 Jan 2027 07:33:00 +0000',
        heading: 'Vrijdag 1 Januari',
        encoding: 'quoted-printable',
      }),
      sportSociety,
    );
    expect(p.meta.from).toBe('2026-12-31');
  });
  it('weigert ontbrekende regels, verkeerde tenant, dubbele clubs en afwijkende datum', async () => {
    await expect(
      parseHealthplannerMail(mail({ omit: labels[0] }), sportSociety),
    ).rejects.toThrow('Verplichte');
    await expect(
      parseHealthplannerMail(mail(), {
        ...sportSociety,
        name: 'Andere organisatie',
      }),
    ).rejects.toThrow('organisatie');
    await expect(
      parseHealthplannerMail(
        mail({ names: ['Wekerom', 'Wekerom', ...order.slice(2)] }),
        sportSociety,
      ),
    ).rejects.toThrow('dubbele');
    await expect(
      parseHealthplannerMail(
        mail({ heading: 'Dinsdag 6 Oktober' }),
        sportSociety,
      ),
    ).rejects.toThrow('Datum');
    await expect(
      parseHealthplannerMail(
        mail({ sender: 'other@example.com' }),
        sportSociety,
      ),
    ).rejects.toThrow('Afzender');
  });
  it('staat alleen expliciet toegestane dagmail toe bij complete HP-bron en ontbrekende Dewi; nooit maandelijkse churn of ontbrekende HP', async () => {
    const file = await stored();
    const r = calculateReport(
      sportSociety,
      [file],
      'real',
      'daily',
      '2026-10-06',
      settings,
      new Date('2026-10-07T06:45:00Z'),
    );
    expect(r.total.soldMemberships).toBe(15);
    expect(r.total.conversion).toBeNull();
    expect(r.total.active).toBeNull();
    expect(canDeliverReport(r, settings)).toBe(true);
    expect(canDeliverReport(r, { ...settings, allowPartialDaily: false })).toBe(
      false,
    );
    expect(canDeliverReport({ ...r, kind: 'monthly' }, settings)).toBe(false);
    expect(
      canDeliverReport(
        {
          ...r,
          sources: r.sources.map((s) =>
            s.source === 'healthplanner' ? { ...s, status: 'invalid' } : s,
          ),
        },
        settings,
      ),
    ).toBe(false);
    expect(
      dueRuns(new Date('2026-10-07T06:44:00Z'), '08:45').some((r) => !r.missed),
    ).toBe(false);
    expect(
      dueRuns(new Date('2026-10-07T06:45:00Z'), '08:45').find((r) => !r.missed)
        ?.date,
    ).toBe('2026-10-06');
  });
  it('combineert volledige dagimports zonder overlap en houdt een ontbrekende dag onbekend', async () => {
    const org = { ...sportSociety, locations: [sportSociety.locations[0]!] };
    const f = await stored();
    const row = f.rows[0]!;
    const files = Array.from({ length: 31 }, (_, i) => ({
      ...f,
      id: `day-${i}`,
      from: `2026-10-${String(i + 1).padStart(2, '0')}`,
      through: `2026-10-${String(i + 1).padStart(2, '0')}`,
      rows: [{ ...row, date: `2026-10-${String(i + 1).padStart(2, '0')}` }],
    }));
    const r = calculateReport(
      org,
      [...files, files[0]!],
      'real',
      'monthly',
      '2026-10-01',
      settings,
      new Date('2026-11-01T07:45:00Z'),
    );
    expect(r.clubs[0]?.metrics.soldMemberships).toBe(62);
    expect(
      calculateReport(
        org,
        files.slice(1),
        'real',
        'monthly',
        '2026-10-01',
        settings,
      ).clubs[0]?.metrics.soldMemberships,
    ).toBeNull();
  });
  it('haalt alleen exacte rapportmails als MIME op, verwerkt duplicaten en weigert externe pagineringslinks', async () => {
    const save = vi.fn().mockResolvedValue(true);
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(Response.json({ access_token: 'private-token' }))
      .mockResolvedValueOnce(
        Response.json({
          value: [
            {
              id: 'hp',
              subject: HP_SUBJECT,
              from: { emailAddress: { address: HP_SENDER } },
            },
            { id: 'other', subject: 'other' },
          ],
        }),
      )
      .mockResolvedValueOnce(new Response(mail()));
    vi.stubGlobal('fetch', fetch);
    const c = {
      organizationId: 'sport-society',
      enabled: true,
      tenantId: 'tenant',
      clientId: 'client',
      clientSecret: 'secret',
      mailbox: 'test@example.com',
      folderId: 'inbox',
    };
    const result = await collectOutlookMails(
      c,
      new Date('2026-10-07T06:45:00Z'),
      save,
    );
    expect(result).toEqual({ matched: 1, imported: 0, duplicates: 1 });
    expect(save).toHaveBeenCalledOnce();
    expect(fetch.mock.calls[2]?.[0]).toContain('/messages/hp/$value');
    fetch
      .mockReset()
      .mockResolvedValueOnce(Response.json({ access_token: 'private-token' }))
      .mockResolvedValueOnce(
        Response.json({
          value: [],
          '@odata.nextLink': 'https://example.com/steal',
        }),
      );
    await expect(collectOutlookMails(c, new Date(), save)).rejects.toThrow(
      'paginering',
    );
    expect(fetch).toHaveBeenCalledTimes(2);
  });
});
