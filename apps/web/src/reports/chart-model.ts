import type {
  ForecastDashboard,
  ManagementReport,
  Metrics,
} from '@cop/contracts';
export type ChartGroup = 'hp' | 'members' | 'forecast' | 'finance';
export type Grain = 'day' | 'week' | 'month';
export interface ChartRow {
  period: string;
  start: string;
  through: string;
  values: Record<string, number | null>;
  sources: Record<string, string>;
}
export const chartMetrics = {
  hp: {
    total: 'Leden in HP-bron',
    active: 'Bezoekend actief (HP)',
    withoutAppointment: 'Zonder afspraak (HP)',
    sleeping: 'Slapend (HP)',
    leads: 'Leads',
    sold: 'Verkochte lidmaatschappen',
    appointments: 'Afgeronde afspraken',
  },
  members: {
    total: 'Leden in Dewi-selectie',
    active: 'Status Actief in Dewi-selectie',
    inactive14: 'Actief, ≥14 dagen niet bezocht',
    inactive30: 'Actief, ≥30 dagen niet bezocht',
  },
  forecast: {
    closing: 'Forecast-eindstand (bronbeeld)',
    joiners: 'Nieuwe leden (forecast)',
    leavers: 'Uitstroom (forecast)',
  },
  finance: {
    revenue: 'Omzet per volledige week',
    received: 'Ontvangen betalingen per week',
    outstanding: 'Openstaand op weekeinde',
  },
} as const;
const day = (d: Date) => d.toISOString().slice(0, 10);
export function closedWeekEnd(date: string) {
  const d = new Date(date);
  d.setUTCDate(d.getUTCDate() - d.getUTCDay());
  return day(d);
}
export function periodBounds(
  period: string,
): { start: string; through: string; grain: Grain } | null {
  let start: string, through: string, grain: Grain;
  if (/^\d{4}-\d{2}-\d{2}$/.test(period)) {
    start = through = period;
    grain = 'day';
  } else if (/^\d{6}$/.test(period)) {
    start = `${period.slice(0, 4)}-${period.slice(4)}-01`;
    through = day(
      new Date(
        Date.UTC(Number(period.slice(0, 4)), Number(period.slice(4)), 0),
      ),
    );
    grain = 'month';
  } else if (/^\d{4}W\d{2}$/.test(period)) {
    const jan4 = new Date(`${period.slice(0, 4)}-01-04T00:00:00Z`);
    jan4.setUTCDate(
      4 - (jan4.getUTCDay() || 7) + 1 + (Number(period.slice(5)) - 1) * 7,
    );
    start = day(jan4);
    through = day(new Date(Date.parse(start) + 6 * 86400000));
    grain = 'week';
  } else return null;
  if (!Number.isFinite(Date.parse(start)) || day(new Date(start)) !== start)
    return null;
  return { start, through, grain };
}
function key(date: string, grain: Grain) {
  if (grain === 'day') return date;
  if (grain === 'month') return date.slice(0, 7).replace('-', '');
  const d = new Date(date);
  d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay() || 7));
  const year = d.getUTCFullYear();
  const week = Math.ceil(
    ((d.getTime() - Date.UTC(year, 0, 1)) / 86400000 + 1) / 7,
  );
  return `${year}W${String(week).padStart(2, '0')}`;
}
export function buildChartRows(
  data: ForecastDashboard,
  group: ChartGroup,
  metric: string,
  grain: Grain,
  cutoff: string,
  count: number,
  weekly: ManagementReport[] = [],
): ChartRow[] {
  const map = new Map<string, ChartRow>();
  const ranks = new Map<string, string>();
  const add = (
    period: string,
    location: string,
    value: unknown,
    source: string,
    rank = '',
  ) => {
    const bounds = periodBounds(period);
    if (
      !bounds ||
      bounds.grain !== grain ||
      bounds.start > cutoff ||
      !data.organization.locations.some((l) => l.id === location)
    )
      return;
    let r = map.get(period);
    if (!r) {
      r = { period, ...bounds, values: {}, sources: {} };
      map.set(period, r);
    }
    if (
      !(location in r.values) ||
      rank > (ranks.get(period + ':' + location) ?? '')
    ) {
      ranks.set(period + ':' + location, rank);
      r.values[location] =
        typeof value === 'number' && Number.isFinite(value) ? value : null;
      r.sources[location] = source;
    }
  };
  if (group === 'hp')
    for (const p of data.combined?.periods ?? [])
      for (const r of p.rows)
        if (r.source)
          add(
            p.period,
            r.locationId,
            r.values[metric],
            r.source
              ? `${r.source.filename} · ${p.period} · import ${r.source.importedAt}${r.conflict ? ' · afwijkende oudere bron' : ''}`
              : 'Bron ontbreekt',
            r.source.importedAt,
          );
  if (group === 'hp' && grain === 'day') {
    const keys: Record<string, keyof Metrics> = {
      active: 'visitingActive',
      withoutAppointment: 'withoutFutureAppointment',
      sleeping: 'sleeping',
      leads: 'leads',
      sold: 'soldMemberships',
      appointments: 'appointments',
    };
    const field = keys[metric];
    if (field)
      for (const report of weekly) {
        if (
          report.organization.id !== data.organization.id ||
          report.dataset !== data.dataset ||
          report.kind !== 'daily'
        )
          continue;
        for (const c of report.clubs) {
          const source = report.sources.find(
            (s) => s.source === 'healthplanner' && s.locationId === c.id,
          );
          if (source && ['ready', 'stale'].includes(source.status))
            add(
              report.from,
              c.id,
              c.metrics[field],
              `Healthplanner rapportage-import · ${report.from} · ${source.status} · import ${source.importedAt ?? 'onbekend'} · ${source.importId ?? ''}`,
              source.importedAt ?? '',
            );
        }
      }
  }
  if (group === 'members' || group === 'forecast')
    for (const i of [...data.imports].sort(
      (a, b) =>
        b.importedAt.localeCompare(a.importedAt) || b.id.localeCompare(a.id),
    )) {
      if (i.status !== 'accepted') continue;
      const r = i.report;
      if (group === 'members' && r?.kind === 'members')
        for (const row of r.rows)
          add(
            row.period,
            row.locationId,
            row.values[metric],
            `${i.filename} · peildatum ${row.period} · import ${i.importedAt}`,
          );
      if (group === 'forecast' && r?.kind === 'forecast')
        for (const m of r.months)
          if (m.month <= r.exportedOn.slice(0, 7))
            add(
              m.month.replace('-', ''),
              r.locationId,
              m[metric as 'closing' | 'joiners' | 'leavers'],
              `${i.filename} · export ${r.exportedOn} · historisch/lopend bronbeeld; geen bewezen historische churn`,
            );
    }
  if (group === 'finance')
    for (const r of weekly) {
      if (
        r.organization.id !== data.organization.id ||
        r.dataset !== data.dataset ||
        r.kind !== 'weekly'
      )
        continue;
      for (const c of r.clubs)
        add(
          key(r.from, 'week'),
          c.id,
          r.through <= cutoff
            ? c.metrics[metric as 'revenue' | 'received' | 'outstanding']
            : null,
          `Financiële events ${r.from} t/m ${r.through} · ${r.sources
            .filter((s) => s.source === 'dewi-finance' && s.locationId === c.id)
            .map(
              (s) =>
                `${s.status} · import ${s.importedAt ?? 'onbekend'} · ${s.importId ?? 'geen bron'}`,
            )
            .join('; ')}`,
        );
    }
  // Explicit calendar buckets retain gaps instead of connecting observations
  // over missing days/weeks/months or distributing a monthly export over weeks.
  const cursor = new Date(cutoff),
    periods: string[] = [];
  for (let i = 0; i < count; i++) {
    periods.unshift(key(day(cursor), grain));
    if (grain === 'month') {
      cursor.setUTCDate(1);
      cursor.setUTCMonth(cursor.getUTCMonth() - 1);
    } else cursor.setUTCDate(cursor.getUTCDate() - (grain === 'week' ? 7 : 1));
  }
  return periods.map(
    (period) =>
      map.get(period) ?? {
        period,
        ...periodBounds(period)!,
        values: {},
        sources: {},
      },
  );
}
