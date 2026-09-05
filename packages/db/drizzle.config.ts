import type { Config } from "drizzle-kit";

export default {
  schema: "./src/schema/*.ts",
  out: "./migrations",
  dialect: "postgresql",
  dbCredentials: {
    url: process.env.DATABASE_URL ?? "postgres://velocity:velocity@localhost:5432/velocity",
  },
} satisfies Config;
