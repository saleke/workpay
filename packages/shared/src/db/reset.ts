import { sql } from "drizzle-orm";
import { getDb, type Database } from "./client.js";

export function assertDestructiveResetAllowed(input: {
  nodeEnv: "development" | "test" | "production";
  workpayMode: "demo" | "production";
  confirmation?: string;
}): void {
  const production = input.nodeEnv === "production" || input.workpayMode === "production";
  if (production && input.confirmation !== "ERASE_ALL_TENFO_DATA") {
    throw new Error("Production reset requires WORKPAY_DESTRUCTIVE_RESET=ERASE_ALL_TENFO_DATA.");
  }
}

/** Remove all application data while preserving Drizzle migration history. */
export async function truncateApplicationData(db: Database = getDb()): Promise<void> {
  const result = await db.execute<{ tablename: string }>(
    sql`SELECT tablename FROM pg_tables
        WHERE schemaname = 'public' AND tablename <> '__drizzle_migrations'`,
  );
  const rows = result.rows;
  if (rows.length === 0) return;
  const tables = rows.map((row) => `"public"."${row.tablename}"`).join(", ");
  await db.execute(sql.raw(`TRUNCATE ${tables} RESTART IDENTITY CASCADE`));
}
