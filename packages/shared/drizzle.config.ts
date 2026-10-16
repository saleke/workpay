/**
 * Drizzle Kit configuration. Migrations are generated from the schema and
 * applied by `src/db/migrate.ts`. The schema lives in one place so both the
 * web app and the worker compile against the same types.
 *
 * `drizzle-kit generate` writes SQL to ./drizzle. Migrations are append-only:
 * never edit a migration that has been applied to a shared database.
 */
import { defineConfig } from "drizzle-kit";

export default defineConfig({
  schema: "./src/db/schema/index.ts",
  out: "./drizzle",
  dialect: "postgresql",
  strict: true,
  verbose: true,
  dbCredentials: {
    url: process.env.DATABASE_URL ?? "postgres://workpay:workpay@localhost:5432/workpay",
  },
});
