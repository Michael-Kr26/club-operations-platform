import type {
  CombinedPeriod,
  MetricChange,
  WorkbookAttention,
  WorkbookThresholds,
  ForecastImport,
  CombinedWorkbookDashboard,
} from '@cop/contracts';
import { workbookDefaults } from './workbook-preferences.js';

const day = 86400_000;
const iso = (time: number) => new Date(time).toISOString().slice(0, 10);
function weekStart(year: number) {
  const fourth = Date.UTC(year, 0, 4),
    weekday = new Date(fourth).getUTCDay() || 7;
  return fourth - (weekday - 1) * day;
}
function weekLabel(time: number) {
  const date = new Date(time),
    thursday = time + (4 - (date.getUTCDay() || 7)) * day;
  const year = new Date(thursday).getUTCFullYear();
  return `${year}W${String(Math.round((time - weekStart(year)) / (7 * day)) + 1).padStart(2, '0')}`;
}
export function workbookPeriod(period: string, type: CombinedPeriod['type']) {
  if (type === 'week') {
    const year = Number(period.slice(0, 4)),
      week = Number(period.slice(5));
    const from = weekStart(year) + (week - 1) * 7 * day;
    return {
      from: iso(from),
      through: iso(from + 6 * day),
      previous: weekLabel(from - 7 * day),
      cadence: 7,
    };
  }
  if (type === 'month') {
    const year = Number(period.slice(0, 4)),
      month = Number(period.slice(4, 6));
    const from = Date.UTC(year, month - 1, 1),
      previous = new Date(Date.UTC(year, month - 2, 1));
    return {
      from: iso(from),
      through: iso(Date.UTC(year, month, 1) - day),
      previous: `${previous.getUTCFullYear()}${String(previous.getUTCMonth() + 1).padStart(2, '0')}`,
      cadence: (Date.UTC(year, month, 1) - from) / day,
    };
  }
  const from = Date.parse(period + 'T00:00:00Z');
  return {
    from: period,
    through: period,
    previous: iso(from - day),
    cadence: 1,
  };
}
export function changes(
  current: Record<string, number | null>,
  previous: Record<string, number | null> | undefined,
  available: boolean,
) {
  const result: Record<string, MetricChange> = {};
  for (const [key, value] of Object.entries(current)) {
    if (key.endsWith('Ratio')) continue;
    const before = previous?.[key];
    const difference =
      available && value != null && before != null ? value - before : null;
    result[key] = {
      difference,
      percent:
        difference !== null && before != null && before !== 0
          ? (difference / Math.abs(before)) * 100
          : null,
    };
  }
  return result;
}
export function supplementChanges(
  items: ForecastImport[],
  now = new Date(),
): NonNullable<CombinedWorkbookDashboard['supplementChanges']> {
  const today = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Amsterdam',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now);
  const result: NonNullable<CombinedWorkbookDashboard['supplementChanges']> =
    {};
  for (const item of items) {
    const report = item.report;
    if (
      !report ||
      report.kind === 'forecast' ||
      report.kind === 'healthplanner'
    )
      continue;
    let previous: ForecastImport | undefined,
      reason: string | null = null,
      previousPeriod: string | null = null;
    const peers = items.filter(
      (p) =>
        p.id !== item.id &&
        p.report?.kind === report.kind &&
        p.report.locationIds.join(',') === report.locationIds.join(','),
    );
    if (report.kind === 'members') {
      previous = peers
        .filter(
          (p) =>
            p.report?.kind === 'members' && p.report.period < report.period,
        )
        .sort((a, b) =>
          (b.report as { period: string }).period.localeCompare(
            (a.report as { period: string }).period,
          ),
        )[0];
      previousPeriod =
        previous?.report?.kind === 'members' ? previous.report.period : null;
      if (report.period > today)
        reason = 'Peildatum ligt in de toekomst; geen vergelijking.';
      else if (!previous)
        reason =
          'Geen eerdere ledenexport voor dezelfde club. Dit betreft snapshots, geen maandelijkse in- of uitstroom.';
    } else {
      const match = report.period.match(
        /^(\d{4}-\d{2}-01) t\/m (\d{4}-\d{2}-\d{2})$/,
      );
      const month = match?.[1]?.slice(0, 7).replace('-', '');
      const bounds = month ? workbookPeriod(month, 'month') : null;
      if (!match || !bounds || match[2] !== bounds.through)
        reason =
          'Geen volledige kalendermaand; omzet wordt niet met een volledige maand vergeleken.';
      else {
        const prevMonth = bounds.previous;
        const from = `${prevMonth.slice(0, 4)}-${prevMonth.slice(4)}-01`;
        previousPeriod = `${from} t/m ${workbookPeriod(prevMonth, 'month').through}`;
        previous = peers.find(
          (p) =>
            p.report?.kind === 'finance' && p.report.period === previousPeriod,
        );
        if (bounds.through >= today)
          reason = 'Omzetmaand nog niet afgesloten; geen maandvergelijking.';
        else if (!previous)
          reason = 'Omzet van de vorige volledige kalendermaand ontbreekt.';
      }
    }
    const values =
      report.kind === 'members'
        ? (report.rows[0]?.values ?? {})
        : Object.fromEntries(report.cards.map((c) => [c.label, c.value]));
    const prevReport = previous?.report;
    const before =
      prevReport?.kind === 'members'
        ? prevReport.rows[0]?.values
        : prevReport?.kind === 'finance'
          ? Object.fromEntries(prevReport.cards.map((c) => [c.label, c.value]))
          : undefined;
    result[item.id] = {
      previousId: previous?.id ?? null,
      previousPeriod,
      reason,
      changes: changes(values, before, !reason),
    };
  }
  return result;
}
export function addWorkbookInsights(
  periods: CombinedPeriod[],
  thresholds: WorkbookThresholds = workbookDefaults,
  now = new Date(),
) {
  const today = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Amsterdam',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now);
  for (const current of periods) {
    const bounds = workbookPeriod(current.period, current.type);
    const previous = periods.find(
      (p) => p.type === current.type && p.period === bounds.previous,
    );
    const ongoing = bounds.through >= today;
    const reason = ongoing
      ? 'Deze kalenderperiode is nog niet afgesloten; verschillen worden niet berekend.'
      : !previous
        ? 'De vorige kalenderperiode ontbreekt; er wordt geen oudere periode als vervanging gebruikt.'
        : null;
    current.comparison = {
      previousPeriod: bounds.previous,
      reason,
      totals: changes(current.totals, previous?.totals, !reason),
      rows: current.rows.map((r) => ({
        locationId: r.locationId,
        changes: changes(
          r.values,
          previous?.rows.find((v) => v.locationId === r.locationId)?.values,
          !reason,
        ),
      })),
    };
    const attention: WorkbookAttention[] = [];
    const add = (
      code: string,
      message: string,
      locationId: string | null,
      sourceId: string | null,
    ) => attention.push({ code, message, locationId, sourceId });
    const hasNumbers = current.rows.some((r) =>
      Object.values(r.values).some((v) => v != null),
    );
    // Empty future columns in the manual workbook are expected, not failures.
    if (bounds.from > today || (!hasNumbers && bounds.through >= today)) {
      current.attention = [];
      continue;
    }
    const keys =
      current.type === 'day'
        ? ['active', 'sleeping', 'withoutAppointment']
        : ['total', 'withoutGoal', 'withoutAppointment', 'withoutCoach'];
    for (const row of current.rows) {
      const source = row.source?.id ?? null;
      if (!row.source) {
        add(
          'missing-source',
          'Bron voor deze club ontbreekt.',
          row.locationId,
          null,
        );
        continue;
      }
      const missing = keys.filter((k) => row.values[k] == null);
      if (missing.length)
        add(
          'missing-values',
          'Niet alle kerncijfers zijn ingevuld; onbekend telt niet als nul.',
          row.locationId,
          source,
        );
      if (row.conflict)
        add(
          'conflicting-source',
          'Een oudere bron bevat afwijkende cijfers. Controleer de bronweergave.',
          row.locationId,
          source,
        );
      // No ratio from daily visiting-active: its denominator is not proven to
      // be the same member population as the appointment count.
      const ratio = row.values.withoutAppointmentRatio;
      if (ratio != null && ratio * 100 >= thresholds.withoutAppointmentPercent)
        add(
          'appointment-ratio',
          `${(ratio * 100).toLocaleString('nl-NL', { maximumFractionDigits: 1 })}% zonder afspraak; ingestelde grens ${thresholds.withoutAppointmentPercent}%.`,
          row.locationId,
          source,
        );
      const increase = current.comparison.rows.find(
        (r) => r.locationId === row.locationId,
      )?.changes.withoutAppointment;
      if (
        increase?.percent != null &&
        increase.difference! > 0 &&
        increase.percent >= thresholds.increasePercent
      )
        add(
          'appointment-increase',
          `Leden zonder afspraak stijgen met ${increase.difference} (${increase.percent.toLocaleString('nl-NL', { maximumFractionDigits: 1 })}%) t.o.v. ${bounds.previous}.`,
          row.locationId,
          source,
        );
    }
    // Warn on the latest filled source period only; historical reports are not
    // stale merely because somebody selects them for a historical comparison.
    const latest = periods
      .filter(
        (p) =>
          p.type === current.type &&
          workbookPeriod(p.period, p.type).from <= today &&
          p.rows.some((r) => Object.values(r.values).some((v) => v != null)),
      )
      .at(-1);
    const age = (Date.parse(today) - Date.parse(bounds.through)) / day;
    if (current === latest && age > bounds.cadence + thresholds.staleDays)
      add(
        'stale-source',
        `Laatste ingevulde bronperiode eindigt op ${bounds.through}. Verwachte verversing plus ${thresholds.staleDays} dagen speling is verstreken.`,
        null,
        null,
      );
    current.attention = attention;
  }
}
