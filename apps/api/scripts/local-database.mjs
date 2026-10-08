import { mkdir, open, unlink } from 'node:fs/promises';
import { join } from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { PGlite } from '@electric-sql/pglite';
import { PGLiteSocketServer } from '@electric-sql/pglite-socket';

const dbRequire = createRequire(
  new URL('../../../packages/db/package.json', import.meta.url),
);
export async function startLocalDatabase(directory, { port = 5433 } = {}) {
  await mkdir(directory, { recursive: true, mode: 0o700 });
  const lockFile = join(directory, 'pglite-local.lock');
  let lock;
  try {
    lock = await open(lockFile, 'wx', 0o600);
    await lock.writeFile(String(process.pid));
  } catch (error) {
    if (error.code === 'EEXIST')
      throw new Error(
        'De lokale database is vergrendeld. Sluit de andere COP-terminal. Na een crash: controleer dat COP gestopt is voordat je pglite-local.lock verwijdert.',
        { cause: error },
      );
    throw error;
  }
  let db, server;
  let closed = false;
  const close = async () => {
    if (closed) return;
    closed = true;
    try {
      await server?.stop();
    } finally {
      try {
        await db?.close();
      } finally {
        await lock.close();
        await unlink(lockFile);
      }
    }
  };
  try {
    db = await PGlite.create(join(directory, 'postgres-local'));
    const { drizzle } = await import(
      pathToFileURL(dbRequire.resolve('drizzle-orm/pglite')).href
    );
    const { migrate } = await import(
      pathToFileURL(dbRequire.resolve('drizzle-orm/pglite/migrator')).href
    );
    await migrate(drizzle(db), {
      migrationsFolder: fileURLToPath(
        new URL('../../../packages/db/migrations/', import.meta.url),
      ),
    });
    server = new PGLiteSocketServer({
      db,
      port,
      host: '127.0.0.1',
      maxConnections: 20,
    });
    await server.start();
    return {
      db,
      server,
      connectionString: `postgresql://postgres:postgres@${server.getServerConn()}/postgres`,
      close,
    };
  } catch (error) {
    await close();
    throw error;
  }
}
