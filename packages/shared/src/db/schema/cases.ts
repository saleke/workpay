/**
 * Case tables (Component 10). A case is opened when the automated path cannot
 * decide alone: verification is uncertain, a party disputes the outcome, or a
 * payment exception occurs.
 *
 * WorkPay operations must not adjudicate task quality or party disputes.
 * Blocking cases keep payment fail-closed; operational resolutions still go
 * through the deterministic policy engine before money moves.
 */
import { relations } from "drizzle-orm";
import {
  boolean,
  index,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  varchar,
} from "drizzle-orm/pg-core";
import {
  caseAuthorEnum,
  caseCategoryEnum,
  caseOpenerEnum,
  caseSeverityEnum,
  caseStatusEnum,
  caseTypeEnum,
  resolutionOutcomeEnum,
} from "../enums";
import { payments } from "./payments";
import { tasks } from "./tasks";

export const cases = pgTable(
  "cases",
  {
    id: varchar("id", { length: 64 }).primaryKey(),
    taskId: varchar("task_id", { length: 64 })
      .notNull()
      .references(() => tasks.id, { onDelete: "cascade" }),
    type: caseTypeEnum("type").notNull(),
    category: caseCategoryEnum("category").notNull(),
    status: caseStatusEnum("status").notNull().default("OPEN"),
    severity: caseSeverityEnum("severity").notNull().default("MEDIUM"),
    openedBy: caseOpenerEnum("opened_by").notNull(),
    title: text("title").notNull(),
    description: text("description").notNull(),
    /**
     * When true, the payment policy engine must refuse capture while the case
     * is open. This is how a dispute halts the money.
     */
    blocksPaymentCapture: boolean("blocks_payment_capture").notNull().default(false),
    /** The payment this case can block, when known. */
    paymentId: varchar("payment_id", { length: 64 }).references(() => payments.id, {
      onDelete: "set null",
    }),
    /** Link back to the object under dispute (submission, verification, etc). */
    subjectType: varchar("subject_type", { length: 32 }),
    subjectId: varchar("subject_id", { length: 64 }),
    openedAt: timestamp("opened_at", { withTimezone: true }).notNull().defaultNow(),
    resolvedAt: timestamp("resolved_at", { withTimezone: true }),
    closedAt: timestamp("closed_at", { withTimezone: true }),
  },
  (t) => ({
    taskIdx: index("cases_task_idx").on(t.taskId),
    statusIdx: index("cases_status_idx").on(t.status),
    blockingIdx: index("cases_blocking_idx").on(t.taskId, t.blocksPaymentCapture),
  }),
);

export const caseMessages = pgTable(
  "case_messages",
  {
    id: varchar("id", { length: 64 }).primaryKey(),
    caseId: varchar("case_id", { length: 64 })
      .notNull()
      .references(() => cases.id, { onDelete: "cascade" }),
    author: caseAuthorEnum("author").notNull(),
    authorId: varchar("author_id", { length: 64 }),
    body: text("body").notNull(),
    /** Optional attached evidence reference. */
    evidenceId: varchar("evidence_id", { length: 64 }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    caseIdx: index("case_messages_case_idx").on(t.caseId, t.createdAt),
  }),
);

/** Append-only case lifecycle log. */
export const caseEvents = pgTable(
  "case_events",
  {
    id: varchar("id", { length: 64 }).primaryKey(),
    caseId: varchar("case_id", { length: 64 })
      .notNull()
      .references(() => cases.id, { onDelete: "cascade" }),
    type: varchar("type", { length: 64 }).notNull(),
    actorType: varchar("actor_type", { length: 32 }).notNull(),
    actorId: varchar("actor_id", { length: 64 }),
    detail: jsonb("detail"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    caseIdx: index("case_events_case_idx").on(t.caseId, t.createdAt),
  }),
);

export const resolutions = pgTable(
  "resolutions",
  {
    id: varchar("id", { length: 64 }).primaryKey(),
    caseId: varchar("case_id", { length: 64 })
      .notNull()
      .references(() => cases.id, { onDelete: "cascade" }),
    outcome: resolutionOutcomeEnum("outcome").notNull(),
    /** Reasoning recorded for audit. */
    rationale: text("rationale").notNull(),
    resolvedBy: varchar("resolved_by", { length: 64 }),
    /** True when the resolution requires fresh verification before capture. */
    requiresReverification: boolean("requires_reverification").notNull().default(false),
    detail: jsonb("detail"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    caseIdx: uniqueIndex("resolutions_case_unique").on(t.caseId),
  }),
);

/**
 * Records the effect a resolution has on other aggregates. Making the impact a
 * row (rather than a side effect) keeps the "what changed because of this"
 * question answerable.
 */
export const caseImpacts = pgTable(
  "case_impacts",
  {
    id: varchar("id", { length: 64 }).primaryKey(),
    caseId: varchar("case_id", { length: 64 })
      .notNull()
      .references(() => cases.id, { onDelete: "cascade" }),
    targetType: varchar("target_type", { length: 32 }).notNull(),
    targetId: varchar("target_id", { length: 64 }).notNull(),
    impact: varchar("impact", { length: 64 }).notNull(),
    detail: jsonb("detail"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    caseIdx: index("case_impacts_case_idx").on(t.caseId),
  }),
);

export const casesRelations = relations(cases, ({ one, many }) => ({
  task: one(tasks, { fields: [cases.taskId], references: [tasks.id] }),
  payment: one(payments, { fields: [cases.paymentId], references: [payments.id] }),
  messages: many(caseMessages),
  events: many(caseEvents),
}));

export const caseMessagesRelations = relations(caseMessages, ({ one }) => ({
  case: one(cases, { fields: [caseMessages.caseId], references: [cases.id] }),
}));

export const resolutionsRelations = relations(resolutions, ({ one }) => ({
  case: one(cases, { fields: [resolutions.caseId], references: [cases.id] }),
}));
