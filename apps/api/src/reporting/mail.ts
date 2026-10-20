import nodemailer from 'nodemailer';
import { designedMail, type MailDesignContext } from './mail-design.js';
import type { MailPreview, ManagementReport, Metrics } from '@cop/contracts';

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
  context: MailDesignContext = {},
): MailPreview {
  return designedMail(report, recipients, delivery, formatMetric, context);
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
