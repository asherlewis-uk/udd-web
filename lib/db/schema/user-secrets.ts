import { index, pgTable, text, timestamp, unique, uuid } from 'drizzle-orm/pg-core'
import { user } from './auth'

export const userSecrets = pgTable(
  'user_secrets',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    ownerId: uuid('owner_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    kind: text('kind').notNull(),
    name: text('name').notNull(),
    // AES-GCM ciphertext wire format must round-trip byte-for-byte; never normalize, cast to JSON, or convert to bytea.
    encryptedValue: text('encrypted_value').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('user_secrets_owner_kind_idx').on(table.ownerId, table.kind),
    unique('user_secrets_owner_kind_name_key').on(table.ownerId, table.kind, table.name),
  ],
)
