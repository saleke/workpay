-- Reconcile legacy schema additions and create the first persisted intake tables.
CREATE TABLE "intake_sessions" (
	"id" varchar(64) PRIMARY KEY NOT NULL,
	"user_id" varchar(64) NOT NULL,
	"original_request" text NOT NULL,
	"current_version" integer DEFAULT 1 NOT NULL,
	"status" varchar(16) DEFAULT 'DRAFT' NOT NULL,
	"approved_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "intake_sessions_version_positive" CHECK ("intake_sessions"."current_version" > 0),
	CONSTRAINT "intake_sessions_status_valid" CHECK ("intake_sessions"."status" in ('DRAFT', 'READY', 'APPROVED')),
	CONSTRAINT "intake_sessions_approval_consistent" CHECK (("intake_sessions"."status" = 'APPROVED') = ("intake_sessions"."approved_at" is not null))
);
--> statement-breakpoint
CREATE TABLE "intake_versions" (
	"id" varchar(64) PRIMARY KEY NOT NULL,
	"session_id" varchar(64) NOT NULL,
	"version" integer NOT NULL,
	"snapshot" jsonb NOT NULL,
	"created_by" varchar(64) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "intake_versions_version_positive" CHECK ("intake_versions"."version" > 0)
);
--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "username" varchar(32);--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "display_name" text;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "legal_name" text;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "github_username" text;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "github_verified_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "id_verification_status" varchar(32) DEFAULT 'UNVERIFIED' NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "id_verified_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "id_document_type" varchar(32);--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "paypal_payer_id" text;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "paypal_payout_email" text;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "paypal_linked_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "paypal_verified" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "paypal_auto_hold_enabled" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "providers" ADD COLUMN IF NOT EXISTS "work_preferences" jsonb;--> statement-breakpoint
ALTER TABLE "intake_sessions" ADD CONSTRAINT "intake_sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "intake_versions" ADD CONSTRAINT "intake_versions_session_id_intake_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."intake_sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "intake_versions" ADD CONSTRAINT "intake_versions_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "intake_sessions_owner_updated_idx" ON "intake_sessions" USING btree ("user_id","updated_at");--> statement-breakpoint
CREATE UNIQUE INDEX "intake_versions_session_version_unique" ON "intake_versions" USING btree ("session_id","version");--> statement-breakpoint
CREATE INDEX "intake_versions_session_created_idx" ON "intake_versions" USING btree ("session_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "users_username_unique" ON "users" USING btree ("username");