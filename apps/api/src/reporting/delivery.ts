import type { ManagementReport, ReportSettings, SendRun } from '@cop/contracts';
import type { TestMailer } from './mail.js';
import { previewMail } from './mail.js';
import type { ReportStore } from './store.js';
import { localClock, shiftDate } from './calculation.js';

export async function deliver(
  store: ReportStore,
  mailer: TestMailer,
  organizationId: string,
  report: ManagementReport,
  settings: ReportSettings,
  actor: string,
) {
  const id = await store.claim(
    organizationId,
    report.dataset,
    report.kind,
    report.from,
    actor,
  );
  if (!id) return { duplicate: true };
  const preview = previewMail(report, settings.recipients, mailer.delivery);
  await store.attachPreview(organizationId, id, preview);
  // Manual test capture may include unknown/provisional values, but scheduler explicitly blocks these.
  try {
    await mailer.capture(preview, id);
  } catch {
    await store.finish(
      organizationId,
      id,
      'uncertain',
      preview,
      'SMTP-acceptatie niet bevestigd. Controleer verzendhistorie en mailprovider; geen automatische retry vanwege mogelijk ontvangen bericht.',
    );
    return { id, status: 'uncertain' };
  }
  const status = mailer.delivery === 'microsoft365' ? 'sent' : 'captured';
  await store.finish(organizationId, id, status, preview, null);
  return { id, status };
}
export function dueRuns(
  now: Date,
  time: string,
): { kind: SendRun['kind']; date: string; missed: boolean }[] {
  const clock = localClock(now);
  const minutes = (value: string) =>
    Number(value.slice(0, 2)) * 60 + Number(value.slice(3, 5));
  const late = minutes(clock.time) - minutes(time) > 5;
  const todayRun = shiftDate(clock.date, -1);
  const due: { kind: SendRun['kind']; date: string; missed: boolean }[] = [];
  // A single previous run is recorded as missed on startup; older gaps are represented by the interval notice in the guide/UI.
  due.push({ kind: 'daily', date: shiftDate(clock.date, -2), missed: true });
  if (clock.time >= time)
    due.push({ kind: 'daily', date: todayRun, missed: late });
  const previousMonth =
    shiftDate(`${clock.date.slice(0, 7)}-01`, -1).slice(0, 7) + '-01';
  due.push({
    kind: 'monthly',
    date: previousMonth,
    missed: clock.date.slice(-2) !== '01' || late,
  });
  if (clock.date.endsWith('-01') && clock.time < time)
    return due.filter((r) => r.kind !== 'monthly');
  return due;
}
export function canDeliverReport(
  report: ManagementReport,
  settings: ReportSettings,
) {
  if (report.provisional || !settings.recipients.length) return false;
  if (
    !report.warnings.length &&
    report.sources.every((s) => s.status === 'ready')
  )
    return true;
  if (
    report.kind !== 'daily' ||
    settings.allowPartialDaily !== true ||
    !report.clubs.length
  )
    return false;
  return (
    report.clubs.every(
      (c) =>
        report.sources.some(
          (s) =>
            s.source === 'healthplanner' &&
            s.locationId === c.id &&
            s.status === 'ready',
        ) &&
        [
          c.metrics.leads,
          c.metrics.appointments,
          c.metrics.visitingActive,
          c.metrics.sleeping,
          c.metrics.soldMemberships,
          c.metrics.requestedCancellations,
          c.metrics.withoutFutureAppointment,
        ].every((v) => v != null),
    ) &&
    report.sources.every(
      (s) =>
        s.source === 'healthplanner' ||
        s.status === 'missing' ||
        s.status === 'ready',
    )
  );
}
export async function scheduledRun(
  store: ReportStore,
  mailer: TestMailer,
  org: string,
  run: ReturnType<typeof dueRuns>[number],
  report: ManagementReport,
  settings: ReportSettings,
) {
  if (run.missed)
    return store.claim(
      org,
      'real',
      run.kind,
      report.from,
      'scheduler',
      'missed',
      'Geplande tijd gemist (computer/proces uit, slaapstand of klokovergang). Geen automatische inhaalmail; vijf minuten startmarge.',
    );
  if (!canDeliverReport(report, settings))
    return store.claim(
      org,
      'real',
      run.kind,
      report.from,
      'scheduler',
      'blocked',
      'Bedrijfsregels, ontvangers of complete actuele bronnen ontbreken. Deze run blijft geregistreerd; geen automatische herverzending.',
    );
  return deliver(store, mailer, org, report, settings, 'scheduler');
}
