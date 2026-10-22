/**
 * Database seed script (ENGINEERING_PLAN section 5.3.12).
 *
 * Populates:
 *  1. Demo users: buyer, provider, admin reviewer.
 *  2. Seeded provider profiles with capabilities, availability, and reputation.
 *  3. Demo dataset fixtures:
 *     - customers.csv: raw 5,000-row dataset for the demo task
 *     - customers-v1.csv: flawed submission with 7.2% duplicates (fails verification)
 *     - customers-v2.csv: clean submission with 0% duplicates (passes verification)
 */
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { eq } from "drizzle-orm";
import { getDb, closeDb, type Database } from "./client.js";
import { users } from "./schema/identity.js";
import { availability, capabilities, providers, reputation } from "./schema/providers.js";
import { logger } from "../platform/logger.js";
import { newId } from "../platform/ids.js";

const here = dirname(fileURLToPath(import.meta.url));
const fixturesDir = resolve(here, "../../fixtures");

export interface SeedResult {
  buyerId: string;
  providerUserId: string;
  reviewerId: string;
  providerIds: string[];
}

export async function generateDemoCsvs(): Promise<{
  rawPath: string;
  v1Path: string;
  v2Path: string;
}> {
  await mkdir(fixturesDir, { recursive: true });

  const rawPath = resolve(fixturesDir, "customers.csv");
  const v1Path = resolve(fixturesDir, "customers-v1.csv");
  const v2Path = resolve(fixturesDir, "customers-v2.csv");

  const totalRows = 5000;
  const rawRows: string[] = ["id,name,email,joined_at,status"];
  const v1Rows: string[] = ["id,name,email,joined_at,status"];
  const v2Rows: string[] = ["id,name,email,joined_at,status"];

  // Flawed duplicate rate for v1: 7.2% duplicates (360 duplicate rows out of 5,000)
  const dupTarget = 360;

  for (let i = 1; i <= totalRows; i++) {
    const id = `cust_${String(i).padStart(5, "0")}`;
    const name = `Customer ${i}`;
    const email = `customer${i}@example.com`;
    const joinedAt = "2026-01-15";
    const status = i % 10 === 0 ? "inactive" : "active";

    rawRows.push(`${id},${name},${email},${joinedAt},${status}`);
    v2Rows.push(`${id},${name},${email},${joinedAt},${status}`);

    if (i <= dupTarget) {
      // Intentionally insert duplicate emails into v1 submission to fail duplicate_rate check
      v1Rows.push(`${id},${name},customer_dup@example.com,${joinedAt},${status}`);
    } else {
      v1Rows.push(`${id},${name},${email},${joinedAt},${status}`);
    }
  }

  await writeFile(rawPath, rawRows.join("\n"), "utf-8");
  await writeFile(v1Path, v1Rows.join("\n"), "utf-8");
  await writeFile(v2Path, v2Rows.join("\n"), "utf-8");

  logger.info({ fixturesDir }, "generated demo CSV fixtures");
  return { rawPath, v1Path, v2Path };
}

export async function seed(db: Database = getDb()): Promise<SeedResult> {
  logger.info("seeding database with initial users and providers...");

  // 1. Users
  const buyerId = "usr_buyer_alice";
  const providerUserId = "usr_provider_bob";
  const reviewerId = "usr_admin_carol";

  await db
    .insert(users)
    .values([
      {
        id: buyerId,
        name: "Alice Buyer",
        email: "buyer@example.com",
        role: "buyer",
      },
      {
        id: providerUserId,
        name: "Bob DataClean",
        email: "provider@example.com",
        role: "provider",
      },
      {
        id: reviewerId,
        name: "Carol Reviewer",
        email: "reviewer@example.com",
        role: "admin_reviewer",
      },
    ])
    .onConflictDoNothing();

  // 2. Seeded Providers
  const providerSpecs = [
    {
      id: "pro_dataclean_apex",
      userId: providerUserId,
      displayName: "Apex Data Solutions (Bob)",
      payoutEmail: "bob.dataclean@example.com",
      hourlyRateMinor: 4500, // $45/hr
      tags: [
        "data_cleaning",
        "dataset_cleaning",
        "data_preprocessing",
        "csv",
        "csv_processing",
        "data_validation",
        "deduplication",
        "email_validation",
        "spreadsheet",
      ],
      capacity: 4,
      activeAssignments: 1,
      completedTasks: 42,
      onTimeRatePct: 98.0,
      firstPassAcceptancePct: 95.0,
    },
    {
      id: "pro_datasweep_labs",
      displayName: "DataSweep AI & Human Labs",
      hourlyRateMinor: 5000, // $50/hr
      tags: [
        "data_cleaning",
        "dataset_cleaning",
        "data_preprocessing",
        "csv",
        "csv_processing",
        "spreadsheet",
      ],
      capacity: 3,
      activeAssignments: 0,
      completedTasks: 28,
      onTimeRatePct: 92.5,
      firstPassAcceptancePct: 88.0,
    },
    {
      id: "pro_quickclean_csv",
      displayName: "QuickClean CSV Services",
      hourlyRateMinor: 3500, // $35/hr
      tags: [
        "data_cleaning",
        "data_preprocessing",
        "csv",
        "csv_processing",
        "spreadsheet",
      ],
      capacity: 2,
      activeAssignments: 0,
      completedTasks: 15,
      onTimeRatePct: 82.0,
      firstPassAcceptancePct: 76.0,
    },
  ];

  for (const spec of providerSpecs) {
    const existing = await db
      .select({ id: providers.id })
      .from(providers)
      .where(eq(providers.id, spec.id))
      .limit(1);

    if (existing.length === 0) {
      await db.insert(providers).values({
        id: spec.id,
        userId: (spec as any).userId ?? null,
        displayName: spec.displayName,
        type: "HUMAN",
        status: "ACTIVE",
        hourlyRateMinor: spec.hourlyRateMinor,
        currency: "USD",
        payoutEmail: (spec as any).payoutEmail ?? null,
      });

      await db.insert(capabilities).values(
        spec.tags.map((tag) => ({
          id: newId("cap"),
          providerId: spec.id,
          tag,
          proficiency: 5,
        })),
      );

      await db.insert(availability).values({
        id: newId("avail"),
        providerId: spec.id,
        available: true,
        capacity: spec.capacity,
        activeAssignments: spec.activeAssignments,
      });

      await db.insert(reputation).values({
        id: newId("rep"),
        providerId: spec.id,
        completedTasks: spec.completedTasks,
        onTimeRatePct: spec.onTimeRatePct.toFixed(2),
        firstPassAcceptancePct: spec.firstPassAcceptancePct.toFixed(2),
        avgSettlementMinor: spec.hourlyRateMinor * 3,
      });
    } else {
      await db
        .update(providers)
        .set({
          userId: (spec as any).userId ?? null,
          payoutEmail: (spec as any).payoutEmail ?? null,
        })
        .where(eq(providers.id, spec.id));
    }
  }

  // 3. Demo CSV Fixtures
  await generateDemoCsvs();

  logger.info("database seeding completed successfully");

  return {
    buyerId,
    providerUserId,
    reviewerId,
    providerIds: providerSpecs.map((p) => p.id),
  };
}

async function main(): Promise<void> {
  try {
    await seed();
    await closeDb();
  } catch (err) {
    logger.error({ err: String(err) }, "seed failed");
    await closeDb();
    process.exitCode = 1;
  }
}

// Run directly if invoked via CLI
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main();
}
