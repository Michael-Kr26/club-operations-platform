import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import nodemailer from 'nodemailer';
import type { MailPreview } from '@cop/contracts';
import type { TestMailer } from './mail.js';

export interface MicrosoftMailConfig {
  organizationId: string;
  enabled: boolean;
  tenantId: string;
  clientId: string;
  clientSecret: string;
  mailbox: string;
  allowedRecipients: string[];
}
const email = /^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/;
const guid = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
export function validateMicrosoftConfig(
  value: unknown,
  org: string,
): MicrosoftMailConfig {
  const c = value as MicrosoftMailConfig;
  if (
    !c ||
    c.organizationId !== org ||
    c.enabled !== true ||
    !guid.test(c.tenantId) ||
    !guid.test(c.clientId) ||
    typeof c.clientSecret !== 'string' ||
    !c.clientSecret.trim() ||
    !email.test(c.mailbox) ||
    !Array.isArray(c.allowedRecipients) ||
    !c.allowedRecipients.length ||
    c.allowedRecipients.some(
      (r) =>
        typeof r !== 'string' ||
        !email.test(r) ||
        /\.(invalid|localhost)$/i.test(r),
    )
  )
    throw new Error(
      'Ongeldige Microsoft 365-instellingen; controleer het lokale configuratiebestand.',
    );
  if (
    org === 'sport-society' &&
    c.mailbox.toLowerCase() !== 'barneveld@sport-society.nl'
  )
    throw new Error(
      'Voor Sport Society is alleen barneveld@sport-society.nl als afzender ingesteld.',
    );
  return c;
}
export async function loadMicrosoftConfig(directory: string, org: string) {
  try {
    const text = await readFile(
      join(directory, 'mail', `${encodeURIComponent(org)}.json`),
      'utf8',
    );
    const value = JSON.parse(text);
    if (value.enabled === false) return null;
    return validateMicrosoftConfig(value, org);
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === 'ENOENT') return null;
    // Never expose JSON content or provider responses containing secrets.
    // eslint-disable-next-line preserve-caught-error -- JSON parse errors may contain client secrets.
    throw new Error(
      'Microsoft 365-configuratie ongeldig of niet leesbaar. Controleer het lokale mailbestand.',
    );
  }
}
export function checkRealRecipients(
  config: MicrosoftMailConfig,
  recipients: string[],
) {
  const allowed = new Set(config.allowedRecipients.map((r) => r.toLowerCase()));
  if (
    !recipients.length ||
    recipients.some((r) => !email.test(r) || !allowed.has(r.toLowerCase()))
  )
    throw new Error(
      'Ontvangers ontbreken of zijn niet toegestaan in de lokale Microsoft 365-configuratie.',
    );
}
export class Microsoft365Mailer implements TestMailer {
  readonly delivery = 'microsoft365' as const;
  constructor(private readonly config: MicrosoftMailConfig) {}
  async capture(preview: MailPreview, id: string) {
    checkRealRecipients(this.config, preview.recipients);
    const response = await fetch(
      `https://login.microsoftonline.com/${this.config.tenantId}/oauth2/v2.0/token`,
      {
        method: 'POST',
        body: new URLSearchParams({
          grant_type: 'client_credentials',
          client_id: this.config.clientId,
          client_secret: this.config.clientSecret,
          scope: 'https://outlook.office365.com/.default',
        }),
        signal: AbortSignal.timeout(15000),
      },
    );
    if (!response.ok) throw new Error('Microsoft 365-autorisatie mislukt.');
    const token = (await response.json()) as { access_token?: string };
    if (typeof token.access_token !== 'string' || !token.access_token)
      throw new Error('Microsoft 365 gaf geen toegangstoken.');
    const transport = nodemailer.createTransport({
      host: 'smtp.office365.com',
      port: 587,
      secure: false,
      requireTLS: true,
      tls: { minVersion: 'TLSv1.2' },
      auth: {
        type: 'OAuth2',
        user: this.config.mailbox,
        accessToken: token.access_token,
      },
      connectionTimeout: 15000,
      socketTimeout: 30000,
      logger: false,
      debug: false,
    });
    try {
      const result = await transport.sendMail({
        from: this.config.mailbox,
        to: preview.recipients,
        envelope: { from: this.config.mailbox, to: preview.recipients },
        messageId: `<${id}@${this.config.mailbox.split('@')[1]}>`,
        subject: preview.subject,
        text: preview.text,
        html: preview.html,
        headers: { 'X-COP-Mode': 'microsoft365' },
      });
      if (
        result.rejected?.length ||
        result.accepted?.length !== preview.recipients.length
      )
        throw new Error(
          'Microsoft 365 heeft niet alle ontvangers geaccepteerd.',
        );
    } finally {
      transport.close();
    }
  }
}
