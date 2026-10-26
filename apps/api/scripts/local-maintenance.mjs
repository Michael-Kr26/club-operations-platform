import { homedir } from 'node:os';
import { join, resolve } from 'node:path';
import { lstat } from 'node:fs/promises';
import { startLocalDatabase } from './local-database.mjs';
import { createBackup, listBackups, restoreBackup } from './local-backups.mjs';

const directory = process.env.COP_DATA_DIR ?? join(homedir(), '.cop');
const backupDirectory =
  process.env.COP_BACKUP_DIR ?? join(directory, 'backups');
try {
  const [command, archive, target] = process.argv.slice(2);
  if (command === 'list')
    console.log(JSON.stringify(await listBackups(backupDirectory), null, 2));
  else if (command === 'backup') {
    if (!(await lstat(join(directory, 'postgres-local'))).isDirectory())
      throw new Error('Bestaande COP-database niet gevonden.');
    const database = await startLocalDatabase(directory, {
      port: 0,
      migrate: false,
    });
    try {
      const saved = await createBackup(database.db, backupDirectory);
      console.log(`Back-up opgeslagen: ${join(backupDirectory, saved.name)}`);
    } finally {
      await database.close();
    }
  } else if (command === 'restore' && archive && target) {
    const restored = await restoreBackup(resolve(archive), target);
    console.log(`Back-up gecontroleerd en hersteld naar: ${restored}`);
    console.log(
      'De bestaande gegevensmap is behouden. Start COP met COP_DATA_DIR ingesteld op deze nieuwe map.',
    );
  } else
    throw new Error(
      'Gebruik: backup, list of restore <back-upbestand> <nieuwe absolute gegevensmap>.',
    );
} catch (error) {
  console.error(
    error.code === 'EEXIST'
      ? 'De herstelmap bestaat al. Kies een nieuwe, nog niet bestaande map.'
      : error.message,
  );
  process.exitCode = 1;
}
