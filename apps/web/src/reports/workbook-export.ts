import type { CombinedPeriod, ForecastDashboard } from '@cop/contracts';
function cell(value: unknown) {
  if (value == null) return '"Onbekend"';
  if (typeof value === 'number') return String(value).replace('.', ',');
  // Excel must not execute untrusted filenames/location names as formulas.
  const text = String(value),
    safe = /^[\s]*[=+@-]/.test(text) ? "'" + text : text;
  return '"' + safe.replaceAll('"', '""') + '"';
}
export function workbookCsv(
  data: ForecastDashboard,
  period: CombinedPeriod,
  columns: readonly (readonly [string, string])[],
) {
  const comparison = period.comparison;
  const header = [
    'Organisatie',
    'Dataset',
    'Periode',
    'Locatie',
    ...columns.flatMap(([, label]) => [
      label,
      label + ' verschil',
      label + ' verschil (%)',
    ]),
    'Vergelijking met',
    'Toelichting vergelijking',
    'Bron',
    'Importmoment',
    'Signalen',
  ];
  const rows = period.rows.map((row) => [
    data.organization.name,
    data.dataset === 'demo' ? 'DEMO' : 'Werkelijke gegevens',
    period.period,
    data.organization.locations.find((l) => l.id === row.locationId)?.name ??
      row.locationId,
    ...columns.flatMap(([key]) => {
      const change = comparison?.rows.find(
        (c) => c.locationId === row.locationId,
      )?.changes[key];
      return [row.values[key], change?.difference, change?.percent];
    }),
    comparison?.previousPeriod ?? null,
    comparison?.reason ?? '',
    row.source?.filename ?? null,
    row.source?.importedAt ?? null,
    (period.attention ?? [])
      .filter((a) => a.locationId === null || a.locationId === row.locationId)
      .map((a) => a.message)
      .join(' | '),
  ]);
  rows.push([
    data.organization.name,
    data.dataset === 'demo' ? 'DEMO' : 'Werkelijke gegevens',
    period.period,
    'Som clubregistraties (geen unieke leden)',
    ...columns.flatMap(([key]) => [
      period.totals[key],
      comparison?.totals[key]?.difference,
      comparison?.totals[key]?.percent,
    ]),
    comparison?.previousPeriod ?? null,
    comparison?.reason ?? '',
    'Afgeleid uit clubregistraties',
    '',
    '',
  ]);
  return (
    '\uFEFF' +
    [header, ...rows].map((row) => row.map(cell).join(';')).join('\r\n')
  );
}
export function downloadWorkbookCsv(
  data: ForecastDashboard,
  period: CombinedPeriod,
  columns: readonly (readonly [string, string])[],
) {
  const url = URL.createObjectURL(
    new Blob([workbookCsv(data, period, columns)], {
      type: 'text/csv;charset=utf-8',
    }),
  );
  const link = document.createElement('a');
  link.href = url;
  link.download = `cop-${data.dataset}-${period.period}.csv`;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
