import ExcelJS from 'exceljs';
import type {
  DewiForecast,
  ForecastMonth,
  ReportOrganization,
} from '@cop/contracts';
import { inspectXlsx } from './adapters.js';
import { dateOnly } from './calculation.js';

const monthNames = [
  'jan.',
  'feb.',
  'mrt.',
  'apr.',
  'mei',
  'jun.',
  'jul.',
  'aug.',
  'sep.',
  'okt.',
  'nov.',
  'dec.',
];
const labels = [
  'Opening members',
  'Joiners',
  'Betermeldingen',
  'Movement IN',
  'Leavers',
  'Ziek meldingen',
  'Movement OUT',
  'Closing Members',
  'Nett Movement',
];
const keys = [
  'opening',
  'joiners',
  'better',
  'movementIn',
  'leavers',
  'sick',
  'movementOut',
  'closing',
  'net',
] as const;
const normalized = (s: string) => s.trim().replace(/\s+/g, ' ').toLowerCase();
function count(value: ExcelJS.CellValue): number | null {
  if (value === null || value === '') return null;
  if (typeof value !== 'string' && typeof value !== 'number')
    throw new Error('Onbekende formule of celinhoud in bronaantal.');
  if (
    !/^\d+$/.test(String(value)) ||
    !Number.isSafeInteger(Number(value)) ||
    Number(value) > 1_000_000
  )
    throw new Error('Verwacht een geheel, niet-negatief aantal.');
  return Number(value);
}
function detailCount(sheet: ExcelJS.Worksheet) {
  if (
    normalized(sheet.getCell('A1').text) !== 'klantnummer' ||
    normalized(sheet.getCell('B1').text) !== 'naam'
  )
    throw new Error('Onbekende kopregel in ledenbijlage.');
  const ids = new Set<string>();
  let duplicate = false;
  sheet.eachRow((row, i) => {
    if (i === 1) return;
    const value = row.getCell(1).value;
    let id: string | undefined;
    if (
      value &&
      typeof value === 'object' &&
      'formula' in value &&
      typeof value.formula === 'string'
    ) {
      // Only inspect an exact HYPERLINK shape. Never execute spreadsheet formulas or follow links.
      id = value.formula.match(
        /^HYPERLINK\("https:\/\/admin\.dewi-online\.nl\/members\/(\d+)\/edit",\s*\d+\)$/i,
      )?.[1];
    } else if (value && typeof value === 'object' && 'hyperlink' in value) {
      id = value.hyperlink.match(
        /^https:\/\/admin\.dewi-online\.nl\/members\/(\d+)\/edit$/,
      )?.[1];
    } else if (
      (typeof value === 'number' || typeof value === 'string') &&
      /^\d+$/.test(String(value))
    )
      id = String(value);
    if (!id)
      throw new Error('Onbekend klantnummer of formule in ledenbijlage.');
    if (ids.has(id)) duplicate = true;
    ids.add(id);
  });
  return { count: ids.size, duplicate };
}
export async function parseDewiForecast(
  bytes: Buffer,
  org: ReportOrganization,
): Promise<DewiForecast> {
  if (!bytes.length || bytes.length > 5_000_000)
    throw new Error('Gebruik een XLSX-bestand van maximaal 5 MB.');
  inspectXlsx(bytes);
  const book = new ExcelJS.Workbook();
  await book.xlsx.load(bytes as never);
  if (
    book.worksheets.length > 310 ||
    book.worksheets.reduce((sum, s) => sum + s.rowCount, 0) > 100_000
  )
    throw new Error('Te veel werkbladen of rijen.');
  const description = book.getWorksheet('Omschrijving')?.getCell('A2').value;
  if (typeof description !== 'string')
    throw new Error(
      'Het Dewi-tabblad Omschrijving ontbreekt. Gebruik de originele ledenforecast.',
    );
  const match = description
    .trim()
    .match(/^Forecast (.+) (\d{2})-(\d{2})-(\d{4})$/);
  if (!match) throw new Error('Onbekende bronbeschrijving of exportdatum.');
  const location = org.locations.find((l) => `${org.id}-${l.id}` === match[1]);
  if (!location)
    throw new Error(
      'De organisatie of locatie in deze export hoort niet bij de gekozen COP-organisatie.',
    );
  const exportedOn = dateOnly(`${match[4]}-${match[3]}-${match[2]}`);
  const candidates = book.worksheets.filter((s) =>
    /^Forecast KPI /i.test(s.name),
  );
  if (candidates.length !== 1)
    throw new Error('Verwacht precies één Forecast KPI-werkblad.');
  const source = candidates[0]!;
  if (source.columnCount < 2 || source.columnCount > 61)
    throw new Error('Verwacht 1 tot 60 maandkolommen.');
  const rowMap = new Map<string, number>();
  source.eachRow((r, i) => {
    if (i === 1) return;
    const label = normalized(r.getCell(1).text);
    if (!labels.some((l) => normalized(l) === label) || rowMap.has(label))
      throw new Error('Onbekende of dubbele KPI-regel.');
    rowMap.set(label, i);
  });
  if (
    rowMap.size !== labels.length ||
    normalized(source.getCell('A1').text) !== 'naam'
  )
    throw new Error('KPI-kopregel of verplichte KPI-regels ontbreken.');
  const months: ForecastMonth[] = [];
  for (let col = 2; col <= source.columnCount; col++) {
    const text = source.getCell(1, col).text;
    if (!/^\d{4}(0[1-9]|1[0-2])$/.test(text))
      throw new Error('Ongeldige maandkolom; verwacht YYYYMM.');
    const month = `${text.slice(0, 4)}-${text.slice(4)}`;
    if (months.length) {
      const previous = new Date(`${months.at(-1)!.month}-01T12:00:00Z`);
      previous.setUTCMonth(previous.getUTCMonth() + 1);
      if (previous.toISOString().slice(0, 7) !== month)
        throw new Error('Maandkolommen zijn dubbel of niet aaneengesloten.');
    }
    const m: ForecastMonth = {
      month,
      opening: null,
      joiners: null,
      better: null,
      movementIn: null,
      leavers: null,
      sick: null,
      movementOut: null,
      closing: null,
      net: null,
      indicativeChurn: null,
      nextOpeningDifference: null,
      warnings: [],
    };
    for (let k = 0; k < 7; k++) {
      const key = keys[k]!;
      m[key] = count(
        source.getCell(rowMap.get(normalized(labels[k]!))!, col).value,
      );
      if (m[key] === null) m.warnings.push(`${labels[k]} ontbreekt.`);
    }
    const inCalculated =
      m.joiners !== null && m.better !== null ? m.joiners + m.better : null;
    const outCalculated =
      m.leavers !== null && m.sick !== null ? m.leavers + m.sick : null;
    if (
      inCalculated !== null &&
      m.movementIn !== null &&
      inCalculated !== m.movementIn
    )
      throw new Error('Movement IN wijkt af van Joiners + Betermeldingen.');
    if (
      outCalculated !== null &&
      m.movementOut !== null &&
      outCalculated !== m.movementOut
    )
      throw new Error('Movement OUT wijkt af van Leavers + Ziek meldingen.');
    const column = source.getColumn(col).letter;
    const validateDerived = (
      label: string,
      formula: string,
      calculated: number | null,
    ) => {
      const v = source.getCell(rowMap.get(normalized(label))!, col).value;
      if (
        v &&
        typeof v === 'object' &&
        'formula' in v &&
        typeof v.formula === 'string'
      ) {
        if (
          v.formula.replaceAll('$', '').replaceAll(' ', '').toUpperCase() !==
          formula
        )
          throw new Error(`Onbekende formule voor ${label}.`);
      } else if (v !== null && v !== '') {
        const n = Number(v);
        if (
          (typeof v !== 'number' && typeof v !== 'string') ||
          !Number.isSafeInteger(n) ||
          (calculated !== null && n !== calculated)
        )
          throw new Error(`Bronwaarde voor ${label} klopt niet.`);
      }
    };
    m.closing =
      m.opening !== null && m.movementIn !== null && m.movementOut !== null
        ? m.opening + m.movementIn - m.movementOut
        : null;
    m.net =
      m.movementIn !== null && m.movementOut !== null
        ? m.movementIn - m.movementOut
        : null;
    if (m.closing !== null && m.closing < 0)
      throw new Error('Negatieve berekende ledenstand.');
    validateDerived(
      'Closing Members',
      `${column}2+${column}5-${column}8`,
      m.closing,
    );
    validateDerived('Nett Movement', `${column}9-${column}2`, m.net);
    let detailValid = true;
    const suffix = `${monthNames[Number(month.slice(-2)) - 1]} ${month.slice(0, 4)}`;
    for (const [prefix, key] of [
      ['Opening members', 'opening'],
      ['Joiners', 'joiners'],
      ['Better', 'better'],
      ['Leavers', 'leavers'],
      ['Sick', 'sick'],
    ] as const) {
      const sheet = book.getWorksheet(`${prefix} ${suffix}`);
      if (!sheet) {
        m.warnings.push(
          `${prefix}: ledenbijlage ontbreekt; aantal niet gecontroleerd.`,
        );
        detailValid = false;
        continue;
      }
      const detail = detailCount(sheet);
      if (detail.duplicate || detail.count !== m[key]) {
        m.warnings.push(
          `${prefix}: bronaantal ${m[key] ?? 'onbekend'}, unieke klantnummers ${detail.count}${detail.duplicate ? ' (dubbele nummers)' : ''}.`,
        );
        detailValid = false;
      }
    }
    // A source ratio is a reviewable indicator, not official churn: effective end dates and transfer history are absent.
    m.indicativeChurn =
      detailValid && m.opening !== null && m.opening > 0 && m.leavers !== null
        ? m.leavers / m.opening
        : null;
    months.push(m);
  }
  for (let i = 0; i < months.length - 1; i++) {
    const m = months[i]!,
      next = months[i + 1]!;
    if (m.closing !== null && next.opening !== null) {
      m.nextOpeningDifference = next.opening - m.closing;
      if (m.nextOpeningDifference !== 0)
        m.warnings.push(
          `Volgende beginstand wijkt ${m.nextOpeningDifference > 0 ? '+' : ''}${m.nextOpeningDifference} af van deze berekende eindstand.`,
        );
    }
  }
  return {
    kind: 'forecast',
    locationId: location.id,
    exportedOn,
    sourceSheet: source.name,
    months,
    warnings: [
      'Dit is een Dewi-forecast. Een verstreken maand is historisch bronbeeld; de export bewijst geen definitieve realisatie of actuele ledenstand vandaag.',
      'De exportmaand is lopend en kan ingeplande mutaties bevatten. Latere maanden zijn alleen een vooruitblik op bekende mutaties; nul instroom betekent geen gegarandeerde nul.',
      'Netto mutatie omvat instroom + betermeldingen − uitstroom − ziekmeldingen. De precieze abonnementsstatussen, verhuizingen en effectieve einddatums moeten nog met Dewi worden bevestigd.',
      'Uitstroomratio = Leavers / Opening members (unieke klantnummers gecontroleerd waar mogelijk). Dit is geen definitieve churn en wordt niet naar de officiële ochtendmail doorgerekend.',
    ],
  };
}
