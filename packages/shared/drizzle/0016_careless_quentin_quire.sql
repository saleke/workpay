CREATE TYPE "public"."review_package_status" AS ENUM('DRAFT', 'READY_FOR_REVIEW', 'CHANGES_REQUESTED', 'APPROVED', 'REJECTED', 'EXTERNAL_REVIEW_REQUESTED');--> statement-breakpoint
ALTER TYPE "public"."task_status" ADD VALUE 'AWAITING_CLIENT_REVIEW' BEFORE 'REVISION_REQUIRED';--> statement-breakpoint
ALTER TYPE "public"."task_status" ADD VALUE 'AWAITING_EXTERNAL_REVIEW' BEFORE 'REVISION_REQUIRED';--> statement-breakpoint
ALTER TYPE "public"."task_status" ADD VALUE 'REVIEW_ACCEPTED' BEFORE 'REVISION_REQUIRED';--> statement-breakpoint
ALTER TYPE "public"."task_status" ADD VALUE 'REJECTED' BEFORE 'REVISION_REQUIRED';--> statement-breakpoint
CREATE TABLE "review_packages" (
	"id" varchar(64) PRIMARY KEY NOT NULL,
	"task_id" varchar(64) NOT NULL,
	"execution_id" varchar(64) NOT NULL,
	"submission_id" varchar(64) NOT NULL,
	"submission_version" integer NOT NULL,
	"submission_hash" varchar(64) NOT NULL,
	"contract_id" varchar(64) NOT NULL,
	"contract_version" integer NOT NULL,
	"contract_hash" varchar(64) NOT NULL,
	"verification_run_id" varchar(64) NOT NULL,
	"buyer_user_id" varchar(64) NOT NULL,
	"provider_id" varchar(64) NOT NULL,
	"status" "review_package_status" DEFAULT 'DRAFT' NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"summary" text NOT NULL,
	"notes" text,
	"preview_links" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"file_references" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"known_issues" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"reviewer_decision" varchar(32),
	"decision_reason" text,
	"reviewed_by" varchar(64),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"reviewed_at" timestamp with time zone,
	CONSTRAINT "review_packages_contract_version_positive" CHECK ("review_packages"."contract_version" > 0),
	CONSTRAINT "review_packages_submission_version_positive" CHECK ("review_packages"."submission_version" > 0),
	CONSTRAINT "review_packages_binding_hashes_valid" CHECK (length("review_packages"."contract_hash") = 64 and length("review_packages"."submission_hash") = 64),
	CONSTRAINT "review_packages_decision_valid" CHECK ("review_packages"."reviewer_decision" is null or "review_packages"."reviewer_decision" in ('APPROVED', 'REJECTED', 'CHANGES_REQUESTED', 'EXTERNAL_REVIEW_REQUESTED')),
	CONSTRAINT "review_packages_decision_reason_required" CHECK ("review_packages"."reviewer_decision" is null or length(trim("review_packages"."decision_reason")) > 0)
);
--> statement-breakpoint
ALTER TABLE "independent_review_engagements" DROP CONSTRAINT "independent_review_engagements_authority_check";--> statement-breakpoint
UPDATE "independent_review_engagements" SET "authority" = 'ADVISORY' WHERE "authority" <> 'ADVISORY';--> statement-breakpoint
ALTER TABLE "reviewer_profiles" ADD COLUMN "offers_work" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "reviewer_profiles" ADD COLUMN "offers_review" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "reviewer_profiles" ADD COLUMN "accepts_review_only" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "reviewer_profiles" ADD COLUMN "review_availability" varchar(16) DEFAULT 'AVAILABLE' NOT NULL;--> statement-breakpoint
ALTER TABLE "reviewer_profiles" ADD COLUMN "review_notice" text;--> statement-breakpoint
UPDATE "reviewer_profiles" SET "offers_review" = "is_listed", "review_availability" = CASE WHEN "available" THEN 'AVAILABLE' ELSE 'OFFLINE' END;--> statement-breakpoint
ALTER TABLE "review_packages" ADD CONSTRAINT "review_packages_task_id_tasks_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."tasks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "review_packages" ADD CONSTRAINT "review_packages_execution_id_work_executions_id_fk" FOREIGN KEY ("execution_id") REFERENCES "public"."work_executions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "review_packages" ADD CONSTRAINT "review_packages_submission_id_work_submissions_id_fk" FOREIGN KEY ("submission_id") REFERENCES "public"."work_submissions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "review_packages" ADD CONSTRAINT "review_packages_contract_id_work_contracts_id_fk" FOREIGN KEY ("contract_id") REFERENCES "public"."work_contracts"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "review_packages" ADD CONSTRAINT "review_packages_buyer_user_id_users_id_fk" FOREIGN KEY ("buyer_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "review_packages" ADD CONSTRAINT "review_packages_provider_id_providers_id_fk" FOREIGN KEY ("provider_id") REFERENCES "public"."providers"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "review_packages_task_idx" ON "review_packages" USING btree ("task_id");--> statement-breakpoint
CREATE INDEX "review_packages_execution_idx" ON "review_packages" USING btree ("execution_id");--> statement-breakpoint
CREATE UNIQUE INDEX "review_packages_submission_unique" ON "review_packages" USING btree ("submission_id");--> statement-breakpoint
ALTER TABLE "reviewer_profiles" ADD CONSTRAINT "reviewer_profiles_review_availability_valid" CHECK ("reviewer_profiles"."review_availability" in ('AVAILABLE', 'BUSY', 'OFFLINE'));--> statement-breakpoint
ALTER TABLE "independent_review_engagements" ADD CONSTRAINT "independent_review_engagements_authority_check" CHECK ("independent_review_engagements"."authority" = 'ADVISORY');
