import { describe, expect, it, vi } from 'vitest';
import nodemailer from 'nodemailer';
import {
  Microsoft365Mailer,
  checkRealRecipients,
  validateMicrosoftConfig,
} from './microsoft-mail.js';
const config = {
  organizationId: 'sport-society',
  enabled: true,
  tenantId: '00000000-0000-0000-0000-000000000001',
  clientId: '00000000-0000-0000-0000-000000000002',
  clientSecret: 'fixture-secret',
  mailbox: 'barneveld@sport-society.nl',
  allowedRecipients: ['review@example.com'],
};
describe('Microsoft 365 verzending zonder echte netwerkverzoeken', () => {
  it('weigert configuratie voor andere tenant en een afwijkende Sport Society-afzender', () => {
    expect(() => validateMicrosoftConfig(config, 'other')).toThrow();
    expect(() =>
      validateMicrosoftConfig(
        { ...config, mailbox: 'other@example.com' },
        'sport-society',
      ),
    ).toThrow();
    expect(() =>
      validateMicrosoftConfig(
        { ...config, tenantId: '../other' },
        'sport-society',
      ),
    ).toThrow();
  });
  it('weigert ongeautoriseerde ontvangers voordat OAuth of SMTP wordt aangeroepen', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    try {
      expect(() => checkRealRecipients(config, [])).toThrow();
      await expect(
        new Microsoft365Mailer(config).capture(
          {
            subject: 'Test',
            text: 'Test',
            html: 'Test',
            recipients: ['other@example.com'],
            delivery: 'microsoft365',
          },
          'id',
        ),
      ).rejects.toThrow();
      expect(fetchMock).not.toHaveBeenCalled();
    } finally {
      vi.unstubAllGlobals();
    }
  });
  it('gebruikt OAuth, STARTTLS, vaste afzender en alleen toegestane ontvangers', async () => {
    const sendMail = vi
      .fn()
      .mockResolvedValue({ accepted: ['review@example.com'], rejected: [] });
    const close = vi.fn();
    const transport = vi
      .spyOn(nodemailer, 'createTransport')
      .mockReturnValue({ sendMail, close } as never);
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ access_token: 'fixture-token' }),
    });
    vi.stubGlobal('fetch', fetchMock);
    try {
      await new Microsoft365Mailer(config).capture(
        {
          subject: 'Test',
          text: 'Test',
          html: 'Test',
          recipients: ['review@example.com'],
          delivery: 'microsoft365',
        },
        'run-1',
      );
      expect(String(fetchMock.mock.calls[0]?.[1].body)).toContain(
        'scope=https%3A%2F%2Foutlook.office365.com%2F.default',
      );
      expect(transport).toHaveBeenCalledWith(
        expect.objectContaining({
          host: 'smtp.office365.com',
          port: 587,
          requireTLS: true,
          auth: {
            type: 'OAuth2',
            user: config.mailbox,
            accessToken: 'fixture-token',
          },
          logger: false,
          debug: false,
        }),
      );
      expect(sendMail).toHaveBeenCalledWith(
        expect.objectContaining({
          from: config.mailbox,
          envelope: { from: config.mailbox, to: ['review@example.com'] },
        }),
      );
      expect(close).toHaveBeenCalledOnce();
    } finally {
      transport.mockRestore();
      vi.unstubAllGlobals();
    }
  });
  it('behandelt gedeeltelijke acceptatie als onzeker en sluit de verbinding', async () => {
    const close = vi.fn();
    const transport = vi.spyOn(nodemailer, 'createTransport').mockReturnValue({
      sendMail: vi.fn().mockResolvedValue({
        accepted: [],
        rejected: ['review@example.com'],
      }),
      close,
    } as never);
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ access_token: 'fixture-token' }),
      }),
    );
    try {
      await expect(
        new Microsoft365Mailer(config).capture(
          {
            subject: 'Test',
            text: 'Test',
            html: 'Test',
            recipients: ['review@example.com'],
            delivery: 'microsoft365',
          },
          'run-1',
        ),
      ).rejects.toThrow();
      expect(close).toHaveBeenCalledOnce();
    } finally {
      transport.mockRestore();
      vi.unstubAllGlobals();
    }
  });
});
