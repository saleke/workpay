import { desc } from "drizzle-orm";
import { getDb, jsonError, jsonOk } from "@/lib/server/api";
import { events } from "@workpay/shared/db/schema/infra";
import { describeEvent } from "@workpay/shared/domain";
import type { ActivityEntryDto } from "@/lib/api/types";

export async function GET(req: Request) {
  try {
    const db = getDb();

    const rows = await db
      .select()
      .from(events)
      .orderBy(desc(events.occurredAt))
      .limit(50);

    const data: ActivityEntryDto[] = rows.map((r) => {
      const { title, description } = describeEvent(r.type, r.payload);
      return {
        id: r.id,
        type: r.type,
        occurredAt: r.occurredAt.toISOString(),
        actorType: r.actorType,
        actorId: r.actorId,
        title,
        description,
        visibility: r.visibility,
      };
    });

    return jsonOk(data);
  } catch (err) {
    return jsonError(err);
  }
}
