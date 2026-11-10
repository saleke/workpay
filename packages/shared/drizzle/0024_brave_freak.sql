CREATE TYPE "public"."work_commitment_status" AS ENUM('AWAITING_PROVIDER', 'AWAITING_CLIENT', 'CONFIRMED', 'PROVIDER_DECLINED', 'BUYER_WITHDRAWN', 'NOT_SELECTED', 'SUPERSEDED');--> statement-breakpoint
CREATE TABLE "work_commitments" (
	"id" varchar(64) PRIMARY KEY NOT NULL,
	"task_id" varchar(64) NOT NULL,
	"conversation_id" varchar(64) NOT NULL,
	"contract_id" varchar(64) NOT NULL,
	"contract_version" integer NOT NULL,
	"contract_hash" varchar(64) NOT NULL,
	"buyer_user_id" varchar(64) NOT NULL,
	"provider_id" varchar(64) NOT NULL,
	"provider_user_id" varchar(64) NOT NULL,
	"status" "work_commitment_status" DEFAULT 'AWAITING_PROVIDER' NOT NULL,
	"amount_minor" bigint NOT NULL,
	"currency" varchar(3) DEFAULT 'USD' NOT NULL,
	"delivery_deadline" timestamp with time zone,
	"terms_snapshot" jsonb NOT NULL,
	"terms_hash" varchar(64) NOT NULL,
	"provider_response_note" text,
	"proposed_at" timestamp with time zone DEFAULT now() NOT NULL,
	"provider_responded_at" timestamp with time zone,
	"buyer_confirmed_at" timestamp with time zone,
	"capacity_reserved_at" timestamp with time zone,
	"capacity_released_at" timestamp with time zone,
	"closed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "work_commitments_amount_nonnegative" CHECK ("work_commitments"."amount_minor" >= 0),
	CONSTRAINT "work_commitments_distinct_participants" CHECK ("work_commitments"."buyer_user_id" <> "work_commitments"."provider_user_id")
);
--> statement-breakpoint
ALTER TABLE "commercial_agreements" ADD COLUMN "work_commitment_id" varchar(64);--> statement-breakpoint
ALTER TABLE "work_commitments" ADD CONSTRAINT "work_commitments_task_id_tasks_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."tasks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "work_commitments" ADD CONSTRAINT "work_commitments_conversation_id_task_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."task_conversations"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "work_commitments" ADD CONSTRAINT "work_commitments_contract_id_work_contracts_id_fk" FOREIGN KEY ("contract_id") REFERENCES "public"."work_contracts"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "work_commitments" ADD CONSTRAINT "work_commitments_buyer_user_id_users_id_fk" FOREIGN KEY ("buyer_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "work_commitments" ADD CONSTRAINT "work_commitments_provider_id_providers_id_fk" FOREIGN KEY ("provider_id") REFERENCES "public"."providers"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "work_commitments" ADD CONSTRAINT "work_commitments_provider_user_id_users_id_fk" FOREIGN KEY ("provider_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "work_commitments_task_idx" ON "work_commitments" USING btree ("task_id","created_at");--> statement-breakpoint
CREATE INDEX "work_commitments_provider_idx" ON "work_commitments" USING btree ("provider_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "work_commitments_conversation_active_unique" ON "work_commitments" USING btree ("conversation_id") WHERE "work_commitments"."status" in ('AWAITING_PROVIDER', 'AWAITING_CLIENT', 'CONFIRMED');--> statement-breakpoint
CREATE UNIQUE INDEX "work_commitments_task_confirmed_unique" ON "work_commitments" USING btree ("task_id") WHERE "work_commitments"."status" = 'CONFIRMED';--> statement-breakpoint
ALTER TABLE "commercial_agreements" ADD CONSTRAINT "commercial_agreements_work_commitment_id_work_commitments_id_fk" FOREIGN KEY ("work_commitment_id") REFERENCES "public"."work_commitments"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "commercial_agreements_commitment_unique" ON "commercial_agreements" USING btree ("work_commitment_id");