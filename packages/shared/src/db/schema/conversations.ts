import { relations, sql } from "drizzle-orm";
import {
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
import { taskConversationStatusEnum } from "../enums";
import { providers } from "./providers";
import { tasks } from "./tasks";
import { users } from "./identity";

export const taskConversations = pgTable(
  "task_conversations",
  {
    id: varchar("id", { length: 64 }).primaryKey(),
    taskId: varchar("task_id", { length: 64 })
      .notNull()
      .references(() => tasks.id, { onDelete: "cascade" }),
    buyerUserId: varchar("buyer_user_id", { length: 64 })
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    providerId: varchar("provider_id", { length: 64 })
      .notNull()
      .references(() => providers.id, { onDelete: "restrict" }),
    providerUserId: varchar("provider_user_id", { length: 64 })
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    status: taskConversationStatusEnum("status").notNull().default("CONTACT_PENDING"),
    messageCounter: integer("message_counter").notNull().default(0),
    initialContactMessageId: varchar("initial_contact_message_id", { length: 64 }),
    contactApprovedAt: timestamp("contact_approved_at", { withTimezone: true }).notNull(),
    contactApprovedContractVersion: integer("contact_approved_contract_version").notNull(),
    contactApprovedContractHash: varchar("contact_approved_contract_hash", {
      length: 64,
    }).notNull(),
    currentContractVersion: integer("current_contract_version").notNull(),
    currentContractHash: varchar("current_contract_hash", { length: 64 }).notNull(),
    currentContractSnapshot: jsonb("current_contract_snapshot").notNull(),
    contractSnapshot: jsonb("contract_snapshot").notNull(),
    providerRespondedAt: timestamp("provider_responded_at", { withTimezone: true }),
    closedAt: timestamp("closed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    taskIdx: index("task_conversations_task_idx").on(t.taskId, t.createdAt),
    buyerIdx: index("task_conversations_buyer_idx").on(t.buyerUserId, t.createdAt),
    providerUserIdx: index("task_conversations_provider_user_idx").on(
      t.providerUserId,
      t.createdAt,
    ),
    activeProviderIdx: uniqueIndex("task_conversations_active_provider_unique")
      .on(t.taskId, t.providerId)
      .where(sql`${t.status} in ('CONTACT_PENDING', 'OPEN')`),
    contractVersionCheck: check(
      "task_conversations_contract_version_positive",
      sql`${t.contactApprovedContractVersion} > 0`,
    ),
    currentContractVersionCheck: check(
      "task_conversations_current_contract_version_positive",
      sql`${t.currentContractVersion} > 0`,
    ),
    messageCounterCheck: check(
      "task_conversations_message_counter_nonnegative",
      sql`${t.messageCounter} >= 0`,
    ),
  }),
);

export const taskConversationMessages = pgTable(
  "task_conversation_messages",
  {
    id: varchar("id", { length: 64 }).primaryKey(),
    conversationId: varchar("conversation_id", { length: 64 })
      .notNull()
      .references(() => taskConversations.id, { onDelete: "cascade" }),
    sequence: integer("sequence").notNull(),
    clientMessageId: varchar("client_message_id", { length: 64 }).notNull(),
    authorUserId: varchar("author_user_id", { length: 64 })
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    body: text("body").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    sequenceIdx: uniqueIndex("task_conversation_messages_sequence_unique").on(
      t.conversationId,
      t.sequence,
    ),
    clientIdIdx: uniqueIndex("task_conversation_messages_client_id_unique").on(
      t.conversationId,
      t.clientMessageId,
    ),
    contentCheck: check(
      "task_conversation_messages_body_nonempty",
      sql`length(trim(${t.body})) > 0`,
    ),
    listIdx: index("task_conversation_messages_list_idx").on(t.conversationId, t.sequence),
  }),
);

export const taskConversationsRelations = relations(taskConversations, ({ one, many }) => ({
  task: one(tasks, { fields: [taskConversations.taskId], references: [tasks.id] }),
  buyer: one(users, { fields: [taskConversations.buyerUserId], references: [users.id] }),
  provider: one(providers, { fields: [taskConversations.providerId], references: [providers.id] }),
  providerUser: one(users, {
    fields: [taskConversations.providerUserId],
    references: [users.id],
  }),
  messages: many(taskConversationMessages),
}));

export const taskConversationMessagesRelations = relations(taskConversationMessages, ({ one }) => ({
  conversation: one(taskConversations, {
    fields: [taskConversationMessages.conversationId],
    references: [taskConversations.id],
  }),
  author: one(users, {
    fields: [taskConversationMessages.authorUserId],
    references: [users.id],
  }),
}));
