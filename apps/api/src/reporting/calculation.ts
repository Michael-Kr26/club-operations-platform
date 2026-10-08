import type {
  FinanceRow,
  HealthplannerRow,
  ImportMeta,
  ManagementReport,
  MembershipRow,
  Metrics,
  ReportOrganization,
  ReportSettings,
  Source,
  StoredImport,
} from '@cop/contracts';
import { REPORT_RULES_VERSION } from '@cop/contracts';

export function dateOnly(value: unknown): string {
  if (
    typeof value !== 'string' ||
    !/^\d{4}-\d{2}-\d{2}$/.test(value) ||
    Number.isNaN(Date.parse(value)) ||
    new Date(value).toISOString().slice(0, 10) !== value
  )
    throw new Error('Datum moet een geldige YYYY-MM-DD zijn.');
  return value;
}
export function shiftDate(date: string, days: number): string {
  const d = new Date(dateOnly(date));
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}
export function reportPeriod(kind: 'daily' | 'monthly', date: string) {
  dateOnly(date);
  if (kind === 'daily') return { from: date, through: date };
  const from = `${date.slice(0, 7)}-01`;
  const next = new Date(from);
  next.setUTCMonth(next.getUTCMonth() + 1);
  return { from, through: shiftDate(next.toISOString().slice(0, 10), -1) };
}
export function localClock(now: Date) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Amsterdam',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(now);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? '';
  return {
    date: `${get('year')}-${get('month')}-${get('day')}`,
    time: `${get('hour')}:${get('minute')}`,
  };
}
export function validateMeta(
  meta: ImportMeta,
  organization: ReportOrganization,
) {
  if (
    !['real', 'demo'].includes(meta.dataset) ||
    !['dewi-members', 'dewi-finance', 'healthplanner'].includes(meta.source)
  )
    throw new Error('Onbekende bron of dataset.');
  dateOnly(meta.from);
  dateOnly(meta.through);
  if (
    meta.from > meta.through ||
    typeof meta.complete !== 'boolean' ||
    !Array.isArray(meta.locations) ||
    !meta.locations.length ||
    new Set(meta.locations).size !== meta.locations.length ||
    meta.locations.some(
      (id) => !organization.locations.some((l) => l.id === id),
    )
  )
    throw new Error('Ongeldige periode, volledigheid of locatiescope.');
}
export function hasSubscription(row: MembershipRow, date: string) {
  return row.startDate <= date && (!row.endDate || date < row.endDate);
}
function paused(row: MembershipRow, date: string) {
  return (
    !!row.pauseStart &&
    row.pauseStart <= date &&
    (!row.pauseEnd || date < row.pauseEnd)
  );
}
function memberMetrics(
  rows: MembershipRow[],
  all: MembershipRow[],
  from: string,
  through: string,
): Partial<Metrics> {
  const uniq = (r: MembershipRow[]) => new Set(r.map((s) => s.memberId)).size;
  const activeAt = (date: string) =>
    rows.filter((r) => hasSubscription(r, date) && !paused(r, date));
  const end = rows.filter((r) => hasSubscription(r, through));
  const starts = new Set(
    rows
      .filter((r) => r.startDate >= from && r.startDate <= through)
      .map((r) => r.memberId),
  );
  const ends = new Set(
    rows
      .filter((r) => r.endDate && r.endDate >= from && r.endDate <= through)
      .map((r) => r.memberId),
  );
  const scope = new Set(rows.map((r) => r.locationId));
  let exits = 0,
    transfersOut = 0,
    newMembers = 0,
    rejoined = 0,
    transfersIn = 0;
  // One member counts once per metric per reporting period, even with several subscriptions.
  for (const memberId of ends) {
    const events = rows.filter(
      (r) =>
        r.memberId === memberId &&
        r.endDate &&
        r.endDate >= from &&
        r.endDate <= through,
    );
    const terminated = events.filter(
      (r) =>
        !rows.some(
          (other) =>
            other.memberId === memberId && hasSubscription(other, r.endDate!),
        ),
    );
    if (
      terminated.some(
        (r) =>
          !all.some(
            (other) =>
              other.memberId === memberId && hasSubscription(other, r.endDate!),
          ),
      )
    )
      exits++;
    if (
      terminated.some((r) =>
        all.some(
          (other) =>
            other.memberId === memberId &&
            !scope.has(other.locationId) &&
            hasSubscription(other, r.endDate!),
        ),
      )
    )
      transfersOut++;
  }
  for (const memberId of starts) {
    const first = rows
      .filter(
        (r) =>
          r.memberId === memberId &&
          r.startDate >= from &&
          r.startDate <= through,
      )
      .sort((a, b) => a.startDate.localeCompare(b.startDate))[0]!;
    const previous = all.filter(
      (r) => r.memberId === memberId && r.startDate < first.startDate,
    );
    if (!previous.length) newMembers++;
    else if (
      !previous.some(
        (r) =>
          scope.has(r.locationId) &&
          (!r.endDate || r.endDate >= first.startDate),
      ) &&
      previous.some(
        (r) => !scope.has(r.locationId) && r.endDate === first.startDate,
      )
    )
      transfersIn++;
    else if (!previous.some((r) => !r.endDate || r.endDate >= first.startDate))
      rejoined++;
  }
  const opening = uniq(activeAt(from));
  return {
    active: uniq(activeAt(through)),
    opening,
    exits,
    churn: opening ? exits / opening : null,
    newMembers,
    rejoined,
    transfersIn,
    transfersOut,
    paused: uniq(
      end.filter((r) => paused(r, through) && r.pauseKind === 'paused'),
    ),
    frozen: uniq(
      end.filter((r) => paused(r, through) && r.pauseKind === 'frozen'),
    ),
  };
}
export function emptyMetrics(): Metrics {
  return {
    active: null,
    paused: null,
    frozen: null,
    newMembers: null,
    exits: null,
    rejoined: null,
    transfersIn: null,
    transfersOut: null,
    opening: null,
    churn: null,
    revenue: null,
    received: null,
    outstanding: null,
    failedDebits: null,
    leads: null,
    converted: null,
    soldMemberships: null,
    requestedCancellations: null,
    withoutFutureAppointment: null,
    conversion: null,
    appointments: null,
    visitingActive: null,
    sleeping: null,
  };
}
export function calculateReport(
  organization: ReportOrganization,
  imports: StoredImport[],
  dataset: 'real' | 'demo',
  kind: 'daily' | 'monthly',
  date: string,
  settings: ReportSettings,
  now = new Date(),
): ManagementReport {
  const { from, through } = reportPeriod(kind, date);
  const warnings: string[] = [];
  const sources: ManagementReport['sources'] = [];
  const selected = new Map<string, StoredImport>();
  for (const location of organization.locations)
    for (const source of [
      'dewi-members',
      'dewi-finance',
      'healthplanner',
    ] as Source[]) {
      // A complete file replaces the earlier file for its declared scope and coverage, never silently combines overlapping snapshots.
      const candidates = imports
        .filter(
          (i) =>
            i.dataset === dataset &&
            i.source === source &&
            i.status === 'accepted' &&
            i.locations.includes(location.id),
        )
        .sort(
          (a, b) =>
            b.importedAt.localeCompare(a.importedAt) ||
            b.id.localeCompare(a.id),
        );
      let covered = candidates.find(
        (i) => i.complete && i.from <= from && i.through >= through,
      );
      if (!covered && source === 'healthplanner') {
        const daily: HealthplannerRow[] = [];
        let newest: StoredImport | undefined;
        for (let day = from; day <= through; day = shiftDate(day, 1)) {
          const item = candidates.find(
            (i) =>
              i.complete &&
              i.from <= day &&
              i.through >= day &&
              i.rows.some(
                (r) =>
                  'date' in r && r.date === day && r.locationId === location.id,
              ),
          );
          if (!item) break;
          daily.push(
            ...(item.rows as HealthplannerRow[]).filter(
              (r) => r.date === day && r.locationId === location.id,
            ),
          );
          if (!newest || item.importedAt > newest.importedAt) newest = item;
        }
        const days =
          Math.round((Date.parse(through) - Date.parse(from)) / 86400_000) + 1;
        if (newest && daily.length === days)
          covered = { ...newest, from, through, rows: daily };
      }
      const latest = covered ?? candidates[0];
      const rejected = imports
        .filter(
          (i) =>
            i.dataset === dataset &&
            i.source === source &&
            i.status === 'rejected' &&
            i.locations.includes(location.id) &&
            i.from <= through &&
            i.through >= from,
        )
        .sort((a, b) => b.importedAt.localeCompare(a.importedAt))[0];
      const invalid =
        !!rejected && (!latest || rejected.importedAt >= latest.importedAt);
      const stale =
        latest &&
        now.getTime() - new Date(latest.importedAt).getTime() > 36 * 3600_000 &&
        through >= shiftDate(localClock(now).date, -1);
      const status = invalid
        ? 'invalid'
        : !latest
          ? 'missing'
          : !covered
            ? 'partial'
            : stale
              ? 'stale'
              : 'ready';
      sources.push({
        source,
        locationId: location.id,
        status,
        importId: latest?.id ?? null,
        importedAt: latest?.importedAt ?? null,
        from: latest?.from ?? null,
        through: latest?.through ?? null,
      });
      if (status !== 'ready')
        warnings.push(
          `${location.name} · ${source}: ${status === 'invalid' ? 'laatste poging afgewezen; eerdere geldige gegevens kunnen hieronder staan' : status === 'missing' ? 'ontbreekt' : status === 'partial' ? 'onvolledig / periode niet gedekt' : 'import ouder dan 36 uur'}.`,
        );
      if (covered) selected.set(`${location.id}:${source}`, covered);
    }
  const allMembers = organization.locations.flatMap(
    (l) =>
      (selected.get(`${l.id}:dewi-members`)?.rows ?? []).filter(
        (r) => r.locationId === l.id,
      ) as MembershipRow[],
  );
  const clubs = organization.locations.map((location) => {
    const metrics = emptyMetrics();
    if (selected.has(`${location.id}:dewi-members`))
      Object.assign(
        metrics,
        memberMetrics(
          allMembers.filter((r) => r.locationId === location.id),
          allMembers,
          from,
          through,
        ),
      );
    const finance = selected.get(`${location.id}:dewi-finance`);
    if (finance) {
      const rows = (finance.rows as FinanceRow[]).filter(
        (r) => r.locationId === location.id,
      );
      const sum = (k: FinanceRow['kind'], snapshot = false) =>
        rows
          .filter(
            (r) =>
              r.kind === k &&
              (snapshot
                ? r.date === through
                : r.date >= from && r.date <= through),
          )
          .reduce((s, r) => s + r.amountCents, 0);
      metrics.revenue = sum('revenue');
      metrics.received = sum('payment');
      metrics.outstanding = sum('outstanding', true);
      metrics.failedDebits = rows.filter(
        (r) => r.kind === 'failed_debit' && r.date === through,
      ).length;
    }
    const hp = selected.get(`${location.id}:healthplanner`);
    if (hp) {
      const rows = (hp.rows as HealthplannerRow[]).filter(
        (r) =>
          r.locationId === location.id && r.date >= from && r.date <= through,
      );
      for (const key of [
        'leads',
        'converted',
        'appointments',
        'soldMemberships',
        'requestedCancellations',
      ] as const)
        metrics[key] =
          rows.length && rows.every((r) => r[key] != null)
            ? rows.reduce((s, r) => s + r[key]!, 0)
            : null;
      const last = rows.find((r) => r.date === through);
      metrics.visitingActive = last?.visitingActive ?? null;
      metrics.sleeping = last?.sleeping ?? null;
      metrics.withoutFutureAppointment = last?.withoutFutureAppointment ?? null;
      metrics.conversion =
        metrics.leads && metrics.converted !== null
          ? metrics.converted / metrics.leads
          : null;
      if (
        [
          'leads',
          'converted',
          'appointments',
          'visitingActive',
          'sleeping',
        ].some((key) => metrics[key as keyof Metrics] === null)
      )
        warnings.push(
          `${location.name} · healthplanner: één of meer velden ontbreken; deze waarden blijven onbekend.`,
        );
    }
    return { ...location, metrics };
  });
  const total = emptyMetrics();
  for (const key of Object.keys(total) as (keyof Metrics)[])
    if (clubs.length && clubs.every((c) => c.metrics[key] !== null))
      total[key] = clubs.reduce((s, c) => s + c.metrics[key]!, 0);
  if (organization.locations.every((l) => selected.has(`${l.id}:dewi-members`)))
    Object.assign(total, memberMetrics(allMembers, allMembers, from, through));
  else {
    for (const c of clubs) {
      c.metrics.newMembers = null;
      c.metrics.exits = null;
      c.metrics.rejoined = null;
      c.metrics.transfersIn = null;
      c.metrics.transfersOut = null;
      c.metrics.churn = null;
    }
    total.newMembers = null;
    total.exits = null;
    total.rejoined = null;
    total.transfersIn = null;
    total.transfersOut = null;
    warnings.push(
      'Ledenhistorie van alle clubs nodig om verhuizingen, nieuwe leden en uitstroom betrouwbaar te onderscheiden.',
    );
  }
  // Healthplanner exports do not prove cross-club identity; organization-wide visiting-member counts stay unknown.
  total.visitingActive = null;
  total.sleeping = null;
  total.withoutFutureAppointment = null;
  total.churn =
    total.opening && total.exits !== null ? total.exits / total.opening : null;
  total.conversion =
    total.leads && total.converted !== null
      ? total.converted / total.leads
      : null;
  const approved =
    settings.rulesApproved && settings.rulesVersion === REPORT_RULES_VERSION;
  if (!approved)
    warnings.unshift('Voorlopige bedrijfsregels: nog niet goedgekeurd.');
  if (dataset === 'demo')
    warnings.unshift(
      'DEMO — fictieve gegevens, geen werkelijke Sport Society-cijfers.',
    );
  return {
    organization,
    dataset,
    kind,
    from,
    through,
    generatedAt: now.toISOString(),
    provisional: !approved,
    rulesVersion: REPORT_RULES_VERSION,
    warnings,
    clubs,
    total,
    sources,
  };
}
