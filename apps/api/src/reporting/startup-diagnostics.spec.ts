import { describe, expect, it } from 'vitest';
import { startupDiagnostic } from '../../scripts/startup-diagnostics.mjs';

describe('lokale startdiagnostiek', () => {
  it('toont stap, foutcode en onderliggende oorzaak zonder parameters of geheimen', () => {
    const cause = Object.assign(new Error('EPERM bij openen bestand'), {
      code: 'EPERM',
    });
    const error = Object.assign(
      new Error(
        'Verbinding postgres://user:secret@localhost mislukt; client_secret=private-value',
      ),
      { cause, params: ['private-parameter'] },
    );
    const text = startupDiagnostic(error, 'database');
    expect(text).toContain('database');
    expect(text).toContain('EPERM');
    expect(text).not.toContain('user:secret');
    expect(text).not.toContain('private-value');
    expect(text).not.toContain('private-parameter');
  });
  it('begrensde oorzaakketen voorkomt een lus', () => {
    const error = new Error('test');
    error.cause = error;
    expect(startupDiagnostic(error, 'API')).toBe('Startfout tijdens API: test');
  });
});
