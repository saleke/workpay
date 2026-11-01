CREATE TYPE "task_conversation_status" AS ENUM ('CONTACT_PENDING', 'OPEN', 'DECLINED', 'CLOSED');
--> statement-breakpoint
CREATE TABLE "task_conversations" (
	"id" varchar(64) PRIMARY KEY NOT NULL,
	"task_id" varchar(64) NOT NULL,
	"buyer_user_id" varchar(64) NOT NULL,
	"provider_id" varchar(64) NOT NULL,
	"provider_user_id" varchar(64) NOT NULL,
	"status" "task_conversation_status" DEFAULT 'CONTACT_PENDING' NOT NULL,
	"message_counter" integer DEFAULT 0 NOT NULL,
	"initial_contact_message_id" varchar(64),
	"contact_approved_at" timestamp with time zone NOT NULL,
	"contact_approved_contract_version" integer NOT NULL,
	"contact_approved_contract_hash" varchar(64) NOT NULL,
	"current_contract_version" integer NOT NULL,
	"current_contract_hash" varchar(64) NOT NULL,
	"current_contract_snapshot" jsonb NOT NULL,
	"contract_snapshot" jsonb NOT NULL,
	"provider_responded_at" timestamp with time zone,
	"closed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "task_conversations_contract_version_positive" CHECK ("task_conversations"."contact_approved_contract_version" > 0),
	CONSTRAINT "task_conversations_current_contract_version_positive" CHECK ("task_conversations"."current_contract_version" > 0),
	CONSTRAINT "task_conversations_message_counter_nonnegative" CHECK ("task_conversations"."message_counter" >= 0)
);
--> statement-breakpoint
ALTER TABLE "task_conversations" ADD CONSTRAINT "task_conversations_task_id_tasks_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."tasks"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "task_conversations" ADD CONSTRAINT "task_conversations_buyer_user_id_users_id_fk" FOREIGN KEY ("buyer_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "task_conversations" ADD CONSTRAINT "task_conversations_provider_id_providers_id_fk" FOREIGN KEY ("provider_id") REFERENCES "public"."providers"("id") ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "task_conversations" ADD CONSTRAINT "task_conversations_provider_user_id_users_id_fk" FOREIGN KEY ("provider_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX "task_conversations_task_idx" ON "task_conversations" USING btree ("task_id","created_at");
--> statement-breakpoint
CREATE INDEX "task_conversations_buyer_idx" ON "task_conversations" USING btree ("buyer_user_id","created_at");
--> statement-breakpoint
CREATE INDEX "task_conversations_provider_user_idx" ON "task_conversations" USING btree ("provider_user_id","created_at");
--> statement-breakpoint
CREATE UNIQUE INDEX "task_conversations_active_provider_unique" ON "task_conversations" USING btree ("task_id","provider_id") WHERE "status" in ('CONTACT_PENDING', 'OPEN');
--> statement-breakpoint
CREATE TABLE "task_conversation_messages" (
	"id" varchar(64) PRIMARY KEY NOT NULL,
	"conversation_id" varchar(64) NOT NULL,
	"sequence" integer NOT NULL,
	"client_message_id" varchar(64) NOT NULL,
	"author_user_id" varchar(64) NOT NULL,
	"body" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "task_conversation_messages_body_nonempty" CHECK (length(trim("task_conversation_messages"."body")) > 0)
);
--> statement-breakpoint
ALTER TABLE "task_conversation_messages" ADD CONSTRAINT "task_conversation_messages_conversation_id_task_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."task_conversations"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "task_conversation_messages" ADD CONSTRAINT "task_conversation_messages_author_user_id_users_id_fk" FOREIGN KEY ("author_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
CREATE UNIQUE INDEX "task_conversation_messages_sequence_unique" ON "task_conversation_messages" USING btree ("conversation_id","sequence");
--> statement-breakpoint
CREATE UNIQUE INDEX "task_conversation_messages_client_id_unique" ON "task_conversation_messages" USING btree ("conversation_id","client_message_id");
--> statement-breakpoint
CREATE INDEX "task_conversation_messages_list_idx" ON "task_conversation_messages" USING btree ("conversation_id","sequence");
--> statement-breakpoint
ALTER TABLE "commercial_agreements" ALTER COLUMN "negotiation_id" DROP NOT NULL;
--> statement-breakpoint
ALTER TABLE "commercial_agreements" ALTER COLUMN "delivery_deadline" DROP NOT NULL;
--> statement-breakpoint
ALTER TABLE "commercial_agreements" ADD COLUMN "source_conversation_id" varchar(64);
--> statement-breakpoint
ALTER TABLE "commercial_agreements" ADD CONSTRAINT "commercial_agreements_source_conversation_id_task_conversations_id_fk" FOREIGN KEY ("source_conversation_id") REFERENCES "public"."task_conversations"("id") ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
CREATE TABLE "contract_change_requests" (
	"id" varchar(64) PRIMARY KEY NOT NULL,
	"task_id" varchar(64) NOT NULL,
	"conversation_id" varchar(64) NOT NULL,
	"base_contract_id" varchar(64) NOT NULL,
	"base_contract_version" integer NOT NULL,
	"base_contract_hash" varchar(64) NOT NULL,
	"proposer_user_id" varchar(64) NOT NULL,
	"respondent_user_id" varchar(64) NOT NULL,
	"reason" text NOT NULL,
	"proposed_terms" jsonb NOT NULL,
	"proposed_terms_hash" varchar(64) NOT NULL,
	"proposed_contract_hash" varchar(64) NOT NULL,
	"proposed_budget_minor" bigint NOT NULL,
	"proposed_agreed_price_minor" bigint,
	"currency" varchar(3) NOT NULL,
	"payment_adjustment_plan" jsonb,
	"base_agreement_snapshot" jsonb,
	"activated_contract_id" varchar(64),
	"activated_at" timestamp with time zone,
	"status" varchar(40) DEFAULT 'PROPOSED' NOT NULL,
	"response_note" text,
	"cancellation_requested_by" varchar(64),
	"responded_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "contract_change_requests_status_check" CHECK ("contract_change_requests"."status" in ('PROPOSED', 'ACCEPTED_PENDING_ACTIVATION', 'ACTIVATING', 'ACTIVATION_FAILED', 'ACTIVATION_RECONCILIATION_REQUIRED', 'CANCELLATION_PENDING', 'ACTIVATED', 'DECLINED', 'WITHDRAWN', 'CANCELLED')),
	CONSTRAINT "contract_change_requests_version_positive" CHECK ("contract_change_requests"."base_contract_version" > 0),
	CONSTRAINT "contract_change_requests_budget_nonnegative" CHECK ("contract_change_requests"."proposed_budget_minor" >= 0),
	CONSTRAINT "contract_change_requests_currency_check" CHECK ("contract_change_requests"."currency" ~ '^[A-Z]{3}$'),
	CONSTRAINT "contract_change_requests_distinct_parties" CHECK ("contract_change_requests"."proposer_user_id" <> "contract_change_requests"."respondent_user_id")
);
--> statement-breakpoint
ALTER TABLE "contract_change_requests" ADD CONSTRAINT "contract_change_requests_task_id_tasks_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."tasks"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "contract_change_requests" ADD CONSTRAINT "contract_change_requests_conversation_id_task_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."task_conversations"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "contract_change_requests" ADD CONSTRAINT "contract_change_requests_base_contract_id_work_contracts_id_fk" FOREIGN KEY ("base_contract_id") REFERENCES "public"."work_contracts"("id") ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "contract_change_requests" ADD CONSTRAINT "contract_change_requests_proposer_user_id_users_id_fk" FOREIGN KEY ("proposer_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "contract_change_requests" ADD CONSTRAINT "contract_change_requests_respondent_user_id_users_id_fk" FOREIGN KEY ("respondent_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "contract_change_requests" ADD CONSTRAINT "contract_change_requests_cancellation_requested_by_users_id_fk" FOREIGN KEY ("cancellation_requested_by") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "contract_change_requests" ADD CONSTRAINT "contract_change_requests_activated_contract_id_work_contracts_id_fk" FOREIGN KEY ("activated_contract_id") REFERENCES "public"."work_contracts"("id") ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX "contract_change_requests_conversation_idx" ON "contract_change_requests" USING btree ("conversation_id","created_at");
--> statement-breakpoint
CREATE INDEX "contract_change_requests_task_idx" ON "contract_change_requests" USING btree ("task_id","created_at");
--> statement-breakpoint
CREATE UNIQUE INDEX "contract_change_requests_one_unresolved_per_task" ON "contract_change_requests" USING btree ("task_id") WHERE "contract_change_requests"."status" in ('PROPOSED', 'ACCEPTED_PENDING_ACTIVATION', 'ACTIVATING', 'ACTIVATION_RECONCILIATION_REQUIRED', 'CANCELLATION_PENDING');
