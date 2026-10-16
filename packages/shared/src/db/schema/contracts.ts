/**
 * Contract tables (Component 3). A contract is the frozen, hashed agreement of
 * what will be done, in scope, how it will be verified, and the budget.
 *
 * Contract hash: sha256 over the canonical serialization of the frozen
 * contents (scope, acceptance rules, budget, deadline). Any change produces a
 * new version with a new hash. Payment and verification bind to the hash, so a
 * post-approval mutation is detectable.
 */
import { relations, sql } from "drizzle-orm";
import {
  bigint,
  boolean,
  check,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  varchar,
} from "drizzle-orm/pg-core";
import { contractStatusEnum, scopeItemTypeEnum, verificationMethodTypeEnum } from "../enums";
import { tasks } from "./tasks";
import { users } from "./identity";

export const workContracts = pgTable(
  "work_contracts",
  {
    id: varchar("id", { length: 64 }).primaryKey(),
    taskId: varchar("task_id", { length: 64 })
      .notNull()
      .references(() => tasks.id, { onDelete: "cascade" }),
    version: integer("version").notNull().default(1),
    status: contractStatusEnum("status").notNull().default("DRAFT"),
    title: text("title").notNull(),
    /** Buyer-facing summary of the agreed work. */
    summary: text("summary").notNull(),
    /** sha256 of canonical frozen contents. */
    contractHash: varchar("contract_hash", { length: 64 }).notNull(),
    budgetMinor: bigint("budget_minor", { mode: "number" }).notNull(),
    currency: varchar("currency", { length: 3 }).notNull().default("USD"),
    deadline: timestamp("deadline", { withTimezone: true }),
    /** Acceptance/verification rules resolved into a deterministic plan. */
    acceptancePlan: jsonb("acceptance_plan"),
    approvedBy: varchar("approved_by", { length: 64 }).references(() => users.id, {
      onDelete: "set null",
    }),
    approvedAt: timestamp("approved_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    taskVersionIdx: uniqueIndex("work_contracts_task_version_unique").on(t.taskId, t.version),
    statusIdx: index("work_contracts_status_idx").on(t.status),
    budgetCheck: check("contracts_budget_nonnegative", sql`${t.budgetMinor} >= 0`),
  }),
);

export const contractRequirements = pgTable(
  "contract_requirements",
  {
    id: varchar("id", { length: 64 }).primaryKey(),
    contractId: varchar("contract_id", { length: 64 })
      .notNull()
      .references(() => workContracts.id, { onDelete: "cascade" }),
    /** Requirement key inherited from the work specification. */
    key: varchar("key", { length: 128 }).notNull(),
    statement: text("statement").notNull(),
    acceptanceRelevant: boolean("acceptance_relevant").notNull().default(true),
  },
  (t) => ({
    contractKeyIdx: uniqueIndex("contract_requirements_key_unique").on(t.contractId, t.key),
  }),
);

export const scopeItems = pgTable(
  "scope_items",
  {
    id: varchar("id", { length: 64 }).primaryKey(),
    contractId: varchar("contract_id", { length: 64 })
      .notNull()
      .references(() => workContracts.id, { onDelete: "cascade" }),
    type: scopeItemTypeEnum("type").notNull(),
    statement: text("statement").notNull(),
    position: integer("position").notNull().default(0),
  },
  (t) => ({
    contractIdx: index("scope_items_contract_idx").on(t.contractId),
  }),
);

export const acceptanceRules = pgTable(
  "acceptance_rules",
  {
    id: varchar("id", { length: 64 }).primaryKey(),
    contractId: varchar("contract_id", { length: 64 })
      .notNull()
      .references(() => workContracts.id, { onDelete: "cascade" }),
    /** Requirement key this rule proves or refutes. */
    requirementKey: varchar("requirement_key", { length: 128 }).notNull(),
    method: verificationMethodTypeEnum("method").notNull(),
    /** Machine-checkable parameters for deterministic checks. */
    params: jsonb("params"),
    /** Prompt/instructions for semantic checks (never used for money). */
    instructions: text("instructions"),
    position: integer("position").notNull().default(0),
  },
  (t) => ({
    contractIdx: index("acceptance_rules_contract_idx").on(t.contractId),
    contractReqIdx: uniqueIndex("acceptance_rules_contract_req_unique").on(
      t.contractId,
      t.requirementKey,
    ),
  }),
);

export const approvals = pgTable(
  "approvals",
  {
    id: varchar("id", { length: 64 }).primaryKey(),
    contractId: varchar("contract_id", { length: 64 })
      .notNull()
      .references(() => workContracts.id, { onDelete: "cascade" }),
    approvedBy: varchar("approved_by", { length: 64 })
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    /** The exact hash the buyer approved. Guards against silent edits. */
    contractHash: varchar("contract_hash", { length: 64 }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    contractIdx: uniqueIndex("approvals_contract_unique").on(t.contractId),
  }),
);

export const contractsRelations = relations(workContracts, ({ one, many }) => ({
  task: one(tasks, { fields: [workContracts.taskId], references: [tasks.id] }),
  requirements: many(contractRequirements),
  scopeItems: many(scopeItems),
  acceptanceRules: many(acceptanceRules),
}));

export const contractRequirementsRelations = relations(contractRequirements, ({ one }) => ({
  contract: one(workContracts, {
    fields: [contractRequirements.contractId],
    references: [workContracts.id],
  }),
}));

export const scopeItemsRelations = relations(scopeItems, ({ one }) => ({
  contract: one(workContracts, { fields: [scopeItems.contractId], references: [workContracts.id] }),
}));

export const acceptanceRulesRelations = relations(acceptanceRules, ({ one }) => ({
  contract: one(workContracts, {
    fields: [acceptanceRules.contractId],
    references: [workContracts.id],
  }),
}));
