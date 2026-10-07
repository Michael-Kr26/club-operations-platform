import { parse } from 'csv-parse/sync';
import ExcelJS from 'exceljs';
import type {
  FinanceRow,
  HealthplannerRow,
  ImportMeta,
  MembershipRow,
} from '@cop/contracts';
import { dateOnly } from './calculation.js';

type Row = Record<string, unknown>;
function inspectXlsx(bytes: Buffer) {
  // Sum the ZIP central-directory sizes before ExcelJS inflates anything. Reject ZIP64 and oversized archives.
  let end = -1;
  for (let i = bytes.length - 22; i >= Math.max(0, bytes.length - 65557); i--)
    if (bytes.readUInt32LE(i) === 0x06054b50) {
      end = i;
      break;
    }
  if (end < 0) throw new Error('Ongeldig XLSX-archief.');
  const entries = bytes.readUInt16LE(end + 10);
  let offset = bytes.readUInt32LE(end + 16),
    expanded = 0;
  if (entries > 2000) throw new Error('Te veel XLSX-onderdelen.');
  for (let n = 0; n < entries; n++) {
    if (offset + 46 > bytes.length || bytes.readUInt32LE(offset) !== 0x02014b50)
      throw new Error('Ongeldige XLSX-directory.');
    expanded += bytes.readUInt32LE(offset + 24);
    if (expanded > 30_000_000)
      throw new Error('Uitgepakt XLSX groter dan 30 MB. Gebruik CSV.');
    offset +=
      46 +
      bytes.readUInt16LE(offset + 28) +
      bytes.readUInt16LE(offset + 30) +
      bytes.readUInt16LE(offset + 32);
  }
}
const columns = {
  'dewi-members': [
    'subscriptionId',
    'memberId',
    'locationId',
    'startDate',
    'endDate',
    'cancellationRequestedDate',
    'pauseStart',
    'pauseEnd',
    'pauseKind',
  ],
  'dewi-finance': ['eventId', 'locationId', 'date', 'kind', 'amountCents'],
  healthplanner: [
    'locationId',
    'date',
    'leads',
    'converted',
    'appointments',
    'visitingActive',
    'sleeping',
  ],
};
export interface SourceAdapter {
  parse(
    bytes: Buffer,
    filename: string,
    meta: ImportMeta,
  ): Promise<(MembershipRow | FinanceRow | HealthplannerRow)[]>;
}
const required = (value: unknown, name: string) => {
  if (typeof value !== 'string' || !value.trim() || value.length > 120)
    throw new Error(`${name}: ontbreekt of ongeldig (maximaal 120 tekens).`);
  return value.trim();
};
const optionalDate = (v: unknown) =>
  v === '' || v == null ? null : dateOnly(v);
const count = (v: unknown) => {
  if (v === '' || v == null) return null;
  const n = Number(v);
  if (!Number.isSafeInteger(n) || n < 0)
    throw new Error('Aantallen moeten niet-negatieve gehele getallen zijn.');
  return n;
};
// Acquisition is deliberately limited to reviewed canonical files. No guessed vendor endpoint or mapping.
export class CanonicalFileAdapter implements SourceAdapter {
  async parse(bytes: Buffer, filename: string, meta: ImportMeta) {
    let input: Row[];
    let headers: string[] = [];
    if (/\.csv$/i.test(filename)) {
      input = parse(bytes, {
        bom: true,
        delimiter: bytes.toString('utf8').split('\n')[0]?.includes(';')
          ? ';'
          : ',',
        columns: (h: string[]) => {
          headers = h;
          return h;
        },
        skip_empty_lines: true,
        trim: true,
        max_record_size: 10000,
      }) as Row[];
    } else if (/\.xlsx$/i.test(filename)) {
      const workbook = new ExcelJS.Workbook();
      inspectXlsx(bytes);
      await workbook.xlsx.load(bytes as never);
      if (workbook.worksheets.length !== 1)
        throw new Error('Gebruik één werkblad met een kopregel.');
      const sheet = workbook.worksheets[0]!;
      headers = (sheet.getRow(1).values as ExcelJS.CellValue[])
        .slice(1)
        .map((v) => String(v ?? '').trim());
      input = [];
      sheet.eachRow((r, index) => {
        if (index === 1) return;
        const row: Row = {};
        headers.forEach((name, i) => {
          const v = r.getCell(i + 1).value;
          if (v !== null && typeof v === 'object' && !(v instanceof Date))
            throw new Error(
              `Rij ${index}: formules en rich text niet toegestaan.`,
            );
          row[name] =
            v instanceof Date ? v.toISOString().slice(0, 10) : (v ?? '');
        });
        input.push(row);
      });
    } else
      throw new Error('Gebruik CSV of XLSX (geen XLS, macrobestand of PDF).');
    if (input.length > 50000)
      throw new Error('Maximaal 50.000 rijen per import.');
    if (
      headers.length !== columns[meta.source].length ||
      new Set(headers).size !== headers.length ||
      columns[meta.source].some((k) => !headers.includes(k))
    )
      throw new Error(
        `Verwachte kolommen: ${columns[meta.source].join(', ')}. Een ruwe ledenlijst is geen volledige historische managementexport.`,
      );
    const ids = new Set<string>();
    const output = input.map((r, index) => {
      try {
        const locationId = required(r.locationId, 'locationId');
        if (!meta.locations.includes(locationId))
          throw new Error('Locatie valt buiten de verklaarde scope.');
        if (meta.source === 'dewi-members') {
          const subscriptionId = required(r.subscriptionId, 'subscriptionId'),
            memberId = required(r.memberId, 'memberId');
          const startDate = dateOnly(r.startDate),
            endDate = optionalDate(r.endDate),
            cancellationRequestedDate = optionalDate(
              r.cancellationRequestedDate,
            );
          const pauseStart = optionalDate(r.pauseStart),
            pauseEnd = optionalDate(r.pauseEnd);
          const pauseKind =
            r.pauseKind === '' || r.pauseKind == null ? null : r.pauseKind;
          if (
            (endDate && endDate <= startDate) ||
            (cancellationRequestedDate &&
              endDate &&
              cancellationRequestedDate > endDate) ||
            (!pauseStart && (pauseEnd || pauseKind)) ||
            (pauseStart &&
              (!['paused', 'frozen'].includes(String(pauseKind)) ||
                pauseStart < startDate ||
                (endDate && pauseStart >= endDate))) ||
            (pauseEnd &&
              (pauseEnd <= pauseStart! || (endDate && pauseEnd > endDate)))
          )
            throw new Error('Ongeldige effectieve datums of pauze.');
          if (ids.has(subscriptionId))
            throw new Error('Dubbel subscriptionId in hetzelfde bestand.');
          ids.add(subscriptionId);
          return {
            subscriptionId,
            memberId,
            locationId,
            startDate,
            endDate,
            cancellationRequestedDate,
            pauseStart,
            pauseEnd,
            pauseKind,
          } as MembershipRow;
        }
        const date = dateOnly(r.date);
        if (date < meta.from || date > meta.through)
          throw new Error('Eventdatum buiten de importperiode.');
        if (meta.source === 'dewi-finance') {
          const eventId = required(r.eventId, 'eventId');
          if (ids.has(eventId)) throw new Error('Dubbel eventId.');
          ids.add(eventId);
          const amountCents = Number(r.amountCents);
          if (
            r.amountCents === '' ||
            !Number.isSafeInteger(amountCents) ||
            Math.abs(amountCents) > 1e10 ||
            !['revenue', 'payment', 'outstanding', 'failed_debit'].includes(
              String(r.kind),
            ) ||
            (r.kind === 'outstanding' && amountCents < 0)
          )
            throw new Error('Ongeldig financieel event of bedrag in centen.');
          return {
            eventId,
            locationId,
            date,
            kind: r.kind,
            amountCents,
          } as FinanceRow;
        }
        const key = `${locationId}:${date}`;
        if (ids.has(key)) throw new Error('Dubbele club/datum.');
        ids.add(key);
        const row: HealthplannerRow = {
          locationId,
          date,
          leads: count(r.leads),
          converted: count(r.converted),
          appointments: count(r.appointments),
          visitingActive: count(r.visitingActive),
          sleeping: count(r.sleeping),
        };
        if (
          row.converted !== null &&
          row.leads !== null &&
          row.converted > row.leads
        )
          throw new Error(
            'Conversies hoger dan leads; controleer dezelfde cohort.',
          );
        return row;
      } catch (error) {
        throw new Error(
          `Rij ${index + 2}: ${error instanceof Error ? error.message : 'ongeldig'}`,
          { cause: error },
        );
      }
    });
    if (meta.complete && meta.source === 'healthplanner')
      for (const location of meta.locations) {
        const days =
          (Date.parse(meta.through) - Date.parse(meta.from)) / 86400000 + 1;
        if (
          days > 366 ||
          output.filter((r) => r.locationId === location).length !== days
        )
          throw new Error(
            'Volledige Healthplanner-import vereist één expliciete rij per club per dag (ook nul-dagen).',
          );
      }
    return output;
  }
}
