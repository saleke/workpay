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
import {
  workReviewAssessmentStatusEnum,
  workReviewItemTypeEnum,
  workReviewKindEnum,
  workReviewStatusEnum,
} from "../enums";
import { workContracts } from "./contracts";
import { workExecutions } from "./execution";
import { users } from "./identity";
import { tasks } from "./tasks";

/** Human-led review cycles. Tenfo preserves context and constraints but never decides quality. */
export const workReviews = pgTable(
  "work_reviews",
  {
    id: varchar("id", { length: 64 }).primaryKey(),
    taskId: varchar("task_id", { length: 64 })
      .notNull()
      .references(() => tasks.id, { onDelete: "cascade" }),
    executionId: varchar("execution_id", { length: 64 })
      .notNull()
      .references(() => workExecutions.id, { onDelete: "cascade" }),
    contractId: varchar("contract_id", { length: 64 })
      .notNull()
      .references(() => workContracts.id, { onDelete: "restrict" }),
    contractVersion: integer("contract_version").notNull(),
    contractHash: varchar("contract_hash", { length: 64 }).notNull(),
    sequence: integer("sequence").notNull(),
    kind: workReviewKindEnum("kind").notNull(),
    status: workReviewStatusEnum("status").notNull().default("REQUESTED"),
    title: varchar("title", { length: 160 }).notNull(),
    openingNote: text("opening_note").notNull(),
    requirementKeys: jsonb("requirement_keys").notNull().default([]),
    responseWindowDays: integer("response_window_days").notNull().default(5),
    responseDueAt: timestamp("response_due_at", { withTimezone: true }),
    openedByUserId: varchar("opened_by_user_id", { length: 64 })
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    providerResponseSummary: text("provider_response_summary"),
    providerRespondedAt: timestamp("provider_responded_at", { withTimezone: true }),
    packageHash: varchar("package_hash", { length: 64 }),
    reviewerSummary: text("reviewer_summary"),
    reviewerRespondedAt: timestamp("reviewer_responded_at", { withTimezone: true }),
    decisionByUserId: varchar("decision_by_user_id", { length: 64 }).references(() => users.id, {
      onDelete: "restrict",
    }),
    decisionRole: varchar("decision_role", { length: 32 }),
    decisionReason: text("decision_reason"),
    dissatisfactionRemedy: varchar("dissatisfaction_remedy", { length: 32 }),
    providerResponse: varchar("provider_response", { length: 32 }),
    providerResponseNote: text("provider_response_note"),
    providerResponseAt: timestamp("provider_response_at", { withTimezone: true }),
    riskAcknowledged: boolean("risk_acknowledged").notNull().default(false),
    openedAt: timestamp("opened_at", { withTimezone: true }).notNull().defaultNow(),
    decidedAt: timestamp("decided_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    taskIdx: index("work_reviews_task_idx").on(t.taskId, t.createdAt),
    executionSequenceIdx: uniqueIndex("work_reviews_execution_sequence_unique").on(
      t.executionId,
      t.sequence,
    ),
    executionActiveIdx: uniqueIndex("work_reviews_execution_active_unique")
      .on(t.executionId)
      .where(
        sql`${t.status} not in ('CHECKPOINT_ACCEPTED', 'FINAL_ACCEPTED', 'CHANGES_REQUESTED', 'CANCELLED')`,
      ),
    sequenceCheck: check("work_reviews_sequence_positive", sql`${t.sequence} > 0`),
    titleCheck: check("work_reviews_title_nonempty", sql`length(trim(${t.title})) > 0`),
    openingNoteCheck: check(
      "work_reviews_opening_note_nonempty",
      sql`length(trim(${t.openingNote})) > 0`,
    ),
    decisionRoleCheck: check(
      "work_reviews_decision_role_valid",
      sql`${t.decisionRole} is null or ${t.decisionRole} in ('CLIENT', 'AGREED_REVIEWER')`,
    ),
    responseWindowCheck: check(
      "work_reviews_response_window_valid",
      sql`${t.responseWindowDays} between 1 and 30`,
    ),
    dissatisfactionRemedyCheck: check(
      "work_reviews_dissatisfaction_remedy_valid",
      sql`${t.dissatisfactionRemedy} is null or ${t.dissatisfactionRemedy} in ('REVISION', 'PAID_REVIEW', 'CANCEL', 'OTHER')`,
    ),
    providerResponseCheck: check(
      "work_reviews_provider_response_valid",
      sql`${t.providerResponse} is null or ${t.providerResponse} in ('ACCEPT_REVISION', 'DISAGREE', 'REQUEST_PAID_REVIEW')`,
    ),
  }),
);

export const workReviewItems = pgTable(
  "work_review_items",
  {
    id: varchar("id", { length: 64 }).primaryKey(),
    reviewId: varchar("review_id", { length: 64 })
      .notNull()
      .references(() => workReviews.id, { onDelete: "cascade" }),
    taskId: varchar("task_id", { length: 64 })
      .notNull()
      .references(() => tasks.id, { onDelete: "cascade" }),
    authorUserId: varchar("author_user_id", { length: 64 })
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    type: workReviewItemTypeEnum("type").notNull(),
    label: varchar("label", { length: 255 }),
    note: text("note"),
    url: text("url"),
    storageKey: text("storage_key"),
    filename: varchar("filename", { length: 255 }),
    contentType: varchar("content_type", { length: 255 }),
    sizeBytes: bigint("size_bytes", { mode: "number" }),
    sha256: varchar("sha256", { length: 64 }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    reviewIdx: index("work_review_items_review_idx").on(t.reviewId, t.createdAt),
    storageIdx: uniqueIndex("work_review_items_storage_unique").on(t.storageKey),
    shapeCheck: check(
      "work_review_items_shape_valid",
      sql`(${t.type} = 'NOTE' and ${t.note} is not null and length(trim(${t.note})) > 0 and ${t.url} is null and ${t.storageKey} is null) or (${t.type} = 'LINK' and ${t.url} is not null and ${t.label} is not null and length(trim(${t.label})) > 0 and ${t.storageKey} is null) or (${t.type} = 'FILE' and ${t.storageKey} is not null and ${t.filename} is not null and ${t.sizeBytes} > 0 and ${t.sha256} is not null)`,
    ),
  }),
);

export const workReviewAssessments = pgTable(
  "work_review_assessments",
  {
    id: varchar("id", { length: 64 }).primaryKey(),
    reviewId: varchar("review_id", { length: 64 })
      .notNull()
      .references(() => workReviews.id, { onDelete: "cascade" }),
    requirementKey: varchar("requirement_key", { length: 128 }).notNull(),
    status: workReviewAssessmentStatusEnum("status").notNull(),
    rationale: text("rationale"),
    assessedByUserId: varchar("assessed_by_user_id", { length: 64 })
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    reviewRequirementIdx: uniqueIndex("work_review_assessments_reviewer_requirement_unique").on(
      t.reviewId,
      t.requirementKey,
      t.assessedByUserId,
    ),
    reviewRequirementLookupIdx: index("work_review_assessments_review_requirement_idx").on(
      t.reviewId,
      t.requirementKey,
    ),
  }),
);

export const workReviewsRelations = relations(workReviews, ({ one, many }) => ({
  task: one(tasks, { fields: [workReviews.taskId], references: [tasks.id] }),
  execution: one(workExecutions, {
    fields: [workReviews.executionId],
    references: [workExecutions.id],
  }),
  contract: one(workContracts, {
    fields: [workReviews.contractId],
    references: [workContracts.id],
  }),
  items: many(workReviewItems),
  assessments: many(workReviewAssessments),
}));

export const workReviewItemsRelations = relations(workReviewItems, ({ one }) => ({
  review: one(workReviews, { fields: [workReviewItems.reviewId], references: [workReviews.id] }),
}));

export const workReviewAssessmentsRelations = relations(workReviewAssessments, ({ one }) => ({
  review: one(workReviews, {
    fields: [workReviewAssessments.reviewId],
    references: [workReviews.id],
  }),
}));
