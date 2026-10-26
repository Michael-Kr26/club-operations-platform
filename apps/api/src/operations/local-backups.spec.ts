import { afterEach, describe, expect, it } from 'vitest';
import { mkdtemp, rm, readFile, writeFile, access } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { PGlite } from '@electric-sql/pglite';
import {
  createBackup,
  listBackups,
  restoreBackup,
  startBackupManager,
} from '../../scripts/local-backups.mjs';

const directories: string[] = [];
afterEach(async () => {
  for (const dir of directories.splice(0))
    await rm(dir, { recursive: true, force: true });
});
async function workspace() {
  const dir = await mkdtemp(join(tmpdir(), 'cop-backup-'));
  directories.push(dir);
  return dir;
}

describe('lokale databaseback-ups', () => {
  it('herstelt opgeslagen data en originelen, weigert beschadiging en overschrijft geen bestaande map', async () => {
    const root = await workspace();
    const db = await PGlite.create(join(root, 'source'));
    let saved;
    try {
      await db.exec(
        "CREATE TABLE sample (id int PRIMARY KEY, original bytea); INSERT INTO sample VALUES (1, decode('0001ff', 'hex'))",
      );
      saved = await createBackup(db, join(root, 'backups'));
    } finally {
      await db.close();
    }
    const archive = join(root, 'backups', saved.name);
    const target = join(root, 'restored');
    await restoreBackup(archive, target);
    const restored = await PGlite.create(join(target, 'postgres-local'));
    try {
      expect(
        (
          await restored.query(
            "SELECT id, encode(original, 'hex') AS original FROM sample",
          )
        ).rows,
      ).toEqual([{ id: 1, original: '0001ff' }]);
    } finally {
      await restored.close();
    }
    await expect(restoreBackup(archive, target)).rejects.toThrow();
    const corrupted = await readFile(archive);
    corrupted[corrupted.length - 1] ^= 1;
    const broken = join(root, 'broken.copbackup');
    await writeFile(broken, corrupted);
    await expect(
      restoreBackup(broken, join(root, 'should-not-exist')),
    ).rejects.toThrow('beschadigd');
    await expect(access(join(root, 'should-not-exist'))).rejects.toThrow();
  });
  it('bewaart 14 automatische kopieën en behoudt handmatige en onbekende bestanden', async () => {
    const root = await workspace();
    const db = { dumpDataDir: async () => new Blob(['synthetic archive']) };
    const manual = await createBackup(db, root, 'manual');
    await writeFile(join(root, 'unrelated.copbackup'), 'leave this alone');
    for (let day = 1; day <= 16; day++)
      await createBackup(
        db,
        root,
        'automatic',
        new Date(`2026-10-${String(day).padStart(2, '0')}T08:00:00Z`),
      );
    const entries = await listBackups(root);
    expect(entries.filter((entry) => entry.kind === 'automatic')).toHaveLength(
      14,
    );
    expect(entries.some((entry) => entry.name === manual.name)).toBe(true);
    expect(await readFile(join(root, 'unrelated.copbackup'), 'utf8')).toBe(
      'leave this alone',
    );
  });
  it('beschermt de interne beheerpoort en maakt een handmatige kopie zonder database-stop', async () => {
    const root = await workspace();
    const db = await PGlite.create(join(root, 'source'));
    const manager = await startBackupManager(db, join(root, 'backups'));
    try {
      expect((await fetch(`${manager.url}/status`)).status).toBe(403);
      const response = await fetch(`${manager.url}/backup`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${manager.token}` },
      });
      expect(response.status).toBe(200);
      const state = await response.json();
      expect(
        state.backups.filter(
          (entry: { kind: string }) => entry.kind === 'manual',
        ),
      ).toHaveLength(1);
      expect(
        state.backups.filter(
          (entry: { kind: string }) => entry.kind === 'automatic',
        ),
      ).toHaveLength(1);
    } finally {
      await manager.close();
      await db.close();
    }
  });
});
