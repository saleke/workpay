ALTER TYPE "public"."work_review_status" ADD VALUE 'DISSATISFIED' BEFORE 'CHECKPOINT_ACCEPTED';--> statement-breakpoint
ALTER TYPE "public"."work_review_status" ADD VALUE 'CLIENT_RESPONSE_OVERDUE' BEFORE 'CHECKPOINT_ACCEPTED';--> statement-breakpoint
CREATE TABLE "oauth_attempts" (
	"id" varchar(64) PRIMARY KEY NOT NULL,
	"provider" varchar(16) NOT NULL,
	"state_hash" varchar(64) NOT NULL,
	"intent" varchar(16) NOT NULL,
	"user_id" varchar(64),
	"tab_nonce_hash" varchar(64) NOT NULL,
	"return_to" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"consumed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "oauth_attempts_provider_valid" CHECK ("oauth_attempts"."provider" in ('GOOGLE', 'GITHUB')),
	CONSTRAINT "oauth_attempts_intent_valid" CHECK ("oauth_attempts"."intent" in ('SIGN_IN', 'LINK'))
);
--> statement-breakpoint
CREATE TABLE "payment_release_approvals" (
	"id" varchar(64) PRIMARY KEY NOT NULL,
	"payment_id" varchar(64) NOT NULL,
	"task_id" varchar(64) NOT NULL,
	"review_id" varchar(64) NOT NULL,
	"buyer_user_id" varchar(64) NOT NULL,
	"amount_minor" bigint NOT NULL,
	"currency" varchar(3) NOT NULL,
	"contract_version" integer NOT NULL,
	"contract_hash" varchar(64) NOT NULL,
	"approval_hash" varchar(64) NOT NULL,
	"statement_version" varchar(32) DEFAULT 'release-v1' NOT NULL,
	"approved_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "payment_release_approvals_amount_nonnegative" CHECK ("payment_release_approvals"."amount_minor" >= 0)
);
--> statement-breakpoint
DROP INDEX "work_reviews_execution_active_unique";--> statement-breakpoint
ALTER TABLE "sessions" ADD COLUMN "handoff_code_hash" varchar(64);--> statement-breakpoint
ALTER TABLE "sessions" ADD COLUMN "handoff_tab_nonce_hash" varchar(64);--> statement-breakpoint
ALTER TABLE "sessions" ADD COLUMN "handoff_expires_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "work_reviews" ADD COLUMN "response_window_days" integer DEFAULT 5 NOT NULL;--> statement-breakpoint
ALTER TABLE "work_reviews" ADD COLUMN "response_due_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "work_reviews" ADD COLUMN "dissatisfaction_remedy" varchar(32);--> statement-breakpoint
ALTER TABLE "work_reviews" ADD COLUMN "provider_response" varchar(32);--> statement-breakpoint
ALTER TABLE "work_reviews" ADD COLUMN "provider_response_note" text;--> statement-breakpoint
ALTER TABLE "work_reviews" ADD COLUMN "provider_response_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "oauth_attempts" ADD CONSTRAINT "oauth_attempts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_release_approvals" ADD CONSTRAINT "payment_release_approvals_payment_id_payments_id_fk" FOREIGN KEY ("payment_id") REFERENCES "public"."payments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_release_approvals" ADD CONSTRAINT "payment_release_approvals_task_id_tasks_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."tasks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_release_approvals" ADD CONSTRAINT "payment_release_approvals_review_id_work_reviews_id_fk" FOREIGN KEY ("review_id") REFERENCES "public"."work_reviews"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_release_approvals" ADD CONSTRAINT "payment_release_approvals_buyer_user_id_users_id_fk" FOREIGN KEY ("buyer_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "oauth_attempts_state_hash_unique" ON "oauth_attempts" USING btree ("state_hash");--> statement-breakpoint
CREATE INDEX "oauth_attempts_user_idx" ON "oauth_attempts" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "payment_release_approvals_payment_unique" ON "payment_release_approvals" USING btree ("payment_id");--> statement-breakpoint
CREATE UNIQUE INDEX "payment_release_approvals_review_unique" ON "payment_release_approvals" USING btree ("review_id");--> statement-breakpoint
CREATE UNIQUE INDEX "sessions_handoff_code_hash_unique" ON "sessions" USING btree ("handoff_code_hash");--> statement-breakpoint
CREATE UNIQUE INDEX "work_reviews_execution_active_unique" ON "work_reviews" USING btree ("execution_id") WHERE "work_reviews"."status" not in ('CHECKPOINT_ACCEPTED', 'FINAL_ACCEPTED', 'CHANGES_REQUESTED', 'CANCELLED');--> statement-breakpoint
ALTER TABLE "work_reviews" ADD CONSTRAINT "work_reviews_response_window_valid" CHECK ("work_reviews"."response_window_days" between 1 and 30);--> statement-breakpoint
ALTER TABLE "work_reviews" ADD CONSTRAINT "work_reviews_dissatisfaction_remedy_valid" CHECK ("work_reviews"."dissatisfaction_remedy" is null or "work_reviews"."dissatisfaction_remedy" in ('REVISION', 'PAID_REVIEW', 'CANCEL', 'OTHER'));--> statement-breakpoint
ALTER TABLE "work_reviews" ADD CONSTRAINT "work_reviews_provider_response_valid" CHECK ("work_reviews"."provider_response" is null or "work_reviews"."provider_response" in ('ACCEPT_REVISION', 'DISAGREE', 'REQUEST_PAID_REVIEW'));