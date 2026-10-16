/**
 * Agent tables (Component 11). The buyer agent is a bounded actor: it can
 * propose steps and narrate progress, but every economically meaningful action
 * is validated against a deterministic authority policy before it is executed.
 *
 * Each run records the goal and current phase. Each action records what the
 * agent proposed, the authority decision, and the outcome, so the whole
 * decision trail is reconstructable.
 */
import { relations } from "drizzle-orm";
import {
  boolean,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  varchar,
} from "drizzle-orm/pg-core";
import { agentActionStatusEnum, agentActionTypeEnum, agentRunStatusEnum } from "../enums";
import { tasks } from "./tasks";

export const agentRuns = pgTable(
  "agent_runs",
  {
    id: varchar("id", { length: 64 }).primaryKey(),
    taskId: varchar("task_id", { length: 64 })
      .notNull()
      .references(() => tasks.id, { onDelete: "cascade" }),
    status: agentRunStatusEnum("status").notNull().default("RUNNING"),
    goal: text("goal").notNull(),
    /** Current phase label, e.g. "PLANNING", "NEGOTIATION". */
    phase: varchar("phase", { length: 64 }).notNull().default("INIT"),
    /** Bounded step budget. The run stops when exhausted. */
    maxSteps: integer("max_steps").notNull().default(40),
    stepCount: integer("step_count").notNull().default(0),
    /** Version of the authority policy the run operates under. */
    authorityVersion: varchar("authority_version", { length: 32 }).notNull().default("v1"),
    lastError: text("last_error"),
    startedAt: timestamp("started_at", { withTimezone: true }).notNull().defaultNow(),
    finishedAt: timestamp("finished_at", { withTimezone: true }),
  },
  (t) => ({
    taskIdx: uniqueIndex("agent_runs_task_unique").on(t.taskId),
    statusIdx: index("agent_runs_status_idx").on(t.status),
  }),
);

export const agentActions = pgTable(
  "agent_actions",
  {
    id: varchar("id", { length: 64 }).primaryKey(),
    agentRunId: varchar("agent_run_id", { length: 64 })
      .notNull()
      .references(() => agentRuns.id, { onDelete: "cascade" }),
    taskId: varchar("task_id", { length: 64 })
      .notNull()
      .references(() => tasks.id, { onDelete: "cascade" }),
    /** Monotonic step index within the run. */
    sequence: integer("sequence").notNull(),
    actionType: agentActionTypeEnum("action_type").notNull(),
    status: agentActionStatusEnum("status").notNull().default("PROPOSED"),
    /** The structured proposal the agent produced. */
    proposal: jsonb("proposal"),
    /** Authority evaluation outcome, if the action required one. */
    authorityAllowed: boolean("authority_allowed"),
    authorityReason: varchar("authority_reason", { length: 128 }),
    /** Result of executing the action, when it was executed. */
    result: jsonb("result"),
    reasonCode: varchar("reason_code", { length: 128 }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    executedAt: timestamp("executed_at", { withTimezone: true }),
  },
  (t) => ({
    runSequenceIdx: uniqueIndex("agent_actions_run_sequence_unique").on(t.agentRunId, t.sequence),
    taskIdx: index("agent_actions_task_idx").on(t.taskId),
  }),
);

export const agentRunsRelations = relations(agentRuns, ({ one, many }) => ({
  task: one(tasks, { fields: [agentRuns.taskId], references: [tasks.id] }),
  actions: many(agentActions),
}));

export const agentActionsRelations = relations(agentActions, ({ one }) => ({
  run: one(agentRuns, { fields: [agentActions.agentRunId], references: [agentRuns.id] }),
}));
