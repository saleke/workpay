/**
 * Testing helpers for the shared package.
 *
 * Integration tests that need a real database are gated on an explicit
 * environment flag so `pnpm test` stays green without a database running (CI,
 * and a fresh clone). When a database is available, `resetDatabase` gives each
 * test a clean slate by truncating every table in one statement.
 */
import { sql } from "drizzle-orm";
import { getDb, type Database } from "../db/client.js";
import { truncateApplicationData } from "../db/reset.js";

/**
 * True when integration tests should run. Requires both an explicit opt-in and
 * a configured database URL, so a stray DATABASE_URL cannot make tests mutate a
 * developer's real database by accident.
 */
export function hasTestDatabase(): boolean {
  return process.env.RUN_DB_TESTS === "1" && Boolean(process.env.DATABASE_URL);
}

/** A Drizzle instance for integration tests. Throws when not configured. */
export function getTestDb(): Database {
  if (!hasTestDatabase()) {
    throw new Error(
      "Integration tests require RUN_DB_TESTS=1 and DATABASE_URL to be set to a disposable database.",
    );
  }
  return getDb();
}

/**
 * Truncate every table in the public schema except the migration bookkeeping
 * table. Uses a single TRUNCATE ... CASCADE so foreign keys never block it.
 */
export async function resetDatabase(): Promise<void> {
  await truncateApplicationData();
}

/** Close the pool at the end of an integration suite. */
export async function closeTestDb(): Promise<void> {
  const { closeDb } = await import("../db/client.js");
  await closeDb();
}

export { sql };

// Seed factories for integration tests. Re-exported here so a test needs a
// single import for all of its database setup.
export * from "./factories.js";
