/**
 * Verification tables (Component 8). Verification is where WorkPay decides,
 * before any money moves, whether the deliverable satisfies the contract.
 *
 * Deterministic checks run first and are authoritative for their requirements.
 * Semantic (AI) checks may only add evidence or escalate to human review; they
 * never override a failed deterministic check and never authorize payment.
 *
 * An AcceptanceDecision is the frozen verdict. Payment capture reads the most
 * recent decision and refuses unless it is PASS and bound to the current
 * contract hash.
 */
import { relations } from "drizzle-orm";
import {
  boolean,
  index,
  integer,
  jsonb,
  numeric,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  varchar,
} from "drizzle-orm/pg-core";
import {
  evidenceTypeEnum,
  verificationMethodValueEnum,
  verificationOutcomeEnum,
  verificationRunStatusEnum,
} from "../enums";
import { workContracts } from "./contracts";
import { workSubmissions } from "./execution";
import { tasks } from "./tasks";

export const verificationRuns = pgTable(
  "verification_runs",
  {
    id: varchar("id", { length: 64 }).primaryKey(),
    taskId: varchar("task_id", { length: 64 })
      .notNull()
      .references(() => tasks.id, { onDelete: "cascade" }),
    submissionId: varchar("submission_id", { length: 64 })
      .notNull()
      .references(() => workSubmissions.id, { onDelete: "cascade" }),
    contractId: varchar("contract_id", { length: 64 })
      .notNull()
      .references(() => workContracts.id, { onDelete: "cascade" }),
    contractVersion: integer("contract_version").notNull(),
    contractHash: varchar("contract_hash", { length: 64 }).notNull(),
    status: verificationRunStatusEnum("status").notNull().default("RUNNING"),
    /** Aggregate outcome across all requirements. */
    outcome: verificationOutcomeEnum("outcome"),
    passedCount: integer("passed_count").notNull().default(0),
    failedCount: integer("failed_count").notNull().default(0),
    uncertainCount: integer("uncertain_count").notNull().default(0),
    summary: text("summary"),
    /** Planner/verifier metadata (model, prompt version, latency). */
    runMetadata: jsonb("run_metadata"),
    startedAt: timestamp("started_at", { withTimezone: true }).notNull().defaultNow(),
    completedAt: timestamp("completed_at", { withTimezone: true }),
  },
  (t) => ({
    taskIdx: index("verification_runs_task_idx").on(t.taskId),
    submissionIdx: index("verification_runs_submission_idx").on(t.submissionId),
  }),
);

export const verificationResults = pgTable(
  "verification_results",
  {
    id: varchar("id", { length: 64 }).primaryKey(),
    verificationRunId: varchar("verification_run_id", { length: 64 })
      .notNull()
      .references(() => verificationRuns.id, { onDelete: "cascade" }),
    requirementKey: varchar("requirement_key", { length: 128 }).notNull(),
    method: verificationMethodValueEnum("method").notNull(),
    outcome: verificationOutcomeEnum("outcome").notNull(),
    /** 0.0000..1.0000. Deterministic results are always 1 or 0. */
    confidence: numeric("confidence", { precision: 5, scale: 4 }),
    rationale: text("rationale").notNull(),
    /** Machine-readable detail for deterministic checks. */
    detail: jsonb("detail"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    runRequirementIdx: uniqueIndex("verification_results_run_req_unique").on(
      t.verificationRunId,
      t.requirementKey,
    ),
  }),
);

export const evidence = pgTable(
  "evidence",
  {
    id: varchar("id", { length: 64 }).primaryKey(),
    taskId: varchar("task_id", { length: 64 })
      .notNull()
      .references(() => tasks.id, { onDelete: "cascade" }),
    verificationRunId: varchar("verification_run_id", { length: 64 }).references(
      () => verificationRuns.id,
      { onDelete: "cascade" },
    ),
    verificationResultId: varchar("verification_result_id", { length: 64 }).references(
      () => verificationResults.id,
      { onDelete: "cascade" },
    ),
    type: evidenceTypeEnum("type").notNull(),
    /** Human-readable evidence statement. */
    description: text("description").notNull(),
    /** Structured evidence payload (row range, field, metric, excerpt). */
    payload: jsonb("payload"),
    /** Optional pointer to an artifact in object storage. */
    storageKey: text("storage_key"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    runIdx: index("evidence_run_idx").on(t.verificationRunId),
    taskIdx: index("evidence_task_idx").on(t.taskId),
  }),
);

export const acceptanceDecisions = pgTable(
  "acceptance_decisions",
  {
    id: varchar("id", { length: 64 }).primaryKey(),
    taskId: varchar("task_id", { length: 64 })
      .notNull()
      .references(() => tasks.id, { onDelete: "cascade" }),
    submissionId: varchar("submission_id", { length: 64 })
      .notNull()
      .references(() => workSubmissions.id, { onDelete: "cascade" }),
    verificationRunId: varchar("verification_run_id", { length: 64 })
      .notNull()
      .references(() => verificationRuns.id, { onDelete: "cascade" }),
    contractId: varchar("contract_id", { length: 64 })
      .notNull()
      .references(() => workContracts.id, { onDelete: "cascade" }),
    contractVersion: integer("contract_version").notNull(),
    contractHash: varchar("contract_hash", { length: 64 }).notNull(),
    outcome: verificationOutcomeEnum("outcome").notNull(),
    /** True when a failed deterministic requirement forced the outcome. */
    hasDeterministicFailure: boolean("has_deterministic_failure").notNull().default(false),
    /** Human-readable explanation shown to the buyer. */
    explanation: text("explanation").notNull(),
    /** Set when a reviewer overrides the automated outcome. */
    reviewedBy: varchar("reviewed_by", { length: 64 }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    taskIdx: index("acceptance_decisions_task_idx").on(t.taskId, t.createdAt),
    submissionIdx: index("acceptance_decisions_submission_idx").on(t.submissionId),
  }),
);

export const verificationRunsRelations = relations(verificationRuns, ({ one, many }) => ({
  task: one(tasks, { fields: [verificationRuns.taskId], references: [tasks.id] }),
  submission: one(workSubmissions, {
    fields: [verificationRuns.submissionId],
    references: [workSubmissions.id],
  }),
  results: many(verificationResults),
  evidence: many(evidence),
}));

export const verificationResultsRelations = relations(verificationResults, ({ one }) => ({
  run: one(verificationRuns, {
    fields: [verificationResults.verificationRunId],
    references: [verificationRuns.id],
  }),
}));

export const evidenceRelations = relations(evidence, ({ one }) => ({
  run: one(verificationRuns, {
    fields: [evidence.verificationRunId],
    references: [verificationRuns.id],
  }),
}));

export const acceptanceDecisionsRelations = relations(acceptanceDecisions, ({ one }) => ({
  task: one(tasks, { fields: [acceptanceDecisions.taskId], references: [tasks.id] }),
  submission: one(workSubmissions, {
    fields: [acceptanceDecisions.submissionId],
    references: [workSubmissions.id],
  }),
  run: one(verificationRuns, {
    fields: [acceptanceDecisions.verificationRunId],
    references: [verificationRuns.id],
  }),
}));
