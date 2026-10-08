import { spawn } from 'node:child_process';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { once } from 'node:events';
import { startLocalDatabase } from './local-database.mjs';

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
  stopping = false;
async function stop(code = 0) {
  if (stopping) return;
  stopping = true;
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
  const env = {
    ...process.env,
    DATABASE_URL: database.connectionString,
    COP_DATA_DIR: directory,
    COP_STORAGE_MODE: 'pglite-local',
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
    console.log(
      'Eerste account: lees de installatiecode in een tweede terminal met Get-Content "$env:USERPROFILE\\.cop\\setup-token".',
    );
    console.log(
      'Ctrl+C stopt de website en database. Lokale SMTP-opvang vereist apart Mailpit; mailvoorbeelden werken zonder Mailpit.',
    );
  }
} catch (error) {
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
