import { and, desc, eq, isNull } from "drizzle-orm";
import { getDb, jsonError, jsonOk, resolveActor } from "@/lib/server/api";
import { notifications } from "@workpay/shared/db/schema/infra";
import type { NotificationDto } from "@/lib/api/types";

export async function GET(req: Request) {
  try {
    const actor = resolveActor(req, "buyer");
    const db = getDb();

    const rows = await db
      .select()
      .from(notifications)
      .where(eq(notifications.userId, actor.id as string))
      .orderBy(desc(notifications.createdAt))
      .limit(30);

    const data: NotificationDto[] = rows.map((n) => ({
      id: n.id,
      taskId: n.taskId,
      type: n.type,
      title: n.title,
      body: n.body ?? "",
      href: n.href ?? (n.taskId ? `/tasks/${n.taskId}` : null),
      readAt: n.readAt?.toISOString() ?? null,
      createdAt: n.createdAt.toISOString(),
    }));

    return jsonOk(data);
  } catch (err) {
    return jsonError(err);
  }
}

export async function PATCH(req: Request) {
  try {
    const actor = resolveActor(req, "buyer");
    const db = getDb();
    const body = (await req.json().catch(() => ({}))) as {
      id?: string;
      markAllRead?: boolean;
    };

    const now = new Date();

    if (body.markAllRead) {
      await db
        .update(notifications)
        .set({ readAt: now })
        .where(
          and(
            eq(notifications.userId, actor.id as string),
            isNull(notifications.readAt),
          ),
        );
      return jsonOk({ ok: true, markedAll: true });
    }

    if (body.id) {
      await db
        .update(notifications)
        .set({ readAt: now })
        .where(
          and(
            eq(notifications.id, body.id),
            eq(notifications.userId, actor.id as string),
          ),
        );
      return jsonOk({ ok: true, id: body.id });
    }

    return jsonOk({ ok: true });
  } catch (err) {
    return jsonError(err);
  }
}
