import { WorkbookInbox } from './workbook-inbox.js';
import {
  afterAll,
  afterEach,
  beforeAll,
  describe,
  expect,
  it,
  vi,
} from 'vitest';
import { mkdtemp, rm, writeFile, utimes, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import ExcelJS from 'exceljs';
import { Pool } from 'pg';
import type { Principal } from '@cop/contracts';
import { startLocalDatabase } from '../../scripts/local-database.mjs';
import {
  defaultHealthplannerFile,
  defaultImportFolder,
} from '../../scripts/local-workbook-path.mjs';
import { LocalWorkbookFile } from './local-workbook-file.js';
import { WorkbookImports } from './workbook-imports.js';
import { ReportStore, sportSociety } from './store.js';
import { healthplannerFixture, forecastFixture } from './workbook-fixtures.js';
const principal: Principal = {
  userId: 'fixture',
  organizationId: sportSociety.id,
  locations: null,
  permissions: ['reports.read', 'reports.manage'],
};
let directory: string,
  database: Awaited<ReturnType<typeof startLocalDatabase>>,
  pool: Pool,
  imports: WorkbookImports;
afterEach(() => vi.unstubAllEnvs());
const now = new Date('2026-10-23T07:00:00Z');
beforeAll(async () => {
  directory = await mkdtemp(join(tmpdir(), 'cop-fixed-workbook-'));
  database = await startLocalDatabase(directory, { port: 0 });
  pool = new Pool({ connectionString: database.connectionString });
  await new ReportStore(pool).seed();
  imports = new WorkbookImports(pool);
}, 60000);
afterAll(async () => {
  await pool?.end();
  await database?.close();
  if (directory) await rm(directory, { recursive: true, force: true });
});
const source = (path: string, available = true) =>
  new LocalWorkbookFile(imports, {
    available,
    path,
    organizationId: sportSociety.id,
  });
async function put(path: string, bytes: Buffer) {
  await writeFile(path, bytes);
  await utimes(path, new Date(0), new Date(0));
}
describe('vast lokaal Healthplanner-bestand', () => {
  it('kiest het opgegeven Windows-pad vanuit de eigen gebruikersmap', () => {
    expect(defaultHealthplannerFile('win32', 'C:\\Users\\mssyt')).toBe(
      'C:\\Users\\mssyt\\OneDrive\\Documenten\\Werkdocumenten\\SportSociety\\Taken\\AOM Taken\\Healthplanner_leden_updates.xlsx',
    );
    expect(defaultHealthplannerFile('linux', '/home/test')).toBe('');
    expect(defaultImportFolder('win32', 'C:/Users/mssyt')).toBe(
      'C:' +
        String.fromCharCode(92) +
        [
          'Users',
          'mssyt',
          'OneDrive',
          'Documenten',
          'Werkdocumenten',
          'SportSociety',
          'Taken',
          'AOM Taken',
          'COP imports',
        ].join(String.fromCharCode(92)),
    );
  });
  it('importeert gewijzigd Excel met bronperioden en voorkomt dubbeltelling na herstart', async () => {
    const path = join(directory, 'Healthplanner_leden_updates.xlsx');
    await put(path, await healthplannerFixture());
    const watcher = source(path);
    await Promise.all([
      watcher.scan(sportSociety, now),
      watcher.scan(sportSociety, now),
    ]);
    expect(watcher.status(sportSociety.id)?.status).toBe('imported');
    const first = await imports.list(principal, 'real');
    expect(first).toHaveLength(1);
    expect(first[0]?.report?.kind).toBe('healthplanner');
    expect(
      first[0]?.report?.kind !== 'forecast' &&
        first[0]?.report?.rows[0]?.period,
    ).toBe('2026W39');
    await watcher.scan(sportSociety, new Date(now.getTime() + 60000));
    expect(watcher.status(sportSociety.id)?.status).toBe('unchanged');
    await source(path).scan(sportSociety, now);
    expect(await imports.list(principal, 'real')).toHaveLength(1);
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load((await healthplannerFixture()) as never);
    const sheet = workbook.getWorksheet('Wekelijkse update')!;
    // Alter a source count without changing the reporting period.
    sheet.eachRow((row) => {
      if (row.getCell(1).text === 'Totaal leden') row.getCell(2).value = 11;
    });
    await put(path, Buffer.from(await workbook.xlsx.writeBuffer()));
    await watcher.scan(sportSociety, new Date(now.getTime() + 120000));
    expect(await imports.list(principal, 'real')).toHaveLength(2);
    expect(await imports.list(principal, 'demo')).toEqual([]);
    expect(watcher.status('other')).toBeUndefined();
    await watcher.scan(
      { ...sportSociety, id: 'other' },
      new Date(now.getTime() + 180000),
    );
    expect(
      await imports.list({ ...principal, organizationId: 'other' }, 'real'),
    ).toEqual([]);
    const successful = watcher.status(sportSociety.id)?.lastImportedAt;
    await rm(path);
    await watcher.scan(sportSociety, new Date(now.getTime() + 240000));
    expect(watcher.status(sportSociety.id)).toMatchObject({
      status: 'error',
      lastImportedAt: successful,
    });
    expect(await imports.list(principal, 'real')).toHaveLength(2);
  });
  it('weigert verkeerde bestandstypen en bewaart eerdere geldige imports', async () => {
    const path = join(directory, 'wrong.xlsx');
    await put(path, await forecastFixture());
    const watcher = source(path);
    await watcher.scan(sportSociety, now);
    expect(watcher.status(sportSociety.id)?.status).toBe('rejected');
    const rows = await imports.list(principal, 'real');
    expect(rows.filter((item) => item.status === 'accepted')).toHaveLength(2);
    const rejected = rows.find((item) => item.status === 'rejected');
    expect(rejected?.report).toBeNull();
    expect(rejected?.error).toContain('Healthplanner-updatetabel');
    expect(
      (await imports.original(principal.organizationId, rejected!.id)).original
        .length,
    ).toBeGreaterThan(0);
    const unavailable = source(path, false);
    await unavailable.scan(sportSociety, now);
    expect(unavailable.status(sportSociety.id)).toBeUndefined();
  });
  it('bewaakt uitsluitend de geconfigureerde echte organisatiemap en slaat Excel-lockbestanden over', async () => {
    const folder = join(directory, 'COP imports');
    vi.stubEnv('COP_IMPORT_FOLDER', folder);
    vi.stubEnv('COP_IMPORT_ORGANIZATION', sportSociety.id);
    const inbox = new WorkbookInbox(directory, imports, true);
    expect(inbox.path(sportSociety.id, 'real')).toBe(folder);
    expect(inbox.path(sportSociety.id, 'demo')).not.toBe(folder);
    expect(inbox.path('other', 'real')).not.toBe(folder);
    expect(
      new WorkbookInbox(directory, imports, false).path(
        sportSociety.id,
        'real',
      ),
    ).not.toBe(folder);
    await inbox.enable(sportSociety.id, 'real');
    await imports.preferences.inbox(sportSociety.id, 'real', 'fixture', true);
    await put(join(folder, '~$Healthplanner.xlsx'), Buffer.from('Excel lock'));
    await put(join(folder, 'download.xlsx'), await healthplannerFixture());
    await inbox.scan(sportSociety, 'real', now);
    expect(
      inbox
        .status(sportSociety.id, 'real', true)
        .files.map((file) => file.filename),
    ).toEqual(['download.xlsx']);
  });
  it('wacht op recente writes en volgt geen symlink', async () => {
    const path = join(directory, 'writing.xlsx');
    await put(path, await healthplannerFixture());
    await utimes(path, now, now);
    const watcher = source(path);
    await watcher.scan(sportSociety, now);
    expect(watcher.status(sportSociety.id)?.status).toBe('waiting');
    const link = join(directory, 'link.xlsx');
    await symlink(path, link);
    const linked = source(link);
    await linked.scan(sportSociety, now);
    expect(linked.status(sportSociety.id)?.status).toBe('error');
  });
});
