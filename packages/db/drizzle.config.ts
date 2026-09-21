import { defineConfig } from 'drizzle-kit';

export default defineConfig({
  dialect: 'postgresql',
  dbCredentials: {
    url: process.env.DATABASE_URL ?? 'postgresql://cop:cop@localhost:5432/cop',
  },
  out: './migrations',
  schema: './src/schema/index.ts',
  strict: true,
  verbose: true,
});
