import nodemailer from 'nodemailer';
import type { MailPreview, ManagementReport, Metrics } from '@cop/contracts';

const escape = (s: string) =>
  s.replace(
    /[&<>"']/g,
    (c) =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[
        c
      ]!,
  );
export const metricLabels: Partial<Record<keyof Metrics, string>> = {
  active: 'Actieve leden (Dewi)',
  opening: 'Leden aan maandbegin',
  newMembers: 'Nieuwe leden',
  exits: 'Uitstroom',
  churn: 'Churn',
  rejoined: 'Herinschrijvingen',
  transfersIn: 'Verhuizingen in',
  transfersOut: 'Verhuizingen uit',
  paused: 'Gepauzeerd',
  frozen: 'Bevroren',
  revenue: 'Omzet',
  received: 'Ontvangen betalingen',
  outstanding: 'Openstaand',
  failedDebits: 'Mislukte incasso’s',
  soldMemberships: 'Verkochte lidmaatschappen (HP)',
  requestedCancellations: 'Opzeggingen gemeld (HP; geen effectieve uitstroom)',
  withoutFutureAppointment: 'Leden zonder toekomstige afspraak (HP)',
  leads: 'Leads',
  converted: 'Leads naar lid',
  conversion: 'Conversie',
  appointments: 'Afspraken',
  visitingActive: 'Bezoekend actief (HP)',
  sleeping: 'Slapend (HP)',
};
export function formatMetric(key: keyof Metrics, value: number | null) {
  if (value === null) return 'onbekend';
  if (['revenue', 'received', 'outstanding'].includes(key))
    return new Intl.NumberFormat('nl-NL', {
      style: 'currency',
      currency: 'EUR',
    }).format(value / 100);
  if (['churn', 'conversion'].includes(key))
    return new Intl.NumberFormat('nl-NL', {
      style: 'percent',
      maximumFractionDigits: 1,
    }).format(value);
  return String(value);
}
export function previewMail(
  report: ManagementReport,
  recipients: string[],
  delivery: MailPreview['delivery'] = 'local-test-only',
): MailPreview {
  const subject = `${report.dataset === 'demo' ? '[DEMO] ' : ''}${report.provisional ? '[VOORSTEL] ' : ''}${report.organization.name} · ${report.kind === 'monthly' ? 'Maandrapport & churn' : 'Ochtendrapport'} · ${report.from} t/m ${report.through}`;
  const cols = [
    ...report.clubs.map((c) => ({ name: c.name, metrics: c.metrics })),
    { name: 'Organisatietotaal', metrics: report.total },
  ];
  const rows = Object.entries(metricLabels)
    .filter(
      ([key]) =>
        report.kind === 'monthly' || !['opening', 'churn'].includes(key),
    )
    .map(([key, label]) => ({
      label,
      values: cols.map((c) =>
        formatMetric(key as keyof Metrics, c.metrics[key as keyof Metrics]),
      ),
    }));
  const attention = report.clubs
    .filter(
      (c) =>
        (c.metrics.failedDebits ?? 0) > 0 || (c.metrics.outstanding ?? 0) > 0,
    )
    .map((c) => `${c.name}: incasso/openstaand controleren.`);
  const notes = [
    ...report.warnings,
    ...attention,
    'Uitstroom: effectieve einddatum; churn: uitstroom / actieve leden bij aanvang van de maand.',
    delivery === 'local-test-only'
      ? 'Alleen lokale testmailopvang. Er wordt geen internetmail verstuurd.'
      : 'Verzending via Microsoft 365; SMTP-acceptatie bevestigt geen aflevering in de inbox.',
  ];
  return {
    subject,
    recipients,
    delivery,
    text: [
      subject,
      cols.map((c) => c.name).join(' | '),
      ...rows.map((r) => `${r.label}: ${r.values.join(' | ')}`),
      ...notes,
    ].join('\n'),
    html: `<!doctype html><html lang="nl"><meta charset="utf-8"><body style="font-family:Arial,sans-serif;color:#172840"><h1>${escape(subject)}</h1><p>Korte vergelijking van clubs · bedrag in euro · onbekend betekent ontbrekende gegevens.</p><table cellpadding="8" border="1" style="border-collapse:collapse"><thead><tr><th>Cijfer</th>${cols.map((c) => `<th>${escape(c.name)}</th>`).join('')}</tr></thead><tbody>${rows.map((r) => `<tr><th>${escape(r.label)}</th>${r.values.map((v) => `<td>${escape(v)}</td>`).join('')}</tr>`).join('')}</tbody></table><ul>${notes.map((n) => `<li>${escape(n)}</li>`).join('')}</ul></body></html>`,
  };
}
export interface TestMailer {
  readonly delivery?: MailPreview['delivery'];
  capture(preview: MailPreview, id: string): Promise<void>;
}
export class LocalTestMailer implements TestMailer {
  async capture(preview: MailPreview, id: string) {
    // No host, recipients or credentials from browser/settings/environment can enable internet delivery.
    const transport = nodemailer.createTransport({
      host: '127.0.0.1',
      port: 1025,
      secure: false,
      ignoreTLS: true,
      connectionTimeout: 5000,
      socketTimeout: 10000,
    });
    try {
      await transport.sendMail({
        from: 'cop@localhost.invalid',
        to: 'opvang@localhost.invalid',
        messageId: `<${id}@cop.localhost.invalid>`,
        subject: preview.subject,
        text: preview.text,
        html: preview.html,
        headers: { 'X-COP-Mode': 'local-test-only' },
      });
    } finally {
      transport.close();
    }
  }
}
