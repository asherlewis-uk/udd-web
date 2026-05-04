import { sql } from 'drizzle-orm'
import { boolean, check, jsonb, pgTable, text, timestamp, unique, uniqueIndex, uuid } from 'drizzle-orm/pg-core'
import { user } from './auth'

export const providerConfigs = pgTable(
  'provider_configs',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    ownerId: uuid('owner_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    kind: text('kind').notNull(),
    name: text('name').notNull(),
    config: jsonb('config').notNull().default(sql`'{}'::jsonb`),
    secretRef: text('secret_ref'),
    isActive: boolean('is_active').notNull().default(true),
    isDefault: boolean('is_default').notNull().default(false),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    unique('provider_configs_owner_kind_name_key').on(table.ownerId, table.kind, table.name),
    uniqueIndex('provider_configs_one_default_ai_per_owner_idx')
      .on(table.ownerId)
      .where(sql`${table.kind} = 'ai' and ${table.isDefault} = true`),
    check('provider_configs_kind_check', sql`${table.kind} in ('ai','export','runtime','other')`),
  ],
)
