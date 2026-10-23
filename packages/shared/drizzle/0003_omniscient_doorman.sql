ALTER TABLE "providers" ALTER COLUMN "type" SET DEFAULT 'HUMAN';--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "password_hash" text;--> statement-breakpoint
ALTER TABLE "providers" ADD COLUMN IF NOT EXISTS "user_id" varchar(64);--> statement-breakpoint
ALTER TABLE "providers" ADD COLUMN IF NOT EXISTS "payout_email" text;--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "providers" ADD CONSTRAINT "providers_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "providers_user_id_unique" ON "providers" USING btree ("user_id");