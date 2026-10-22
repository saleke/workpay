-- Add user_id reference and payout_email destination to providers table
ALTER TABLE "providers" ADD COLUMN IF NOT EXISTS "user_id" varchar(64) REFERENCES "users"("id") ON DELETE CASCADE;
ALTER TABLE "providers" ADD COLUMN IF NOT EXISTS "payout_email" text;
CREATE UNIQUE INDEX IF NOT EXISTS "providers_user_id_unique" ON "providers" ("user_id");
