/**
 * Task and planning tables (Components 1 and 2).
 *
 * A task is the central business entity. Everything economically meaningful
 * hangs off it: the work specification (what the buyer wants), the contract
 * (what is agreed), the payment, and the verification.
 *
 * Money is stored as integer minor units plus a currency. Never a float.
 */
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
import { clarificationStatusEnum, requirementSourceEnum, taskStatusEnum } from "../enums";
import { users } from "./identity";
import { intakeSessions } from "./intake";

export const tasks = pgTable(
  "tasks",
  {
    id: varchar("id", { length: 64 }).primaryKey(),
    userId: varchar("user_id", { length: 64 })
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    /** The buyer's raw request, kept verbatim for audit. */
    rawRequest: text("raw_request").notNull(),
    status: taskStatusEnum("status").notNull().default("DRAFT"),
    /** Buyer ceiling in integer minor units (M2: >= 0). */
    budgetMinor: bigint("budget_minor", { mode: "number" }).notNull().default(0),
    currency: varchar("currency", { length: 3 }).notNull().default("USD"),
    /** Buyer's desired deadline for the work, distinct from the task record. */
    desiredDeadline: timestamp("desired_deadline", { withTimezone: true }),
    /** Which planner produced the active work specification. */
    plannerSource: varchar("planner_source", { length: 32 }),
    /** Intake session that produced this task; one task per approved intake. */
    sourceIntakeSessionId: varchar("source_intake_session_id", { length: 64 }).references(
      () => intakeSessions.id,
      { onDelete: "set null" },
    ),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    cancelledAt: timestamp("cancelled_at", { withTimezone: true }),
  },
  (t) => ({
    userIdx: index("tasks_user_idx").on(t.userId),
    sourceIntakeUnique: uniqueIndex("tasks_source_intake_unique").on(t.sourceIntakeSessionId),
    statusIdx: index("tasks_status_idx").on(t.status),
    budgetCheck: check("tasks_budget_nonnegative", sql`${t.budgetMinor} >= 0`),
    currencyCheck: check("tasks_currency_usd", sql`${t.currency} = 'USD'`),
  }),
);

export const taskFiles = pgTable(
  "task_files",
  {
    id: varchar("id", { length: 64 }).primaryKey(),
    taskId: varchar("task_id", { length: 64 })
      .notNull()
      .references(() => tasks.id, { onDelete: "cascade" }),
    /** Original filename as supplied by the buyer. */
    filename: text("filename").notNull(),
    /** Object-storage key. Content is never stored in Postgres. */
    storageKey: text("storage_key").notNull(),
    contentType: varchar("content_type", { length: 128 }),
    sizeBytes: bigint("size_bytes", { mode: "number" }).notNull().default(0),
    /** SHA-256 of the bytes, used to bind a submission to exact inputs. */
    sha256: varchar("sha256", { length: 64 }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    taskIdx: index("task_files_task_idx").on(t.taskId),
  }),
);

export const workSpecifications = pgTable(
  "work_specifications",
  {
    id: varchar("id", { length: 64 }).primaryKey(),
    taskId: varchar("task_id", { length: 64 })
      .notNull()
      .references(() => tasks.id, { onDelete: "cascade" }),
    version: integer("version").notNull().default(1),
    /** Buyer-facing summary of what will be done. */
    summary: text("summary").notNull(),
    /** "AI" when the planner ran, "DETERMINISTIC_FALLBACK" otherwise. */
    planSource: varchar("plan_source", { length: 32 }).notNull(),
    /** Snapshot of planner metadata (model, prompt version, latency). */
    plannerMetadata: jsonb("planner_metadata"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    taskVersionIdx: uniqueIndex("work_specs_task_version_unique").on(t.taskId, t.version),
  }),
);

export const requirements = pgTable(
  "requirements",
  {
    id: varchar("id", { length: 64 }).primaryKey(),
    workSpecificationId: varchar("work_specification_id", { length: 64 })
      .notNull()
      .references(() => workSpecifications.id, { onDelete: "cascade" }),
    taskId: varchar("task_id", { length: 64 })
      .notNull()
      .references(() => tasks.id, { onDelete: "cascade" }),
    /** Stable human-readable key, e.g. "no_duplicate_emails". */
    key: varchar("key", { length: 128 }).notNull(),
    statement: text("statement").notNull(),
    source: requirementSourceEnum("source").notNull(),
    /** Requirements the planner could not ground in the buyer's words. */
    requiresClarification: boolean("requires_clarification").notNull().default(false),
    /** True when this requirement drives acceptance (deterministic where possible). */
    acceptanceRelevant: boolean("acceptance_relevant").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    taskIdx: index("requirements_task_idx").on(t.taskId),
    specKeyIdx: uniqueIndex("requirements_spec_key_unique").on(t.workSpecificationId, t.key),
  }),
);

export const clarifications = pgTable(
  "clarifications",
  {
    id: varchar("id", { length: 64 }).primaryKey(),
    taskId: varchar("task_id", { length: 64 })
      .notNull()
      .references(() => tasks.id, { onDelete: "cascade" }),
    workSpecificationId: varchar("work_specification_id", { length: 64 }).references(
      () => workSpecifications.id,
      { onDelete: "cascade" },
    ),
    question: text("question").notNull(),
    answer: text("answer"),
    /** Requirement key this question unblocks, when known. */
    requirementKey: varchar("requirement_key", { length: 128 }),
    status: clarificationStatusEnum("status").notNull().default("PENDING"),
    answeredBy: varchar("answered_by", { length: 64 }).references(() => users.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    answeredAt: timestamp("answered_at", { withTimezone: true }),
  },
  (t) => ({
    taskIdx: index("clarifications_task_idx").on(t.taskId),
    statusIdx: index("clarifications_status_idx").on(t.status),
  }),
);

export const tasksRelations = relations(tasks, ({ one, many }) => ({
  user: one(users, { fields: [tasks.userId], references: [users.id] }),
  files: many(taskFiles),
  workSpecifications: many(workSpecifications),
  requirements: many(requirements),
  clarifications: many(clarifications),
}));

export const taskFilesRelations = relations(taskFiles, ({ one }) => ({
  task: one(tasks, { fields: [taskFiles.taskId], references: [tasks.id] }),
}));

export const workSpecificationsRelations = relations(workSpecifications, ({ one, many }) => ({
  task: one(tasks, { fields: [workSpecifications.taskId], references: [tasks.id] }),
  requirements: many(requirements),
}));

export const requirementsRelations = relations(requirements, ({ one }) => ({
  workSpecification: one(workSpecifications, {
    fields: [requirements.workSpecificationId],
    references: [workSpecifications.id],
  }),
  task: one(tasks, { fields: [requirements.taskId], references: [tasks.id] }),
}));

export const clarificationsRelations = relations(clarifications, ({ one }) => ({
  task: one(tasks, { fields: [clarifications.taskId], references: [tasks.id] }),
}));
