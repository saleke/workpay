CREATE TYPE "public"."work_review_assessment_status" AS ENUM('MET', 'PARTIAL', 'NOT_MET', 'UNCLEAR', 'NOT_APPLICABLE');--> statement-breakpoint
CREATE TYPE "public"."work_review_item_type" AS ENUM('NOTE', 'LINK', 'FILE');--> statement-breakpoint
CREATE TYPE "public"."work_review_kind" AS ENUM('CHECKPOINT', 'FINAL');--> statement-breakpoint
CREATE TYPE "public"."work_review_status" AS ENUM('REQUESTED', 'PREPARING', 'CLARIFICATION_REQUESTED', 'READY_FOR_REVIEW', 'REFERRED', 'CHECKPOINT_ACCEPTED', 'FINAL_ACCEPTED', 'CHANGES_REQUESTED', 'CANCELLED');--> statement-breakpoint
ALTER TYPE "public"."execution_status" ADD VALUE 'REVIEW_REQUESTED' BEFORE 'SUBMITTED';--> statement-breakpoint
ALTER TYPE "public"."execution_status" ADD VALUE 'UNDER_REVIEW' BEFORE 'SUBMITTED';--> statement-breakpoint
ALTER TYPE "public"."task_status" ADD VALUE 'REVIEW_REQUESTED' BEFORE 'SUBMITTED';--> statement-breakpoint
CREATE TABLE "work_review_assessments" (
	"id" varchar(64) PRIMARY KEY NOT NULL,
	"review_id" varchar(64) NOT NULL,
	"requirement_key" varchar(128) NOT NULL,
	"status" "work_review_assessment_status" NOT NULL,
	"rationale" text,
	"assessed_by_user_id" varchar(64) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "work_review_items" (
	"id" varchar(64) PRIMARY KEY NOT NULL,
	"review_id" varchar(64) NOT NULL,
	"task_id" varchar(64) NOT NULL,
	"author_user_id" varchar(64) NOT NULL,
	"type" "work_review_item_type" NOT NULL,
	"label" varchar(255),
	"note" text,
	"url" text,
	"storage_key" text,
	"filename" varchar(255),
	"content_type" varchar(255),
	"size_bytes" bigint,
	"sha256" varchar(64),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "work_review_items_shape_valid" CHECK (("work_review_items"."type" = 'NOTE' and "work_review_items"."note" is not null and length(trim("work_review_items"."note")) > 0 and "work_review_items"."url" is null and "work_review_items"."storage_key" is null) or ("work_review_items"."type" = 'LINK' and "work_review_items"."url" is not null and "work_review_items"."label" is not null and length(trim("work_review_items"."label")) > 0 and "work_review_items"."storage_key" is null) or ("work_review_items"."type" = 'FILE' and "work_review_items"."storage_key" is not null and "work_review_items"."filename" is not null and "work_review_items"."size_bytes" > 0 and "work_review_items"."sha256" is not null))
);
--> statement-breakpoint
CREATE TABLE "work_reviews" (
	"id" varchar(64) PRIMARY KEY NOT NULL,
	"task_id" varchar(64) NOT NULL,
	"execution_id" varchar(64) NOT NULL,
	"contract_id" varchar(64) NOT NULL,
	"contract_version" integer NOT NULL,
	"contract_hash" varchar(64) NOT NULL,
	"sequence" integer NOT NULL,
	"kind" "work_review_kind" NOT NULL,
	"status" "work_review_status" DEFAULT 'REQUESTED' NOT NULL,
	"title" varchar(160) NOT NULL,
	"opening_note" text NOT NULL,
	"requirement_keys" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"opened_by_user_id" varchar(64) NOT NULL,
	"provider_response_summary" text,
	"provider_responded_at" timestamp with time zone,
	"package_hash" varchar(64),
	"reviewer_summary" text,
	"reviewer_responded_at" timestamp with time zone,
	"decision_by_user_id" varchar(64),
	"decision_role" varchar(32),
	"decision_reason" text,
	"risk_acknowledged" boolean DEFAULT false NOT NULL,
	"opened_at" timestamp with time zone DEFAULT now() NOT NULL,
	"decided_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "work_reviews_sequence_positive" CHECK ("work_reviews"."sequence" > 0),
	CONSTRAINT "work_reviews_title_nonempty" CHECK (length(trim("work_reviews"."title")) > 0),
	CONSTRAINT "work_reviews_opening_note_nonempty" CHECK (length(trim("work_reviews"."opening_note")) > 0),
	CONSTRAINT "work_reviews_decision_role_valid" CHECK ("work_reviews"."decision_role" is null or "work_reviews"."decision_role" in ('CLIENT', 'AGREED_REVIEWER'))
);
--> statement-breakpoint
ALTER TABLE "independent_review_engagements" ADD COLUMN "work_review_id" varchar(64);--> statement-breakpoint
ALTER TABLE "work_review_assessments" ADD CONSTRAINT "work_review_assessments_review_id_work_reviews_id_fk" FOREIGN KEY ("review_id") REFERENCES "public"."work_reviews"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "work_review_assessments" ADD CONSTRAINT "work_review_assessments_assessed_by_user_id_users_id_fk" FOREIGN KEY ("assessed_by_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "work_review_items" ADD CONSTRAINT "work_review_items_review_id_work_reviews_id_fk" FOREIGN KEY ("review_id") REFERENCES "public"."work_reviews"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "work_review_items" ADD CONSTRAINT "work_review_items_task_id_tasks_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."tasks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "work_review_items" ADD CONSTRAINT "work_review_items_author_user_id_users_id_fk" FOREIGN KEY ("author_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "work_reviews" ADD CONSTRAINT "work_reviews_task_id_tasks_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."tasks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "work_reviews" ADD CONSTRAINT "work_reviews_execution_id_work_executions_id_fk" FOREIGN KEY ("execution_id") REFERENCES "public"."work_executions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "work_reviews" ADD CONSTRAINT "work_reviews_contract_id_work_contracts_id_fk" FOREIGN KEY ("contract_id") REFERENCES "public"."work_contracts"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "work_reviews" ADD CONSTRAINT "work_reviews_opened_by_user_id_users_id_fk" FOREIGN KEY ("opened_by_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "work_reviews" ADD CONSTRAINT "work_reviews_decision_by_user_id_users_id_fk" FOREIGN KEY ("decision_by_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "work_review_assessments_reviewer_requirement_unique" ON "work_review_assessments" USING btree ("review_id","requirement_key","assessed_by_user_id");--> statement-breakpoint
CREATE INDEX "work_review_assessments_review_requirement_idx" ON "work_review_assessments" USING btree ("review_id","requirement_key");--> statement-breakpoint
CREATE INDEX "work_review_items_review_idx" ON "work_review_items" USING btree ("review_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "work_review_items_storage_unique" ON "work_review_items" USING btree ("storage_key");--> statement-breakpoint
CREATE INDEX "work_reviews_task_idx" ON "work_reviews" USING btree ("task_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "work_reviews_execution_sequence_unique" ON "work_reviews" USING btree ("execution_id","sequence");--> statement-breakpoint
CREATE UNIQUE INDEX "work_reviews_execution_active_unique" ON "work_reviews" USING btree ("execution_id") WHERE "work_reviews"."status" in ('REQUESTED', 'PREPARING', 'CLARIFICATION_REQUESTED', 'READY_FOR_REVIEW', 'REFERRED');--> statement-breakpoint
ALTER TABLE "independent_review_engagements" ADD CONSTRAINT "independent_review_engagements_work_review_id_work_reviews_id_fk" FOREIGN KEY ("work_review_id") REFERENCES "public"."work_reviews"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "independent_review_engagements_work_review_unique" ON "independent_review_engagements" USING btree ("work_review_id");