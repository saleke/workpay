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
import { verificationOutcomeEnum } from "../enums";
import { taskConversations } from "./conversations";
import { workContracts } from "./contracts";
import { workSubmissions } from "./execution";
import { tasks } from "./tasks";
import { users } from "./identity";
import { workReviews } from "./work-reviews";
import { providers } from "./providers";

export const independentReviewEngagements = pgTable(
  "independent_review_engagements",
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
    providerUserId: varchar("provider_user_id", { length: 64 })
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    reviewerUserId: varchar("reviewer_user_id", { length: 64 })
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    reviewerProviderId: varchar("reviewer_provider_id", { length: 64 }).references(
      () => providers.id,
      { onDelete: "restrict" },
    ),
    workReviewId: varchar("work_review_id", { length: 64 }).references(() => workReviews.id, {
      onDelete: "restrict",
    }),
    proposerUserId: varchar("proposer_user_id", { length: 64 })
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    requirementKeys: jsonb("requirement_keys").$type<string[]>().notNull(),
    domains: jsonb("domains").$type<string[]>().notNull(),
    brief: text("brief").notNull(),
    authority: varchar("authority", { length: 32 }).notNull(),
    feeMinor: bigint("fee_minor", { mode: "number" }),
    feeCurrency: varchar("fee_currency", { length: 3 }).notNull().default("USD"),
    feePayer: varchar("fee_payer", { length: 16 }).notNull(),
    feeMode: varchar("fee_mode", { length: 16 }).notNull().default("DIRECT"),
    feeStatus: varchar("fee_status", { length: 32 }).notNull().default("NOT_REQUIRED"),
    feePaidAt: timestamp("fee_paid_at", { withTimezone: true }),
    status: varchar("status", { length: 32 }).notNull().default("PROPOSED"),
    buyerAcceptedAt: timestamp("buyer_accepted_at", { withTimezone: true }),
    providerAcceptedAt: timestamp("provider_accepted_at", { withTimezone: true }),
    reviewerAcceptedAt: timestamp("reviewer_accepted_at", { withTimezone: true }),
    reviewerConflictConfirmed: boolean("reviewer_conflict_confirmed").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    taskIdx: index("independent_review_engagements_task_idx").on(t.taskId, t.createdAt),
    reviewerIdx: index("independent_review_engagements_reviewer_idx").on(
      t.reviewerUserId,
      t.status,
    ),
    currentContractIdx: index("independent_review_engagements_contract_idx").on(
      t.contractId,
      t.contractVersion,
    ),
    workReviewIdx: uniqueIndex("independent_review_engagements_work_review_unique").on(
      t.workReviewId,
    ),
    activeTaskUnique: uniqueIndex("independent_review_engagements_active_task_unique")
      .on(t.taskId)
      .where(
        sql`${t.status} in ('PROPOSED', 'AWAITING_REVIEWER', 'AWAITING_FEE_AUTHORIZATION', 'ENGAGED')`,
      ),
    versionCheck: check(
      "independent_review_engagements_version_positive",
      sql`${t.contractVersion} > 0`,
    ),
    distinctParties: check(
      "independent_review_engagements_distinct_parties",
      sql`${t.buyerUserId} <> ${t.providerUserId} and ${t.reviewerUserId} <> ${t.buyerUserId} and ${t.reviewerUserId} <> ${t.providerUserId}`,
    ),
    authorityCheck: check(
      "independent_review_engagements_authority_check",
      sql`${t.authority} = 'ADVISORY'`,
    ),
    payerCheck: check(
      "independent_review_engagements_payer_check",
      sql`${t.feePayer} in ('BUYER', 'PROVIDER', 'SHARED', 'DIRECT')`,
    ),
    statusCheck: check(
      "independent_review_engagements_status_check",
      sql`${t.status} in ('PROPOSED', 'AWAITING_REVIEWER', 'AWAITING_FEE_AUTHORIZATION', 'ENGAGED', 'INCONCLUSIVE', 'CLOSED', 'DECLINED', 'CANCELLED')`,
    ),
    feeCheck: check(
      "independent_review_engagements_fee_nonnegative",
      sql`${t.feeMinor} is null or ${t.feeMinor} >= 0`,
    ),
    briefCheck: check(
      "independent_review_engagements_brief_nonempty",
      sql`length(trim(${t.brief})) >= 20`,
    ),
    feeModeCheck: check(
      "independent_review_engagements_fee_mode_check",
      sql`${t.feeMode} in ('PAYPAL', 'DIRECT')`,
    ),
    feeStatusCheck: check(
      "independent_review_engagements_fee_status_check",
      sql`${t.feeStatus} in ('NOT_REQUIRED', 'PENDING', 'PAID', 'FAILED', 'UNKNOWN')`,
    ),
  }),
);

export const independentReviewReports = pgTable(
  "independent_review_reports",
  {
    id: varchar("id", { length: 64 }).primaryKey(),
    engagementId: varchar("engagement_id", { length: 64 })
      .notNull()
      .references(() => independentReviewEngagements.id, { onDelete: "restrict" }),
    taskId: varchar("task_id", { length: 64 })
      .notNull()
      .references(() => tasks.id, { onDelete: "cascade" }),
    submissionId: varchar("submission_id", { length: 64 })
      .notNull()
      .references(() => workSubmissions.id, { onDelete: "restrict" }),
    contractVersion: integer("contract_version").notNull(),
    contractHash: varchar("contract_hash", { length: 64 }).notNull(),
    reviewerUserId: varchar("reviewer_user_id", { length: 64 })
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    outcome: verificationOutcomeEnum("outcome").notNull(),
    rationale: text("rationale").notNull(),
    findings: jsonb("findings")
      .$type<
        Array<{
          requirementKey: string;
          outcome: "PASS" | "FAIL" | "UNCERTAIN";
          rationale: string;
          evidence: Array<{ description: string; url?: string }>;
        }>
      >()
      .notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    taskIdx: index("independent_review_reports_task_idx").on(t.taskId, t.createdAt),
    submissionUnique: uniqueIndex("independent_review_reports_submission_unique").on(
      t.engagementId,
      t.submissionId,
    ),
    versionCheck: check(
      "independent_review_reports_version_positive",
      sql`${t.contractVersion} > 0`,
    ),
  }),
);

export const independentReviewEngagementsRelations = relations(
  independentReviewEngagements,
  ({ one, many }) => ({
    task: one(tasks, {
      fields: [independentReviewEngagements.taskId],
      references: [tasks.id],
    }),
    conversation: one(taskConversations, {
      fields: [independentReviewEngagements.conversationId],
      references: [taskConversations.id],
    }),
    contract: one(workContracts, {
      fields: [independentReviewEngagements.contractId],
      references: [workContracts.id],
    }),
    reports: many(independentReviewReports),
  }),
);

export const independentReviewReportsRelations = relations(independentReviewReports, ({ one }) => ({
  engagement: one(independentReviewEngagements, {
    fields: [independentReviewReports.engagementId],
    references: [independentReviewEngagements.id],
  }),
  submission: one(workSubmissions, {
    fields: [independentReviewReports.submissionId],
    references: [workSubmissions.id],
  }),
}));
