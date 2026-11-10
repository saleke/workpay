CREATE TYPE "public"."account_class" AS ENUM('UNCLASSIFIED', 'DEMO_FIXTURE', 'MEMBER');--> statement-breakpoint
CREATE TYPE "public"."payment_mode" AS ENUM('FAKE', 'PAYPAL_SANDBOX', 'PAYPAL_LIVE');--> statement-breakpoint
ALTER TYPE "public"."payment_status" ADD VALUE 'ORDER_CREATE_REQUESTED' BEFORE 'AUTHORIZATION_REQUESTED';--> statement-breakpoint
ALTER TYPE "public"."payment_status" ADD VALUE 'AWAITING_BUYER_APPROVAL' BEFORE 'AUTHORIZATION_REQUESTED';--> statement-breakpoint
ALTER TYPE "public"."payment_status" ADD VALUE 'ORDER_APPROVED' BEFORE 'AUTHORIZATION_REQUESTED';--> statement-breakpoint
CREATE TABLE "payment_orders" (
	"id" varchar(64) PRIMARY KEY NOT NULL,
	"payment_id" varchar(64) NOT NULL,
	"mode" "payment_mode" NOT NULL,
	"generation" integer DEFAULT 1 NOT NULL,
	"request_id" varchar(128) NOT NULL,
	"external_order_id" varchar(128),
	"approval_state_hash" varchar(64) NOT NULL,
	"approval_url" text,
	"payer_id_snapshot" varchar(128) NOT NULL,
	"seller_merchant_id_snapshot" varchar(128) NOT NULL,
	"amount_minor" bigint NOT NULL,
	"currency" varchar(3) DEFAULT 'USD' NOT NULL,
	"status" varchar(32) DEFAULT 'CREATE_REQUESTED' NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"approved_at" timestamp with time zone,
	"authorized_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "payment_orders_amount_nonnegative" CHECK ("payment_orders"."amount_minor" >= 0),
	CONSTRAINT "payment_orders_status_valid" CHECK ("payment_orders"."status" in ('CREATE_REQUESTED', 'AWAITING_APPROVAL', 'APPROVED', 'AUTHORIZATION_REQUESTED', 'AUTHORIZED', 'CANCELLED', 'FAILED', 'UNKNOWN'))
);
--> statement-breakpoint
CREATE TABLE "paypal_identity_links" (
	"id" varchar(64) PRIMARY KEY NOT NULL,
	"user_id" varchar(64) NOT NULL,
	"environment" varchar(16) NOT NULL,
	"payer_id" varchar(128) NOT NULL,
	"email" text NOT NULL,
	"email_verified" boolean DEFAULT false NOT NULL,
	"account_verified" boolean DEFAULT false NOT NULL,
	"scopes" text[] DEFAULT ARRAY[]::text[] NOT NULL,
	"status" varchar(16) DEFAULT 'LINKED' NOT NULL,
	"linked_at" timestamp with time zone DEFAULT now() NOT NULL,
	"revoked_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "paypal_identity_links_status_valid" CHECK ("paypal_identity_links"."status" in ('LINKED', 'REVOKED')),
	CONSTRAINT "paypal_identity_links_environment_valid" CHECK ("paypal_identity_links"."environment" in ('SANDBOX', 'LIVE'))
);
--> statement-breakpoint
CREATE TABLE "paypal_oauth_attempts" (
	"id" varchar(64) PRIMARY KEY NOT NULL,
	"user_id" varchar(64) NOT NULL,
	"environment" varchar(16) NOT NULL,
	"state_hash" varchar(64) NOT NULL,
	"session_token_hash" varchar(64) NOT NULL,
	"return_to" text DEFAULT '/settings?tab=paypal' NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"consumed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "paypal_oauth_attempts_environment_valid" CHECK ("paypal_oauth_attempts"."environment" in ('SANDBOX', 'LIVE'))
);
--> statement-breakpoint
CREATE TABLE "provider_paypal_accounts" (
	"id" varchar(64) PRIMARY KEY NOT NULL,
	"provider_id" varchar(64) NOT NULL,
	"user_id" varchar(64) NOT NULL,
	"environment" varchar(16) NOT NULL,
	"tracking_id" varchar(128) NOT NULL,
	"referral_id" varchar(128),
	"merchant_id" varchar(128),
	"status" varchar(24) DEFAULT 'PENDING' NOT NULL,
	"payments_receivable" boolean DEFAULT false NOT NULL,
	"primary_email_confirmed" boolean DEFAULT false NOT NULL,
	"consent_status" boolean DEFAULT false NOT NULL,
	"products" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"permissions" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"action_url" text,
	"last_checked_at" timestamp with time zone,
	"revoked_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "provider_paypal_accounts_status_valid" CHECK ("provider_paypal_accounts"."status" in ('PENDING', 'ACTIVE', 'RESTRICTED', 'REVOKED')),
	CONSTRAINT "provider_paypal_accounts_environment_valid" CHECK ("provider_paypal_accounts"."environment" in ('SANDBOX', 'LIVE'))
);
--> statement-breakpoint
DROP INDEX "webhook_events_external_unique";--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "account_class" "account_class" DEFAULT 'UNCLASSIFIED' NOT NULL;--> statement-breakpoint
ALTER TABLE "payments" ADD COLUMN "mode" "payment_mode" DEFAULT 'FAKE' NOT NULL;--> statement-breakpoint
ALTER TABLE "payments" ADD COLUMN "buyer_user_id" varchar(64);--> statement-breakpoint
ALTER TABLE "payments" ADD COLUMN "provider_id" varchar(64);--> statement-breakpoint
ALTER TABLE "payments" ADD COLUMN "payer_id_snapshot" varchar(128);--> statement-breakpoint
ALTER TABLE "payments" ADD COLUMN "seller_merchant_id_snapshot" varchar(128);--> statement-breakpoint
ALTER TABLE "payments" ADD COLUMN "authorization_expires_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "webhook_events" ADD COLUMN "mode" "payment_mode" DEFAULT 'FAKE' NOT NULL;--> statement-breakpoint
ALTER TABLE "webhook_events" ADD COLUMN "payment_id" varchar(64);--> statement-breakpoint
ALTER TABLE "webhook_events" ADD COLUMN "body_hash" varchar(64);--> statement-breakpoint
ALTER TABLE "webhook_events" ADD COLUMN "processing_status" varchar(24) DEFAULT 'RECEIVED' NOT NULL;--> statement-breakpoint
ALTER TABLE "webhook_events" ADD COLUMN "attempts" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "webhook_events" ADD COLUMN "last_error" text;--> statement-breakpoint
UPDATE "users" SET "account_class" = 'MEMBER';--> statement-breakpoint
UPDATE "users" SET "account_class" = 'DEMO_FIXTURE' WHERE "id" IN ('usr_buyer_alice', 'usr_provider_bob', 'usr_admin_carol', 'usr_provider_dee', 'usr_provider_sam', 'usr_provider_taylor', 'usr_reviewer_jamie', 'usr_reviewer_morgan');--> statement-breakpoint
UPDATE "payments" AS p SET "buyer_user_id" = t."user_id", "provider_id" = a."provider_id", "authorization_expires_at" = CASE WHEN p."authorized_at" IS NOT NULL THEN TIMESTAMPTZ '2099-01-01 00:00:00+00' ELSE NULL END FROM "tasks" AS t, "commercial_agreements" AS a WHERE p."task_id" = t."id" AND p."agreement_id" = a."id";--> statement-breakpoint
UPDATE "payments" AS p SET "status" = 'FAILED', "updated_at" = now() FROM "users" AS buyer, "providers" AS provider, "users" AS seller WHERE p."buyer_user_id" = buyer."id" AND p."provider_id" = provider."id" AND provider."user_id" = seller."id" AND p."mode" = 'FAKE' AND p."status" NOT IN ('CAPTURED', 'REFUNDED', 'VOIDED', 'FAILED') AND (buyer."account_class" <> 'DEMO_FIXTURE' OR seller."account_class" <> 'DEMO_FIXTURE');--> statement-breakpoint
ALTER TABLE "payments" ALTER COLUMN "buyer_user_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "payments" ALTER COLUMN "provider_id" SET NOT NULL;--> statement-breakpoint
UPDATE "webhook_events" SET "body_hash" = repeat('0', 64) WHERE "body_hash" IS NULL;--> statement-breakpoint
ALTER TABLE "webhook_events" ALTER COLUMN "body_hash" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "payment_orders" ADD CONSTRAINT "payment_orders_payment_id_payments_id_fk" FOREIGN KEY ("payment_id") REFERENCES "public"."payments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "paypal_identity_links" ADD CONSTRAINT "paypal_identity_links_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "paypal_oauth_attempts" ADD CONSTRAINT "paypal_oauth_attempts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "provider_paypal_accounts" ADD CONSTRAINT "provider_paypal_accounts_provider_id_providers_id_fk" FOREIGN KEY ("provider_id") REFERENCES "public"."providers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "provider_paypal_accounts" ADD CONSTRAINT "provider_paypal_accounts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "payment_orders_payment_generation_unique" ON "payment_orders" USING btree ("payment_id","generation");--> statement-breakpoint
CREATE UNIQUE INDEX "payment_orders_request_unique" ON "payment_orders" USING btree ("request_id");--> statement-breakpoint
CREATE UNIQUE INDEX "payment_orders_external_unique" ON "payment_orders" USING btree ("mode","external_order_id");--> statement-breakpoint
CREATE UNIQUE INDEX "payment_orders_approval_state_unique" ON "payment_orders" USING btree ("approval_state_hash");--> statement-breakpoint
CREATE UNIQUE INDEX "paypal_identity_links_user_environment_unique" ON "paypal_identity_links" USING btree ("user_id","environment");--> statement-breakpoint
CREATE UNIQUE INDEX "paypal_identity_links_payer_environment_unique" ON "paypal_identity_links" USING btree ("payer_id","environment");--> statement-breakpoint
CREATE UNIQUE INDEX "paypal_oauth_attempts_state_unique" ON "paypal_oauth_attempts" USING btree ("state_hash");--> statement-breakpoint
CREATE INDEX "paypal_oauth_attempts_user_idx" ON "paypal_oauth_attempts" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "provider_paypal_accounts_provider_environment_unique" ON "provider_paypal_accounts" USING btree ("provider_id","environment");--> statement-breakpoint
CREATE UNIQUE INDEX "provider_paypal_accounts_tracking_environment_unique" ON "provider_paypal_accounts" USING btree ("tracking_id","environment");--> statement-breakpoint
CREATE UNIQUE INDEX "provider_paypal_accounts_merchant_environment_unique" ON "provider_paypal_accounts" USING btree ("merchant_id","environment");--> statement-breakpoint
CREATE INDEX "provider_paypal_accounts_status_idx" ON "provider_paypal_accounts" USING btree ("status","updated_at");--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_buyer_user_id_users_id_fk" FOREIGN KEY ("buyer_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_provider_id_providers_id_fk" FOREIGN KEY ("provider_id") REFERENCES "public"."providers"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "webhook_events" ADD CONSTRAINT "webhook_events_payment_id_payments_id_fk" FOREIGN KEY ("payment_id") REFERENCES "public"."payments"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "webhook_events_processing_idx" ON "webhook_events" USING btree ("processing_status","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "webhook_events_external_unique" ON "webhook_events" USING btree ("provider","mode","external_event_id");--> statement-breakpoint
ALTER TABLE "webhook_events" ADD CONSTRAINT "webhook_events_attempts_nonnegative" CHECK ("webhook_events"."attempts" >= 0);
--> statement-breakpoint
CREATE OR REPLACE FUNCTION workpay_payment_mode_immutable() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.mode IS DISTINCT FROM OLD.mode THEN
    RAISE EXCEPTION 'payments.mode is immutable';
  END IF;
  RETURN NEW;
END;
$$;--> statement-breakpoint
CREATE TRIGGER payments_mode_immutable BEFORE UPDATE OF "mode" ON "payments" FOR EACH ROW EXECUTE FUNCTION workpay_payment_mode_immutable();
