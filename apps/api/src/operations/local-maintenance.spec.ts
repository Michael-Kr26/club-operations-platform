import 'reflect-metadata';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { FastifyRequest } from 'fastify';
import type { Principal } from '@cop/contracts';
import { OperationsController } from './controller.js';
import { ReportingService, WEB_ORIGIN } from '../reporting/service.js';

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});
const owner: Principal = {
  userId: 'local-device-owner',
  organizationId: 'sport-society',
  locations: null,
  permissions: ['operations.manage'],
};
const request = (method = 'GET', origin = WEB_ORIGIN) =>
  ({ method, headers: { origin } }) as FastifyRequest;
function controller(principal = owner) {
  return new OperationsController({
    principal: async () => principal,
  } as unknown as ReportingService);
}
function local() {
  vi.stubEnv('COP_STORAGE_MODE', 'pglite-local');
  vi.stubEnv('HOST', '127.0.0.1');
  vi.stubEnv('COP_MAINTENANCE_URL', 'http://127.0.0.1:12345');
  vi.stubEnv('COP_MAINTENANCE_TOKEN', 'test-only');
}
describe('toegang lokaal back-upbeheer', () => {
  it('weigert organisatiegebruikers, locatiescope, productie en afwijkende browserorigin', async () => {
    local();
    const fetcher = vi.spyOn(globalThis, 'fetch');
    await expect(
      controller({ ...owner, userId: 'org-admin' }).maintenanceStatus(
        request(),
        'sport-society',
      ),
    ).rejects.toThrow('apparaateigenaar');
    await expect(
      controller({ ...owner, locations: ['achterveld'] }).maintenanceStatus(
        request(),
        'sport-society',
      ),
    ).rejects.toThrow('apparaateigenaar');
    await expect(
      controller().backup(
        request('POST', 'https://outside.invalid'),
        'sport-society',
      ),
    ).rejects.toThrow('lokale COP-browser');
    vi.stubEnv('NODE_ENV', 'production');
    await expect(
      controller().maintenanceStatus(request(), 'sport-society'),
    ).rejects.toThrow('apparaateigenaar');
    expect(fetcher).not.toHaveBeenCalled();
  });
  it('gebruikt de geheime lokale verbinding en retourneert geen token naar de browser', async () => {
    local();
    const fetcher = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify({
          directory: 'local-backups',
          backups: [],
          error: null,
        }),
        { headers: { 'content-type': 'application/json' } },
      ),
    );
    const result = await controller().backup(request('POST'), 'sport-society');
    expect(fetcher).toHaveBeenCalledWith(
      'http://127.0.0.1:12345/backup',
      expect.objectContaining({
        method: 'POST',
        headers: { Authorization: 'Bearer test-only' },
      }),
    );
    expect(result).not.toHaveProperty('token');
    vi.stubEnv('COP_MAINTENANCE_URL', 'https://outside.invalid');
    await expect(
      controller().maintenanceStatus(request(), 'sport-society'),
    ).rejects.toThrow('Herstart COP');
  });
});
