import ExcelJS from 'exceljs';
import { ForbiddenException, NotFoundException } from '@nestjs/common';
import type { Dataset, DirectoryMember, Principal } from '@cop/contracts';
import type { WorkbookImports } from '../reporting/workbook-imports.js';
const plain = (v: ExcelJS.CellValue, max = 200) =>
  typeof v === 'string' || typeof v === 'number'
    ? String(v).trim().slice(0, max)
    : '';
export async function memberDirectory(
  imports: WorkbookImports,
  principal: Principal,
  dataset: Dataset,
  sourceId?: string,
) {
  if (!principal.permissions.includes('members.read'))
    throw new ForbiddenException(
      'Geen toegang tot persoonsgegevens van leden.',
    );
  const candidates = (await imports.list(principal, dataset))
    .filter((i) => i.status === 'accepted' && i.report?.kind === 'members')
    .sort((a, b) => {
      const ap = a.report?.kind === 'members' ? a.report.period : '',
        bp = b.report?.kind === 'members' ? b.report.period : '';
      return bp.localeCompare(ap) || b.importedAt.localeCompare(a.importedAt);
    });
  if (sourceId && !candidates.some((i) => i.id === sourceId))
    throw new NotFoundException(
      'Ledenbron niet gevonden binnen jouw locaties.',
    );
  const seen = new Set<string>(),
    selected = candidates.filter((i) => {
      const loc = i.locationId!;
      if (sourceId) return i.id === sourceId;
      if (seen.has(loc)) return false;
      seen.add(loc);
      return true;
    });
  const members: DirectoryMember[] = [],
    sources: {
      id: string;
      locationId: string;
      asOf: string;
      filename: string;
    }[] = candidates.map((i) => ({
      id: i.id,
      locationId: i.locationId!,
      asOf: i.report!.kind === 'members' ? i.report!.period : '',
      filename: i.filename,
    }));
  for (const item of selected) {
    const report = item.report!;
    if (report.kind !== 'members') continue;
    const original = await imports.original(principal.organizationId, item.id);
    if (!original) continue;
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(original.original as never);
    const sheet = workbook.getWorksheet('Leden');
    if (!sheet) continue;
    const columns = new Map<string, number>();
    sheet
      .getRow(1)
      .eachCell((cell, index) =>
        columns.set(cell.text.trim().toLowerCase(), index),
      );
    const cell = (row: ExcelJS.Row, name: string) =>
      columns.has(name) ? row.getCell(columns.get(name)!) : null;
    sheet.eachRow((row, index) => {
      if (index === 1) return;
      const number = plain(cell(row, 'klantnummer')?.value ?? null, 60);
      if (!/^\d+$/.test(number)) return;
      const given = plain(
        cell(row, 'roepnaam')?.value ??
          cell(row, 'voorletter(s)')?.value ??
          null,
        120,
      );
      const name =
        [
          given,
          plain(cell(row, 'tussenvoegsels')?.value ?? null, 50),
          plain(cell(row, 'achternaam')?.value ?? null, 120),
        ]
          .filter(Boolean)
          .join(' ') || `Lid ${number}`;
      const value = cell(row, 'laatste bezoek')?.value;
      const lastVisit =
        value instanceof Date
          ? value.toISOString().slice(0, 10)
          : typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)
            ? value
            : null;
      const days = lastVisit
        ? (Date.parse(report.period) - Date.parse(lastVisit)) / 86400000
        : null;
      members.push({
        key: `${item.locationId}:${number}`,
        number,
        name,
        status: plain(cell(row, 'status')?.value ?? null, 60),
        locationId: item.locationId!,
        sourceId: item.id,
        asOf: report.period,
        lastVisit,
        inactiveDays: days !== null && days >= 0 ? days : null,
        email: plain(cell(row, 'email')?.value ?? null) || null,
        phone:
          plain(
            cell(row, 'mobiele telefoonnummer')?.value ??
              cell(row, 'telefoonnummer')?.value ??
              null,
          ) || null,
      });
    });
  }
  return {
    members,
    sources,
    warnings: [
      'Dit is de bevestigde selectie uit de Dewi-export. Status Actief bewijst geen geldig, ongepauzeerd abonnement.',
      'Niet-bezoeken wordt berekend op de peildatum van de bron, niet op vandaag. Onbekende en toekomstige bezoekdatums tellen niet als inactief.',
      'Klantnummers blijven per club gescheiden. Geen koppeling of ontdubbeling tussen clubs op basis van naam of e-mail.',
      'Healthplanner-gegevens per individueel lid ontbreken hier. Zonder afspraak/doel/coach is alleen als clubtotaal beschikbaar.',
    ],
  };
}
