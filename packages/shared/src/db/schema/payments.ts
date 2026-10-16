/**
 * Payment tables (Components 6 and 9). The payment path is the most safety
 * critical code in WorkPay, so it is deliberately narrow.
 *
 * Rules enforced here and in the policy engine:
 *  - Integer minor units only (never float).
 *  - No LLM output ever reaches a PayPal call.
 *  - A capture is proposed by the deterministic policy engine and only
 *    executed after an ALLOW decision, and only after verification PASS.
 *  - `payment_operations` is append-only. At most one SUCCEEDED CAPTURE may
 *    exist per payment (partial unique index), so a retry cannot double-spend.
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
import {
  paymentDecisionActionEnum,
  paymentDecisionResultEnum,
  paymentOperationActionEnum,
  paymentOperationStatusEnum,
  paymentStatusEnum,
  policyCheckResultEnum,
} from "../enums";
import { commercialAgreements } from "./negotiation";
import { tasks } from "./tasks";

export const payments = pgTable(
  "payments",
  {
    id: varchar("id", { length: 64 }).primaryKey(),
    taskId: varchar("task_id", { length: 64 })
      .notNull()
      .references(() => tasks.id, { onDelete: "cascade" }),
    agreementId: varchar("agreement_id", { length: 64 })
      .notNull()
      .references(() => commercialAgreements.id, { onDelete: "restrict" }),
    /** Amount is copied from the agreement, never from the request body. */
    amountMinor: bigint("amount_minor", { mode: "number" }).notNull(),
    currency: varchar("currency", { length: 3 }).notNull().default("USD"),
    status: paymentStatusEnum("status").notNull().default("PENDING"),
    /** PayPal order id used to authorize. */
    providerOrderId: varchar("provider_order_id", { length: 128 }),
    /** PayPal authorization id. */
    providerAuthorizationId: varchar("provider_authorization_id", { length: 128 }),
    /** PayPal capture id, set once and never changed. */
    providerCaptureId: varchar("provider_capture_id", { length: 128 }),
    capturedAmountMinor: bigint("captured_amount_minor", { mode: "number" }),
    authorizedAt: timestamp("authorized_at", { withTimezone: true }),
    capturedAt: timestamp("captured_at", { withTimezone: true }),
    voidedAt: timestamp("voided_at", { withTimezone: true }),
    refundedAt: timestamp("refunded_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    taskIdx: uniqueIndex("payments_task_unique").on(t.taskId),
    statusIdx: index("payments_status_idx").on(t.status),
    amountCheck: check("payments_amount_nonnegative", sql`${t.amountMinor} >= 0`),
    capturedCheck: check(
      "payments_captured_nonnegative",
      sql`${t.capturedAmountMinor} is null or ${t.capturedAmountMinor} >= 0`,
    ),
  }),
);

/**
 * A policy decision: the auditable output of the deterministic policy engine.
 * `inputsHash` freezes the exact state the engine evaluated, so a decision can
 * be replayed and audited.
 */
export const paymentDecisions = pgTable(
  "payment_decisions",
  {
    id: varchar("id", { length: 64 }).primaryKey(),
    paymentId: varchar("payment_id", { length: 64 })
      .notNull()
      .references(() => payments.id, { onDelete: "cascade" }),
    taskId: varchar("task_id", { length: 64 })
      .notNull()
      .references(() => tasks.id, { onDelete: "cascade" }),
    action: paymentDecisionActionEnum("action").notNull(),
    result: paymentDecisionResultEnum("result").notNull(),
    reasonCode: varchar("reason_code", { length: 128 }).notNull(),
    /** Version of the policy rule set, so old decisions stay interpretable. */
    policyVersion: varchar("policy_version", { length: 32 }).notNull(),
    inputsHash: varchar("inputs_hash", { length: 64 }).notNull(),
    detail: jsonb("detail"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    paymentIdx: index("payment_decisions_payment_idx").on(t.paymentId),
    paymentActionIdx: index("payment_decisions_payment_action_idx").on(t.paymentId, t.action),
  }),
);

export const paymentPolicyChecks = pgTable(
  "payment_policy_checks",
  {
    id: varchar("id", { length: 64 }).primaryKey(),
    decisionId: varchar("decision_id", { length: 64 })
      .notNull()
      .references(() => paymentDecisions.id, { onDelete: "cascade" }),
    /** Stable check id, e.g. "capture.verification_passed". */
    checkId: varchar("check_id", { length: 128 }).notNull(),
    result: policyCheckResultEnum("result").notNull(),
    message: text("message").notNull(),
    detail: jsonb("detail"),
    position: integer("position").notNull().default(0),
  },
  (t) => ({
    decisionIdx: index("payment_policy_checks_decision_idx").on(t.decisionId),
  }),
);

/**
 * A capture command: the only object that may trigger a PayPal capture.
 * It exists only when an ALLOW capture decision was produced, and it carries
 * the idempotency key used for the PayPal request.
 */
export const paymentCommands = pgTable(
  "payment_commands",
  {
    id: varchar("id", { length: 64 }).primaryKey(),
    paymentId: varchar("payment_id", { length: 64 })
      .notNull()
      .references(() => payments.id, { onDelete: "cascade" }),
    taskId: varchar("task_id", { length: 64 })
      .notNull()
      .references(() => tasks.id, { onDelete: "cascade" }),
    /** The ALLOW decision that authorized this command. */
    decisionId: varchar("decision_id", { length: 64 })
      .notNull()
      .references(() => paymentDecisions.id, { onDelete: "restrict" }),
    amountMinor: bigint("amount_minor", { mode: "number" }).notNull(),
    currency: varchar("currency", { length: 3 }).notNull().default("USD"),
    /** PayPal-Idempotency-Key / Request-Id for the capture call. */
    idempotencyKey: varchar("idempotency_key", { length: 128 }).notNull(),
    consumed: boolean("consumed").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    consumedAt: timestamp("consumed_at", { withTimezone: true }),
  },
  (t) => ({
    paymentIdx: uniqueIndex("payment_commands_payment_unique").on(t.paymentId),
    idempotencyIdx: uniqueIndex("payment_commands_idempotency_unique").on(t.idempotencyKey),
    amountCheck: check("payment_commands_amount_nonnegative", sql`${t.amountMinor} >= 0`),
  }),
);

/**
 * Append-only record of every external money operation. Rows are never updated
 * in place once SUCCEEDED; state transitions happen by appending a new row.
 *
 * The partial unique index guarantees at most one SUCCEEDED capture per
 * payment, the last line of defense against double capture.
 */
export const paymentOperations = pgTable(
  "payment_operations",
  {
    id: varchar("id", { length: 64 }).primaryKey(),
    paymentId: varchar("payment_id", { length: 64 })
      .notNull()
      .references(() => payments.id, { onDelete: "cascade" }),
    taskId: varchar("task_id", { length: 64 })
      .notNull()
      .references(() => tasks.id, { onDelete: "cascade" }),
    action: paymentOperationActionEnum("action").notNull(),
    status: paymentOperationStatusEnum("status").notNull().default("PENDING"),
    amountMinor: bigint("amount_minor", { mode: "number" }).notNull(),
    currency: varchar("currency", { length: 3 }).notNull().default("USD"),
    /** Idempotency key sent to the gateway. */
    idempotencyKey: varchar("idempotency_key", { length: 128 }).notNull(),
    /** External identifier (authorization/capture/void/refund). */
    providerOperationId: varchar("provider_operation_id", { length: 128 }),
    /** Hash of the exact request, for reconciliation. */
    requestHash: varchar("request_hash", { length: 64 }),
    rawResponse: jsonb("raw_response"),
    errorCode: varchar("error_code", { length: 64 }),
    errorMessage: text("error_message"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    paymentIdx: index("payment_operations_payment_idx").on(t.paymentId, t.createdAt),
    idempotencyIdx: uniqueIndex("payment_operations_idempotency_unique").on(t.idempotencyKey),
    // At most one successful capture per payment.
    singleSuccessfulCapture: uniqueIndex("payment_operations_single_capture")
      .on(t.paymentId)
      .where(sql`${t.action} = 'CAPTURE' and ${t.status} = 'SUCCEEDED'`),
    amountCheck: check("payment_operations_amount_nonnegative", sql`${t.amountMinor} >= 0`),
  }),
);

/**
 * Raw gateway webhook receipts, stored before interpretation. Used for
 * reconciliation and to make webhook handling idempotent by external id.
 */
export const webhookEvents = pgTable(
  "webhook_events",
  {
    id: varchar("id", { length: 64 }).primaryKey(),
    provider: varchar("provider", { length: 32 }).notNull(),
    /** Gateway event id, unique to dedupe redeliveries. */
    externalEventId: varchar("external_event_id", { length: 128 }).notNull(),
    eventType: varchar("event_type", { length: 128 }).notNull(),
    /** Signature verification outcome. */
    verified: boolean("verified").notNull().default(false),
    payload: jsonb("payload").notNull(),
    processedAt: timestamp("processed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    externalIdx: uniqueIndex("webhook_events_external_unique").on(t.provider, t.externalEventId),
  }),
);

export const paymentsRelations = relations(payments, ({ one, many }) => ({
  task: one(tasks, { fields: [payments.taskId], references: [tasks.id] }),
  agreement: one(commercialAgreements, {
    fields: [payments.agreementId],
    references: [commercialAgreements.id],
  }),
  decisions: many(paymentDecisions),
  operations: many(paymentOperations),
}));

export const paymentDecisionsRelations = relations(paymentDecisions, ({ one, many }) => ({
  payment: one(payments, { fields: [paymentDecisions.paymentId], references: [payments.id] }),
  checks: many(paymentPolicyChecks),
}));

export const policyChecksRelations = relations(paymentPolicyChecks, ({ one }) => ({
  decision: one(paymentDecisions, {
    fields: [paymentPolicyChecks.decisionId],
    references: [paymentDecisions.id],
  }),
}));

export const paymentOperationsRelations = relations(paymentOperations, ({ one }) => ({
  payment: one(payments, { fields: [paymentOperations.paymentId], references: [payments.id] }),
}));
