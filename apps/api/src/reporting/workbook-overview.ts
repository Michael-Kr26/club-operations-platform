import type {
  CombinedWorkbookDashboard,
  CombinedPeriod,
  ForecastImport,
  ReportOrganization,
} from '@cop/contracts';

export function workbookOverview(
  org: ReportOrganization,
  imports: ForecastImport[],
): CombinedWorkbookDashboard {
  // Newest import wins for a whole club/period. Never fill its missing cells from
  // older files; that would silently construct a report that no source contains.
  const sorted = [...imports].sort(
    (a, b) =>
      b.importedAt.localeCompare(a.importedAt) || b.id.localeCompare(a.id),
  );
  const periods = new Map<string, CombinedPeriod>();
  for (const item of sorted) {
    if (item.status !== 'accepted' || item.report?.kind !== 'healthplanner')
      continue;
    for (const row of item.report.rows) {
      if (!org.locations.some((l) => l.id === row.locationId)) continue;
      let entry = periods.get(row.period);
      if (!entry) {
        entry = {
          period: row.period,
          type: row.period.includes('W')
            ? 'week'
            : /^\d{6}$/.test(row.period)
              ? 'month'
              : 'day',
          rows: org.locations.map((l) => ({
            locationId: l.id,
            values: {},
            source: null,
            conflict: false,
          })),
          totals: {},
        };
        periods.set(row.period, entry);
      }
      const target = entry.rows.find((r) => r.locationId === row.locationId)!;
      if (target.source) {
        if (JSON.stringify(target.values) !== JSON.stringify(row.values))
          target.conflict = true;
      } else {
        target.values = row.values;
        target.source = {
          id: item.id,
          filename: item.filename,
          importedAt: item.importedAt,
        };
      }
    }
  }
  for (const entry of periods.values()) {
    const keys = new Set(entry.rows.flatMap((r) => Object.keys(r.values)));
    for (const key of keys) {
      if (key.endsWith('Ratio')) continue;
      entry.totals[key] = entry.rows.every((r) => r.values[key] != null)
        ? entry.rows.reduce((s, r) => s + r.values[key]!, 0)
        : null;
    }
    for (const key of ['withoutGoal', 'withoutAppointment', 'withoutCoach'])
      entry.totals[key + 'Ratio'] =
        entry.totals.total && entry.totals[key] != null
          ? entry.totals[key]! / entry.totals.total
          : null;
  }
  // Retain the latest version per source-kind / club / source-period. Financial
  // and membership snapshots keep their own dates, never join onto HP counts.
  const seen = new Set<string>();
  const supplements = sorted.filter((item) => {
    const r = item.report;
    if (item.status !== 'accepted' || !r || r.kind === 'healthplanner')
      return false;
    const key =
      r.kind === 'forecast'
        ? `forecast:${r.locationId}`
        : `${r.kind}:${r.locationIds.join(',')}:${r.period}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  return {
    periods: [...periods.values()].sort((a, b) =>
      a.period.localeCompare(b.period),
    ),
    supplements,
    warnings: [
      'Organisatietotalen zijn een optelsom van clubregistraties, geen unieke leden. Ontbreekt één clubwaarde, dan blijft het totaal onbekend.',
      'Healthplanner bezoekend actief, Dewi status Actief en een forecast-eindstand hebben verschillende definities en blijven afzonderlijk zichtbaar.',
      'Bij meerdere bestanden voor dezelfde club en periode wordt de nieuwste import gebruikt, inclusief onbekende waarden. Afwijkende oudere bronnen worden gemarkeerd.',
    ],
  };
}
