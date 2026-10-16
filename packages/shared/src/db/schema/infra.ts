/**
 * Infrastructure state (Components 12 and 14).
 *
 * The transactional outbox is the backbone of reliability: a domain
 * transaction writes business state and the event in the same commit, so
 * either both exist or neither does (invariant D1). A publisher later moves
 * outbox rows to consumers; consumers dedupe through `processed_events`.
 *
 * `events` is an append-only store for projections such as the activity
 * timeline. It is never mutated.
 */
import { relations, sql } from "drizzle-orm";
import {
  check,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  varchar,
} from "drizzle-orm/pg-core";
import { actorTypeEnum, aggregateTypeEnum, eventVisibilityEnum, jobStatusEnum } from "../enums";
import { tasks } from "./tasks";
import { users } from "./identity";

/**
 * Append-only domain event store. Rows are immutable once written. Used for
 * the activity timeline and as the authoritative record of what happened.
 */
export const events = pgTable(
  "events",
  {
    id: varchar("id", { length: 64 }).primaryKey(),
    type: varchar("type", { length: 128 }).notNull(),
    version: integer("version").notNull().default(1),
    aggregateType: aggregateTypeEnum("aggregate_type").notNull(),
    aggregateId: varchar("aggregate_id", { length: 64 }).notNull(),
    taskId: varchar("task_id", { length: 64 }).notNull(),
    actorType: actorTypeEnum("actor_type").notNull(),
    actorId: varchar("actor_id", { length: 64 }),
    correlationId: varchar("correlation_id", { length: 64 }).notNull(),
    causationId: varchar("causation_id", { length: 64 }),
    visibility: eventVisibilityEnum("visibility").notNull().default("USER"),
    payload: jsonb("payload").notNull(),
    occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull(),
    recordedAt: timestamp("recorded_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    taskIdx: index("events_task_idx").on(t.taskId, t.recordedAt),
    typeIdx: index("events_type_idx").on(t.type),
    aggregateIdx: index("events_aggregate_idx").on(t.aggregateType, t.aggregateId),
    correlationIdx: index("events_correlation_idx").on(t.correlationId),
  }),
);

/**
 * Dispatch queue entry for an event. One row per published event, created in
 * the same transaction as the business state and the `events` row.
 */
export const outboxEvents = pgTable(
  "outbox_events",
  {
    id: varchar("id", { length: 64 }).primaryKey(),
    eventId: varchar("event_id", { length: 64 })
      .notNull()
      .references(() => events.id, { onDelete: "cascade" }),
    eventType: varchar("event_type", { length: 128 }).notNull(),
    aggregateType: aggregateTypeEnum("aggregate_type").notNull(),
    aggregateId: varchar("aggregate_id", { length: 64 }).notNull(),
    taskId: varchar("task_id", { length: 64 }).notNull(),
    status: jobStatusEnum("status").notNull().default("PENDING"),
    attempts: integer("attempts").notNull().default(0),
    lastError: text("last_error"),
    /** Earliest time the publisher may attempt dispatch (backoff). */
    availableAt: timestamp("available_at", { withTimezone: true }).notNull().defaultNow(),
    publishedAt: timestamp("published_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    eventIdx: uniqueIndex("outbox_events_event_unique").on(t.eventId),
    pendingIdx: index("outbox_events_pending_idx").on(t.status, t.availableAt),
    attemptsCheck: check("outbox_events_attempts_nonnegative", sql`${t.attempts} >= 0`),
  }),
);

/** Consumer dedupe table. A consumer processes each (consumer,event) once. */
export const processedEvents = pgTable(
  "processed_events",
  {
    consumerName: varchar("consumer_name", { length: 128 }).notNull(),
    eventId: varchar("event_id", { length: 64 }).notNull(),
    processedAt: timestamp("processed_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.consumerName, t.eventId] }),
  }),
);

/**
 * Domain job intents. pg-boss is the transport; this table is the durable,
 * queryable record of what work was requested and its outcome, so operational
 * questions do not require reading the pg-boss schema.
 */
export const jobs = pgTable(
  "jobs",
  {
    id: varchar("id", { length: 64 }).primaryKey(),
    queue: varchar("queue", { length: 64 }).notNull(),
    taskId: varchar("task_id", { length: 64 }),
    status: jobStatusEnum("status").notNull().default("PENDING"),
    payload: jsonb("payload"),
    attempts: integer("attempts").notNull().default(0),
    lastError: text("last_error"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    startedAt: timestamp("started_at", { withTimezone: true }),
    completedAt: timestamp("completed_at", { withTimezone: true }),
  },
  (t) => ({
    queueStatusIdx: index("jobs_queue_status_idx").on(t.queue, t.status),
    taskIdx: index("jobs_task_idx").on(t.taskId),
  }),
);

/**
 * Idempotency records for money-moving and other mutating endpoints. The
 * request hash is compared so a key reused with a different body is rejected
 * rather than silently replaying a different operation.
 */
export const idempotencyRecords = pgTable(
  "idempotency_records",
  {
    id: varchar("id", { length: 64 }).primaryKey(),
    scope: varchar("scope", { length: 128 }).notNull(),
    idempotencyKey: varchar("idempotency_key", { length: 255 }).notNull(),
    requestHash: varchar("request_hash", { length: 64 }).notNull(),
    resourceType: varchar("resource_type", { length: 64 }),
    resourceId: varchar("resource_id", { length: 64 }),
    responseStatus: integer("response_status"),
    responseBody: jsonb("response_body"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    expiresAt: timestamp("expires_at", { withTimezone: true }),
  },
  (t) => ({
    scopeKeyIdx: uniqueIndex("idempotency_records_scope_key_unique").on(t.scope, t.idempotencyKey),
  }),
);

/** Append-only audit trail for economically significant actions. */
export const auditRecords = pgTable(
  "audit_records",
  {
    id: varchar("id", { length: 64 }).primaryKey(),
    actorType: actorTypeEnum("actor_type").notNull(),
    actorId: varchar("actor_id", { length: 64 }),
    action: varchar("action", { length: 128 }).notNull(),
    targetType: varchar("target_type", { length: 64 }).notNull(),
    targetId: varchar("target_id", { length: 64 }).notNull(),
    taskId: varchar("task_id", { length: 64 }),
    correlationId: varchar("correlation_id", { length: 64 }),
    detail: jsonb("detail"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    targetIdx: index("audit_records_target_idx").on(t.targetType, t.targetId),
    taskIdx: index("audit_records_task_idx").on(t.taskId, t.createdAt),
  }),
);

/**
 * In-app notifications, derived from events. The bell reads this table; the
 * activity timeline reads `events`. Notifications are a convenience projection,
 * never a source of truth.
 */
export const notifications = pgTable(
  "notifications",
  {
    id: varchar("id", { length: 64 }).primaryKey(),
    userId: varchar("user_id", { length: 64 })
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    taskId: varchar("task_id", { length: 64 }).references(() => tasks.id, {
      onDelete: "cascade",
    }),
    /** Event id that produced this notification, for dedupe and linking. */
    eventId: varchar("event_id", { length: 64 }),
    type: varchar("type", { length: 64 }).notNull(),
    title: text("title").notNull(),
    body: text("body"),
    /** Relative link within the app, e.g. "/tasks/task_...". */
    href: text("href"),
    readAt: timestamp("read_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    userIdx: index("notifications_user_idx").on(t.userId, t.createdAt),
    unreadIdx: index("notifications_unread_idx").on(t.userId, t.readAt),
    eventIdx: uniqueIndex("notifications_event_unique").on(t.eventId),
  }),
);

export const eventsRelations = relations(events, ({ one }) => ({
  task: one(tasks, { fields: [events.taskId], references: [tasks.id] }),
}));

export const notificationsRelations = relations(notifications, ({ one }) => ({
  user: one(users, { fields: [notifications.userId], references: [users.id] }),
  task: one(tasks, { fields: [notifications.taskId], references: [tasks.id] }),
}));
