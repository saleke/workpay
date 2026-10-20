import { asc, eq, gt } from "drizzle-orm";
import { getDb } from "@/lib/server/api";
import { events } from "@workpay/shared/db/schema/infra";

export const dynamic = "force-dynamic";

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: taskId } = await params;
  const url = new URL(req.url);
  const since = url.searchParams.get("since") || req.headers.get("last-event-id") || null;
  const db = getDb();

  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      try {
        let query = db
          .select()
          .from(events)
          .where(eq(events.taskId, taskId))
          .orderBy(asc(events.recordedAt));

        const rows = await query;

        let sinceReached = !since;
        for (const ev of rows) {
          if (!sinceReached) {
            if (ev.id === since) {
              sinceReached = true;
            }
            continue;
          }

          const message = `id: ${ev.id}\nevent: message\ndata: ${JSON.stringify({
            id: ev.id,
            type: ev.type,
            occurredAt: ev.occurredAt.toISOString(),
            payload: ev.payload,
          })}\n\n`;

          controller.enqueue(encoder.encode(message));
        }

        // Send initial ping/heartbeat and keep stream alive
        controller.enqueue(encoder.encode(`event: ping\ndata: {}\n\n`));

        const interval = setInterval(() => {
          try {
            controller.enqueue(encoder.encode(`event: ping\ndata: {}\n\n`));
          } catch {
            clearInterval(interval);
          }
        }, 15000);

        req.signal.addEventListener("abort", () => {
          clearInterval(interval);
        });
      } catch (err) {
        controller.error(err);
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}
