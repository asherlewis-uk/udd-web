## 1. Drizzle config

| File | Required content |
|---|---|
| `package.json` | Add deps: `drizzle-orm`, `postgres`, `@better-auth/cli`, `better-auth`. Add devDeps: `drizzle-kit`, `@types/pg` (if needed). Pin `drizzle-orm` and `drizzle-kit` to the same minor. |
| `drizzle.config.ts` | `schema: './lib/db/schema/*'`, `out: './drizzle'`, `dialect: 'postgresql'`, `dbCredentials.url: process.env.DATABASE_URL`. |
| `lib/db/index.ts` | Export `db = drizzle(postgres(process.env.DATABASE_URL!), { schema })`. Single connection pool, lazy-init pattern. |
| Baseline migration | Must include `CREATE EXTENSION IF NOT EXISTS pgcrypto;` to back `defaultRandom()` → `gen_random_uuid()` on 11 of 12 app tables (source: `scripts/001_init_schema.sql:8`). |

## 2. Better Auth tables

**Source**

Better Auth v1.x canonical core schema defines `user`, `session`, `account`, and `verification`. ID generation is locked to UUID strings by configuring `advanced.database.generateId: () => crypto.randomUUID()` and using Drizzle `uuid()` column overrides for Better Auth IDs and user FKs.

**`user`**

```ts
export const user = pgTable("user", {
  id: uuid("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  emailVerified: boolean("email_verified").notNull(),
  image: text("image"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull(),
});
```

**`session`**

```ts
export const session = pgTable("session", {
  id: uuid("id").primaryKey(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  token: text("token").notNull().unique(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull(),
  ipAddress: text("ip_address"),
  userAgent: text("user_agent"),
  userId: uuid("user_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
});
```

**`account`**

```ts
export const account = pgTable("account", {
  id: uuid("id").primaryKey(),
  accountId: text("account_id").notNull(),
  providerId: text("provider_id").notNull(),
  userId: uuid("user_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  accessToken: text("access_token"),
  refreshToken: text("refresh_token"),
  idToken: text("id_token"),
  accessTokenExpiresAt: timestamp("access_token_expires_at", { withTimezone: true }),
  refreshTokenExpiresAt: timestamp("refresh_token_expires_at", { withTimezone: true }),
  scope: text("scope"),
  password: text("password"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull(),
});
```

**`verification`**

```ts
export const verification = pgTable("verification", {
  id: uuid("id").primaryKey(),
  identifier: text("identifier").notNull(),
  value: text("value").notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull(),
});
```

**Source of truth**

Run `npx @better-auth/cli generate` during execution to produce the authoritative Better Auth schema and diff it against this table. Any deviation found at that time is a follow-up; do not pre-emptively widen the schema here.

## 3. App tables (Drizzle translation)

**Check-Constraint Choice**

Use raw `text()` columns plus `check()` constraints instead of `pgEnum`; this preserves the existing PostgreSQL check-constraint behavior exactly.

### 3.1. `profiles`

**Source**

`scripts/001_init_schema.sql:13-19`; active.

**Table**

```ts
export const profiles = pgTable("profiles", {
  id: uuid("id")
    .primaryKey()
    .references(() => user.id, { onDelete: "cascade" }),
  displayName: text("display_name"),
  avatarUrl: text("avatar_url"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});
```

**Indexes**

```ts
// Primary key only: profiles.id.
```

### 3.2. `projects`

**Source**

`scripts/001_init_schema.sql:41-54`; active.

**Table**

```ts
export const projects = pgTable("projects", {
  id: uuid("id").primaryKey().defaultRandom(),
  ownerId: uuid("owner_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  slug: text("slug").notNull(),
  description: text("description"),
  idea: text("idea"),
  status: text("status").notNull().default("draft"),
  lastOpenedAt: timestamp("last_opened_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});
```

**Indexes**

```ts
(table) => [
  index("projects_owner_idx").on(table.ownerId),
  index("projects_status_idx").on(table.ownerId, table.status),
  unique("projects_owner_slug_key").on(table.ownerId, table.slug),
  check("projects_status_check", sql`${table.status} in ('draft','active','archived','error')`),
]
```

### 3.3. `project_files`

**Source**

`scripts/001_init_schema.sql:79-90`; active.

**Table**

```ts
export const projectFiles = pgTable("project_files", {
  id: uuid("id").primaryKey().defaultRandom(),
  projectId: uuid("project_id")
    .notNull()
    .references(() => projects.id, { onDelete: "cascade" }),
  ownerId: uuid("owner_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  path: text("path").notNull(),
  content: text("content").notNull().default(""),
  language: text("language"),
  sizeBytes: integer("size_bytes").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});
```

**Indexes**

```ts
(table) => [
  index("project_files_project_idx").on(table.projectId),
  unique("project_files_project_path_key").on(table.projectId, table.path),
]
```

### 3.4. `prompts`

**Source**

`scripts/001_init_schema.sql:114-120`; active.

**Table**

```ts
export const prompts = pgTable("prompts", {
  id: uuid("id").primaryKey().defaultRandom(),
  projectId: uuid("project_id")
    .notNull()
    .references(() => projects.id, { onDelete: "cascade" }),
  ownerId: uuid("owner_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  body: text("body").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});
```

**Indexes**

```ts
(table) => [
  index("prompts_project_idx").on(table.projectId, desc(table.createdAt)),
]
```

### 3.5. `run_sessions`

**Source**

`scripts/001_init_schema.sql:213-225`; active.

**Table**

```ts
export const runSessions = pgTable("run_sessions", {
  id: uuid("id").primaryKey().defaultRandom(),
  projectId: uuid("project_id")
    .notNull()
    .references(() => projects.id, { onDelete: "cascade" }),
  ownerId: uuid("owner_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  status: text("status").notNull().default("idle"),
  previewUrl: text("preview_url"),
  startedAt: timestamp("started_at", { withTimezone: true }),
  stoppedAt: timestamp("stopped_at", { withTimezone: true }),
  error: text("error"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});
```

**Indexes**

```ts
(table) => [
  index("run_sessions_project_idx").on(table.projectId, desc(table.createdAt)),
  check("run_sessions_status_check", sql`${table.status} in ('idle','starting','running','stopping','stopped','error')`),
]
```

### 3.6. `run_events`

**Source**

`scripts/001_init_schema.sql:249-260`; active; append-only in source because no UPDATE policy exists.

**Table**

```ts
export const runEvents = pgTable("run_events", {
  id: uuid("id").primaryKey().defaultRandom(),
  sessionId: uuid("session_id")
    .notNull()
    .references(() => runSessions.id, { onDelete: "cascade" }),
  projectId: uuid("project_id")
    .notNull()
    .references(() => projects.id, { onDelete: "cascade" }),
  ownerId: uuid("owner_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  level: text("level").notNull().default("info"),
  source: text("source").notNull().default("system"),
  message: text("message").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});
```

**Indexes**

```ts
(table) => [
  index("run_events_session_idx").on(table.sessionId, table.createdAt),
  check("run_events_level_check", sql`${table.level} in ('info','warn','error','system')`),
  check("run_events_source_check", sql`${table.source} in ('system','stdout','stderr','build')`),
]
```

### 3.7. `ai_tasks`

**Source**

`scripts/001_init_schema.sql:144-160` plus `scripts/002_link_ai_tasks_to_run_sessions.sql:6-12`; active.

**Table**

```ts
export const aiTasks = pgTable("ai_tasks", {
  id: uuid("id").primaryKey().defaultRandom(),
  projectId: uuid("project_id")
    .notNull()
    .references(() => projects.id, { onDelete: "cascade" }),
  ownerId: uuid("owner_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  promptId: uuid("prompt_id").references(() => prompts.id, { onDelete: "set null" }),
  runSessionId: uuid("run_session_id").references(() => runSessions.id, { onDelete: "set null" }),
  kind: text("kind").notNull().default("edit"),
  title: text("title").notNull(),
  status: text("status").notNull().default("pending"),
  input: jsonb("input").notNull().default(sql`'{}'::jsonb`),
  output: jsonb("output"),
  error: text("error"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  startedAt: timestamp("started_at", { withTimezone: true }),
  finishedAt: timestamp("finished_at", { withTimezone: true }),
});
```

**Indexes**

```ts
(table) => [
  index("ai_tasks_project_idx").on(table.projectId, desc(table.createdAt)),
  index("ai_tasks_status_idx").on(table.ownerId, table.status),
  index("ai_tasks_run_session_idx")
    .on(table.runSessionId)
    .where(sql`${table.runSessionId} is not null`),
  check("ai_tasks_kind_check", sql`${table.kind} in ('scaffold','edit','refactor','explain','other')`),
  check("ai_tasks_status_check", sql`${table.status} in ('pending','running','completed','failed','cancelled')`),
]
```

### 3.8. `ai_task_events`

**Source**

`scripts/001_init_schema.sql:185-192`; active; append-only in source because no UPDATE policy exists.

**Table**

```ts
export const aiTaskEvents = pgTable("ai_task_events", {
  id: uuid("id").primaryKey().defaultRandom(),
  taskId: uuid("task_id")
    .notNull()
    .references(() => aiTasks.id, { onDelete: "cascade" }),
  ownerId: uuid("owner_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  kind: text("kind").notNull(),
  payload: jsonb("payload").notNull().default(sql`'{}'::jsonb`),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});
```

**Indexes**

```ts
(table) => [
  index("ai_task_events_task_idx").on(table.taskId, table.createdAt),
]
```

### 3.9. `provider_configs`

**Source**

`scripts/001_init_schema.sql:350-361` plus `scripts/003_provider_configs_default_ai.sql:4-9`; active.

**Table**

```ts
export const providerConfigs = pgTable("provider_configs", {
  id: uuid("id").primaryKey().defaultRandom(),
  ownerId: uuid("owner_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  kind: text("kind").notNull(),
  name: text("name").notNull(),
  config: jsonb("config").notNull().default(sql`'{}'::jsonb`),
  secretRef: text("secret_ref"),
  isActive: boolean("is_active").notNull().default(true),
  isDefault: boolean("is_default").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});
```

**Indexes**

```ts
(table) => [
  unique("provider_configs_owner_kind_name_key").on(table.ownerId, table.kind, table.name),
  uniqueIndex("provider_configs_one_default_ai_per_owner_idx")
    .on(table.ownerId)
    .where(sql`${table.kind} = 'ai' and ${table.isDefault} = true`),
  check("provider_configs_kind_check", sql`${table.kind} in ('ai','export','runtime','other')`),
]
```

### 3.10. `user_secrets`

**Source**

`scripts/005_user_secrets.sql:7-16`; active.

**Table**

```ts
export const userSecrets = pgTable("user_secrets", {
  id: uuid("id").primaryKey().defaultRandom(),
  ownerId: uuid("owner_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  kind: text("kind").notNull(),
  name: text("name").notNull(),
  // AES-GCM ciphertext wire format must round-trip byte-for-byte; never normalize, cast to JSON, or convert to bytea.
  encryptedValue: text("encrypted_value").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});
```

**Indexes**

```ts
(table) => [
  index("user_secrets_owner_kind_idx").on(table.ownerId, table.kind),
  unique("user_secrets_owner_kind_name_key").on(table.ownerId, table.kind, table.name),
]
```

### 3.11. `previews`

**Source**

`scripts/001_init_schema.sql:281-289`; forward-looking, 0 query sites.

**Table**

```ts
export const previews = pgTable("previews", {
  id: uuid("id").primaryKey().defaultRandom(),
  projectId: uuid("project_id")
    .notNull()
    .references(() => projects.id, { onDelete: "cascade" }),
  ownerId: uuid("owner_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  sessionId: uuid("session_id").references(() => runSessions.id, { onDelete: "set null" }),
  url: text("url"),
  thumbnailUrl: text("thumbnail_url"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});
```

**Indexes**

```ts
(table) => [
  index("previews_project_idx").on(table.projectId, desc(table.createdAt)),
]
```

### 3.12. `exports`

**Source**

`scripts/001_init_schema.sql:313-325`; forward-looking, 0 query sites.

**Table**

```ts
export const exports = pgTable("exports", {
  id: uuid("id").primaryKey().defaultRandom(),
  projectId: uuid("project_id")
    .notNull()
    .references(() => projects.id, { onDelete: "cascade" }),
  ownerId: uuid("owner_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  kind: text("kind").notNull().default("zip"),
  status: text("status").notNull().default("pending"),
  artifactUrl: text("artifact_url"),
  error: text("error"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  finishedAt: timestamp("finished_at", { withTimezone: true }),
});
```

**Indexes**

```ts
(table) => [
  index("exports_project_idx").on(table.projectId, desc(table.createdAt)),
  check("exports_kind_check", sql`${table.kind} in ('zip','github','download')`),
  check("exports_status_check", sql`${table.status} in ('pending','processing','completed','failed')`),
]
```

## 4. RLS replacement plan

| Table | Read pattern (Drizzle) | Write/Update pattern | Delete pattern |
|---|---|---|---|
| `profiles` | `.where(eq(profiles.id, session.user.id))` | Insert `id: session.user.id`; update with `.where(eq(profiles.id, session.user.id))` | `.where(eq(profiles.id, session.user.id))` |
| `projects` | `.where(eq(projects.ownerId, session.user.id))` | Insert `ownerId: session.user.id`; update with `.where(eq(projects.ownerId, session.user.id))` | `.where(eq(projects.ownerId, session.user.id))` |
| `project_files` | `.where(eq(projectFiles.ownerId, session.user.id))` | Insert `ownerId: session.user.id`; update with `.where(eq(projectFiles.ownerId, session.user.id))` | `.where(eq(projectFiles.ownerId, session.user.id))` |
| `prompts` | `.where(eq(prompts.ownerId, session.user.id))` | Insert `ownerId: session.user.id`; update with `.where(eq(prompts.ownerId, session.user.id))` | `.where(eq(prompts.ownerId, session.user.id))` |
| `run_sessions` | `.where(eq(runSessions.ownerId, session.user.id))` | Insert `ownerId: session.user.id`; update with `.where(eq(runSessions.ownerId, session.user.id))` | `.where(eq(runSessions.ownerId, session.user.id))` |
| `run_events` | `.where(eq(runEvents.ownerId, session.user.id))` | Insert `ownerId: session.user.id`; update N/A — append-only, no UPDATE policy in source | `.where(eq(runEvents.ownerId, session.user.id))` |
| `ai_tasks` | `.where(eq(aiTasks.ownerId, session.user.id))` | Insert `ownerId: session.user.id`; update with `.where(eq(aiTasks.ownerId, session.user.id))` | `.where(eq(aiTasks.ownerId, session.user.id))` |
| `ai_task_events` | `.where(eq(aiTaskEvents.ownerId, session.user.id))` | Insert `ownerId: session.user.id`; update N/A — append-only, no UPDATE policy in source | `.where(eq(aiTaskEvents.ownerId, session.user.id))` |
| `provider_configs` | `.where(eq(providerConfigs.ownerId, session.user.id))` | Insert `ownerId: session.user.id`; update with `.where(eq(providerConfigs.ownerId, session.user.id))` | `.where(eq(providerConfigs.ownerId, session.user.id))` |
| `user_secrets` | `.where(eq(userSecrets.ownerId, session.user.id))` | Insert `ownerId: session.user.id`; update with `.where(eq(userSecrets.ownerId, session.user.id))` | `.where(eq(userSecrets.ownerId, session.user.id))` |
| `previews` | `.where(eq(previews.ownerId, session.user.id))` | Insert `ownerId: session.user.id`; update with `.where(eq(previews.ownerId, session.user.id))` | `.where(eq(previews.ownerId, session.user.id))` |
| `exports` | `.where(eq(exports.ownerId, session.user.id))` | Insert `ownerId: session.user.id`; update with `.where(eq(exports.ownerId, session.user.id))` | `.where(eq(exports.ownerId, session.user.id))` |

RLS is dropped. Server-side query helpers in `lib/db/queries/` enforce ownership via every `.where(eq(ownerId, session.user.id))`. No query path may omit this clause; PR review must reject any call site that does.

## 5. `handle_new_user` replacement

| Concern | Source today | Better Auth equivalent |
|---|---|---|
| Trigger fires on user signup | `001:399-403` `AFTER INSERT ON auth.users` | Better Auth `databaseHooks.user.create.after` callback |
| Profile row creation | `handle_new_user()` `SECURITY DEFINER` insert into `profiles` | Inline `db.insert(profiles).values({ id: user.id }).onConflictDoNothing()` inside the after-create hook |
| Failure mode | Trigger failure aborts user creation | Hook failure must abort signup (await, throw on error) |

## 6. `deleteAccount` rewrite

| Concern | Source today | Better Auth equivalent |
|---|---|---|
| Auth admin delete | `app/actions/profile.ts:36` `serviceClient.auth.admin.deleteUser(user.id)` | `auth.api.deleteUser({ userId: session.user.id, body: {} })` (server-side admin) **OR** `db.delete(user).where(eq(user.id, session.user.id))` if cascade-only path is used |
| Cleanup mechanism | PG cascades from Supabase auth-user deletion | PG cascades from new `user(id)` deletion (every `owner_id` repointed) |
| Sign-out | Implicit in Supabase admin delete | Explicit `auth.api.signOut()` after delete |

## 7. Migration sequencing

1. Install deps + scaffold Drizzle config + `lib/db/index.ts`.
   - Verify: `node -e "const p=require('./package.json'); for (const d of ['drizzle-orm','postgres','@better-auth/cli','better-auth']) if (!p.dependencies?.[d]) process.exit(1); for (const d of ['drizzle-kit']) if (!p.devDependencies?.[d]) process.exit(1);"`
2. Generate Better Auth schema via CLI; reconcile with Section 2.
   - Verify: `npx @better-auth/cli generate --help`
3. Author all 12 app-table Drizzle schema files in `lib/db/schema/`.
   - Verify: `find lib/db/schema -type f -maxdepth 1 | sort`
4. Run `drizzle-kit generate` → produce baseline migration.
   - Verify: `npx drizzle-kit generate --config drizzle.config.ts`
5. Apply migration to fresh Legion Postgres database (empty, not the current Supabase DB).
   - Verify: `psql $DATABASE_URL -c '\dt'` shows all 16 tables (4 Better Auth + 12 app).
6. Smoke-test: round-trip a `user_secrets` row through `encrypt → INSERT → SELECT → decrypt` for both v2 and legacy formats.
   - Verify: `tsx scripts/smoke-user-secrets-roundtrip.ts`
7. Implement `lib/db/queries/*` for every table in Section 4 with mandatory ownership clauses.
   - Verify: `grep -R "eq(.*ownerId, session.user.id\|eq(profiles.id, session.user.id" lib/db/queries`
8. Hand off to next prompt for Better Auth integration + Supabase code removal.
   - Verify: `git status --short`
