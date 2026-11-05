CREATE TABLE "task_conversation_participants" (
	"conversation_id" varchar(64) NOT NULL,
	"user_id" varchar(64) NOT NULL,
	"last_read_sequence" integer DEFAULT 0 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "task_conversation_participants_conversation_id_user_id_pk" PRIMARY KEY("conversation_id","user_id"),
	CONSTRAINT "task_conversation_participants_read_sequence_nonnegative" CHECK ("task_conversation_participants"."last_read_sequence" >= 0)
);
--> statement-breakpoint
ALTER TABLE "task_conversation_participants" ADD CONSTRAINT "task_conversation_participants_conversation_id_task_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."task_conversations"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "task_conversation_participants" ADD CONSTRAINT "task_conversation_participants_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX "task_conversation_participants_user_idx" ON "task_conversation_participants" USING btree ("user_id","updated_at");
--> statement-breakpoint
UPDATE "notifications" AS notification
SET "href" = '/messages?conversation=' || (event."payload"->>'conversationId')
FROM "events" AS event
WHERE notification."event_id" = event."id"
	AND notification."type" IN (
		'TASK_CONVERSATION_STARTED',
		'TASK_CONVERSATION_ACCEPTED',
		'TASK_CONVERSATION_DECLINED',
		'TASK_CONVERSATION_WITHDRAWN',
		'TASK_MESSAGE_SENT'
	)
	AND event."payload"->>'conversationId' IS NOT NULL;
--> statement-breakpoint
UPDATE "notifications" AS notification
SET "href" = '/messages?conversation=' || (
	SELECT conversation."id"
	FROM "task_conversations" AS conversation
	WHERE conversation."task_id" = notification."task_id"
		AND conversation."provider_user_id" = notification."user_id"
	ORDER BY abs(extract(epoch FROM (conversation."created_at" - notification."created_at")))
	LIMIT 1
)
WHERE notification."type" = 'TASK_CONVERSATION_STARTED'
	AND notification."event_id" IS NULL
	AND EXISTS (
		SELECT 1
		FROM "task_conversations" AS conversation
		WHERE conversation."task_id" = notification."task_id"
			AND conversation."provider_user_id" = notification."user_id"
	);
--> statement-breakpoint
UPDATE "notifications" AS notification
SET "body" = 'A requester sent an approved agreement and message for “' || task."title" ||
	'”. Review the request in Messages. Starting a discussion does not assign work.'
FROM "tasks" AS task
WHERE notification."task_id" = task."id"
	AND notification."type" = 'TASK_CONVERSATION_STARTED';
