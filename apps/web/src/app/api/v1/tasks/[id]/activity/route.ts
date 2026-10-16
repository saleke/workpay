import { getDb, jsonError, jsonOk } from "@/lib/server/api";
import { getTaskActivity } from "@workpay/shared/domain";
import type { ActivityEntryDto } from "@/lib/api/types";

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id: taskId } = await params;
    const db = getDb();
    const rows = await getTaskActivity(db, taskId);

    const data: ActivityEntryDto[] = rows.map((r) => ({
      id: r.id,
      type: r.type,
      occurredAt: r.occurredAt,
      actorType: r.actorType,
      actorId: r.actorId,
      title: r.title,
      description: r.description,
      visibility: r.visibility,
    }));

    return jsonOk(data);
  } catch (err) {
    return jsonError(err);
  }
}
