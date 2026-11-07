CREATE TABLE "task_conversation_attachments" (
	"id" varchar(64) PRIMARY KEY NOT NULL,
	"conversation_id" varchar(64) NOT NULL,
	"message_id" varchar(64) NOT NULL,
	"uploader_user_id" varchar(64) NOT NULL,
	"kind" varchar(16) NOT NULL,
	"filename" varchar(255) NOT NULL,
	"storage_key" varchar(512) NOT NULL,
	"content_type" varchar(255) NOT NULL,
	"size_bytes" integer NOT NULL,
	"sha256" varchar(64) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "task_conversation_attachments_storage_key_unique" UNIQUE("storage_key"),
	CONSTRAINT "task_conversation_attachments_kind_check" CHECK ("task_conversation_attachments"."kind" in ('AUDIO', 'FILE')),
	CONSTRAINT "task_conversation_attachments_size_check" CHECK ("task_conversation_attachments"."size_bytes" > 0 and "task_conversation_attachments"."size_bytes" <= 10485760)
);
--> statement-breakpoint
ALTER TABLE "task_conversation_attachments" ADD CONSTRAINT "task_conversation_attachments_conversation_id_task_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."task_conversations"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "task_conversation_attachments" ADD CONSTRAINT "task_conversation_attachments_message_id_task_conversation_messages_id_fk" FOREIGN KEY ("message_id") REFERENCES "public"."task_conversation_messages"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "task_conversation_attachments" ADD CONSTRAINT "task_conversation_attachments_uploader_user_id_users_id_fk" FOREIGN KEY ("uploader_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX "task_conversation_attachments_message_idx" ON "task_conversation_attachments" USING btree ("message_id");
--> statement-breakpoint
CREATE INDEX "task_conversation_attachments_conversation_idx" ON "task_conversation_attachments" USING btree ("conversation_id", "created_at");
