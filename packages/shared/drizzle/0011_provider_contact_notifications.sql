INSERT INTO "notifications" (
  "id",
  "user_id",
  "task_id",
  "event_id",
  "type",
  "title",
  "body",
  "href",
  "created_at"
)
SELECT
  'notif_backfill_' || substr(md5(conversation."id" || ':provider-contact'), 1, 32),
  conversation."provider_user_id",
  conversation."task_id",
  contact_event."id",
  'TASK_CONVERSATION_STARTED',
  'New buyer contact request',
  'A requester sent an approved agreement and message for “' || task."title" || '”. Review it in Work Studio and accept or decline.',
  '/provider',
  conversation."created_at"
FROM "task_conversations" conversation
INNER JOIN "tasks" task ON task."id" = conversation."task_id"
LEFT JOIN LATERAL (
  SELECT event."id"
  FROM "events" event
  WHERE event."type" = 'TASK_CONVERSATION_STARTED'
    AND event."payload"->>'conversationId' = conversation."id"
  ORDER BY event."occurred_at" ASC
  LIMIT 1
) contact_event ON true
WHERE conversation."status" IN ('CONTACT_PENDING', 'OPEN')
  AND NOT EXISTS (
    SELECT 1
    FROM "notifications" existing
    WHERE existing."user_id" = conversation."provider_user_id"
      AND existing."task_id" = conversation."task_id"
      AND existing."type" = 'TASK_CONVERSATION_STARTED'
  )
ON CONFLICT DO NOTHING;
