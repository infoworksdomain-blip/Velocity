// Placeholder Drizzle Kit config. Points at the real schema module once
// STEP 2 creates it. Kept here now so the STEP 2 diff is additive, not a
// new-file scavenger hunt.
import type { Config } from "drizzle-kit";

export default {
  schema: "./src/schema.ts", // created in STEP 2
  out: "./migrations",
  dialect: "postgresql",
  dbCredentials: {
    url: process.env.DATABASE_URL ?? "postgres://velocity:velocity@localhost:5432/velocity",
  },
} satisfies Config;
