/**
 * Reset evaluator data (`pnpm reset-demo`).
 *
 * Deletes all application rows and stored objects, then seeds the current
 * evaluator identities and complete Work Profiles. Production requires an
 * explicit one-command confirmation token.
 */
import { closeDb, withTransaction } from "./client.js";
import { assertDestructiveResetAllowed, truncateApplicationData } from "./reset.js";
import { seed } from "./seed.js";
import { logger } from "../platform/logger.js";
import { getObjectStorage } from "../integrations/storage/index.js";
import { getEnv } from "../platform/env.js";
import { sql } from "drizzle-orm";

async function main(): Promise<void> {
  const env = getEnv();
  assertDestructiveResetAllowed({
    nodeEnv: env.NODE_ENV,
    workpayMode: env.WORKPAY_MODE,
    confirmation: process.env.WORKPAY_DESTRUCTIVE_RESET,
  });
  logger.warn("erasing all Tenfo application data and stored objects...");
  const deletedObjects = await getObjectStorage().clearAll();
  await withTransaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext('tenfo_fresh_start'))`);
    await truncateApplicationData(tx);
    await seed(tx);
  });
  await closeDb();
  logger.info({ deletedObjects }, "Tenfo environment reset and seeded");
}

main().catch(async (err) => {
  logger.error({ err: String(err) }, "reset-demo failed");
  await closeDb();
  process.exitCode = 1;
});
