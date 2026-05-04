import { sql } from 'drizzle-orm'
import { check, index, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core'
import { user } from './auth'
import { projects } from './projects'
import { runSessions } from './run-sessions'

export const runEvents = pgTable(
  'run_events',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    sessionId: uuid('session_id')
      .notNull()
      .references(() => runSessions.id, { onDelete: 'cascade' }),
    projectId: uuid('project_id')
      .notNull()
      .references(() => projects.id, { onDelete: 'cascade' }),
    ownerId: uuid('owner_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    level: text('level').notNull().default('info'),
    source: text('source').notNull().default('system'),
    message: text('message').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('run_events_session_idx').on(table.sessionId, table.createdAt),
    check('run_events_level_check', sql`${table.level} in ('info','warn','error','system')`),
    check('run_events_source_check', sql`${table.source} in ('system','stdout','stderr','build')`),
  ],
)
