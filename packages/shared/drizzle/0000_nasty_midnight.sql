CREATE TYPE "public"."actor_type" AS ENUM('USER', 'AGENT', 'PROVIDER', 'SYSTEM', 'PAYPAL', 'REVIEWER');--> statement-breakpoint
CREATE TYPE "public"."agent_action_status" AS ENUM('PROPOSED', 'VALIDATING', 'APPROVED', 'REJECTED', 'EXECUTED', 'FAILED');--> statement-breakpoint
CREATE TYPE "public"."agent_action_type" AS ENUM('CREATE_PLAN', 'REQUEST_CLARIFICATION', 'CREATE_CONTRACT', 'SELECT_PROVIDER', 'START_NEGOTIATION', 'SEND_OFFER', 'ACCEPT_OFFER', 'AUTHORIZE_PAYMENT', 'REQUEST_VERIFICATION', 'REQUEST_REVISION', 'OPEN_CASE', 'WAIT', 'COMPLETE_TASK');--> statement-breakpoint
CREATE TYPE "public"."agent_run_status" AS ENUM('RUNNING', 'WAITING', 'PAUSED', 'COMPLETED', 'FAILED');--> statement-breakpoint
CREATE TYPE "public"."aggregate_type" AS ENUM('TASK', 'WORK_SPEC', 'CONTRACT', 'PROVIDER_SELECTION', 'NEGOTIATION', 'AGREEMENT', 'PAYMENT', 'EXECUTION', 'SUBMISSION', 'VERIFICATION', 'CASE', 'AGENT', 'SYSTEM');--> statement-breakpoint
CREATE TYPE "public"."agreement_status" AS ENUM('PENDING_AUTHORIZATION', 'AUTHORIZED', 'ACTIVE', 'COMPLETED', 'CANCELLED');--> statement-breakpoint
CREATE TYPE "public"."artifact_type" AS ENUM('PRIMARY_DELIVERABLE', 'SUPPORTING_FILE', 'EVIDENCE');--> statement-breakpoint
CREATE TYPE "public"."case_author" AS ENUM('BUYER', 'PROVIDER', 'SYSTEM', 'AI_ASSISTANT', 'REVIEWER');--> statement-breakpoint
CREATE TYPE "public"."case_category" AS ENUM('VERIFICATION_UNCERTAIN', 'WORK_DISPUTE', 'CONTRACT_DISPUTE', 'SCOPE_CHANGE', 'DEADLINE_DISPUTE', 'PAYMENT_EXCEPTION', 'PAYMENT_DISPUTE', 'PROVIDER_CLAIM', 'BUYER_COMPLAINT', 'TECHNICAL_FAILURE', 'FRAUD_SUSPECTED');--> statement-breakpoint
CREATE TYPE "public"."case_opener" AS ENUM('BUYER', 'PROVIDER', 'SYSTEM', 'VERIFICATION', 'PAYMENT');--> statement-breakpoint
CREATE TYPE "public"."case_severity" AS ENUM('LOW', 'MEDIUM', 'HIGH', 'CRITICAL');--> statement-breakpoint
CREATE TYPE "public"."case_status" AS ENUM('OPEN', 'AWAITING_RESPONSE', 'UNDER_REVIEW', 'RESOLVED', 'CLOSED');--> statement-breakpoint
CREATE TYPE "public"."case_type" AS ENUM('EXCEPTION', 'DISPUTE', 'HUMAN_REVIEW');--> statement-breakpoint
CREATE TYPE "public"."clarification_status" AS ENUM('PENDING', 'ANSWERED', 'CANCELLED');--> statement-breakpoint
CREATE TYPE "public"."contract_status" AS ENUM('DRAFT', 'AWAITING_APPROVAL', 'ACTIVE', 'COMPLETED', 'CANCELLED', 'EXPIRED', 'DISPUTED');--> statement-breakpoint
CREATE TYPE "public"."event_visibility" AS ENUM('USER', 'PROVIDER', 'ADMIN', 'INTERNAL');--> statement-breakpoint
CREATE TYPE "public"."evidence_type" AS ENUM('FILE', 'ROW_RANGE', 'FIELD', 'TEXT_EXCERPT', 'METRIC', 'MODEL_OBSERVATION', 'HUMAN_NOTE');--> statement-breakpoint
CREATE TYPE "public"."execution_status" AS ENUM('ASSIGNED', 'ACCEPTED', 'IN_PROGRESS', 'SUBMITTED', 'REVISION_REQUESTED', 'COMPLETED', 'CANCELLED');--> statement-breakpoint
CREATE TYPE "public"."job_status" AS ENUM('PENDING', 'RUNNING', 'COMPLETED', 'FAILED', 'DEAD_LETTER');--> statement-breakpoint
CREATE TYPE "public"."negotiation_status" AS ENUM('INITIATED', 'OFFER_SENT', 'COUNTEROFFER_RECEIVED', 'ACCEPTED', 'REJECTED', 'EXPIRED', 'CANCELLED');--> statement-breakpoint
CREATE TYPE "public"."offer_party" AS ENUM('BUYER_AGENT', 'PROVIDER');--> statement-breakpoint
CREATE TYPE "public"."offer_status" AS ENUM('PENDING', 'ACCEPTED', 'REJECTED', 'EXPIRED', 'SUPERSEDED');--> statement-breakpoint
CREATE TYPE "public"."payment_decision_action" AS ENUM('AUTHORIZE', 'CAPTURE', 'VOID', 'REFUND');--> statement-breakpoint
CREATE TYPE "public"."payment_decision_result" AS ENUM('ALLOW', 'DENY');--> statement-breakpoint
CREATE TYPE "public"."payment_operation_action" AS ENUM('AUTHORIZE', 'CAPTURE', 'VOID', 'REFUND');--> statement-breakpoint
CREATE TYPE "public"."payment_operation_status" AS ENUM('PENDING', 'SUCCEEDED', 'FAILED', 'UNKNOWN');--> statement-breakpoint
CREATE TYPE "public"."payment_status" AS ENUM('PENDING', 'AUTHORIZATION_REQUESTED', 'AUTHORIZED', 'CAPTURE_REQUESTED', 'CAPTURED', 'VOIDED', 'REFUNDED', 'FAILED', 'UNKNOWN');--> statement-breakpoint
CREATE TYPE "public"."payment_terms_type" AS ENUM('FULL_ON_ACCEPTANCE', 'FULL_ON_VERIFICATION', 'MILESTONE_BASED', 'PARTIAL_UPFRONT');--> statement-breakpoint
CREATE TYPE "public"."policy_check_result" AS ENUM('PASS', 'FAIL', 'NOT_APPLICABLE');--> statement-breakpoint
CREATE TYPE "public"."provider_selection_status" AS ENUM('SELECTED', 'FAILED', 'EXPIRED');--> statement-breakpoint
CREATE TYPE "public"."provider_status" AS ENUM('ACTIVE', 'SUSPENDED', 'INACTIVE');--> statement-breakpoint
CREATE TYPE "public"."provider_type" AS ENUM('HUMAN', 'AGENT', 'SERVICE');--> statement-breakpoint
CREATE TYPE "public"."requirement_source" AS ENUM('USER_EXPLICIT', 'USER_CLARIFIED', 'DETERMINISTICALLY_DERIVED', 'AI_PROPOSED');--> statement-breakpoint
CREATE TYPE "public"."resolution_outcome" AS ENUM('UPHOLD_SYSTEM_DECISION', 'OVERRIDE_VERIFICATION', 'REQUIRE_REVISION', 'REQUIRE_NEW_EVIDENCE', 'AMEND_CONTRACT', 'CANCEL_TASK', 'RELEASE_PAYMENT', 'REFUND_PAYMENT', 'VOID_PAYMENT', 'NO_ACTION');--> statement-breakpoint
CREATE TYPE "public"."scope_item_type" AS ENUM('INCLUDED', 'EXCLUDED');--> statement-breakpoint
CREATE TYPE "public"."submission_status" AS ENUM('DRAFT', 'SUBMITTED', 'UNDER_REVIEW', 'REVISION_REQUESTED', 'ACCEPTED', 'REJECTED');--> statement-breakpoint
CREATE TYPE "public"."task_status" AS ENUM('DRAFT', 'CREATED', 'PLANNING', 'AWAITING_CLARIFICATION', 'CONTRACT_REVIEW', 'APPROVED', 'PROVIDER_SEARCH', 'NEGOTIATION', 'AGREEMENT_READY', 'PAYMENT_AUTHORIZATION', 'WORK_IN_PROGRESS', 'SUBMITTED', 'VERIFYING', 'REVISION_REQUIRED', 'HUMAN_REVIEW', 'PAYMENT_RELEASE', 'COMPLETED', 'CANCELLED', 'EXPIRED', 'DISPUTED');--> statement-breakpoint
CREATE TYPE "public"."user_role" AS ENUM('buyer', 'provider', 'admin_reviewer');--> statement-breakpoint
CREATE TYPE "public"."verification_method_type" AS ENUM('DETERMINISTIC', 'SEMANTIC', 'HUMAN_REVIEW');--> statement-breakpoint
CREATE TYPE "public"."verification_method_value" AS ENUM('DETERMINISTIC', 'SEMANTIC', 'HUMAN');--> statement-breakpoint
CREATE TYPE "public"."verification_outcome" AS ENUM('PASS', 'FAIL', 'UNCERTAIN');--> statement-breakpoint
CREATE TYPE "public"."verification_run_status" AS ENUM('RUNNING', 'COMPLETED', 'FAILED');--> statement-breakpoint
CREATE TABLE "accounts" (
	"user_id" varchar(64) NOT NULL,
	"type" varchar(32) NOT NULL,
	"provider" varchar(64) NOT NULL,
	"provider_account_id" varchar(255) NOT NULL,
	"refresh_token" text,
	"access_token" text,
	"expires_at" integer,
	"token_type" varchar(64),
	"scope" text,
	"id_token" text,
	"session_state" text,
	CONSTRAINT "accounts_provider_provider_account_id_pk" PRIMARY KEY("provider","provider_account_id")
);
--> statement-breakpoint
CREATE TABLE "sessions" (
	"session_token" text PRIMARY KEY NOT NULL,
	"user_id" varchar(64) NOT NULL,
	"expires" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" varchar(64) PRIMARY KEY NOT NULL,
	"name" text,
	"email" text NOT NULL,
	"email_verified" timestamp with time zone,
	"image" text,
	"role" "user_role" DEFAULT 'buyer' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "verification_tokens" (
	"identifier" text NOT NULL,
	"token" text NOT NULL,
	"expires" timestamp with time zone NOT NULL,
	CONSTRAINT "verification_tokens_identifier_token_pk" PRIMARY KEY("identifier","token")
);
--> statement-breakpoint
CREATE TABLE "clarifications" (
	"id" varchar(64) PRIMARY KEY NOT NULL,
	"task_id" varchar(64) NOT NULL,
	"work_specification_id" varchar(64),
	"question" text NOT NULL,
	"answer" text,
	"requirement_key" varchar(128),
	"status" "clarification_status" DEFAULT 'PENDING' NOT NULL,
	"answered_by" varchar(64),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"answered_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "requirements" (
	"id" varchar(64) PRIMARY KEY NOT NULL,
	"work_specification_id" varchar(64) NOT NULL,
	"task_id" varchar(64) NOT NULL,
	"key" varchar(128) NOT NULL,
	"statement" text NOT NULL,
	"source" "requirement_source" NOT NULL,
	"requires_clarification" boolean DEFAULT false NOT NULL,
	"acceptance_relevant" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "task_files" (
	"id" varchar(64) PRIMARY KEY NOT NULL,
	"task_id" varchar(64) NOT NULL,
	"filename" text NOT NULL,
	"storage_key" text NOT NULL,
	"content_type" varchar(128),
	"size_bytes" bigint DEFAULT 0 NOT NULL,
	"sha256" varchar(64),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tasks" (
	"id" varchar(64) PRIMARY KEY NOT NULL,
	"user_id" varchar(64) NOT NULL,
	"title" text NOT NULL,
	"raw_request" text NOT NULL,
	"status" "task_status" DEFAULT 'DRAFT' NOT NULL,
	"budget_minor" bigint DEFAULT 0 NOT NULL,
	"currency" varchar(3) DEFAULT 'USD' NOT NULL,
	"desired_deadline" timestamp with time zone,
	"planner_source" varchar(32),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone,
	"cancelled_at" timestamp with time zone,
	CONSTRAINT "tasks_budget_nonnegative" CHECK ("tasks"."budget_minor" >= 0),
	CONSTRAINT "tasks_currency_usd" CHECK ("tasks"."currency" = 'USD')
);
--> statement-breakpoint
CREATE TABLE "work_specifications" (
	"id" varchar(64) PRIMARY KEY NOT NULL,
	"task_id" varchar(64) NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"summary" text NOT NULL,
	"plan_source" varchar(32) NOT NULL,
	"planner_metadata" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "acceptance_rules" (
	"id" varchar(64) PRIMARY KEY NOT NULL,
	"contract_id" varchar(64) NOT NULL,
	"requirement_key" varchar(128) NOT NULL,
	"method" "verification_method_type" NOT NULL,
	"params" jsonb,
	"instructions" text,
	"position" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "approvals" (
	"id" varchar(64) PRIMARY KEY NOT NULL,
	"contract_id" varchar(64) NOT NULL,
	"approved_by" varchar(64) NOT NULL,
	"contract_hash" varchar(64) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "contract_requirements" (
	"id" varchar(64) PRIMARY KEY NOT NULL,
	"contract_id" varchar(64) NOT NULL,
	"key" varchar(128) NOT NULL,
	"statement" text NOT NULL,
	"acceptance_relevant" boolean DEFAULT true NOT NULL
);
--> statement-breakpoint
CREATE TABLE "scope_items" (
	"id" varchar(64) PRIMARY KEY NOT NULL,
	"contract_id" varchar(64) NOT NULL,
	"type" "scope_item_type" NOT NULL,
	"statement" text NOT NULL,
	"position" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "work_contracts" (
	"id" varchar(64) PRIMARY KEY NOT NULL,
	"task_id" varchar(64) NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"status" "contract_status" DEFAULT 'DRAFT' NOT NULL,
	"title" text NOT NULL,
	"summary" text NOT NULL,
	"contract_hash" varchar(64) NOT NULL,
	"budget_minor" bigint NOT NULL,
	"currency" varchar(3) DEFAULT 'USD' NOT NULL,
	"deadline" timestamp with time zone,
	"acceptance_plan" jsonb,
	"approved_by" varchar(64),
	"approved_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "contracts_budget_nonnegative" CHECK ("work_contracts"."budget_minor" >= 0)
);
--> statement-breakpoint
CREATE TABLE "provider_availability" (
	"id" varchar(64) PRIMARY KEY NOT NULL,
	"provider_id" varchar(64) NOT NULL,
	"available" boolean DEFAULT true NOT NULL,
	"capacity" integer DEFAULT 1 NOT NULL,
	"active_assignments" integer DEFAULT 0 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "provider_availability_capacity" CHECK ("provider_availability"."capacity" >= 0 and "provider_availability"."active_assignments" >= 0)
);
--> statement-breakpoint
CREATE TABLE "provider_capabilities" (
	"id" varchar(64) PRIMARY KEY NOT NULL,
	"provider_id" varchar(64) NOT NULL,
	"tag" varchar(128) NOT NULL,
	"proficiency" integer DEFAULT 3 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "provider_selections" (
	"id" varchar(64) PRIMARY KEY NOT NULL,
	"task_id" varchar(64) NOT NULL,
	"contract_id" varchar(64) NOT NULL,
	"provider_id" varchar(64),
	"status" "provider_selection_status" DEFAULT 'SELECTED' NOT NULL,
	"candidates" jsonb,
	"reason" text,
	"algorithm_version" varchar(32) DEFAULT 'v1' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "providers" (
	"id" varchar(64) PRIMARY KEY NOT NULL,
	"display_name" text NOT NULL,
	"type" "provider_type" NOT NULL,
	"status" "provider_status" DEFAULT 'ACTIVE' NOT NULL,
	"bio" text,
	"hourly_rate_minor" bigint,
	"currency" varchar(3) DEFAULT 'USD' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "providers_rate_nonnegative" CHECK ("providers"."hourly_rate_minor" is null or "providers"."hourly_rate_minor" >= 0)
);
--> statement-breakpoint
CREATE TABLE "provider_reputation_snapshots" (
	"id" varchar(64) PRIMARY KEY NOT NULL,
	"provider_id" varchar(64) NOT NULL,
	"completed_tasks" integer DEFAULT 0 NOT NULL,
	"on_time_rate_pct" numeric(5, 2),
	"first_pass_acceptance_pct" numeric(5, 2),
	"avg_settlement_minor" bigint,
	"captured_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "commercial_agreements" (
	"id" varchar(64) PRIMARY KEY NOT NULL,
	"task_id" varchar(64) NOT NULL,
	"contract_id" varchar(64) NOT NULL,
	"negotiation_id" varchar(64) NOT NULL,
	"provider_id" varchar(64) NOT NULL,
	"contract_version" integer NOT NULL,
	"status" "agreement_status" DEFAULT 'PENDING_AUTHORIZATION' NOT NULL,
	"agreed_price_minor" bigint NOT NULL,
	"currency" varchar(3) DEFAULT 'USD' NOT NULL,
	"delivery_deadline" timestamp with time zone NOT NULL,
	"payment_terms" "payment_terms_type" DEFAULT 'FULL_ON_ACCEPTANCE' NOT NULL,
	"agreement_hash" varchar(64) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "commercial_agreements_price_nonnegative" CHECK ("commercial_agreements"."agreed_price_minor" >= 0)
);
--> statement-breakpoint
CREATE TABLE "negotiations" (
	"id" varchar(64) PRIMARY KEY NOT NULL,
	"task_id" varchar(64) NOT NULL,
	"contract_id" varchar(64) NOT NULL,
	"provider_id" varchar(64) NOT NULL,
	"status" "negotiation_status" DEFAULT 'INITIATED' NOT NULL,
	"max_rounds" integer DEFAULT 4 NOT NULL,
	"current_round" integer DEFAULT 0 NOT NULL,
	"turn" "offer_party" DEFAULT 'BUYER_AGENT' NOT NULL,
	"accepted_offer_id" varchar(64),
	"terminal_reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "negotiations_rounds" CHECK ("negotiations"."current_round" >= 0 and "negotiations"."current_round" <= "negotiations"."max_rounds")
);
--> statement-breakpoint
CREATE TABLE "offers" (
	"id" varchar(64) PRIMARY KEY NOT NULL,
	"negotiation_id" varchar(64) NOT NULL,
	"task_id" varchar(64) NOT NULL,
	"version" integer NOT NULL,
	"submitted_by" "offer_party" NOT NULL,
	"status" "offer_status" DEFAULT 'PENDING' NOT NULL,
	"price_minor" bigint NOT NULL,
	"currency" varchar(3) DEFAULT 'USD' NOT NULL,
	"delivery_deadline" timestamp with time zone NOT NULL,
	"scope_delta" jsonb,
	"message" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"resolved_at" timestamp with time zone,
	CONSTRAINT "offers_price_nonnegative" CHECK ("offers"."price_minor" >= 0)
);
--> statement-breakpoint
CREATE TABLE "payment_commands" (
	"id" varchar(64) PRIMARY KEY NOT NULL,
	"payment_id" varchar(64) NOT NULL,
	"task_id" varchar(64) NOT NULL,
	"decision_id" varchar(64) NOT NULL,
	"amount_minor" bigint NOT NULL,
	"currency" varchar(3) DEFAULT 'USD' NOT NULL,
	"idempotency_key" varchar(128) NOT NULL,
	"consumed" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"consumed_at" timestamp with time zone,
	CONSTRAINT "payment_commands_amount_nonnegative" CHECK ("payment_commands"."amount_minor" >= 0)
);
--> statement-breakpoint
CREATE TABLE "payment_decisions" (
	"id" varchar(64) PRIMARY KEY NOT NULL,
	"payment_id" varchar(64) NOT NULL,
	"task_id" varchar(64) NOT NULL,
	"action" "payment_decision_action" NOT NULL,
	"result" "payment_decision_result" NOT NULL,
	"reason_code" varchar(128) NOT NULL,
	"policy_version" varchar(32) NOT NULL,
	"inputs_hash" varchar(64) NOT NULL,
	"detail" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "payment_operations" (
	"id" varchar(64) PRIMARY KEY NOT NULL,
	"payment_id" varchar(64) NOT NULL,
	"task_id" varchar(64) NOT NULL,
	"action" "payment_operation_action" NOT NULL,
	"status" "payment_operation_status" DEFAULT 'PENDING' NOT NULL,
	"amount_minor" bigint NOT NULL,
	"currency" varchar(3) DEFAULT 'USD' NOT NULL,
	"idempotency_key" varchar(128) NOT NULL,
	"provider_operation_id" varchar(128),
	"request_hash" varchar(64),
	"raw_response" jsonb,
	"error_code" varchar(64),
	"error_message" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "payment_operations_amount_nonnegative" CHECK ("payment_operations"."amount_minor" >= 0)
);
--> statement-breakpoint
CREATE TABLE "payment_policy_checks" (
	"id" varchar(64) PRIMARY KEY NOT NULL,
	"decision_id" varchar(64) NOT NULL,
	"check_id" varchar(128) NOT NULL,
	"result" "policy_check_result" NOT NULL,
	"message" text NOT NULL,
	"detail" jsonb,
	"position" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "payments" (
	"id" varchar(64) PRIMARY KEY NOT NULL,
	"task_id" varchar(64) NOT NULL,
	"agreement_id" varchar(64) NOT NULL,
	"amount_minor" bigint NOT NULL,
	"currency" varchar(3) DEFAULT 'USD' NOT NULL,
	"status" "payment_status" DEFAULT 'PENDING' NOT NULL,
	"provider_order_id" varchar(128),
	"provider_authorization_id" varchar(128),
	"provider_capture_id" varchar(128),
	"captured_amount_minor" bigint,
	"authorized_at" timestamp with time zone,
	"captured_at" timestamp with time zone,
	"voided_at" timestamp with time zone,
	"refunded_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "payments_amount_nonnegative" CHECK ("payments"."amount_minor" >= 0),
	CONSTRAINT "payments_captured_nonnegative" CHECK ("payments"."captured_amount_minor" is null or "payments"."captured_amount_minor" >= 0)
);
--> statement-breakpoint
CREATE TABLE "webhook_events" (
	"id" varchar(64) PRIMARY KEY NOT NULL,
	"provider" varchar(32) NOT NULL,
	"external_event_id" varchar(128) NOT NULL,
	"event_type" varchar(128) NOT NULL,
	"verified" boolean DEFAULT false NOT NULL,
	"payload" jsonb NOT NULL,
	"processed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "provider_acceptances" (
	"id" varchar(64) PRIMARY KEY NOT NULL,
	"execution_id" varchar(64) NOT NULL,
	"provider_id" varchar(64) NOT NULL,
	"accepted_contract_hash" varchar(64) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "submission_artifacts" (
	"id" varchar(64) PRIMARY KEY NOT NULL,
	"submission_id" varchar(64) NOT NULL,
	"type" "artifact_type" NOT NULL,
	"filename" text NOT NULL,
	"storage_key" text NOT NULL,
	"content_type" varchar(128),
	"size_bytes" bigint DEFAULT 0 NOT NULL,
	"sha256" varchar(64),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "submission_artifacts_size_nonnegative" CHECK ("submission_artifacts"."size_bytes" >= 0)
);
--> statement-breakpoint
CREATE TABLE "work_executions" (
	"id" varchar(64) PRIMARY KEY NOT NULL,
	"task_id" varchar(64) NOT NULL,
	"contract_id" varchar(64) NOT NULL,
	"agreement_id" varchar(64) NOT NULL,
	"provider_id" varchar(64) NOT NULL,
	"status" "execution_status" DEFAULT 'ASSIGNED' NOT NULL,
	"contract_version" integer NOT NULL,
	"contract_hash" varchar(64) NOT NULL,
	"started_at" timestamp with time zone,
	"submitted_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "work_submissions" (
	"id" varchar(64) PRIMARY KEY NOT NULL,
	"execution_id" varchar(64) NOT NULL,
	"task_id" varchar(64) NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"status" "submission_status" DEFAULT 'DRAFT' NOT NULL,
	"contract_version" integer NOT NULL,
	"contract_hash" varchar(64) NOT NULL,
	"submission_hash" varchar(64),
	"notes" text,
	"summary" jsonb,
	"submitted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "acceptance_decisions" (
	"id" varchar(64) PRIMARY KEY NOT NULL,
	"task_id" varchar(64) NOT NULL,
	"submission_id" varchar(64) NOT NULL,
	"verification_run_id" varchar(64) NOT NULL,
	"contract_id" varchar(64) NOT NULL,
	"contract_version" integer NOT NULL,
	"contract_hash" varchar(64) NOT NULL,
	"outcome" "verification_outcome" NOT NULL,
	"has_deterministic_failure" boolean DEFAULT false NOT NULL,
	"explanation" text NOT NULL,
	"reviewed_by" varchar(64),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "evidence" (
	"id" varchar(64) PRIMARY KEY NOT NULL,
	"task_id" varchar(64) NOT NULL,
	"verification_run_id" varchar(64),
	"verification_result_id" varchar(64),
	"type" "evidence_type" NOT NULL,
	"description" text NOT NULL,
	"payload" jsonb,
	"storage_key" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "verification_results" (
	"id" varchar(64) PRIMARY KEY NOT NULL,
	"verification_run_id" varchar(64) NOT NULL,
	"requirement_key" varchar(128) NOT NULL,
	"method" "verification_method_value" NOT NULL,
	"outcome" "verification_outcome" NOT NULL,
	"confidence" numeric(5, 4),
	"rationale" text NOT NULL,
	"detail" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "verification_runs" (
	"id" varchar(64) PRIMARY KEY NOT NULL,
	"task_id" varchar(64) NOT NULL,
	"submission_id" varchar(64) NOT NULL,
	"contract_id" varchar(64) NOT NULL,
	"contract_version" integer NOT NULL,
	"contract_hash" varchar(64) NOT NULL,
	"status" "verification_run_status" DEFAULT 'RUNNING' NOT NULL,
	"outcome" "verification_outcome",
	"passed_count" integer DEFAULT 0 NOT NULL,
	"failed_count" integer DEFAULT 0 NOT NULL,
	"uncertain_count" integer DEFAULT 0 NOT NULL,
	"summary" text,
	"run_metadata" jsonb,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "case_events" (
	"id" varchar(64) PRIMARY KEY NOT NULL,
	"case_id" varchar(64) NOT NULL,
	"type" varchar(64) NOT NULL,
	"actor_type" varchar(32) NOT NULL,
	"actor_id" varchar(64),
	"detail" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "case_impacts" (
	"id" varchar(64) PRIMARY KEY NOT NULL,
	"case_id" varchar(64) NOT NULL,
	"target_type" varchar(32) NOT NULL,
	"target_id" varchar(64) NOT NULL,
	"impact" varchar(64) NOT NULL,
	"detail" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "case_messages" (
	"id" varchar(64) PRIMARY KEY NOT NULL,
	"case_id" varchar(64) NOT NULL,
	"author" "case_author" NOT NULL,
	"author_id" varchar(64),
	"body" text NOT NULL,
	"evidence_id" varchar(64),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "cases" (
	"id" varchar(64) PRIMARY KEY NOT NULL,
	"task_id" varchar(64) NOT NULL,
	"type" "case_type" NOT NULL,
	"category" "case_category" NOT NULL,
	"status" "case_status" DEFAULT 'OPEN' NOT NULL,
	"severity" "case_severity" DEFAULT 'MEDIUM' NOT NULL,
	"opened_by" "case_opener" NOT NULL,
	"title" text NOT NULL,
	"description" text NOT NULL,
	"blocks_payment_capture" boolean DEFAULT false NOT NULL,
	"payment_id" varchar(64),
	"subject_type" varchar(32),
	"subject_id" varchar(64),
	"opened_at" timestamp with time zone DEFAULT now() NOT NULL,
	"resolved_at" timestamp with time zone,
	"closed_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "resolutions" (
	"id" varchar(64) PRIMARY KEY NOT NULL,
	"case_id" varchar(64) NOT NULL,
	"outcome" "resolution_outcome" NOT NULL,
	"rationale" text NOT NULL,
	"resolved_by" varchar(64),
	"requires_reverification" boolean DEFAULT false NOT NULL,
	"detail" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "agent_actions" (
	"id" varchar(64) PRIMARY KEY NOT NULL,
	"agent_run_id" varchar(64) NOT NULL,
	"task_id" varchar(64) NOT NULL,
	"sequence" integer NOT NULL,
	"action_type" "agent_action_type" NOT NULL,
	"status" "agent_action_status" DEFAULT 'PROPOSED' NOT NULL,
	"proposal" jsonb,
	"authority_allowed" boolean,
	"authority_reason" varchar(128),
	"result" jsonb,
	"reason_code" varchar(128),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"executed_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "agent_runs" (
	"id" varchar(64) PRIMARY KEY NOT NULL,
	"task_id" varchar(64) NOT NULL,
	"status" "agent_run_status" DEFAULT 'RUNNING' NOT NULL,
	"goal" text NOT NULL,
	"phase" varchar(64) DEFAULT 'INIT' NOT NULL,
	"max_steps" integer DEFAULT 40 NOT NULL,
	"step_count" integer DEFAULT 0 NOT NULL,
	"authority_version" varchar(32) DEFAULT 'v1' NOT NULL,
	"last_error" text,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"finished_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "audit_records" (
	"id" varchar(64) PRIMARY KEY NOT NULL,
	"actor_type" "actor_type" NOT NULL,
	"actor_id" varchar(64),
	"action" varchar(128) NOT NULL,
	"target_type" varchar(64) NOT NULL,
	"target_id" varchar(64) NOT NULL,
	"task_id" varchar(64),
	"correlation_id" varchar(64),
	"detail" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "events" (
	"id" varchar(64) PRIMARY KEY NOT NULL,
	"type" varchar(128) NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"aggregate_type" "aggregate_type" NOT NULL,
	"aggregate_id" varchar(64) NOT NULL,
	"task_id" varchar(64) NOT NULL,
	"actor_type" "actor_type" NOT NULL,
	"actor_id" varchar(64),
	"correlation_id" varchar(64) NOT NULL,
	"causation_id" varchar(64),
	"visibility" "event_visibility" DEFAULT 'USER' NOT NULL,
	"payload" jsonb NOT NULL,
	"occurred_at" timestamp with time zone NOT NULL,
	"recorded_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "idempotency_records" (
	"id" varchar(64) PRIMARY KEY NOT NULL,
	"scope" varchar(128) NOT NULL,
	"idempotency_key" varchar(255) NOT NULL,
	"request_hash" varchar(64) NOT NULL,
	"resource_type" varchar(64),
	"resource_id" varchar(64),
	"response_status" integer,
	"response_body" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "jobs" (
	"id" varchar(64) PRIMARY KEY NOT NULL,
	"queue" varchar(64) NOT NULL,
	"task_id" varchar(64),
	"status" "job_status" DEFAULT 'PENDING' NOT NULL,
	"payload" jsonb,
	"attempts" integer DEFAULT 0 NOT NULL,
	"last_error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"started_at" timestamp with time zone,
	"completed_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "notifications" (
	"id" varchar(64) PRIMARY KEY NOT NULL,
	"user_id" varchar(64) NOT NULL,
	"task_id" varchar(64),
	"event_id" varchar(64),
	"type" varchar(64) NOT NULL,
	"title" text NOT NULL,
	"body" text,
	"href" text,
	"read_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "outbox_events" (
	"id" varchar(64) PRIMARY KEY NOT NULL,
	"event_id" varchar(64) NOT NULL,
	"event_type" varchar(128) NOT NULL,
	"aggregate_type" "aggregate_type" NOT NULL,
	"aggregate_id" varchar(64) NOT NULL,
	"task_id" varchar(64) NOT NULL,
	"status" "job_status" DEFAULT 'PENDING' NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"last_error" text,
	"available_at" timestamp with time zone DEFAULT now() NOT NULL,
	"published_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "outbox_events_attempts_nonnegative" CHECK ("outbox_events"."attempts" >= 0)
);
--> statement-breakpoint
CREATE TABLE "processed_events" (
	"consumer_name" varchar(128) NOT NULL,
	"event_id" varchar(64) NOT NULL,
	"processed_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "processed_events_consumer_name_event_id_pk" PRIMARY KEY("consumer_name","event_id")
);
--> statement-breakpoint
ALTER TABLE "accounts" ADD CONSTRAINT "accounts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "clarifications" ADD CONSTRAINT "clarifications_task_id_tasks_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."tasks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "clarifications" ADD CONSTRAINT "clarifications_work_specification_id_work_specifications_id_fk" FOREIGN KEY ("work_specification_id") REFERENCES "public"."work_specifications"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "clarifications" ADD CONSTRAINT "clarifications_answered_by_users_id_fk" FOREIGN KEY ("answered_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "requirements" ADD CONSTRAINT "requirements_work_specification_id_work_specifications_id_fk" FOREIGN KEY ("work_specification_id") REFERENCES "public"."work_specifications"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "requirements" ADD CONSTRAINT "requirements_task_id_tasks_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."tasks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task_files" ADD CONSTRAINT "task_files_task_id_tasks_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."tasks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "work_specifications" ADD CONSTRAINT "work_specifications_task_id_tasks_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."tasks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "acceptance_rules" ADD CONSTRAINT "acceptance_rules_contract_id_work_contracts_id_fk" FOREIGN KEY ("contract_id") REFERENCES "public"."work_contracts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "approvals" ADD CONSTRAINT "approvals_contract_id_work_contracts_id_fk" FOREIGN KEY ("contract_id") REFERENCES "public"."work_contracts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "approvals" ADD CONSTRAINT "approvals_approved_by_users_id_fk" FOREIGN KEY ("approved_by") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contract_requirements" ADD CONSTRAINT "contract_requirements_contract_id_work_contracts_id_fk" FOREIGN KEY ("contract_id") REFERENCES "public"."work_contracts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scope_items" ADD CONSTRAINT "scope_items_contract_id_work_contracts_id_fk" FOREIGN KEY ("contract_id") REFERENCES "public"."work_contracts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "work_contracts" ADD CONSTRAINT "work_contracts_task_id_tasks_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."tasks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "work_contracts" ADD CONSTRAINT "work_contracts_approved_by_users_id_fk" FOREIGN KEY ("approved_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "provider_availability" ADD CONSTRAINT "provider_availability_provider_id_providers_id_fk" FOREIGN KEY ("provider_id") REFERENCES "public"."providers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "provider_capabilities" ADD CONSTRAINT "provider_capabilities_provider_id_providers_id_fk" FOREIGN KEY ("provider_id") REFERENCES "public"."providers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "provider_selections" ADD CONSTRAINT "provider_selections_contract_id_work_contracts_id_fk" FOREIGN KEY ("contract_id") REFERENCES "public"."work_contracts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "provider_selections" ADD CONSTRAINT "provider_selections_provider_id_providers_id_fk" FOREIGN KEY ("provider_id") REFERENCES "public"."providers"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "provider_reputation_snapshots" ADD CONSTRAINT "provider_reputation_snapshots_provider_id_providers_id_fk" FOREIGN KEY ("provider_id") REFERENCES "public"."providers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "commercial_agreements" ADD CONSTRAINT "commercial_agreements_task_id_tasks_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."tasks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "commercial_agreements" ADD CONSTRAINT "commercial_agreements_contract_id_work_contracts_id_fk" FOREIGN KEY ("contract_id") REFERENCES "public"."work_contracts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "commercial_agreements" ADD CONSTRAINT "commercial_agreements_negotiation_id_negotiations_id_fk" FOREIGN KEY ("negotiation_id") REFERENCES "public"."negotiations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "commercial_agreements" ADD CONSTRAINT "commercial_agreements_provider_id_providers_id_fk" FOREIGN KEY ("provider_id") REFERENCES "public"."providers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "negotiations" ADD CONSTRAINT "negotiations_task_id_tasks_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."tasks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "negotiations" ADD CONSTRAINT "negotiations_contract_id_work_contracts_id_fk" FOREIGN KEY ("contract_id") REFERENCES "public"."work_contracts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "negotiations" ADD CONSTRAINT "negotiations_provider_id_providers_id_fk" FOREIGN KEY ("provider_id") REFERENCES "public"."providers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "offers" ADD CONSTRAINT "offers_negotiation_id_negotiations_id_fk" FOREIGN KEY ("negotiation_id") REFERENCES "public"."negotiations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "offers" ADD CONSTRAINT "offers_task_id_tasks_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."tasks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_commands" ADD CONSTRAINT "payment_commands_payment_id_payments_id_fk" FOREIGN KEY ("payment_id") REFERENCES "public"."payments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_commands" ADD CONSTRAINT "payment_commands_task_id_tasks_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."tasks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_commands" ADD CONSTRAINT "payment_commands_decision_id_payment_decisions_id_fk" FOREIGN KEY ("decision_id") REFERENCES "public"."payment_decisions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_decisions" ADD CONSTRAINT "payment_decisions_payment_id_payments_id_fk" FOREIGN KEY ("payment_id") REFERENCES "public"."payments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_decisions" ADD CONSTRAINT "payment_decisions_task_id_tasks_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."tasks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_operations" ADD CONSTRAINT "payment_operations_payment_id_payments_id_fk" FOREIGN KEY ("payment_id") REFERENCES "public"."payments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_operations" ADD CONSTRAINT "payment_operations_task_id_tasks_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."tasks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_policy_checks" ADD CONSTRAINT "payment_policy_checks_decision_id_payment_decisions_id_fk" FOREIGN KEY ("decision_id") REFERENCES "public"."payment_decisions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_task_id_tasks_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."tasks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_agreement_id_commercial_agreements_id_fk" FOREIGN KEY ("agreement_id") REFERENCES "public"."commercial_agreements"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "provider_acceptances" ADD CONSTRAINT "provider_acceptances_execution_id_work_executions_id_fk" FOREIGN KEY ("execution_id") REFERENCES "public"."work_executions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "provider_acceptances" ADD CONSTRAINT "provider_acceptances_provider_id_providers_id_fk" FOREIGN KEY ("provider_id") REFERENCES "public"."providers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "submission_artifacts" ADD CONSTRAINT "submission_artifacts_submission_id_work_submissions_id_fk" FOREIGN KEY ("submission_id") REFERENCES "public"."work_submissions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "work_executions" ADD CONSTRAINT "work_executions_task_id_tasks_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."tasks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "work_executions" ADD CONSTRAINT "work_executions_contract_id_work_contracts_id_fk" FOREIGN KEY ("contract_id") REFERENCES "public"."work_contracts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "work_executions" ADD CONSTRAINT "work_executions_agreement_id_commercial_agreements_id_fk" FOREIGN KEY ("agreement_id") REFERENCES "public"."commercial_agreements"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "work_executions" ADD CONSTRAINT "work_executions_provider_id_providers_id_fk" FOREIGN KEY ("provider_id") REFERENCES "public"."providers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "work_submissions" ADD CONSTRAINT "work_submissions_execution_id_work_executions_id_fk" FOREIGN KEY ("execution_id") REFERENCES "public"."work_executions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "work_submissions" ADD CONSTRAINT "work_submissions_task_id_tasks_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."tasks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "acceptance_decisions" ADD CONSTRAINT "acceptance_decisions_task_id_tasks_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."tasks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "acceptance_decisions" ADD CONSTRAINT "acceptance_decisions_submission_id_work_submissions_id_fk" FOREIGN KEY ("submission_id") REFERENCES "public"."work_submissions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "acceptance_decisions" ADD CONSTRAINT "acceptance_decisions_verification_run_id_verification_runs_id_fk" FOREIGN KEY ("verification_run_id") REFERENCES "public"."verification_runs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "acceptance_decisions" ADD CONSTRAINT "acceptance_decisions_contract_id_work_contracts_id_fk" FOREIGN KEY ("contract_id") REFERENCES "public"."work_contracts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "evidence" ADD CONSTRAINT "evidence_task_id_tasks_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."tasks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "evidence" ADD CONSTRAINT "evidence_verification_run_id_verification_runs_id_fk" FOREIGN KEY ("verification_run_id") REFERENCES "public"."verification_runs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "evidence" ADD CONSTRAINT "evidence_verification_result_id_verification_results_id_fk" FOREIGN KEY ("verification_result_id") REFERENCES "public"."verification_results"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "verification_results" ADD CONSTRAINT "verification_results_verification_run_id_verification_runs_id_fk" FOREIGN KEY ("verification_run_id") REFERENCES "public"."verification_runs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "verification_runs" ADD CONSTRAINT "verification_runs_task_id_tasks_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."tasks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "verification_runs" ADD CONSTRAINT "verification_runs_submission_id_work_submissions_id_fk" FOREIGN KEY ("submission_id") REFERENCES "public"."work_submissions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "verification_runs" ADD CONSTRAINT "verification_runs_contract_id_work_contracts_id_fk" FOREIGN KEY ("contract_id") REFERENCES "public"."work_contracts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "case_events" ADD CONSTRAINT "case_events_case_id_cases_id_fk" FOREIGN KEY ("case_id") REFERENCES "public"."cases"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "case_impacts" ADD CONSTRAINT "case_impacts_case_id_cases_id_fk" FOREIGN KEY ("case_id") REFERENCES "public"."cases"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "case_messages" ADD CONSTRAINT "case_messages_case_id_cases_id_fk" FOREIGN KEY ("case_id") REFERENCES "public"."cases"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cases" ADD CONSTRAINT "cases_task_id_tasks_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."tasks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cases" ADD CONSTRAINT "cases_payment_id_payments_id_fk" FOREIGN KEY ("payment_id") REFERENCES "public"."payments"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "resolutions" ADD CONSTRAINT "resolutions_case_id_cases_id_fk" FOREIGN KEY ("case_id") REFERENCES "public"."cases"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_actions" ADD CONSTRAINT "agent_actions_agent_run_id_agent_runs_id_fk" FOREIGN KEY ("agent_run_id") REFERENCES "public"."agent_runs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_actions" ADD CONSTRAINT "agent_actions_task_id_tasks_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."tasks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_runs" ADD CONSTRAINT "agent_runs_task_id_tasks_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."tasks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_task_id_tasks_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."tasks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "outbox_events" ADD CONSTRAINT "outbox_events_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "users_email_unique" ON "users" USING btree ("email");--> statement-breakpoint
CREATE INDEX "users_role_idx" ON "users" USING btree ("role");--> statement-breakpoint
CREATE INDEX "clarifications_task_idx" ON "clarifications" USING btree ("task_id");--> statement-breakpoint
CREATE INDEX "clarifications_status_idx" ON "clarifications" USING btree ("status");--> statement-breakpoint
CREATE INDEX "requirements_task_idx" ON "requirements" USING btree ("task_id");--> statement-breakpoint
CREATE UNIQUE INDEX "requirements_spec_key_unique" ON "requirements" USING btree ("work_specification_id","key");--> statement-breakpoint
CREATE INDEX "task_files_task_idx" ON "task_files" USING btree ("task_id");--> statement-breakpoint
CREATE INDEX "tasks_user_idx" ON "tasks" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "tasks_status_idx" ON "tasks" USING btree ("status");--> statement-breakpoint
CREATE UNIQUE INDEX "work_specs_task_version_unique" ON "work_specifications" USING btree ("task_id","version");--> statement-breakpoint
CREATE INDEX "acceptance_rules_contract_idx" ON "acceptance_rules" USING btree ("contract_id");--> statement-breakpoint
CREATE UNIQUE INDEX "acceptance_rules_contract_req_unique" ON "acceptance_rules" USING btree ("contract_id","requirement_key");--> statement-breakpoint
CREATE UNIQUE INDEX "approvals_contract_unique" ON "approvals" USING btree ("contract_id");--> statement-breakpoint
CREATE UNIQUE INDEX "contract_requirements_key_unique" ON "contract_requirements" USING btree ("contract_id","key");--> statement-breakpoint
CREATE INDEX "scope_items_contract_idx" ON "scope_items" USING btree ("contract_id");--> statement-breakpoint
CREATE UNIQUE INDEX "work_contracts_task_version_unique" ON "work_contracts" USING btree ("task_id","version");--> statement-breakpoint
CREATE INDEX "work_contracts_status_idx" ON "work_contracts" USING btree ("status");--> statement-breakpoint
CREATE UNIQUE INDEX "availability_provider_unique" ON "provider_availability" USING btree ("provider_id");--> statement-breakpoint
CREATE UNIQUE INDEX "capabilities_unique" ON "provider_capabilities" USING btree ("provider_id","tag");--> statement-breakpoint
CREATE INDEX "provider_selections_task_idx" ON "provider_selections" USING btree ("task_id");--> statement-breakpoint
CREATE INDEX "provider_selections_contract_idx" ON "provider_selections" USING btree ("contract_id");--> statement-breakpoint
CREATE INDEX "providers_status_idx" ON "providers" USING btree ("status");--> statement-breakpoint
CREATE INDEX "providers_type_idx" ON "providers" USING btree ("type");--> statement-breakpoint
CREATE INDEX "reputation_provider_idx" ON "provider_reputation_snapshots" USING btree ("provider_id","captured_at");--> statement-breakpoint
CREATE UNIQUE INDEX "commercial_agreements_task_unique" ON "commercial_agreements" USING btree ("task_id");--> statement-breakpoint
CREATE INDEX "negotiations_task_idx" ON "negotiations" USING btree ("task_id");--> statement-breakpoint
CREATE INDEX "negotiations_contract_idx" ON "negotiations" USING btree ("contract_id");--> statement-breakpoint
CREATE UNIQUE INDEX "offers_negotiation_version_unique" ON "offers" USING btree ("negotiation_id","version");--> statement-breakpoint
CREATE UNIQUE INDEX "payment_commands_payment_unique" ON "payment_commands" USING btree ("payment_id");--> statement-breakpoint
CREATE UNIQUE INDEX "payment_commands_idempotency_unique" ON "payment_commands" USING btree ("idempotency_key");--> statement-breakpoint
CREATE INDEX "payment_decisions_payment_idx" ON "payment_decisions" USING btree ("payment_id");--> statement-breakpoint
CREATE INDEX "payment_decisions_payment_action_idx" ON "payment_decisions" USING btree ("payment_id","action");--> statement-breakpoint
CREATE INDEX "payment_operations_payment_idx" ON "payment_operations" USING btree ("payment_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "payment_operations_idempotency_unique" ON "payment_operations" USING btree ("idempotency_key");--> statement-breakpoint
CREATE UNIQUE INDEX "payment_operations_single_capture" ON "payment_operations" USING btree ("payment_id") WHERE "payment_operations"."action" = 'CAPTURE' and "payment_operations"."status" = 'SUCCEEDED';--> statement-breakpoint
CREATE INDEX "payment_policy_checks_decision_idx" ON "payment_policy_checks" USING btree ("decision_id");--> statement-breakpoint
CREATE UNIQUE INDEX "payments_task_unique" ON "payments" USING btree ("task_id");--> statement-breakpoint
CREATE INDEX "payments_status_idx" ON "payments" USING btree ("status");--> statement-breakpoint
CREATE UNIQUE INDEX "webhook_events_external_unique" ON "webhook_events" USING btree ("provider","external_event_id");--> statement-breakpoint
CREATE UNIQUE INDEX "provider_acceptances_execution_unique" ON "provider_acceptances" USING btree ("execution_id");--> statement-breakpoint
CREATE INDEX "submission_artifacts_submission_idx" ON "submission_artifacts" USING btree ("submission_id");--> statement-breakpoint
CREATE UNIQUE INDEX "work_executions_task_unique" ON "work_executions" USING btree ("task_id");--> statement-breakpoint
CREATE INDEX "work_executions_provider_status_idx" ON "work_executions" USING btree ("provider_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX "work_submissions_execution_version_unique" ON "work_submissions" USING btree ("execution_id","version");--> statement-breakpoint
CREATE INDEX "work_submissions_task_idx" ON "work_submissions" USING btree ("task_id");--> statement-breakpoint
CREATE INDEX "acceptance_decisions_task_idx" ON "acceptance_decisions" USING btree ("task_id","created_at");--> statement-breakpoint
CREATE INDEX "acceptance_decisions_submission_idx" ON "acceptance_decisions" USING btree ("submission_id");--> statement-breakpoint
CREATE INDEX "evidence_run_idx" ON "evidence" USING btree ("verification_run_id");--> statement-breakpoint
CREATE INDEX "evidence_task_idx" ON "evidence" USING btree ("task_id");--> statement-breakpoint
CREATE UNIQUE INDEX "verification_results_run_req_unique" ON "verification_results" USING btree ("verification_run_id","requirement_key");--> statement-breakpoint
CREATE INDEX "verification_runs_task_idx" ON "verification_runs" USING btree ("task_id");--> statement-breakpoint
CREATE INDEX "verification_runs_submission_idx" ON "verification_runs" USING btree ("submission_id");--> statement-breakpoint
CREATE INDEX "case_events_case_idx" ON "case_events" USING btree ("case_id","created_at");--> statement-breakpoint
CREATE INDEX "case_impacts_case_idx" ON "case_impacts" USING btree ("case_id");--> statement-breakpoint
CREATE INDEX "case_messages_case_idx" ON "case_messages" USING btree ("case_id","created_at");--> statement-breakpoint
CREATE INDEX "cases_task_idx" ON "cases" USING btree ("task_id");--> statement-breakpoint
CREATE INDEX "cases_status_idx" ON "cases" USING btree ("status");--> statement-breakpoint
CREATE INDEX "cases_blocking_idx" ON "cases" USING btree ("task_id","blocks_payment_capture");--> statement-breakpoint
CREATE UNIQUE INDEX "resolutions_case_unique" ON "resolutions" USING btree ("case_id");--> statement-breakpoint
CREATE UNIQUE INDEX "agent_actions_run_sequence_unique" ON "agent_actions" USING btree ("agent_run_id","sequence");--> statement-breakpoint
CREATE INDEX "agent_actions_task_idx" ON "agent_actions" USING btree ("task_id");--> statement-breakpoint
CREATE UNIQUE INDEX "agent_runs_task_unique" ON "agent_runs" USING btree ("task_id");--> statement-breakpoint
CREATE INDEX "agent_runs_status_idx" ON "agent_runs" USING btree ("status");--> statement-breakpoint
CREATE INDEX "audit_records_target_idx" ON "audit_records" USING btree ("target_type","target_id");--> statement-breakpoint
CREATE INDEX "audit_records_task_idx" ON "audit_records" USING btree ("task_id","created_at");--> statement-breakpoint
CREATE INDEX "events_task_idx" ON "events" USING btree ("task_id","recorded_at");--> statement-breakpoint
CREATE INDEX "events_type_idx" ON "events" USING btree ("type");--> statement-breakpoint
CREATE INDEX "events_aggregate_idx" ON "events" USING btree ("aggregate_type","aggregate_id");--> statement-breakpoint
CREATE INDEX "events_correlation_idx" ON "events" USING btree ("correlation_id");--> statement-breakpoint
CREATE UNIQUE INDEX "idempotency_records_scope_key_unique" ON "idempotency_records" USING btree ("scope","idempotency_key");--> statement-breakpoint
CREATE INDEX "jobs_queue_status_idx" ON "jobs" USING btree ("queue","status");--> statement-breakpoint
CREATE INDEX "jobs_task_idx" ON "jobs" USING btree ("task_id");--> statement-breakpoint
CREATE INDEX "notifications_user_idx" ON "notifications" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE INDEX "notifications_unread_idx" ON "notifications" USING btree ("user_id","read_at");--> statement-breakpoint
CREATE UNIQUE INDEX "notifications_event_unique" ON "notifications" USING btree ("event_id");--> statement-breakpoint
CREATE UNIQUE INDEX "outbox_events_event_unique" ON "outbox_events" USING btree ("event_id");--> statement-breakpoint
CREATE INDEX "outbox_events_pending_idx" ON "outbox_events" USING btree ("status","available_at");