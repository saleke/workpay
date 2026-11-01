/**
 * Negotiation and commercial agreement tables (Component 5).
 *
 * A negotiation is a bounded, turn-limited exchange of offers between the
 * buyer agent and a provider. Guardrails (max rounds, price within the
 * contract ceiling, deadline sanity) are enforced deterministically. The AI
 * drafts offers but never sets the final price.
 *
 * When an offer is accepted, a CommercialAgreement is created: the frozen,
 * hashed commercial terms that the payment authorizes against.
 */
import { relations, sql } from "drizzle-orm";
import {
  bigint,
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
import {
  agreementStatusEnum,
  negotiationStatusEnum,
  offerPartyEnum,
  offerStatusEnum,
  paymentTermsTypeEnum,
} from "../enums";
import { workContracts } from "./contracts";
import { providers } from "./providers";
import { tasks } from "./tasks";
import { taskConversations } from "./conversations";

export const negotiations = pgTable(
  "negotiations",
  {
    id: varchar("id", { length: 64 }).primaryKey(),
    taskId: varchar("task_id", { length: 64 })
      .notNull()
      .references(() => tasks.id, { onDelete: "cascade" }),
    contractId: varchar("contract_id", { length: 64 })
      .notNull()
      .references(() => workContracts.id, { onDelete: "cascade" }),
    providerId: varchar("provider_id", { length: 64 })
      .notNull()
      .references(() => providers.id, { onDelete: "cascade" }),
    status: negotiationStatusEnum("status").notNull().default("INITIATED"),
    /** Bounded turns: the buyer agent only acts on its own turn. */
    maxRounds: integer("max_rounds").notNull().default(4),
    currentRound: integer("current_round").notNull().default(0),
    /**
     * Who must act next. "BUYER_AGENT" turns are driven by the system;
     * "PROVIDER" turns await a provider (or the simulated provider) reply.
     */
    turn: offerPartyEnum("turn").notNull().default("BUYER_AGENT"),
    acceptedOfferId: varchar("accepted_offer_id", { length: 64 }),
    /** Set when the negotiation ends without agreement. */
    terminalReason: text("terminal_reason"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    taskIdx: index("negotiations_task_idx").on(t.taskId),
    contractIdx: index("negotiations_contract_idx").on(t.contractId),
    roundsCheck: check(
      "negotiations_rounds",
      sql`${t.currentRound} >= 0 and ${t.currentRound} <= ${t.maxRounds}`,
    ),
  }),
);

export const offers = pgTable(
  "offers",
  {
    id: varchar("id", { length: 64 }).primaryKey(),
    negotiationId: varchar("negotiation_id", { length: 64 })
      .notNull()
      .references(() => negotiations.id, { onDelete: "cascade" }),
    taskId: varchar("task_id", { length: 64 })
      .notNull()
      .references(() => tasks.id, { onDelete: "cascade" }),
    /** Monotonic per-negotiation version. */
    version: integer("version").notNull(),
    submittedBy: offerPartyEnum("submitted_by").notNull(),
    status: offerStatusEnum("status").notNull().default("PENDING"),
    priceMinor: bigint("price_minor", { mode: "number" }).notNull(),
    currency: varchar("currency", { length: 3 }).notNull().default("USD"),
    deliveryDeadline: timestamp("delivery_deadline", { withTimezone: true }).notNull(),
    /** Scope deltas relative to the contract, if any. */
    scopeDelta: jsonb("scope_delta"),
    message: text("message"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    resolvedAt: timestamp("resolved_at", { withTimezone: true }),
  },
  (t) => ({
    negotiationVersionIdx: uniqueIndex("offers_negotiation_version_unique").on(
      t.negotiationId,
      t.version,
    ),
    priceCheck: check("offers_price_nonnegative", sql`${t.priceMinor} >= 0`),
  }),
);

export const commercialAgreements = pgTable(
  "commercial_agreements",
  {
    id: varchar("id", { length: 64 }).primaryKey(),
    taskId: varchar("task_id", { length: 64 })
      .notNull()
      .references(() => tasks.id, { onDelete: "cascade" }),
    contractId: varchar("contract_id", { length: 64 })
      .notNull()
      .references(() => workContracts.id, { onDelete: "cascade" }),
    negotiationId: varchar("negotiation_id", { length: 64 }).references(() => negotiations.id, {
      onDelete: "cascade",
    }),
    sourceConversationId: varchar("source_conversation_id", { length: 64 }).references(
      () => taskConversations.id,
      { onDelete: "restrict" },
    ),
    providerId: varchar("provider_id", { length: 64 })
      .notNull()
      .references(() => providers.id, { onDelete: "cascade" }),
    /**
     * The contract version this agreement was struck against. If the contract
     * changes, the agreement is stale and cannot be used to authorize payment.
     */
    contractVersion: integer("contract_version").notNull(),
    status: agreementStatusEnum("status").notNull().default("PENDING_AUTHORIZATION"),
    agreedPriceMinor: bigint("agreed_price_minor", { mode: "number" }).notNull(),
    currency: varchar("currency", { length: 3 }).notNull().default("USD"),
    deliveryDeadline: timestamp("delivery_deadline", { withTimezone: true }),
    paymentTerms: paymentTermsTypeEnum("payment_terms").notNull().default("FULL_ON_ACCEPTANCE"),
    /** sha256 over the frozen commercial terms. */
    agreementHash: varchar("agreement_hash", { length: 64 }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    taskIdx: uniqueIndex("commercial_agreements_task_unique").on(t.taskId),
    priceCheck: check("commercial_agreements_price_nonnegative", sql`${t.agreedPriceMinor} >= 0`),
  }),
);

export const negotiationsRelations = relations(negotiations, ({ one, many }) => ({
  task: one(tasks, { fields: [negotiations.taskId], references: [tasks.id] }),
  contract: one(workContracts, {
    fields: [negotiations.contractId],
    references: [workContracts.id],
  }),
  provider: one(providers, { fields: [negotiations.providerId], references: [providers.id] }),
  offers: many(offers),
}));

export const offersRelations = relations(offers, ({ one }) => ({
  negotiation: one(negotiations, { fields: [offers.negotiationId], references: [negotiations.id] }),
}));

export const commercialAgreementsRelations = relations(commercialAgreements, ({ one }) => ({
  task: one(tasks, { fields: [commercialAgreements.taskId], references: [tasks.id] }),
  contract: one(workContracts, {
    fields: [commercialAgreements.contractId],
    references: [workContracts.id],
  }),
  provider: one(providers, {
    fields: [commercialAgreements.providerId],
    references: [providers.id],
  }),
  conversation: one(taskConversations, {
    fields: [commercialAgreements.sourceConversationId],
    references: [taskConversations.id],
  }),
}));
