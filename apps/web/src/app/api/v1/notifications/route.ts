import { desc, eq } from "drizzle-orm";
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
      readAt: n.readAt?.toISOString() ?? null,
      createdAt: n.createdAt.toISOString(),
    }));

    return jsonOk(data);
  } catch (err) {
    return jsonError(err);
  }
}
