import { afterEach, describe, expect, it, vi } from 'vitest';
import { localReportAccess } from './local-access.js';
import { ReportingService } from './service.js';
import { sportSociety } from './store.js';
const env = {
  COP_LOCAL_REPORT_ACCESS: '1',
  COP_STORAGE_MODE: 'pglite-local',
  HOST: '127.0.0.1',
  NODE_ENV: 'development',
};
afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});
describe('tijdelijke toegang van de lokale apparaateigenaar', () => {
  it('vereist alle lokale serverinstellingen en sluit productie uit', () => {
    expect(localReportAccess(env)).toEqual({ organizationId: 'sport-society' });
    expect(
      localReportAccess({ ...env, COP_LOCAL_REPORT_ORGANIZATION: 'other' }),
    ).toEqual({ organizationId: 'other' });
    for (const change of [
      { COP_LOCAL_REPORT_ACCESS: '0' },
      { COP_STORAGE_MODE: 'postgres' },
      { HOST: '0.0.0.0' },
      { NODE_ENV: 'production' },
    ])
      expect(localReportAccess({ ...env, ...change })).toBeNull();
    expect(localReportAccess({})).toBeNull();
  });
  it('geeft zonder account alleen toegang tot de ingestelde lokale organisatie', async () => {
    for (const [key, value] of Object.entries(env)) vi.stubEnv(key, value);
    const service = new ReportingService();
    service.ready = true;
    const getSession = vi.fn().mockResolvedValue(null);
    service.auth = { api: { getSession } } as never;
    vi.spyOn(service.store, 'organization').mockResolvedValue(sportSociety);
    try {
      expect(
        await service.principal(
          new Headers(),
          'sport-society',
          'reports.manage',
        ),
      ).toMatchObject({
        userId: 'local-device-owner',
        organizationId: 'sport-society',
        locations: null,
      });
      expect(getSession).not.toHaveBeenCalled();
      expect(service.status()).toMatchObject({
        localReportAccess: true,
        setupRequired: false,
      });
      await expect(
        service.principal(new Headers(), 'other', 'reports.read'),
      ).rejects.toThrow('Meld je aan');
      expect(getSession).toHaveBeenCalledOnce();
    } finally {
      await service.onModuleDestroy();
    }
  });
  it('blijft zonder opt-in weigeren, ook met een browserheader die toegang vraagt', async () => {
    for (const [key, value] of Object.entries(env)) vi.stubEnv(key, value);
    vi.stubEnv('COP_LOCAL_REPORT_ACCESS', '0');
    const service = new ReportingService();
    service.ready = true;
    service.auth = {
      api: { getSession: vi.fn().mockResolvedValue(null) },
    } as never;
    try {
      await expect(
        service.principal(
          new Headers({ 'X-Local-Report-Access': '1' }),
          'sport-society',
          'reports.read',
        ),
      ).rejects.toThrow('Meld je aan');
      expect(service.status().localReportAccess).toBe(false);
    } finally {
      await service.onModuleDestroy();
    }
  });
});
