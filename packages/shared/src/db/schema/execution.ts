/**
 * Execution and submission tables (Component 7). Once payment is authorized
 * and the provider accepts the assignment, work begins. Providers submit
 * deliverables with evidence; workSubmissions are versioned and bound to the
 * contract hash they were produced against.
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
import { artifactTypeEnum, executionStatusEnum, submissionStatusEnum } from "../enums";
import { workContracts } from "./contracts";
import { commercialAgreements } from "./negotiation";
import { providers } from "./providers";
import { tasks } from "./tasks";

export const workExecutions = pgTable(
  "work_executions",
  {
    id: varchar("id", { length: 64 }).primaryKey(),
    taskId: varchar("task_id", { length: 64 })
      .notNull()
      .references(() => tasks.id, { onDelete: "cascade" }),
    contractId: varchar("contract_id", { length: 64 })
      .notNull()
      .references(() => workContracts.id, { onDelete: "cascade" }),
    agreementId: varchar("agreement_id", { length: 64 })
      .notNull()
      .references(() => commercialAgreements.id, { onDelete: "restrict" }),
    providerId: varchar("provider_id", { length: 64 })
      .notNull()
      .references(() => providers.id, { onDelete: "cascade" }),
    status: executionStatusEnum("status").notNull().default("ASSIGNED"),
    /** Contract version and hash pinned at assignment time. */
    contractVersion: integer("contract_version").notNull(),
    contractHash: varchar("contract_hash", { length: 64 }).notNull(),
    startedAt: timestamp("started_at", { withTimezone: true }),
    submittedAt: timestamp("submitted_at", { withTimezone: true }),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    taskIdx: uniqueIndex("work_executions_task_unique").on(t.taskId),
    providerStatusIdx: index("work_executions_provider_status_idx").on(t.providerId, t.status),
  }),
);

/** Explicit provider acknowledgement of the assignment. */
export const providerAcceptances = pgTable(
  "provider_acceptances",
  {
    id: varchar("id", { length: 64 }).primaryKey(),
    executionId: varchar("execution_id", { length: 64 })
      .notNull()
      .references(() => workExecutions.id, { onDelete: "cascade" }),
    providerId: varchar("provider_id", { length: 64 })
      .notNull()
      .references(() => providers.id, { onDelete: "cascade" }),
    /** Hash of the terms the provider accepted. */
    acceptedContractHash: varchar("accepted_contract_hash", { length: 64 }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    executionIdx: uniqueIndex("provider_acceptances_execution_unique").on(t.executionId),
  }),
);

export const workSubmissions = pgTable(
  "work_submissions",
  {
    id: varchar("id", { length: 64 }).primaryKey(),
    executionId: varchar("execution_id", { length: 64 })
      .notNull()
      .references(() => workExecutions.id, { onDelete: "cascade" }),
    taskId: varchar("task_id", { length: 64 })
      .notNull()
      .references(() => tasks.id, { onDelete: "cascade" }),
    /** Monotonic per execution. A resubmission after a failure gets a new row. */
    version: integer("version").notNull().default(1),
    status: submissionStatusEnum("status").notNull().default("DRAFT"),
    /** Contract binding at submission time. */
    contractVersion: integer("contract_version").notNull(),
    contractHash: varchar("contract_hash", { length: 64 }).notNull(),
    /** sha256 over the artifact manifest, for content addressing. */
    submissionHash: varchar("submission_hash", { length: 64 }),
    notes: text("notes"),
    /** Structured summary of the deliverable (rows processed, etc.). */
    summary: jsonb("summary"),
    submittedAt: timestamp("submitted_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    executionVersionIdx: uniqueIndex("work_submissions_execution_version_unique").on(
      t.executionId,
      t.version,
    ),
    taskIdx: index("work_submissions_task_idx").on(t.taskId),
  }),
);

export const submissionArtifacts = pgTable(
  "submission_artifacts",
  {
    id: varchar("id", { length: 64 }).primaryKey(),
    submissionId: varchar("submission_id", { length: 64 })
      .notNull()
      .references(() => workSubmissions.id, { onDelete: "cascade" }),
    type: artifactTypeEnum("type").notNull(),
    filename: text("filename").notNull(),
    storageKey: text("storage_key").notNull(),
    contentType: varchar("content_type", { length: 128 }),
    sizeBytes: bigint("size_bytes", { mode: "number" }).notNull().default(0),
    sha256: varchar("sha256", { length: 64 }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    submissionIdx: index("submission_artifacts_submission_idx").on(t.submissionId),
    sizeCheck: check("submission_artifacts_size_nonnegative", sql`${t.sizeBytes} >= 0`),
  }),
);

export const executionsRelations = relations(workExecutions, ({ one, many }) => ({
  task: one(tasks, { fields: [workExecutions.taskId], references: [tasks.id] }),
  contract: one(workContracts, {
    fields: [workExecutions.contractId],
    references: [workContracts.id],
  }),
  provider: one(providers, { fields: [workExecutions.providerId], references: [providers.id] }),
  workSubmissions: many(workSubmissions),
}));

export const submissionsRelations = relations(workSubmissions, ({ one, many }) => ({
  execution: one(workExecutions, {
    fields: [workSubmissions.executionId],
    references: [workExecutions.id],
  }),
  artifacts: many(submissionArtifacts),
}));

export const submissionArtifactsRelations = relations(submissionArtifacts, ({ one }) => ({
  submission: one(workSubmissions, {
    fields: [submissionArtifacts.submissionId],
    references: [workSubmissions.id],
  }),
}));
