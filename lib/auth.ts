import "server-only"

import { betterAuth } from "better-auth"
import { drizzleAdapter } from "better-auth/adapters/drizzle"
import { nextCookies } from "better-auth/next-js"
import { getDb } from "@/lib/db"
import * as schema from "@/lib/db/schema"
import { profiles } from "@/lib/db/schema"

export const auth = betterAuth({
  database: drizzleAdapter(getDb(), {
    provider: "pg",
    schema,
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
