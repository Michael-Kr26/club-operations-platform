import { createHash, randomUUID, timingSafeEqual } from 'node:crypto';
import {
  mkdir,
  open,
  readdir,
  lstat,
  readFile,
  writeFile,
  rename,
  unlink,
} from 'node:fs/promises';
import { join, resolve, isAbsolute } from 'node:path';
import { createServer } from 'node:http';
import { PGlite } from '@electric-sql/pglite';

const suffix = '.copbackup';
const hash = (bytes) => createHash('sha256').update(bytes).digest('hex');

async function header(path) {
  const stat = await lstat(path);
  if (!stat.isFile() || stat.isSymbolicLink())
    throw new Error('Geen regulier back-upbestand.');
  const file = await open(path, 'r');
  try {
    const buffer = Buffer.alloc(4096);
    const { bytesRead } = await file.read(buffer, 0, buffer.length, 0);
    const end = buffer.subarray(0, bytesRead).indexOf(10);
    if (end < 0) throw new Error('Back-upkop ontbreekt.');
    const data = JSON.parse(buffer.subarray(0, end).toString('utf8'));
    if (
      data.format !== 'cop-pglite-1' ||
      !['manual', 'automatic'].includes(data.kind) ||
      !Number.isFinite(Date.parse(data.createdAt)) ||
      !/^[a-f0-9]{64}$/.test(data.sha256) ||
      !Number.isSafeInteger(data.bytes) ||
      data.bytes < 1 ||
      data.bytes !== stat.size - end - 1
    )
      throw new Error('Ongeldige back-upkop.');
    return { ...data, offset: end + 1 };
  } finally {
    await file.close();
  }
}

export async function listBackups(directory) {
  let entries;
  try {
    entries = await readdir(directory);
  } catch (error) {
    if (error.code === 'ENOENT') return [];
    throw error;
  }
  const backups = [];
  for (const name of entries.filter((name) => name.endsWith(suffix))) {
    try {
      const meta = await header(join(directory, name));
      backups.push({
        name,
        createdAt: meta.createdAt,
        bytes: meta.bytes,
        kind: meta.kind,
      });
    } catch {
      /* Incomplete or foreign files are neither listed nor removed. */
    }
  }
  return backups.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export async function createBackup(
  db,
  directory,
  kind = 'manual',
  now = new Date(),
) {
  if (!['manual', 'automatic'].includes(kind))
    throw new Error('Ongeldig back-uptype.');
  await mkdir(directory, { recursive: true, mode: 0o700 });
  const bytes = Buffer.from(await (await db.dumpDataDir('gzip')).arrayBuffer());
  const meta = {
    format: 'cop-pglite-1',
    createdAt: now.toISOString(),
    kind,
    sha256: hash(bytes),
    bytes: bytes.length,
  };
  const name = `cop-${now.toISOString().replace(/[:.]/g, '-')}-${randomUUID()}${suffix}`;
  const path = join(directory, name);
  const temporary = path + '.tmp';
  await writeFile(
    temporary,
    Buffer.concat([Buffer.from(JSON.stringify(meta) + '\n'), bytes]),
    { flag: 'wx', mode: 0o600 },
  );
  await rename(temporary, path);
  // Only old automatic archives created by COP are removed. Manual copies remain.
  const automatic = (await listBackups(directory)).filter(
    (entry) => entry.kind === 'automatic',
  );
  for (const entry of automatic.slice(14))
    await unlink(join(directory, entry.name));
  return { name, createdAt: meta.createdAt, bytes: meta.bytes, kind };
}

export async function restoreBackup(archive, target) {
  if (!isAbsolute(target))
    throw new Error('Gebruik een absoluut pad voor de nieuwe gegevensmap.');
  const meta = await header(archive);
  const bytes = (await readFile(archive)).subarray(meta.offset);
  if (hash(bytes) !== meta.sha256)
    throw new Error('De back-up is beschadigd: controlegetal wijkt af.');
  // Non-recursive mkdir is intentional: an existing directory is never overwritten.
  await mkdir(target, { mode: 0o700 });
  const restored = await PGlite.create(join(target, 'postgres-local'), {
    loadDataDir: new Blob([bytes]),
  });
  try {
    await restored.query('SELECT 1');
  } finally {
    await restored.close();
  }
  return resolve(target);
}

export async function startBackupManager(db, directory) {
  let pending = null;
  let error = null;
  const backup = (kind = 'manual') => {
    if (pending) return pending;
    pending = createBackup(db, directory, kind)
      .then((result) => {
        error = null;
        return result;
      })
      .catch((reason) => {
        error = 'Back-up mislukt. Controleer opslagruimte en maprechten.';
        throw reason;
      })
      .finally(() => {
        pending = null;
      });
    return pending;
  };
  const automatic = async () => {
    const latest = (await listBackups(directory)).find(
      (entry) => entry.kind === 'automatic',
    );
    if (!latest || Date.now() - Date.parse(latest.createdAt) >= 86400000)
      await backup('automatic');
  };
  await automatic().catch(() => {
    error =
      'Automatische back-up mislukt. Controleer opslagruimte en maprechten.';
  });
  const timer = setInterval(
    () =>
      void automatic().catch(() => {
        error =
          'Automatische back-up mislukt. Controleer opslagruimte en maprechten.';
      }),
    3600000,
  );
  timer.unref();
  const token = randomUUID();
  const server = createServer(async (req, res) => {
    const supplied = Buffer.from(req.headers.authorization ?? '');
    const expected = Buffer.from(`Bearer ${token}`);
    if (
      supplied.length !== expected.length ||
      !timingSafeEqual(supplied, expected)
    ) {
      res.writeHead(403).end();
      return;
    }
    if (
      !(req.method === 'GET' && req.url === '/status') &&
      !(req.method === 'POST' && req.url === '/backup')
    ) {
      res.writeHead(404).end();
      return;
    }
    res.setHeader('Content-Type', 'application/json');
    try {
      if (req.method === 'POST') await backup();
      res.end(
        JSON.stringify({
          directory,
          backups: await listBackups(directory),
          error,
        }),
      );
    } catch {
      res.writeHead(500).end(
        JSON.stringify({
          message: error ?? 'Lokaal beheer tijdelijk niet beschikbaar.',
        }),
      );
    }
  });
  await new Promise((resolveReady, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolveReady);
  });
  return {
    url: `http://127.0.0.1:${server.address().port}`,
    token,
    async close() {
      clearInterval(timer);
      await new Promise((done, reject) =>
        server.close((reason) => (reason ? reject(reason) : done())),
      );
      if (pending) await pending.catch(() => undefined);
    },
  };
}
