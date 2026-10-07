import { describe, expect, it, vi } from 'vitest';
import nodemailer from 'nodemailer';
import { LocalTestMailer } from './mail.js';

describe('lokale ontwikkelmail', () => {
  it('negeert ingestelde echte ontvangers en gebruikt uitsluitend loopback opvang', async () => {
    const sendMail = vi.fn().mockResolvedValue({ messageId: 'test' });
    const close = vi.fn();
    const transport = vi
      .spyOn(nodemailer, 'createTransport')
      .mockReturnValue({ sendMail, close } as never);
    try {
      await new LocalTestMailer().capture(
        {
          subject: 'Test',
          text: 'Onbekend',
          html: '<p>Onbekend</p>',
          recipients: ['real-person@example.com'],
          delivery: 'local-test-only',
        },
        'run-1',
      );
      expect(transport).toHaveBeenCalledWith(
        expect.objectContaining({ host: '127.0.0.1', port: 1025 }),
      );
      expect(sendMail).toHaveBeenCalledWith(
        expect.objectContaining({
          to: 'opvang@localhost.invalid',
          from: 'cop@localhost.invalid',
          messageId: '<run-1@cop.localhost.invalid>',
        }),
      );
      expect(JSON.stringify(sendMail.mock.calls)).not.toContain('real-person');
      expect(close).toHaveBeenCalledOnce();
    } finally {
      transport.mockRestore();
    }
  });
});
