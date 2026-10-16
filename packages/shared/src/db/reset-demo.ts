/**
 * Reset demo script (`make reset-demo` / `pnpm reset-demo`).
 *
 * Wipes all application tables and seeds a fresh baseline:
 * buyer user, provider user, admin reviewer, seeded providers, and demo CSVs.
 */
import { resetDatabase } from "../testing/index.js";
import { closeDb } from "./client.js";
import { seed } from "./seed.js";
import { logger } from "../platform/logger.js";

async function main(): Promise<void> {
  logger.info("resetting WorkPay demo database...");
  await resetDatabase();
  await seed();
  await closeDb();
  logger.info("WorkPay demo environment reset and ready!");
}

main().catch(async (err) => {
  logger.error({ err: String(err) }, "reset-demo failed");
  await closeDb();
  process.exitCode = 1;
});
