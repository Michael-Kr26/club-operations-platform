import ExcelJS from 'exceljs';
import type {
  ReportOrganization,
  WorkbookReport,
  WorkbookSupplement,
} from '@cop/contracts';
import { inspectXlsx } from './adapters.js';
import { parseDewiForecast } from './dewi-forecast.js';
import { dateOnly } from './calculation.js';
import { parseHealthplannerMail } from './healthplanner-mail.js';

type Context = {
  locationId?: string;
  asOf?: string;
  scopeConfirmed?: boolean;
  filename?: string;
};
export class WorkbookContextError extends Error {
  constructor(
    message: string,
    public readonly kind: 'members' | 'finance',
  ) {
    super(message);
  }
}
const norm = (s: string) => s.trim().replace(/\s+/g, ' ').toLowerCase();
const count = (v: ExcelJS.CellValue) => {
  if (v === null || v === '') return null;
  if (typeof v !== 'number' && typeof v !== 'string')
    throw new Error('Onverwachte formule in een invoercel.');
  if (!/^\d+$/.test(String(v)) || !Number.isSafeInteger(Number(v)))
    throw new Error('Ongeldig aantal in broninvoer.');
  return Number(v);
};
const cents = (v: ExcelJS.CellValue) => {
  if (
    typeof v !== 'number' ||
    !Number.isFinite(v) ||
    Math.abs(v) > 1_000_000_000
  )
    throw new Error('Verwacht een numeriek bedrag; geen tekst of formule.');
  return Math.round(v * 100);
};
function declaredLocation(
  org: ReportOrganization,
  c: Context,
  kind: 'members' | 'finance',
) {
  if (
    c.scopeConfirmed !== true ||
    !org.locations.some((l) => l.id === c.locationId)
  )
    throw new WorkbookContextError(
      'Dit bestand noemt geen club. Kies de juiste locatie en bevestig de toewijzing.',
      kind,
    );
  return c.locationId!;
}
function moneyRows(sheet: ExcelJS.Worksheet | undefined) {
  if (!sheet) throw new Error('Verplicht financieel werkblad ontbreekt.');
  return sheet;
}
export async function parseWorkbook(
  bytes: Buffer,
  org: ReportOrganization,
  c: Context,
): Promise<WorkbookReport> {
  if (/\.eml$/i.test(c.filename ?? '')) {
    const parsed = await parseHealthplannerMail(bytes, org);
    return {
      kind: 'healthplanner',
      locationIds: parsed.meta.locations,
      period: parsed.meta.from,
      warnings: [
        'Dagcijfers uit de Healthplanner-mail. Bezoekend actief is geen Dewi-abonnementstand. Geen bewezen leadcohortconversies of effectieve uitstroom.',
      ],
      cards: [],
      categories: [],
      rows: parsed.rows.map((r) => ({
        period: r.date,
        locationId: r.locationId,
        values: {
          leads: r.leads,
          sold: r.soldMemberships ?? null,
          cancellations: r.requestedCancellations ?? null,
          appointments: r.appointments,
          active: r.visitingActive,
          sleeping: r.sleeping,
          withoutAppointment: r.withoutFutureAppointment ?? null,
        },
      })),
    };
  }
  inspectXlsx(bytes);
  const w = new ExcelJS.Workbook();
  await w.xlsx.load(bytes as never);
  if (
    w.worksheets.length > 310 ||
    w.worksheets.reduce((s, t) => s + t.rowCount, 0) > 100_000
  )
    throw new Error('Te veel rijen of werkbladen.');
  if (w.worksheets.some((s) => /^Forecast KPI /i.test(s.name)))
    return parseDewiForecast(bytes, org);
  if (w.getWorksheet('Leden') && w.getWorksheet('Contracten'))
    return members(w, org, c);
  if (w.getWorksheet('Artikelen') && w.getWorksheet('Winst&Verlies Kasstelsel'))
    return finance(w, org, c);
  if (
    w.getWorksheet('Wekelijkse update') &&
    w.getWorksheet('Maandelijkse update')
  )
    return healthplanner(w, org);
  throw new Error(
    'Dit Excel-formaat is nog niet ondersteund. Gebruik een Dewi-forecast, Leden/Contracten-export, omzetrapport of Healthplanner-updatetabel.',
  );
}
function members(
  w: ExcelJS.Workbook,
  org: ReportOrganization,
  c: Context,
): WorkbookSupplement {
  const locationId = declaredLocation(org, c, 'members');
  if (!c.asOf)
    throw new WorkbookContextError(
      'Vul de werkelijke peildatum van de ledenexport in.',
      'members',
    );
  const asOf = dateOnly(c.asOf);
  const s = w.getWorksheet('Leden')!;
  const columns = new Map<string, number>();
  s.getRow(1).eachCell((cell, col) => columns.set(norm(cell.text), col));
  for (const key of [
    'klantnummer',
    'status',
    'laatste bezoek',
    'tijdelijke stop',
  ])
    if (!columns.has(key)) throw new Error(`Ledenkolom ontbreekt: ${key}.`);
  const records = new Map<string, ExcelJS.Row>();
  let duplicates = 0;
  s.eachRow((r, i) => {
    if (i === 1) return;
    const v = r.getCell(columns.get('klantnummer')!).value;
    if (!/^\d+$/.test(String(v))) throw new Error('Ongeldig klantnummer.');
    const id = String(v);
    if (records.has(id)) {
      duplicates++;
      throw new Error(
        'Dubbele klantnummers in ledenexport; eerst de bron controleren.',
      );
    }
    records.set(id, r);
  });
  let active = 0,
    inactive30 = 0,
    inactive14 = 0,
    unknownVisit = 0,
    futureVisit = 0;
  const states: Record<string, number> = Object.create(null);
  for (const r of records.values()) {
    const status = r.getCell(columns.get('status')!).text.trim();
    states[status || 'Onbekend'] = (states[status || 'Onbekend'] ?? 0) + 1;
    if (norm(status) !== 'actief') continue;
    active++;
    const last = r.getCell(columns.get('laatste bezoek')!).value;
    if (last === null || last === '') {
      unknownVisit++;
      continue;
    }
    const date = dateOnly(
      last instanceof Date ? last.toISOString().slice(0, 10) : last,
    );
    const days = (Date.parse(asOf) - Date.parse(date)) / 86400_000;
    if (days < 0) {
      futureVisit++;
      continue;
    }
    if (days >= 14) inactive14++;
    if (days >= 30) inactive30++;
  }
  return {
    kind: 'members',
    locationIds: [locationId],
    period: asOf,
    categories: Object.entries(states).map(([name, n]) => ({
      name,
      amountCents: 0,
      count: n,
    })),
    rows: [
      {
        period: asOf,
        locationId,
        values: {
          total: records.size,
          active,
          inactive14,
          inactive30,
          unknownVisit,
          futureVisit,
        },
      },
    ],
    cards: [
      { label: 'Unieke klantnummers in selectie', value: records.size },
      { label: 'Status Actief (bron)', value: active },
      { label: 'Actief, ≥14 dagen niet bezocht', value: inactive14 },
      { label: 'Actief, ≥30 dagen niet bezocht', value: inactive30 },
      { label: 'Actief, bezoekdatum onbekend', value: unknownVisit },
    ],
    warnings: [
      'Locatie en peildatum zijn door de gebruiker bevestigd: deze export bevat geen eigen clubvermelding of aantoonbare exportdatum.',
      'Alleen de aangeleverde selectie wordt geteld. Status Actief is geen bewezen aantal geldige, niet-gepauzeerde abonnementen. Contracten kunnen uitsluitend bij deze selectie horen: geen volledige historische uitstroom of churn.',
      '14/30 dagen gebruiken Laatste bezoek en de opgegeven peildatum. Bezoeken-tabblad bevat cumulatieve tegoeden en is geen dagelijkse check-inhistorie.',
      ...(futureVisit
        ? [
            `${futureVisit} bezoekdatum(s) liggen na de peildatum en tellen niet als inactief.`,
          ]
        : []),
      ...(duplicates ? [`${duplicates} dubbele klantnummers.`] : []),
    ],
  };
}
function finance(
  w: ExcelJS.Workbook,
  org: ReportOrganization,
  c: Context,
): WorkbookSupplement {
  const locationId = declaredLocation(org, c, 'finance');
  const description = w.getWorksheet('Omschrijving')?.getCell('A2').text ?? '';
  const m = description.match(
    /Periode (\d{2})-(\d{2})-(\d{4}) tot en met (\d{2})-(\d{2})-(\d{4})/,
  );
  if (!m) throw new Error('Omzetperiode ontbreekt in Omschrijving.');
  const from = dateOnly(`${m[3]}-${m[2]}-${m[1]}`),
    through = dateOnly(`${m[6]}-${m[5]}-${m[4]}`);
  if (from > through) throw new Error('Omgekeerde omzetperiode.');
  const articles = moneyRows(w.getWorksheet('Artikelen'));
  const expected = [
    'Artikel',
    'Artikelgroep',
    'Aantal',
    'BTW %',
    'Excl BTW',
    'BTW',
    'Incl BTW',
    'Percentage',
  ];
  if (expected.some((v, i) => articles.getCell(1, i + 1).text !== v))
    throw new Error('Onbekende artikelkolommen.');
  let excl = 0,
    vat = 0,
    incl = 0;
  const categories: WorkbookSupplement['categories'] = [];
  articles.eachRow((r, i) => {
    if (i === 1 || !r.getCell(1).value) return;
    const e = cents(r.getCell(5).value),
      v = cents(r.getCell(6).value),
      a = cents(r.getCell(7).value);
    if (Math.abs(e + v - a) > 1)
      throw new Error('Artikelbedragen sluiten niet aan (excl + BTW ≠ incl).');
    excl += e;
    vat += v;
    incl += a;
    categories.push({
      name: r.getCell(1).text,
      amountCents: a,
      count: count(r.getCell(3).value),
    });
  });
  let ledger = 0;
  moneyRows(w.getWorksheet('Winst&Verlies Kasstelsel')).eachRow((r, i) => {
    if (i === 1 || !r.getCell(1).value) return;
    ledger +=
      (r.getCell(5).value === null ? 0 : cents(r.getCell(5).value)) -
      (r.getCell(4).value === null ? 0 : cents(r.getCell(4).value));
  });
  let taxExcl = 0,
    taxVat = 0,
    taxIncl = 0;
  moneyRows(w.getWorksheet('BTW')).eachRow((r, i) => {
    if (i === 1 || !r.getCell(1).value) return;
    taxIncl += cents(r.getCell(2).value);
    taxExcl += cents(r.getCell(3).value);
    taxVat += cents(r.getCell(4).value);
  });
  if (
    Math.abs(excl - ledger) > 1 ||
    Math.abs(excl - taxExcl) > 1 ||
    Math.abs(vat - taxVat) > 1 ||
    Math.abs(incl - taxIncl) > 1
  )
    throw new Error('Artikelen, BTW en kasstelsel sluiten niet op elkaar aan.');
  return {
    kind: 'finance',
    locationIds: [locationId],
    period: `${from} t/m ${through}`,
    cards: [
      {
        label: 'Omzet kasstelsel excl. BTW (bron)',
        value: excl,
        format: 'money',
      },
      { label: 'BTW volgens bron', value: vat, format: 'money' },
      {
        label: 'Omzet kasstelsel incl. BTW (bron)',
        value: incl,
        format: 'money',
      },
    ],
    rows: [],
    categories,
    warnings: [
      'Locatie is door de gebruiker bevestigd; de omschrijving noemt alleen de periode.',
      'Dit is het Dewi-kasstelselrapport. Omzet, bankontvangsten en openstaande debiteuren zijn verschillende cijfers. Balansmutaties worden niet als openstaand saldo of extra omzet opgeteld.',
      'Formulepercentages uit Excel zijn niet gebruikt; productaandelen worden uit de bronbedragen berekend. Dit is geen omzet-per-lid: een passend ledenbestand over dezelfde periode ontbreekt.',
    ],
  };
}
function healthplanner(
  w: ExcelJS.Workbook,
  org: ReportOrganization,
): WorkbookSupplement {
  const rows: WorkbookSupplement['rows'] = [];
  for (const name of ['Wekelijkse update', 'Maandelijkse update']) {
    const s = w.getWorksheet(name)!;
    if (norm(s.getCell('A4').text) !== norm(`${org.name} totaal`))
      throw new Error('Healthplanner-tabel hoort niet bij deze organisatie.');
    for (const location of org.locations) {
      const headings: number[] = [];
      s.eachRow((r, i) => {
        if (norm(r.getCell(1).text) === norm(location.name)) headings.push(i);
      });
      if (headings.length !== 1)
        throw new Error('Ontbrekende of dubbele Healthplanner-clubkop.');
      const start = headings[0]!;
      const labels = [
        [2, 'Totaal leden', 'total'],
        [3, 'Leden zonder doel', 'withoutGoal'],
        [5, 'Leden zonder afspraak', 'withoutAppointment'],
        [7, 'Leden zonder coach', 'withoutCoach'],
      ] as const;
      for (const [offset, label] of labels)
        if (norm(s.getCell(start + offset, 1).text) !== norm(label))
          throw new Error('Healthplanner-invoerregels verschoven.');
      for (let col = 2; col <= s.columnCount; col++) {
        const period = s.getCell(start + 1, col).text;
        if (
          !(
            name === 'Wekelijkse update'
              ? /^\d{4}W(0[1-9]|[1-4]\d|5[0-3])$/
              : /^\d{4}(0[1-9]|1[0-2])$/
          ).test(period)
        )
          throw new Error('Ongeldige Healthplanner-periode.');
        const values: Record<string, number | null> = {};
        for (const [offset, , key] of labels) {
          const v = s.getCell(start + offset, col).value;
          values[key] = v && typeof v === 'object' ? null : count(v);
        }
        for (const key of [
          'withoutGoal',
          'withoutAppointment',
          'withoutCoach',
        ]) {
          if (
            values.total !== null &&
            values[key] !== null &&
            values[key]! > values.total!
          )
            throw new Error(
              'Healthplanner-aantal zonder registratie is hoger dan het totaal.',
            );
          values[key + 'Ratio'] =
            values.total && values[key] !== null
              ? values[key]! / values.total
              : null;
        }
        rows.push({ period, locationId: location.id, values });
      }
    }
  }
  return {
    kind: 'healthplanner',
    locationIds: org.locations.map((l) => l.id),
    period: 'Wekelijkse en maandelijkse broninvoer',
    rows,
    cards: [],
    categories: [],
    warnings: [
      'Dit is een handmatig ingevulde Healthplanner-updatetabel, geen bewijs van een live koppeling.',
      'Alleen directe invoercellen worden gelezen. Excel-formules, organisatietotalen en opgeslagen formule-uitkomsten worden niet overgenomen. Daardoor blijven afgeleide of lege maanden onbekend, ook als Excel daar nul of een fout toont.',
      'Clubtotalen kunnen dezelfde leden bevatten; ze worden niet als unieke Sport Society-leden opgeteld. Percentages worden per club opnieuw uit aantallen berekend.',
    ],
  };
}
