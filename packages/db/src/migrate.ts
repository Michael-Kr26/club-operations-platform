import { migrate } from 'drizzle-orm/node-postgres/migrator';

import { createDatabase } from './client';

async function runMigrations(): Promise<void> {
  const { db, pool } = createDatabase();

  try {
    await migrate(db, { migrationsFolder: './migrations' });
  } finally {
    await pool.end();
  }
}

void runMigrations();
