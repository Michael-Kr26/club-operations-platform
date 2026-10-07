// Reporting storage supports reviewable, versioned rules; approval does not imply vendor completeness.
import {
  check,
  customType,
  index,
  jsonb,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  boolean,
} from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';

const time = (name: string) =>
  timestamp(name, { withTimezone: true }).notNull().defaultNow();
const bytea = customType<{ data: Buffer }>({ dataType: () => 'bytea' });
export const users = pgTable('user', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  email: text('email').notNull().unique(),
  emailVerified: boolean('emailVerified').notNull().default(false),
  image: text('image'),
  createdAt: time('createdAt'),
  updatedAt: time('updatedAt'),
});
export const sessions = pgTable('session', {
  id: text('id').primaryKey(),
  expiresAt: time('expiresAt'),
  token: text('token').notNull().unique(),
  createdAt: time('createdAt'),
  updatedAt: time('updatedAt'),
  ipAddress: text('ipAddress'),
  userAgent: text('userAgent'),
  userId: text('userId')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
});
export const accounts = pgTable('account', {
  id: text('id').primaryKey(),
  accountId: text('accountId').notNull(),
  providerId: text('providerId').notNull(),
  userId: text('userId')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  accessToken: text('accessToken'),
  refreshToken: text('refreshToken'),
  idToken: text('idToken'),
  accessTokenExpiresAt: timestamp('accessTokenExpiresAt', {
    withTimezone: true,
  }),
  refreshTokenExpiresAt: timestamp('refreshTokenExpiresAt', {
    withTimezone: true,
  }),
  scope: text('scope'),
  password: text('password'),
  createdAt: time('createdAt'),
  updatedAt: time('updatedAt'),
});
export const verifications = pgTable('verification', {
  id: text('id').primaryKey(),
  identifier: text('identifier').notNull(),
  value: text('value').notNull(),
  expiresAt: time('expiresAt'),
  createdAt: time('createdAt'),
  updatedAt: time('updatedAt'),
});
export const reportOrganizations = pgTable('report_organizations', {
  id: text('id').primaryKey(),
  definition: jsonb('definition').notNull(),
});
export const reportAccess = pgTable(
  'report_access',
  {
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    organizationId: text('organization_id')
      .notNull()
      .references(() => reportOrganizations.id),
    permissions: jsonb('permissions').notNull(),
    locations: jsonb('locations'),
  },
  (t) => [primaryKey({ columns: [t.userId, t.organizationId] })],
);
export const reportSettings = pgTable('report_settings', {
  organizationId: text('organization_id')
    .primaryKey()
    .references(() => reportOrganizations.id),
  settings: jsonb('settings').notNull(),
  updatedAt: time('updated_at'),
  updatedBy: text('updated_by'),
});
export const reportImports = pgTable(
  'report_imports',
  {
    id: text('id').primaryKey(),
    organizationId: text('organization_id')
      .notNull()
      .references(() => reportOrganizations.id),
    dataset: text('dataset').notNull(),
    source: text('source').notNull(),
    hash: text('hash').notNull(),
    metadata: jsonb('metadata').notNull(),
    filename: text('filename').notNull(),
    original: bytea('original').notNull(),
    rows: jsonb('rows').notNull(),
    status: text('status').notNull(),
    error: text('error'),
    importedAt: time('imported_at'),
    importedBy: text('imported_by').notNull(),
  },
  (t) => [
    uniqueIndex('report_import_unique').on(
      t.organizationId,
      t.dataset,
      t.source,
      t.hash,
    ),
    index('report_import_scope').on(t.organizationId, t.dataset, t.importedAt),
    check('report_import_dataset', sql`${t.dataset} IN ('real','demo')`),
    check('report_import_status', sql`${t.status} IN ('accepted','rejected')`),
  ],
);
export const reportRuns = pgTable(
  'report_runs',
  {
    id: text('id').primaryKey(),
    organizationId: text('organization_id')
      .notNull()
      .references(() => reportOrganizations.id),
    dataset: text('dataset').notNull(),
    kind: text('kind').notNull(),
    reportDate: text('report_date').notNull(),
    status: text('status').notNull(),
    createdAt: time('created_at'),
    completedAt: timestamp('completed_at', { withTimezone: true }),
    reason: text('reason'),
    preview: jsonb('preview'),
    createdBy: text('created_by').notNull(),
  },
  (t) => [
    uniqueIndex('report_run_unique').on(
      t.organizationId,
      t.dataset,
      t.kind,
      t.reportDate,
    ),
    check('report_run_dataset', sql`${t.dataset} IN ('real','demo')`),
    check('report_run_kind', sql`${t.kind} IN ('daily','monthly')`),
    check(
      'report_run_status',
      sql`${t.status} IN ('claimed','captured','missed','blocked','uncertain')`,
    ),
  ],
);
export const reportAudit = pgTable('report_audit', {
  id: text('id').primaryKey(),
  organizationId: text('organization_id')
    .notNull()
    .references(() => reportOrganizations.id),
  actor: text('actor').notNull(),
  action: text('action').notNull(),
  createdAt: time('created_at'),
  detail: jsonb('detail').notNull(),
});
