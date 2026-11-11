import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { getDb } from "./client.js";
import { users } from "./schema/identity.js";
import { availability, capabilities, providers, reputation } from "./schema/providers.js";
import { seed } from "./seed.js";
import { closeTestDb, hasTestDatabase, resetDatabase } from "../testing/index.js";

if (process.env.RUN_DB_TESTS === "1") {
  const { getEnv } = await import("../platform/env.js");
  getEnv();
}

const describeDb = hasTestDatabase() ? describe : describe.skip;

describeDb("fresh evaluator seed (integration)", () => {
  beforeEach(async () => resetDatabase());
  afterAll(async () => closeTestDb());

  it("creates complete neutral identities and usable Work Profiles", async () => {
    const db = getDb();
    const result = await seed(db);
    const [accountRows, profileRows, capabilityRows, availabilityRows, reputationRows] =
      await Promise.all([
        db.select().from(users),
        db.select().from(providers),
        db.select().from(capabilities),
        db.select().from(availability),
        db.select().from(reputation),
      ]);

    expect(accountRows).toHaveLength(7);
    expect(accountRows.every((account) => account.accountClass === "DEMO_FIXTURE")).toBe(true);
    expect(accountRows.map((account) => account.displayName).sort()).toEqual([
      "Amara Okafor",
      "Ethan Brooks",
      "Jordan Ellis",
      "Lucas Martin",
      "Maya Chen",
      "Nadia Patel",
      "Sofia Reyes",
    ]);
    expect(
      accountRows.every(
        (account) => !/\b(?:buyer|provider|reviewer|specialist)\b/i.test(account.displayName ?? ""),
      ),
    ).toBe(true);
    expect(profileRows).toHaveLength(6);
    expect(result.providerIds).toHaveLength(6);
    expect(capabilityRows.length).toBeGreaterThanOrEqual(16);
    expect(availabilityRows.filter((row) => row.available)).toHaveLength(4);
    expect(
      profileRows
        .filter((profile) => profile.hourlyRateMinor !== null)
        .every((profile) => {
          const preferences = profile.workPreferences as {
            aiRecommendationAllowed?: boolean;
            toolsAndTechnologies?: unknown[];
          };
          return (
            preferences.aiRecommendationAllowed === true &&
            (preferences.toolsAndTechnologies?.length ?? 0) > 0
          );
        }),
    ).toBe(true);
    expect(reputationRows.every((row) => row.completedTasks === 0)).toBe(true);
  });

  it("upgrades a legacy evaluator profile without violating the user-profile uniqueness rule", async () => {
    const db = getDb();
    await db.insert(users).values({
      id: "usr_provider_bob",
      name: "Legacy Professional Label",
      displayName: "Legacy Professional Label",
      username: "legacy_professional",
      email: "legacy@example.test",
      role: "provider",
      accountClass: "DEMO_FIXTURE",
    });
    await db.insert(providers).values({
      id: "pro_legacy_jordan",
      userId: "usr_provider_bob",
      displayName: "Legacy Provider Profile",
      type: "HUMAN",
      status: "ACTIVE",
      currency: "USD",
    });

    const result = await seed(db);
    const profiles = await db
      .select()
      .from(providers)
      .where(eq(providers.userId, "usr_provider_bob"));
    expect(profiles).toHaveLength(1);
    expect(profiles[0]).toMatchObject({
      id: "pro_legacy_jordan",
      displayName: "Jordan Ellis",
    });
    expect(result.providerIds).toContain("pro_legacy_jordan");
  });
});
