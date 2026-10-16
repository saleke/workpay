/**
 * Database subpath barrel. Server-only.
 */
export * from "./schema/index.js";
export { getDb, getPool, withTransaction, closeDb, type Database } from "./client.js";
