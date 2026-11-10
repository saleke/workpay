CREATE TABLE "review_fee_operations" (
	"id" varchar(64) PRIMARY KEY NOT NULL,
	"review_fee_payment_id" varchar(64) NOT NULL,
	"action" varchar(16) NOT NULL,
	"status" "payment_operation_status" NOT NULL,
	"amount_minor" bigint NOT NULL,
	"currency" varchar(3) DEFAULT 'USD' NOT NULL,
	"idempotency_key" varchar(128) NOT NULL,
	"provider_operation_id" varchar(128),
	"raw_response" jsonb,
	"error_code" varchar(64),
	"error_message" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "review_fee_operations_action_valid" CHECK ("review_fee_operations"."action" in ('AUTHORIZE', 'CAPTURE'))
);
--> statement-breakpoint
CREATE TABLE "review_fee_payments" (
	"id" varchar(64) PRIMARY KEY NOT NULL,
	"engagement_id" varchar(64) NOT NULL,
	"payer_user_id" varchar(64) NOT NULL,
	"reviewer_provider_id" varchar(64) NOT NULL,
	"mode" "payment_mode" NOT NULL,
	"amount_minor" bigint NOT NULL,
	"currency" varchar(3) DEFAULT 'USD' NOT NULL,
	"status" varchar(32) DEFAULT 'PENDING' NOT NULL,
	"payer_id_snapshot" varchar(128),
	"seller_merchant_id_snapshot" varchar(128),
	"request_id" varchar(128),
	"external_order_id" varchar(128),
	"approval_state_hash" varchar(64),
	"approval_url" text,
	"provider_authorization_id" varchar(128),
	"provider_capture_id" varchar(128),
	"expires_at" timestamp with time zone,
	"paid_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "review_fee_payments_amount_positive" CHECK ("review_fee_payments"."amount_minor" > 0),
	CONSTRAINT "review_fee_payments_status_valid" CHECK ("review_fee_payments"."status" in ('PENDING', 'ORDER_REQUESTED', 'AWAITING_APPROVAL', 'AUTHORIZATION_REQUESTED', 'CAPTURE_REQUESTED', 'PAID', 'FAILED', 'UNKNOWN', 'CANCELLED')),
	CONSTRAINT "review_fee_payments_mode_binding_valid" CHECK (("review_fee_payments"."mode" = 'FAKE' and "review_fee_payments"."payer_id_snapshot" is null and "review_fee_payments"."seller_merchant_id_snapshot" is null) or ("review_fee_payments"."mode" in ('PAYPAL_SANDBOX', 'PAYPAL_LIVE') and "review_fee_payments"."payer_id_snapshot" is not null and "review_fee_payments"."seller_merchant_id_snapshot" is not null))
);
--> statement-breakpoint
ALTER TABLE "independent_review_engagements" DROP CONSTRAINT "independent_review_engagements_status_check";--> statement-breakpoint
DROP INDEX "independent_review_engagements_active_task_unique";--> statement-breakpoint
ALTER TABLE "independent_review_engagements" ADD COLUMN "reviewer_provider_id" varchar(64);--> statement-breakpoint
ALTER TABLE "independent_review_engagements" ADD COLUMN "fee_mode" varchar(16) DEFAULT 'DIRECT' NOT NULL;--> statement-breakpoint
ALTER TABLE "independent_review_engagements" ADD COLUMN "fee_status" varchar(32) DEFAULT 'NOT_REQUIRED' NOT NULL;--> statement-breakpoint
ALTER TABLE "independent_review_engagements" ADD COLUMN "fee_paid_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "review_fee_operations" ADD CONSTRAINT "review_fee_operations_review_fee_payment_id_review_fee_payments_id_fk" FOREIGN KEY ("review_fee_payment_id") REFERENCES "public"."review_fee_payments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "review_fee_payments" ADD CONSTRAINT "review_fee_payments_engagement_id_independent_review_engagements_id_fk" FOREIGN KEY ("engagement_id") REFERENCES "public"."independent_review_engagements"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "review_fee_payments" ADD CONSTRAINT "review_fee_payments_payer_user_id_users_id_fk" FOREIGN KEY ("payer_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "review_fee_payments" ADD CONSTRAINT "review_fee_payments_reviewer_provider_id_providers_id_fk" FOREIGN KEY ("reviewer_provider_id") REFERENCES "public"."providers"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "review_fee_operations_idempotency_unique" ON "review_fee_operations" USING btree ("idempotency_key");--> statement-breakpoint
CREATE INDEX "review_fee_operations_payment_idx" ON "review_fee_operations" USING btree ("review_fee_payment_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "review_fee_operations_single_capture" ON "review_fee_operations" USING btree ("review_fee_payment_id") WHERE "review_fee_operations"."action" = 'CAPTURE' and "review_fee_operations"."status" = 'SUCCEEDED';--> statement-breakpoint
CREATE UNIQUE INDEX "review_fee_payments_engagement_payer_unique" ON "review_fee_payments" USING btree ("engagement_id","payer_user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "review_fee_payments_external_order_unique" ON "review_fee_payments" USING btree ("mode","external_order_id");--> statement-breakpoint
CREATE UNIQUE INDEX "review_fee_payments_approval_state_unique" ON "review_fee_payments" USING btree ("approval_state_hash");--> statement-breakpoint
CREATE INDEX "review_fee_payments_status_idx" ON "review_fee_payments" USING btree ("status","updated_at");--> statement-breakpoint
ALTER TABLE "independent_review_engagements" ADD CONSTRAINT "independent_review_engagements_reviewer_provider_id_providers_id_fk" FOREIGN KEY ("reviewer_provider_id") REFERENCES "public"."providers"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "independent_review_engagements_active_task_unique" ON "independent_review_engagements" USING btree ("task_id") WHERE "independent_review_engagements"."status" in ('PROPOSED', 'AWAITING_REVIEWER', 'AWAITING_FEE_AUTHORIZATION', 'ENGAGED');--> statement-breakpoint
ALTER TABLE "independent_review_engagements" ADD CONSTRAINT "independent_review_engagements_fee_mode_check" CHECK ("independent_review_engagements"."fee_mode" in ('PAYPAL', 'DIRECT'));--> statement-breakpoint
ALTER TABLE "independent_review_engagements" ADD CONSTRAINT "independent_review_engagements_fee_status_check" CHECK ("independent_review_engagements"."fee_status" in ('NOT_REQUIRED', 'PENDING', 'PAID', 'FAILED', 'UNKNOWN'));--> statement-breakpoint
ALTER TABLE "independent_review_engagements" ADD CONSTRAINT "independent_review_engagements_status_check" CHECK ("independent_review_engagements"."status" in ('PROPOSED', 'AWAITING_REVIEWER', 'AWAITING_FEE_AUTHORIZATION', 'ENGAGED', 'INCONCLUSIVE', 'CLOSED', 'DECLINED', 'CANCELLED'));
--> statement-breakpoint
CREATE OR REPLACE FUNCTION workpay_review_fee_binding_immutable() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.mode IS DISTINCT FROM OLD.mode
    OR NEW.engagement_id IS DISTINCT FROM OLD.engagement_id
    OR NEW.payer_user_id IS DISTINCT FROM OLD.payer_user_id
    OR NEW.reviewer_provider_id IS DISTINCT FROM OLD.reviewer_provider_id
    OR NEW.amount_minor IS DISTINCT FROM OLD.amount_minor
    OR NEW.currency IS DISTINCT FROM OLD.currency
    OR NEW.payer_id_snapshot IS DISTINCT FROM OLD.payer_id_snapshot
    OR NEW.seller_merchant_id_snapshot IS DISTINCT FROM OLD.seller_merchant_id_snapshot THEN
    RAISE EXCEPTION 'review fee economic binding is immutable';
  END IF;
  RETURN NEW;
END;
$$;--> statement-breakpoint
CREATE TRIGGER review_fee_binding_immutable BEFORE UPDATE ON "review_fee_payments" FOR EACH ROW EXECUTE FUNCTION workpay_review_fee_binding_immutable();
