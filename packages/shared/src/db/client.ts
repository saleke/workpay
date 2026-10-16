/**
 * Database client.
 *
 * A single `pg` Pool backs Drizzle. `getEnv()` validates configuration at first
 * use so a misconfigured process fails fast. Server-only: never import this
 * from a React client component (the `./db` subpath is for server code).
 *
 * Transactions are created with `db.transaction(...)`. Financial code must not
 * hold a transaction open across a network call (ENGINEERING_PLAN section 3,
 * P4): do the database work, commit, then call the gateway. The outbox handles
 * the "tell the rest of the system" step.
 */
import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import pg from "pg";
import { getEnv } from "../platform/env.js";
import * as schema from "./schema/index.js";

export type Database = NodePgDatabase<typeof schema>;

const { Pool } = pg;

let pool: pg.Pool | null = null;
let database: Database | null = null;

/** The shared connection pool. Prefers the direct URL for long-lived workers. */
export function getPool(): pg.Pool {
  if (pool) return pool;
  const env = getEnv();
  const connectionString = env.DATABASE_URL;
  pool = new Pool({
    connectionString,
    // Modest pool: the worker and the web app each run their own process.
    max: env.NODE_ENV === "test" ? 4 : 10,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 10_000,
  });
  pool.on("error", (err) => {
    // A background pool error must never crash the process silently.
    console.error(JSON.stringify({ level: "error", msg: "postgres pool error", err: String(err) }));
  });
  return pool;
}

/** The shared Drizzle instance. */
export function getDb(): Database {
  if (database) return database;
  database = drizzle(getPool(), { schema });
  return database;
}

/**
 * Run a callback inside a transaction. Use for any operation that must write
 * business state and its outbox event atomically.
 */
export function withTransaction<T>(fn: (tx: Database) => Promise<T>): Promise<T> {
  return getDb().transaction(async (tx) => fn(tx as unknown as Database));
}

/** Test/teardown helper. Closes the pool and clears memoized instances. */
export async function closeDb(): Promise<void> {
  if (pool) {
    await pool.end();
    pool = null;
    database = null;
  }
}
