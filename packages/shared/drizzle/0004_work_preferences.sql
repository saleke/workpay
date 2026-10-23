-- Add work_preferences JSONB column to providers table
ALTER TABLE "providers" ADD COLUMN IF NOT EXISTS "work_preferences" jsonb;
