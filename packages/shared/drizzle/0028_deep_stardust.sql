ALTER TABLE "independent_review_engagements" ADD COLUMN "brief" text;--> statement-breakpoint
UPDATE "independent_review_engagements" SET "brief" = 'Review the agreed requirements for this task and return attributable findings.' WHERE "brief" IS NULL;--> statement-breakpoint
ALTER TABLE "independent_review_engagements" ALTER COLUMN "brief" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "independent_review_engagements" ADD CONSTRAINT "independent_review_engagements_brief_nonempty" CHECK (length(trim("independent_review_engagements"."brief")) >= 20);
