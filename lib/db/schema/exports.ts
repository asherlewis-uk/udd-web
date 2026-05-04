import { desc, sql } from 'drizzle-orm'
import { check, index, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core'
import { user } from './auth'
import { projects } from './projects'

export const exports = pgTable(
  'exports',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    projectId: uuid('project_id')
      .notNull()
      .references(() => projects.id, { onDelete: 'cascade' }),
    ownerId: uuid('owner_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    kind: text('kind').notNull().default('zip'),
    status: text('status').notNull().default('pending'),
    artifactUrl: text('artifact_url'),
    error: text('error'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    finishedAt: timestamp('finished_at', { withTimezone: true }),
  },
  (table) => [
    index('exports_project_idx').on(table.projectId, desc(table.createdAt)),
    check('exports_kind_check', sql`${table.kind} in ('zip','github','download')`),
    check('exports_status_check', sql`${table.status} in ('pending','processing','completed','failed')`),
  ],
)
