CREATE TABLE "reviewer_profiles" (
  "id" varchar(64) PRIMARY KEY NOT NULL,
  "user_id" varchar(64) NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "display_name" text NOT NULL,
  "public_contact_url" text,
  "is_listed" boolean NOT NULL DEFAULT false,
  "available" boolean NOT NULL DEFAULT true,
  "summary" text NOT NULL,
  "languages" text[] NOT NULL DEFAULT ARRAY['English']::text[],
  "fee_minor" bigint,
  "currency" varchar(3) NOT NULL DEFAULT 'USD',
  "typical_turnaround_days" integer,
  "conflict_disclosure_confirmed" boolean NOT NULL DEFAULT false,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "reviewer_profiles_fee_nonnegative" CHECK ("fee_minor" IS NULL OR ("fee_minor" >= 0 AND "fee_minor" <= 9007199254740991)),
  CONSTRAINT "reviewer_profiles_currency_usd" CHECK ("currency" = 'USD'),
  CONSTRAINT "reviewer_profiles_turnaround_positive" CHECK ("typical_turnaround_days" IS NULL OR "typical_turnaround_days" > 0),
  CONSTRAINT "reviewer_profiles_listing_requires_disclosure" CHECK (NOT "is_listed" OR "conflict_disclosure_confirmed")
);
--> statement-breakpoint
CREATE UNIQUE INDEX "reviewer_profiles_user_unique" ON "reviewer_profiles" ("user_id");
--> statement-breakpoint
CREATE INDEX "reviewer_profiles_listed_available_idx" ON "reviewer_profiles" ("is_listed", "available");
--> statement-breakpoint
CREATE TABLE "reviewer_expertise" (
  "id" varchar(64) PRIMARY KEY NOT NULL,
  "profile_id" varchar(64) NOT NULL REFERENCES "reviewer_profiles"("id") ON DELETE CASCADE,
  "domain_tag" varchar(128) NOT NULL,
  "scope" text NOT NULL,
  "self_assessed_level" integer NOT NULL DEFAULT 3,
  "years_experience" integer,
  "methods" text[] NOT NULL DEFAULT ARRAY[]::text[],
  "created_at" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "reviewer_expertise_level_range" CHECK ("self_assessed_level" BETWEEN 1 AND 5),
  CONSTRAINT "reviewer_expertise_years_nonnegative" CHECK ("years_experience" IS NULL OR "years_experience" >= 0)
);
--> statement-breakpoint
CREATE UNIQUE INDEX "reviewer_expertise_profile_domain_unique" ON "reviewer_expertise" ("profile_id", "domain_tag");
--> statement-breakpoint
CREATE INDEX "reviewer_expertise_domain_idx" ON "reviewer_expertise" ("domain_tag");
--> statement-breakpoint
CREATE TABLE "reviewer_evidence" (
  "id" varchar(64) PRIMARY KEY NOT NULL,
  "profile_id" varchar(64) NOT NULL REFERENCES "reviewer_profiles"("id") ON DELETE CASCADE,
  "kind" varchar(24) NOT NULL,
  "title" text NOT NULL,
  "description" text NOT NULL,
  "url" text,
  "issuer" text,
  "provenance" varchar(24) NOT NULL DEFAULT 'REVIEWER_SUPPLIED',
  "created_at" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "reviewer_evidence_kind_valid" CHECK ("kind" IN ('PORTFOLIO', 'CREDENTIAL', 'EXPERIENCE', 'REFERENCE')),
  CONSTRAINT "reviewer_evidence_provenance_unverified" CHECK ("provenance" = 'REVIEWER_SUPPLIED')
);
--> statement-breakpoint
CREATE INDEX "reviewer_evidence_profile_idx" ON "reviewer_evidence" ("profile_id");
--> statement-breakpoint
CREATE TABLE "reviewer_conflicts" (
  "id" varchar(64) PRIMARY KEY NOT NULL,
  "profile_id" varchar(64) NOT NULL REFERENCES "reviewer_profiles"("id") ON DELETE CASCADE,
  "conflicted_user_id" varchar(64) NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "created_at" timestamptz NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE UNIQUE INDEX "reviewer_conflicts_profile_user_unique" ON "reviewer_conflicts" ("profile_id", "conflicted_user_id");
--> statement-breakpoint
CREATE INDEX "reviewer_conflicts_user_idx" ON "reviewer_conflicts" ("conflicted_user_id");
