/**
 * Testing helpers for the shared package.
 *
 * Integration tests that need a real database are gated on an explicit
 * environment flag so `pnpm test` stays green without a database running (CI,
 * and a fresh clone). When a database is available, `resetDatabase` gives each
 * test a clean slate by truncating every table in one statement.
 */
import { sql } from "drizzle-orm";
import { getDb, getPool, type Database } from "../db/client.js";

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
  const pool = getPool();
  const { rows } = await pool.query<{ tablename: string }>(
    `SELECT tablename FROM pg_tables
     WHERE schemaname = 'public' AND tablename <> '__drizzle_migrations'`,
  );
  if (rows.length === 0) return;
  const tables = rows.map((r) => `"public"."${r.tablename}"`).join(", ");
  await pool.query(`TRUNCATE ${tables} RESTART IDENTITY CASCADE`);
}

/** Close the pool at the end of an integration suite. */
export async function closeTestDb(): Promise<void> {
  const { closeDb } = await import("../db/client.js");
  await closeDb();
}

export { sql };
