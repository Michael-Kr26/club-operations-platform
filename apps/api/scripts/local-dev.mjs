import {
  defaultHealthplannerFile,
  defaultImportFolder,
} from './local-workbook-path.mjs';
import { spawn } from 'node:child_process';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { once } from 'node:events';
import { startLocalDatabase } from './local-database.mjs';
import { startBackupManager } from './local-backups.mjs';
import { mkdir, copyFile, unlink, access } from 'node:fs/promises';
import { constants } from 'node:fs';
import { startupDiagnostic } from './startup-diagnostics.mjs';

// pnpm --filter starts this script in apps/api. Use the same working directory
// as a direct start from the repository root, on Windows as well as Unix.
const rootDirectory = fileURLToPath(new URL('../../../', import.meta.url));
process.chdir(rootDirectory);
const directory = process.env.COP_DATA_DIR ?? join(homedir(), '.cop');
const apiDirectory = fileURLToPath(new URL('../', import.meta.url));
const webDirectory = fileURLToPath(new URL('../../web/', import.meta.url));
const webRequire = createRequire(
  new URL('../../web/package.json', import.meta.url),
);
const vite = join(
  webRequire.resolve('vite/package.json'),
  '..',
  'bin',
  'vite.js',
);
const children = [];
let database,
  backupManager,
  stopping = false;
let phase = 'database starten en migreren';
let stopTimer;
async function stop(code = 0) {
  if (stopping) return;
  stopping = true;
  clearInterval(stopTimer);
  await Promise.all(
    children.map(async (child) => {
      if (child.exitCode !== null || child.signalCode !== null) return;
      const exited = once(child, 'exit');
      child.kill('SIGTERM');
      const timer = setTimeout(() => child.kill('SIGKILL'), 5000);
      await exited;
      clearTimeout(timer);
    }),
  );
  await backupManager?.close();
  await database?.close();
  console.log('COP netjes gestopt.');
  process.exitCode = code;
}
process.on('SIGINT', () => void stop());
process.on('SIGTERM', () => void stop());
function start(args, cwd, env) {
  const child = spawn(process.execPath, args, { cwd, env, stdio: 'inherit' });
  children.push(child);
  child.on('error', () => {
    console.error('COP kon een lokaal proces niet starten.');
    void stop(1);
  });
  child.on('exit', (code) => {
    if (!stopping) {
      console.error(`COP-proces gestopt (${code ?? 'signaal'}).`);
      void stop(code || 1);
    }
  });
  return child;
}
async function waitFor(url, check) {
  const deadline = Date.now() + 30000;
  while (Date.now() < deadline && !stopping) {
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(2000) });
      if (response.ok && (await check(response))) return;
    } catch {
      /* Startup may not be listening yet. */
    }
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  throw new Error(
    'COP-start niet bevestigd. Controleer bovenstaande procesmeldingen.',
  );
}
try {
  console.log(
    'Lokale database starten en migraties uitvoeren (zonder Docker)…',
  );
  database = await startLocalDatabase(directory);
  if (process.env.COP_STOP_FILE) {
    const stopFile = process.env.COP_STOP_FILE;
    await unlink(stopFile).catch((error) => {
      if (error.code !== 'ENOENT') throw error;
    });
    stopTimer = setInterval(() => {
      void access(stopFile)
        .then(async () => {
          await unlink(stopFile);
          await stop();
        })
        .catch(() => undefined);
    }, 1000);
    stopTimer.unref();
  }
  backupManager = await startBackupManager(
    database.db,
    process.env.COP_BACKUP_DIR ?? join(directory, 'backups'),
  );
  const importDirectory =
    process.env.COP_IMPORT_FOLDER ?? defaultImportFolder();
  for (const folder of ['omzet', 'registratie', 'statusrapporten'])
    await mkdir(join(importDirectory, folder), { recursive: true });
  // Preserve the previous workbook while making a one-time copy at the new location.
  if (process.env.COP_HEALTHPLANNER_FILE === undefined) {
    await copyFile(
      join(defaultImportFolder(), 'Healthplanner_leden_updates.xlsx'),
      defaultHealthplannerFile(),
      constants.COPYFILE_EXCL,
    ).catch((error) => {
      if (!['ENOENT', 'EEXIST'].includes(error.code)) throw error;
    });
  }
  console.log('Lokale database en migraties klaar.');
  phase = 'API starten';
  const env = {
    ...process.env,
    DATABASE_URL: database.connectionString,
    COP_DATA_DIR: directory,
    COP_MAINTENANCE_URL: backupManager.url,
    COP_MAINTENANCE_TOKEN: backupManager.token,
    COP_STORAGE_MODE: 'pglite-local',
    COP_IMPORT_FOLDER: process.env.COP_IMPORT_FOLDER ?? defaultImportFolder(),
    COP_IMPORT_ORGANIZATION:
      process.env.COP_IMPORT_ORGANIZATION ?? 'sport-society',
    COP_HEALTHPLANNER_FILE:
      process.env.COP_HEALTHPLANNER_FILE ?? defaultHealthplannerFile(),
    COP_HEALTHPLANNER_ORGANIZATION:
      process.env.COP_HEALTHPLANNER_ORGANIZATION ?? 'sport-society',
    COP_LOCAL_REPORT_ACCESS: process.env.COP_LOCAL_REPORT_ACCESS ?? '1',
    PORT: '3000',
    HOST: '127.0.0.1',
    API_URL: 'http://localhost:3000',
    WEB_URL: 'http://localhost:5173',
  };
  start(['dist/main.js'], apiDirectory, env);
  await waitFor(
    'http://127.0.0.1:3000/api/v1/reporting-status',
    async (response) => (await response.json()).ready === true,
  );
  if (!stopping) {
    phase = 'website starten';
    start(
      [vite, '--host', '127.0.0.1', '--port', '5173', '--strictPort'],
      webDirectory,
      env,
    );
    await waitFor('http://127.0.0.1:5173/', async () => true);
    console.log('\nCOP klaar: http://localhost:5173/rapportages');
    console.log(
      `Gegevens blijven opgeslagen in: ${join(directory, 'postgres-local')}`,
    );
    if (env.COP_LOCAL_REPORT_ACCESS === '1' && env.NODE_ENV !== 'production') {
      console.log(
        'Rapportages en Excel-dashboard openen lokaal zonder aanmelding.',
      );
    } else {
      console.log(
        'Eerste account: lees de installatiecode in een tweede terminal met Get-Content "$env:USERPROFILE\\.cop\\setup-token".',
      );
    }
    console.log(
      'Ctrl+C stopt de website en database. Lokale SMTP-opvang vereist apart Mailpit; mailvoorbeelden werken zonder Mailpit.',
    );
  }
} catch (error) {
  console.error(startupDiagnostic(error, phase));
  console.error(`Runtime: Node ${process.version} (${process.arch}).`);
  console.error(`Werkmap: ${process.cwd()}`);
  console.error(`Lokale gegevensmap: ${directory}`);
  if (error.message?.includes('vergrendeld')) console.error(error.message);
  if (error.code === 'EADDRINUSE')
    console.error(
      'Een lokale databasepoort is al in gebruik. Sluit de andere COP-terminal.',
    );
  console.error(
    'Lokaal starten mislukt. Controleer de procesmelding hierboven, eventuele tweede COP-terminal en de rechten op de lokale gegevensmap.',
  );
  await stop(1);
}
