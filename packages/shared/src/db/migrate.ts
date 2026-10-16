/**
 * Migration runner. Applies the SQL files in ./drizzle in order.
 *
 * Migrations are append-only: to change the schema, generate a new migration.
 * Never edit an applied migration, because environments may already have run it.
 *
 * Run with `pnpm db:migrate` (uses the direct DATABASE_URL, not the pooled one).
 */
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { closeDb, getDb } from "./client.js";
import { logger } from "../platform/logger.js";

const here = dirname(fileURLToPath(import.meta.url));
const migrationsFolder = resolve(here, "../../drizzle");

async function main(): Promise<void> {
  logger.info({ migrationsFolder }, "applying migrations");
  await migrate(getDb(), { migrationsFolder });
  logger.info("migrations applied");
  await closeDb();
}

main().catch(async (error) => {
  logger.error({ err: String(error) }, "migration failed");
  await closeDb();
  process.exitCode = 1;
});
