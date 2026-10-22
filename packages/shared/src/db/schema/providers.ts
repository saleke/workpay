/**
 * Provider tables (Component 4). A provider is a human, agent, or service that
 * can be selected to perform a contract.
 *
 * Selection is deterministic and eligibility-first: only providers that are
 * active, capable, and available are considered, then ranked by a documented
 * score. The AI never invents providers; it may only narrate the choice.
 */
import { relations, sql } from "drizzle-orm";
import {
  bigint,
  boolean,
  check,
  index,
  integer,
  jsonb,
  numeric,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  varchar,
} from "drizzle-orm/pg-core";
import { providerSelectionStatusEnum, providerStatusEnum, providerTypeEnum } from "../enums";
import { workContracts } from "./contracts";
import { users } from "./identity";

export const providers = pgTable(
  "providers",
  {
    id: varchar("id", { length: 64 }).primaryKey(),
    userId: varchar("user_id", { length: 64 }).references(() => users.id, { onDelete: "cascade" }),
    displayName: text("display_name").notNull(),
    type: providerTypeEnum("type").notNull().default("HUMAN"),
    status: providerStatusEnum("status").notNull().default("ACTIVE"),
    /** Free-text capabilities for display and coarse filtering. */
    bio: text("bio"),
    hourlyRateMinor: bigint("hourly_rate_minor", { mode: "number" }),
    currency: varchar("currency", { length: 3 }).notNull().default("USD"),
    payoutEmail: text("payout_email"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    userIdIdx: uniqueIndex("providers_user_id_unique").on(t.userId),
    statusIdx: index("providers_status_idx").on(t.status),
    typeIdx: index("providers_type_idx").on(t.type),
    rateCheck: check(
      "providers_rate_nonnegative",
      sql`${t.hourlyRateMinor} is null or ${t.hourlyRateMinor} >= 0`,
    ),
  }),
);

export const capabilities = pgTable(
  "provider_capabilities",
  {
    id: varchar("id", { length: 64 }).primaryKey(),
    providerId: varchar("provider_id", { length: 64 })
      .notNull()
      .references(() => providers.id, { onDelete: "cascade" }),
    /** Capability tag matched against contract requirements, e.g. "data_cleaning". */
    tag: varchar("tag", { length: 128 }).notNull(),
    /** 1 (weak) to 5 (expert). */
    proficiency: integer("proficiency").notNull().default(3),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    providerTagIdx: uniqueIndex("capabilities_unique").on(t.providerId, t.tag),
  }),
);

export const availability = pgTable(
  "provider_availability",
  {
    id: varchar("id", { length: 64 }).primaryKey(),
    providerId: varchar("provider_id", { length: 64 })
      .notNull()
      .references(() => providers.id, { onDelete: "cascade" }),
    available: boolean("available").notNull().default(true),
    capacity: integer("capacity").notNull().default(1),
    activeAssignments: integer("active_assignments").notNull().default(0),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    providerIdx: uniqueIndex("availability_provider_unique").on(t.providerId),
    capacityCheck: check(
      "provider_availability_capacity",
      sql`${t.capacity} >= 0 and ${t.activeAssignments} >= 0`,
    ),
  }),
);

export const reputation = pgTable(
  "provider_reputation_snapshots",
  {
    id: varchar("id", { length: 64 }).primaryKey(),
    providerId: varchar("provider_id", { length: 64 })
      .notNull()
      .references(() => providers.id, { onDelete: "cascade" }),
    completedTasks: integer("completed_tasks").notNull().default(0),
    /** 0..100. Nullable while there is insufficient evidence. */
    onTimeRatePct: numeric("on_time_rate_pct", { precision: 5, scale: 2 }),
    firstPassAcceptancePct: numeric("first_pass_acceptance_pct", { precision: 5, scale: 2 }),
    /** Captured lifetime value in minor units, for display only. */
    avgSettlementMinor: bigint("avg_settlement_minor", { mode: "number" }),
    capturedAt: timestamp("captured_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    providerIdx: index("reputation_provider_idx").on(t.providerId, t.capturedAt),
  }),
);

export const providerSelections = pgTable(
  "provider_selections",
  {
    id: varchar("id", { length: 64 }).primaryKey(),
    taskId: varchar("task_id", { length: 64 }).notNull(),
    contractId: varchar("contract_id", { length: 64 })
      .notNull()
      .references(() => workContracts.id, { onDelete: "cascade" }),
    providerId: varchar("provider_id", { length: 64 }).references(() => providers.id, {
      onDelete: "set null",
    }),
    status: providerSelectionStatusEnum("status").notNull().default("SELECTED"),
    /** Full ranked candidate list with scores, for audit and the UI. */
    candidates: jsonb("candidates"),
    /** Deterministic human-readable reason for the top pick. */
    reason: text("reason"),
    /** Version of the selection algorithm, bumped when scoring changes. */
    algorithmVersion: varchar("algorithm_version", { length: 32 }).notNull().default("v1"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    taskIdx: index("provider_selections_task_idx").on(t.taskId),
    contractIdx: index("provider_selections_contract_idx").on(t.contractId),
  }),
);

export const providersRelations = relations(providers, ({ many }) => ({
  capabilities: many(capabilities),
  availability: many(availability),
  reputation: many(reputation),
}));

export const providerCapabilitiesRelations = relations(capabilities, ({ one }) => ({
  provider: one(providers, {
    fields: [capabilities.providerId],
    references: [providers.id],
  }),
}));

export const providerSelectionsRelations = relations(providerSelections, ({ one }) => ({
  contract: one(workContracts, {
    fields: [providerSelections.contractId],
    references: [workContracts.id],
  }),
  provider: one(providers, { fields: [providerSelections.providerId], references: [providers.id] }),
}));
