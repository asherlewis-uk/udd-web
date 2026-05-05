import "server-only"

import { betterAuth } from "better-auth"
import { drizzleAdapter } from "better-auth/adapters/drizzle"
import { nextCookies } from "better-auth/next-js"
import { getDb } from "@/lib/db"
import * as schema from "@/lib/db/schema"
import { profiles } from "@/lib/db/schema"

const buildWithoutDatabase =
  process.env.NEXT_PHASE === "phase-production-build" && !process.env.DATABASE_URL

export const auth = betterAuth({
  secret:
    process.env.BETTER_AUTH_SECRET ??
    (buildWithoutDatabase
      ? `${crypto.randomUUID()}${crypto.randomUUID()}`
      : undefined),
  baseURL: process.env.BETTER_AUTH_URL ?? (buildWithoutDatabase ? "http://localhost:3000" : undefined),
  ...(buildWithoutDatabase
    ? {}
    : {
        database: (options: Parameters<ReturnType<typeof drizzleAdapter>>[0]) =>
          drizzleAdapter(getDb(), {
            provider: "pg",
            schema,
          })(options),
      }),
  emailAndPassword: {
    enabled: true,
    requireEmailVerification: false,
    minPasswordLength: 8,
  },
  advanced: {
    database: {
      generateId: () => crypto.randomUUID(),
    },
  },
  databaseHooks: {
    user: {
      create: {
        after: async (user) => {
          await getDb()
            .insert(profiles)
            .values({ id: user.id, displayName: user.name })
            .onConflictDoNothing()
        },
      },
    },
  },
  plugins: [nextCookies()],
})
