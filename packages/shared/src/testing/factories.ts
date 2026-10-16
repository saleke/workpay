/**
 * Test data factories. Small helpers that insert the rows a test needs, using
 * the real schema so tests exercise the same constraints as production.
 */
import type { Database } from "../db/client.js";
import { users } from "../db/schema/identity.js";
import { capabilities, availability, providers, reputation } from "../db/schema/providers.js";
import { newId } from "../platform/ids.js";

export async function createUser(
  db: Database,
  overrides: { role?: "buyer" | "provider" | "admin_reviewer"; name?: string; email?: string } = {},
) {
  const id = newId("user");
  const [user] = await db
    .insert(users)
    .values({
      id,
      name: overrides.name ?? "Test Buyer",
      email: overrides.email ?? `${id}@example.test`,
      role: overrides.role ?? "buyer",
    })
    .returning();
  if (!user) throw new Error("failed to create user");
  return user;
}

export interface SeedProviderOptions {
  displayName?: string;
  tags?: string[];
  available?: boolean;
  capacity?: number;
  activeAssignments?: number;
  hourlyRateMinor?: number;
  onTimeRatePct?: number;
  firstPassAcceptancePct?: number;
  completedTasks?: number;
}

/** Create a provider with capabilities, availability and a reputation snapshot. */
export async function createProvider(db: Database, options: SeedProviderOptions = {}) {
  const id = newId("provider");
  const [provider] = await db
    .insert(providers)
    .values({
      id,
      displayName: options.displayName ?? `Provider ${id.slice(-4)}`,
      type: "HUMAN",
      status: "ACTIVE",
      hourlyRateMinor: options.hourlyRateMinor ?? 5000,
      currency: "USD",
    })
    .returning();
  if (!provider) throw new Error("failed to create provider");

  const tags = options.tags ?? ["data_cleaning", "spreadsheet"];
  if (tags.length > 0) {
    await db
      .insert(capabilities)
      .values(tags.map((tag) => ({ id: newId("cap"), providerId: id, tag, proficiency: 4 })));
  }

  await db.insert(availability).values({
    id: newId("avail"),
    providerId: id,
    available: options.available ?? true,
    capacity: options.capacity ?? 3,
    activeAssignments: options.activeAssignments ?? 0,
  });

  await db.insert(reputation).values({
    id: newId("rep"),
    providerId: id,
    completedTasks: options.completedTasks ?? 10,
    onTimeRatePct: String((options.onTimeRatePct ?? 90).toFixed(2)),
    firstPassAcceptancePct: String((options.firstPassAcceptancePct ?? 85).toFixed(2)),
    avgSettlementMinor: 5000,
  });

  return provider;
}
