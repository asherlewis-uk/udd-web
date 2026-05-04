import { desc, sql } from 'drizzle-orm'
import { check, index, jsonb, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core'
import { user } from './auth'
import { projects } from './projects'
import { prompts } from './prompts'
import { runSessions } from './run-sessions'

export const aiTasks = pgTable(
  'ai_tasks',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    projectId: uuid('project_id')
      .notNull()
      .references(() => projects.id, { onDelete: 'cascade' }),
    ownerId: uuid('owner_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    promptId: uuid('prompt_id').references(() => prompts.id, { onDelete: 'set null' }),
    runSessionId: uuid('run_session_id').references(() => runSessions.id, { onDelete: 'set null' }),
    kind: text('kind').notNull().default('edit'),
    title: text('title').notNull(),
    status: text('status').notNull().default('pending'),
    input: jsonb('input').notNull().default(sql`'{}'::jsonb`),
    output: jsonb('output'),
    error: text('error'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    startedAt: timestamp('started_at', { withTimezone: true }),
    finishedAt: timestamp('finished_at', { withTimezone: true }),
  },
  (table) => [
    index('ai_tasks_project_idx').on(table.projectId, desc(table.createdAt)),
    index('ai_tasks_status_idx').on(table.ownerId, table.status),
    index('ai_tasks_run_session_idx')
      .on(table.runSessionId)
      .where(sql`${table.runSessionId} is not null`),
    check('ai_tasks_kind_check', sql`${table.kind} in ('scaffold','edit','refactor','explain','other')`),
    check('ai_tasks_status_check', sql`${table.status} in ('pending','running','completed','failed','cancelled')`),
  ],
)
