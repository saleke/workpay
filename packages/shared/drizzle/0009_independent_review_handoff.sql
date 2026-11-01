CREATE TABLE "independent_review_engagements" (
  "id" varchar(64) PRIMARY KEY NOT NULL,
  "task_id" varchar(64) NOT NULL REFERENCES "tasks"("id") ON DELETE CASCADE,
  "conversation_id" varchar(64) NOT NULL REFERENCES "task_conversations"("id") ON DELETE RESTRICT,
  "contract_id" varchar(64) NOT NULL REFERENCES "work_contracts"("id") ON DELETE RESTRICT,
  "contract_version" integer NOT NULL,
  "contract_hash" varchar(64) NOT NULL,
  "buyer_user_id" varchar(64) NOT NULL REFERENCES "users"("id") ON DELETE RESTRICT,
  "provider_user_id" varchar(64) NOT NULL REFERENCES "users"("id") ON DELETE RESTRICT,
  "reviewer_user_id" varchar(64) NOT NULL REFERENCES "users"("id") ON DELETE RESTRICT,
  "proposer_user_id" varchar(64) NOT NULL REFERENCES "users"("id") ON DELETE RESTRICT,
  "requirement_keys" jsonb NOT NULL,
  "domains" jsonb NOT NULL,
  "authority" varchar(32) NOT NULL,
  "fee_minor" bigint,
  "fee_currency" varchar(3) NOT NULL DEFAULT 'USD',
  "fee_payer" varchar(16) NOT NULL,
  "status" varchar(32) NOT NULL DEFAULT 'PROPOSED',
  "buyer_accepted_at" timestamptz,
  "provider_accepted_at" timestamptz,
  "reviewer_accepted_at" timestamptz,
  "reviewer_conflict_confirmed" boolean NOT NULL DEFAULT false,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "independent_review_engagements_version_positive" CHECK ("contract_version" > 0),
  CONSTRAINT "independent_review_engagements_distinct_parties" CHECK (
    "buyer_user_id" <> "provider_user_id"
    AND "reviewer_user_id" <> "buyer_user_id"
    AND "reviewer_user_id" <> "provider_user_id"
  ),
  CONSTRAINT "independent_review_engagements_authority_check" CHECK ("authority" = 'CONTRACTUAL_ACCEPTANCE'),
  CONSTRAINT "independent_review_engagements_payer_check" CHECK ("fee_payer" IN ('BUYER', 'PROVIDER', 'SHARED', 'DIRECT')),
  CONSTRAINT "independent_review_engagements_status_check" CHECK (
    "status" IN ('PROPOSED', 'AWAITING_REVIEWER', 'ENGAGED', 'INCONCLUSIVE', 'CLOSED', 'DECLINED', 'CANCELLED')
  ),
  CONSTRAINT "independent_review_engagements_fee_nonnegative" CHECK ("fee_minor" IS NULL OR "fee_minor" >= 0)
);
--> statement-breakpoint
CREATE INDEX "independent_review_engagements_task_idx"
  ON "independent_review_engagements" ("task_id", "created_at");
--> statement-breakpoint
CREATE INDEX "independent_review_engagements_reviewer_idx"
  ON "independent_review_engagements" ("reviewer_user_id", "status");
--> statement-breakpoint
CREATE INDEX "independent_review_engagements_contract_idx"
  ON "independent_review_engagements" ("contract_id", "contract_version");
--> statement-breakpoint
CREATE UNIQUE INDEX "independent_review_engagements_active_task_unique"
  ON "independent_review_engagements" ("task_id")
  WHERE "status" IN ('PROPOSED', 'AWAITING_REVIEWER', 'ENGAGED');
--> statement-breakpoint
CREATE TABLE "independent_review_reports" (
  "id" varchar(64) PRIMARY KEY NOT NULL,
  "engagement_id" varchar(64) NOT NULL REFERENCES "independent_review_engagements"("id") ON DELETE RESTRICT,
  "task_id" varchar(64) NOT NULL REFERENCES "tasks"("id") ON DELETE CASCADE,
  "submission_id" varchar(64) NOT NULL REFERENCES "work_submissions"("id") ON DELETE RESTRICT,
  "contract_version" integer NOT NULL,
  "contract_hash" varchar(64) NOT NULL,
  "reviewer_user_id" varchar(64) NOT NULL REFERENCES "users"("id") ON DELETE RESTRICT,
  "outcome" "verification_outcome" NOT NULL,
  "rationale" text NOT NULL,
  "findings" jsonb NOT NULL,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "independent_review_reports_version_positive" CHECK ("contract_version" > 0)
);
--> statement-breakpoint
CREATE INDEX "independent_review_reports_task_idx"
  ON "independent_review_reports" ("task_id", "created_at");
--> statement-breakpoint
CREATE UNIQUE INDEX "independent_review_reports_submission_unique"
  ON "independent_review_reports" ("engagement_id", "submission_id");
