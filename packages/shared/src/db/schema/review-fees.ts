import { sql } from "drizzle-orm";
import {
  bigint,
  check,
  index,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  varchar,
} from "drizzle-orm/pg-core";
import { paymentModeEnum, paymentOperationStatusEnum } from "../enums";
import { independentReviewEngagements } from "./independent-reviews";
import { users } from "./identity";
import { providers } from "./providers";

export const reviewFeePayments = pgTable(
  "review_fee_payments",
  {
    id: varchar("id", { length: 64 }).primaryKey(),
    engagementId: varchar("engagement_id", { length: 64 })
      .notNull()
      .references(() => independentReviewEngagements.id, { onDelete: "cascade" }),
    payerUserId: varchar("payer_user_id", { length: 64 })
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    reviewerProviderId: varchar("reviewer_provider_id", { length: 64 })
      .notNull()
      .references(() => providers.id, { onDelete: "restrict" }),
    mode: paymentModeEnum("mode").notNull(),
    amountMinor: bigint("amount_minor", { mode: "number" }).notNull(),
    currency: varchar("currency", { length: 3 }).notNull().default("USD"),
    status: varchar("status", { length: 32 }).notNull().default("PENDING"),
    payerIdSnapshot: varchar("payer_id_snapshot", { length: 128 }),
    sellerMerchantIdSnapshot: varchar("seller_merchant_id_snapshot", { length: 128 }),
    requestId: varchar("request_id", { length: 128 }),
    externalOrderId: varchar("external_order_id", { length: 128 }),
    approvalStateHash: varchar("approval_state_hash", { length: 64 }),
    approvalUrl: text("approval_url"),
    providerAuthorizationId: varchar("provider_authorization_id", { length: 128 }),
    providerCaptureId: varchar("provider_capture_id", { length: 128 }),
    expiresAt: timestamp("expires_at", { withTimezone: true }),
    paidAt: timestamp("paid_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    engagementPayerIdx: uniqueIndex("review_fee_payments_engagement_payer_unique").on(
      t.engagementId,
      t.payerUserId,
    ),
    externalOrderIdx: uniqueIndex("review_fee_payments_external_order_unique").on(
      t.mode,
      t.externalOrderId,
    ),
    approvalStateIdx: uniqueIndex("review_fee_payments_approval_state_unique").on(
      t.approvalStateHash,
    ),
    statusIdx: index("review_fee_payments_status_idx").on(t.status, t.updatedAt),
    amountCheck: check("review_fee_payments_amount_positive", sql`${t.amountMinor} > 0`),
    statusCheck: check(
      "review_fee_payments_status_valid",
      sql`${t.status} in ('PENDING', 'ORDER_REQUESTED', 'AWAITING_APPROVAL', 'AUTHORIZATION_REQUESTED', 'CAPTURE_REQUESTED', 'PAID', 'FAILED', 'UNKNOWN', 'CANCELLED')`,
    ),
    bindingCheck: check(
      "review_fee_payments_mode_binding_valid",
      sql`(${t.mode} = 'FAKE' and ${t.payerIdSnapshot} is null and ${t.sellerMerchantIdSnapshot} is null) or (${t.mode} in ('PAYPAL_SANDBOX', 'PAYPAL_LIVE') and ${t.sellerMerchantIdSnapshot} is not null)`,
    ),
    payerBoundCheck: check(
      "review_fee_payments_payer_bound_for_authorization",
      sql`${t.mode} = 'FAKE' or ${t.status} not in ('AUTHORIZATION_REQUESTED', 'CAPTURE_REQUESTED', 'PAID') or ${t.payerIdSnapshot} is not null`,
    ),
  }),
);

export const reviewFeeOperations = pgTable(
  "review_fee_operations",
  {
    id: varchar("id", { length: 64 }).primaryKey(),
    reviewFeePaymentId: varchar("review_fee_payment_id", { length: 64 })
      .notNull()
      .references(() => reviewFeePayments.id, { onDelete: "cascade" }),
    action: varchar("action", { length: 16 }).notNull(),
    status: paymentOperationStatusEnum("status").notNull(),
    amountMinor: bigint("amount_minor", { mode: "number" }).notNull(),
    currency: varchar("currency", { length: 3 }).notNull().default("USD"),
    idempotencyKey: varchar("idempotency_key", { length: 128 }).notNull(),
    providerOperationId: varchar("provider_operation_id", { length: 128 }),
    rawResponse: jsonb("raw_response"),
    errorCode: varchar("error_code", { length: 64 }),
    errorMessage: text("error_message"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    idempotencyIdx: uniqueIndex("review_fee_operations_idempotency_unique").on(t.idempotencyKey),
    paymentIdx: index("review_fee_operations_payment_idx").on(t.reviewFeePaymentId, t.createdAt),
    singleCaptureIdx: uniqueIndex("review_fee_operations_single_capture")
      .on(t.reviewFeePaymentId)
      .where(sql`${t.action} = 'CAPTURE' and ${t.status} = 'SUCCEEDED'`),
    actionCheck: check(
      "review_fee_operations_action_valid",
      sql`${t.action} in ('AUTHORIZE', 'CAPTURE')`,
    ),
  }),
);
