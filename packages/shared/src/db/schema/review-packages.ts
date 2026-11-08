/**
 * Review packages are structured work summaries assembled by the provider when
 * a task is ready for client review. They are intentionally separate from the
 * task conversation and from payment; acceptance is still a human decision.
 */
import { sql } from "drizzle-orm";
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
import { reviewPackageStatusEnum } from "../enums";
import { workContracts } from "./contracts";
import { tasks } from "./tasks";
import { workExecutions, workSubmissions } from "./execution";
import { users } from "./identity";
import { providers } from "./providers";

export const reviewPackages = pgTable(
  "review_packages",
  {
    id: varchar("id", { length: 64 }).primaryKey(),
    taskId: varchar("task_id", { length: 64 })
      .notNull()
      .references(() => tasks.id, { onDelete: "cascade" }),
    executionId: varchar("execution_id", { length: 64 })
      .notNull()
      .references(() => workExecutions.id, { onDelete: "cascade" }),
    submissionId: varchar("submission_id", { length: 64 })
      .notNull()
      .references(() => workSubmissions.id, { onDelete: "cascade" }),
    submissionVersion: integer("submission_version").notNull(),
    submissionHash: varchar("submission_hash", { length: 64 }).notNull(),
    contractId: varchar("contract_id", { length: 64 })
      .notNull()
      .references(() => workContracts.id, { onDelete: "restrict" }),
    contractVersion: integer("contract_version").notNull(),
    contractHash: varchar("contract_hash", { length: 64 }).notNull(),
    verificationRunId: varchar("verification_run_id", { length: 64 }).notNull(),
    buyerUserId: varchar("buyer_user_id", { length: 64 })
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    providerId: varchar("provider_id", { length: 64 })
      .notNull()
      .references(() => providers.id, { onDelete: "restrict" }),
    status: reviewPackageStatusEnum("status").notNull().default("DRAFT"),
    version: integer("version").notNull().default(1),
    summary: text("summary").notNull(),
    notes: text("notes"),
    previewLinks: jsonb("preview_links").notNull().default([]),
    fileReferences: jsonb("file_references").notNull().default([]),
    knownIssues: jsonb("known_issues").notNull().default([]),
    reviewerDecision: varchar("reviewer_decision", { length: 32 }),
    decisionReason: text("decision_reason"),
    reviewedBy: varchar("reviewed_by", { length: 64 }).references(() => users.id, {
      onDelete: "restrict",
    }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
  },
  (t) => ({
    taskIdx: index("review_packages_task_idx").on(t.taskId),
    executionIdx: index("review_packages_execution_idx").on(t.executionId),
    submissionUnique: uniqueIndex("review_packages_submission_unique").on(t.submissionId),
    contractVersionCheck: check(
      "review_packages_contract_version_positive",
      sql`${t.contractVersion} > 0`,
    ),
    submissionVersionCheck: check(
      "review_packages_submission_version_positive",
      sql`${t.submissionVersion} > 0`,
    ),
    versionCheck: check("review_packages_version_positive", sql`${t.version} > 0`),
    bindingHashCheck: check(
      "review_packages_binding_hashes_valid",
      sql`length(${t.contractHash}) = 64 and length(${t.submissionHash}) = 64`,
    ),
    decisionCheck: check(
      "review_packages_decision_valid",
      sql`${t.reviewerDecision} is null or ${t.reviewerDecision} in ('APPROVED', 'REJECTED', 'CHANGES_REQUESTED', 'EXTERNAL_REVIEW_REQUESTED')`,
    ),
    decisionReasonCheck: check(
      "review_packages_decision_reason_required",
      sql`${t.reviewerDecision} is null or length(trim(${t.decisionReason})) > 0`,
    ),
  }),
);
