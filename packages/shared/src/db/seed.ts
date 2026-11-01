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
import { reviewerEvidence, reviewerExpertise, reviewerProfiles } from "./schema/reviewers.js";
import { logger } from "../platform/logger.js";
import { newId } from "../platform/ids.js";
import { hashPassword } from "../platform/password.js";

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

  const demoPasswordHash = process.env.WORKPAY_DEMO_PASSWORD
    ? hashPassword(process.env.WORKPAY_DEMO_PASSWORD)
    : undefined;
  const demoAccounts = [
    {
      id: buyerId,
      name: "Alice Buyer",
      displayName: "Alice Buyer",
      username: "alice_buyer",
      email: "buyer@example.com",
      role: "buyer" as const,
    },
    {
      id: providerUserId,
      name: "Bob DataClean",
      displayName: "Bob DataClean",
      username: "bob_dataclean",
      email: "provider@example.com",
      role: "provider" as const,
    },
    {
      id: reviewerId,
      name: "Carol Reviewer",
      displayName: "Carol Reviewer",
      username: "carol_reviewer",
      email: "reviewer@example.com",
      role: "admin_reviewer" as const,
    },
    {
      id: "usr_provider_dee",
      name: "Dee Accessibility",
      displayName: "Dee Accessibility",
      username: "dee_accessibility",
      email: "dee@example.com",
      role: "provider" as const,
    },
    {
      id: "usr_provider_sam",
      name: "Sam Design",
      displayName: "Sam Design",
      username: "sam_design",
      email: "sam@example.com",
      role: "provider" as const,
    },
    {
      id: "usr_provider_taylor",
      name: "Taylor Bookkeeping",
      displayName: "Taylor Bookkeeping",
      username: "taylor_books",
      email: "taylor@example.com",
      role: "provider" as const,
    },
    {
      id: "usr_reviewer_jamie",
      name: "Jamie Accessibility Reviewer",
      displayName: "Jamie Accessibility Reviewer",
      username: "jamie_review",
      email: "jamie@example.com",
      role: "provider" as const,
    },
    {
      id: "usr_reviewer_morgan",
      name: "Morgan Finance Reviewer",
      displayName: "Morgan Finance Reviewer",
      username: "morgan_review",
      email: "morgan@example.com",
      role: "provider" as const,
    },
  ];

  for (const account of demoAccounts) {
    const values = {
      ...account,
      ...(demoPasswordHash ? { passwordHash: demoPasswordHash } : {}),
    };
    await db
      .insert(users)
      .values(values)
      .onConflictDoUpdate({
        target: users.id,
        set: {
          name: account.name,
          displayName: account.displayName,
          username: account.username,
          email: account.email,
          role: account.role,
          ...(demoPasswordHash ? { passwordHash: demoPasswordHash } : {}),
          updatedAt: new Date(),
        },
      });
  }

  // 2. Seeded Providers
  const providerSpecs = [
    {
      id: "pro_dataclean_apex",
      userId: providerUserId,
      displayName: "Apex Data Solutions (Bob)",
      payoutEmail: "provider@example.com",
      bio: "Independent data specialist focused on careful cleaning, deduplication, and validation.",
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
      userId: "usr_provider_sam",
      displayName: "Sam Design Studio",
      payoutEmail: "sam@example.com",
      bio: "Independent design professional specializing in clear, accessible digital experiences.",
      hourlyRateMinor: 5000, // $50/hr
      tags: ["web_design", "ui_design", "accessibility", "ux_research", "prototyping"],
      capacity: 3,
      activeAssignments: 0,
      completedTasks: 28,
      onTimeRatePct: 92.5,
      firstPassAcceptancePct: 88.0,
    },
    {
      id: "pro_quickclean_csv",
      userId: "usr_provider_taylor",
      displayName: "Taylor Bookkeeping",
      payoutEmail: "taylor@example.com",
      bio: "Independent bookkeeping specialist focused on reconciliations and clean financial records.",
      hourlyRateMinor: 3500, // $35/hr
      tags: ["bookkeeping", "financial_analysis", "reconciliation", "spreadsheet"],
      capacity: 2,
      activeAssignments: 0,
      completedTasks: 15,
      onTimeRatePct: 82.0,
      firstPassAcceptancePct: 76.0,
    },
    {
      id: "pro_accessibility_dee",
      userId: "usr_provider_dee",
      displayName: "Dee Accessibility Consulting",
      payoutEmail: "dee@example.com",
      bio: "Accessibility specialist focused on practical audits and standards-informed recommendations.",
      hourlyRateMinor: 6000,
      tags: ["accessibility", "wcag", "web_accessibility", "usability"],
      capacity: 2,
      activeAssignments: 0,
      completedTasks: 19,
      onTimeRatePct: 94.0,
      firstPassAcceptancePct: 91.0,
    },
  ] satisfies Array<{
    id: string;
    userId: string;
    displayName: string;
    payoutEmail: string;
    bio: string;
    hourlyRateMinor: number;
    tags: string[];
    capacity: number;
    activeAssignments: number;
    completedTasks: number;
    onTimeRatePct: number;
    firstPassAcceptancePct: number;
  }>;

  for (const spec of providerSpecs) {
    const existing = await db
      .select({ id: providers.id })
      .from(providers)
      .where(eq(providers.id, spec.id))
      .limit(1);

    if (existing.length === 0) {
      await db.insert(providers).values({
        id: spec.id,
        userId: spec.userId,
        displayName: spec.displayName,
        type: "HUMAN",
        status: "ACTIVE",
        bio: spec.bio,
        hourlyRateMinor: spec.hourlyRateMinor,
        currency: "USD",
        payoutEmail: spec.payoutEmail,
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
          userId: spec.userId,
          displayName: spec.displayName,
          bio: spec.bio,
          hourlyRateMinor: spec.hourlyRateMinor,
          payoutEmail: spec.payoutEmail,
          status: "ACTIVE",
          updatedAt: new Date(),
        })
        .where(eq(providers.id, spec.id));
    }
  }

  const reviewerSpecs = [
    {
      userId: "usr_reviewer_jamie",
      displayName: "Jamie Accessibility Reviewer",
      summary: "Independent review of web accessibility evidence and remediation plans.",
      feeMinor: 18000,
      domainTag: "accessibility",
      scope: "Reviews keyboard access, semantic structure, and documented accessibility findings.",
    },
    {
      userId: "usr_reviewer_morgan",
      displayName: "Morgan Finance Reviewer",
      summary: "Independent review of bookkeeping reconciliations and financial summaries.",
      feeMinor: 22000,
      domainTag: "bookkeeping",
      scope: "Reviews reconciliations, traceability, and consistency of financial summaries.",
    },
  ];
  for (const reviewer of reviewerSpecs) {
    const [existing] = await db
      .select({ id: reviewerProfiles.id })
      .from(reviewerProfiles)
      .where(eq(reviewerProfiles.userId, reviewer.userId))
      .limit(1);
    const profileId = existing?.id ?? newId("reviewer");
    const profileValues = {
      userId: reviewer.userId,
      displayName: reviewer.displayName,
      publicContactUrl: null,
      isListed: true,
      available: true,
      summary: reviewer.summary,
      languages: ["English"],
      feeMinor: reviewer.feeMinor,
      currency: "USD",
      typicalTurnaroundDays: 4,
      conflictDisclosureConfirmed: true,
      updatedAt: new Date(),
    };
    if (existing) {
      await db
        .update(reviewerProfiles)
        .set(profileValues)
        .where(eq(reviewerProfiles.id, profileId));
    } else {
      await db.insert(reviewerProfiles).values({ id: profileId, ...profileValues });
    }

    await db.delete(reviewerExpertise).where(eq(reviewerExpertise.profileId, profileId));
    await db.delete(reviewerEvidence).where(eq(reviewerEvidence.profileId, profileId));
    await db.insert(reviewerExpertise).values({
      id: newId("rex"),
      profileId,
      domainTag: reviewer.domainTag,
      scope: reviewer.scope,
      selfAssessedLevel: 4,
      yearsExperience: 6,
      methods: ["evidence review", "written findings"],
    });
    await db.insert(reviewerEvidence).values({
      id: newId("revd"),
      profileId,
      kind: "EXPERIENCE",
      title: "Reviewer-supplied experience summary",
      description: `Synthetic test profile for ${reviewer.domainTag}; this claim is not verified.`,
      url: null,
      issuer: null,
      provenance: "REVIEWER_SUPPLIED",
    });
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
