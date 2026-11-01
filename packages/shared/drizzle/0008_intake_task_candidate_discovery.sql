ALTER TYPE "provider_selection_status" ADD VALUE IF NOT EXISTS 'CANDIDATES_AVAILABLE';
--> statement-breakpoint
ALTER TABLE "tasks"
  ADD COLUMN "source_intake_session_id" varchar(64)
  REFERENCES "intake_sessions"("id") ON DELETE SET NULL;
--> statement-breakpoint
CREATE UNIQUE INDEX "tasks_source_intake_unique"
  ON "tasks" ("source_intake_session_id");
