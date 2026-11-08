ALTER TABLE "acceptance_decisions" ADD COLUMN "submission_version" integer;--> statement-breakpoint
ALTER TABLE "acceptance_decisions" ADD COLUMN "submission_hash" varchar(64);--> statement-breakpoint
ALTER TABLE "acceptance_decisions" ADD COLUMN "review_package_id" varchar(64);