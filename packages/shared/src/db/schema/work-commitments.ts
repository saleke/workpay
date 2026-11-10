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
import { workCommitmentStatusEnum } from "../enums";
import { taskConversations } from "./conversations";
import { workContracts } from "./contracts";
import { users } from "./identity";
import { providers } from "./providers";
import { tasks } from "./tasks";

/**
 * A two-party commitment to exact work terms. A conversation is non-binding;
 * this record becomes binding only after provider acceptance and buyer confirmation.
 */
export const workCommitments = pgTable(
  "work_commitments",
  {
    id: varchar("id", { length: 64 }).primaryKey(),
    taskId: varchar("task_id", { length: 64 })
      .notNull()
      .references(() => tasks.id, { onDelete: "cascade" }),
    conversationId: varchar("conversation_id", { length: 64 })
      .notNull()
      .references(() => taskConversations.id, { onDelete: "restrict" }),
    contractId: varchar("contract_id", { length: 64 })
      .notNull()
      .references(() => workContracts.id, { onDelete: "restrict" }),
    contractVersion: integer("contract_version").notNull(),
    contractHash: varchar("contract_hash", { length: 64 }).notNull(),
    buyerUserId: varchar("buyer_user_id", { length: 64 })
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    providerId: varchar("provider_id", { length: 64 })
      .notNull()
      .references(() => providers.id, { onDelete: "restrict" }),
    providerUserId: varchar("provider_user_id", { length: 64 })
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    status: workCommitmentStatusEnum("status").notNull().default("AWAITING_PROVIDER"),
    amountMinor: bigint("amount_minor", { mode: "number" }).notNull(),
    currency: varchar("currency", { length: 3 }).notNull().default("USD"),
    deliveryDeadline: timestamp("delivery_deadline", { withTimezone: true }),
    termsSnapshot: jsonb("terms_snapshot").notNull(),
    termsHash: varchar("terms_hash", { length: 64 }).notNull(),
    providerResponseNote: text("provider_response_note"),
    proposedAt: timestamp("proposed_at", { withTimezone: true }).notNull().defaultNow(),
    providerRespondedAt: timestamp("provider_responded_at", { withTimezone: true }),
    buyerConfirmedAt: timestamp("buyer_confirmed_at", { withTimezone: true }),
    capacityReservedAt: timestamp("capacity_reserved_at", { withTimezone: true }),
    capacityReleasedAt: timestamp("capacity_released_at", { withTimezone: true }),
    closedAt: timestamp("closed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    taskIdx: index("work_commitments_task_idx").on(t.taskId, t.createdAt),
    providerIdx: index("work_commitments_provider_idx").on(t.providerId, t.createdAt),
    conversationActiveIdx: uniqueIndex("work_commitments_conversation_active_unique")
      .on(t.conversationId)
      .where(sql`${t.status} in ('AWAITING_PROVIDER', 'AWAITING_CLIENT', 'CONFIRMED')`),
    taskConfirmedIdx: uniqueIndex("work_commitments_task_confirmed_unique")
      .on(t.taskId)
      .where(sql`${t.status} = 'CONFIRMED'`),
    amountCheck: check("work_commitments_amount_nonnegative", sql`${t.amountMinor} >= 0`),
    participantCheck: check(
      "work_commitments_distinct_participants",
      sql`${t.buyerUserId} <> ${t.providerUserId}`,
    ),
  }),
);

export const workCommitmentsRelations = relations(workCommitments, ({ one }) => ({
  task: one(tasks, { fields: [workCommitments.taskId], references: [tasks.id] }),
  conversation: one(taskConversations, {
    fields: [workCommitments.conversationId],
    references: [taskConversations.id],
  }),
  contract: one(workContracts, {
    fields: [workCommitments.contractId],
    references: [workContracts.id],
  }),
  buyer: one(users, { fields: [workCommitments.buyerUserId], references: [users.id] }),
  provider: one(providers, {
    fields: [workCommitments.providerId],
    references: [providers.id],
  }),
  providerUser: one(users, {
    fields: [workCommitments.providerUserId],
    references: [users.id],
  }),
}));
