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
import { taskConversations } from "./conversations";
import { tasks } from "./tasks";
import { users } from "./identity";
import { workContracts } from "./contracts";

export const contractChangeRequests = pgTable(
  "contract_change_requests",
  {
    id: varchar("id", { length: 64 }).primaryKey(),
    taskId: varchar("task_id", { length: 64 })
      .notNull()
      .references(() => tasks.id, { onDelete: "cascade" }),
    conversationId: varchar("conversation_id", { length: 64 })
      .notNull()
      .references(() => taskConversations.id, { onDelete: "cascade" }),
    baseContractId: varchar("base_contract_id", { length: 64 })
      .notNull()
      .references(() => workContracts.id, { onDelete: "restrict" }),
    baseContractVersion: integer("base_contract_version").notNull(),
    baseContractHash: varchar("base_contract_hash", { length: 64 }).notNull(),
    proposerUserId: varchar("proposer_user_id", { length: 64 })
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    respondentUserId: varchar("respondent_user_id", { length: 64 })
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    reason: text("reason").notNull(),
    /** Complete proposed replacement terms; never mutate the base contract. */
    proposedTerms: jsonb("proposed_terms").notNull(),
    proposedTermsHash: varchar("proposed_terms_hash", { length: 64 }).notNull(),
    proposedContractHash: varchar("proposed_contract_hash", { length: 64 }).notNull(),
    proposedBudgetMinor: bigint("proposed_budget_minor", { mode: "number" }).notNull(),
    proposedAgreedPriceMinor: bigint("proposed_agreed_price_minor", { mode: "number" }),
    currency: varchar("currency", { length: 3 }).notNull(),
    paymentAdjustmentPlan: jsonb("payment_adjustment_plan"),
    baseAgreementSnapshot: jsonb("base_agreement_snapshot"),
    activatedContractId: varchar("activated_contract_id", { length: 64 }).references(
      () => workContracts.id,
      { onDelete: "restrict" },
    ),
    activatedAt: timestamp("activated_at", { withTimezone: true }),
    status: varchar("status", { length: 40 }).notNull().default("PROPOSED"),
    responseNote: text("response_note"),
    cancellationRequestedBy: varchar("cancellation_requested_by", { length: 64 }).references(
      () => users.id,
      { onDelete: "restrict" },
    ),
    respondedAt: timestamp("responded_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    conversationIdx: index("contract_change_requests_conversation_idx").on(
      t.conversationId,
      t.createdAt,
    ),
    taskIdx: index("contract_change_requests_task_idx").on(t.taskId, t.createdAt),
    oneUnresolvedPerTask: uniqueIndex("contract_change_requests_one_unresolved_per_task")
      .on(t.taskId)
      .where(
        sql`${t.status} in ('PROPOSED', 'ACCEPTED_PENDING_ACTIVATION', 'ACTIVATING', 'ACTIVATION_RECONCILIATION_REQUIRED', 'CANCELLATION_PENDING')`,
      ),
    statusCheck: check(
      "contract_change_requests_status_check",
      sql`${t.status} in ('PROPOSED', 'ACCEPTED_PENDING_ACTIVATION', 'ACTIVATING', 'ACTIVATION_FAILED', 'ACTIVATION_RECONCILIATION_REQUIRED', 'CANCELLATION_PENDING', 'ACTIVATED', 'DECLINED', 'WITHDRAWN', 'CANCELLED')`,
    ),
    versionCheck: check(
      "contract_change_requests_version_positive",
      sql`${t.baseContractVersion} > 0`,
    ),
    budgetCheck: check(
      "contract_change_requests_budget_nonnegative",
      sql`${t.proposedBudgetMinor} >= 0`,
    ),
    currencyCheck: check(
      "contract_change_requests_currency_check",
      sql`${t.currency} ~ '^[A-Z]{3}$'`,
    ),
    partiesCheck: check(
      "contract_change_requests_distinct_parties",
      sql`${t.proposerUserId} <> ${t.respondentUserId}`,
    ),
  }),
);

export const contractChangeRequestsRelations = relations(contractChangeRequests, ({ one }) => ({
  task: one(tasks, { fields: [contractChangeRequests.taskId], references: [tasks.id] }),
  conversation: one(taskConversations, {
    fields: [contractChangeRequests.conversationId],
    references: [taskConversations.id],
  }),
}));
