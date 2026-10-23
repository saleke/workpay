import { desc } from "drizzle-orm";
import { getDb, jsonError, jsonOk, resolveActor } from "@/lib/server/api";
import { events } from "@workpay/shared/db/schema/infra";
import { users } from "@workpay/shared/db/schema/identity";
import { describeEvent } from "@workpay/shared/domain";
import type { ActivityEntryDto } from "@/lib/api/types";

export async function GET(req: Request) {
  try {
    const db = getDb();
    const viewer = resolveActor(req, "buyer");

    const [rows, userRows] = await Promise.all([
      db.select().from(events).orderBy(desc(events.occurredAt)).limit(50),
      db.select({ id: users.id, name: users.name, role: users.role }).from(users),
    ]);

    const userMap = new Map(userRows.map((u) => [u.id, u]));

    const data: ActivityEntryDto[] = rows.map((r) => {
      const isSelf = Boolean(viewer.id && r.actorId && viewer.id === r.actorId);
      const user = r.actorId ? userMap.get(r.actorId) : null;

      let actorName = user?.name || null;
      if (!actorName && r.actorId) {
        if (r.actorId.includes("alice")) actorName = "Alice";
        else if (r.actorId.includes("bob")) actorName = "Bob";
        else if (r.actorId.includes("carol")) actorName = "Carol";
      }

      let actorRoleTitle = "Task Owner";
      if (user?.role === "provider") {
        actorRoleTitle = "Specialist";
      } else if (r.actorType === "REVIEWER" || user?.role === "admin_reviewer") {
        actorRoleTitle = "Arbitrator";
      } else if (r.actorType === "AGENT") {
        actorRoleTitle = "Autonomous Agent";
        actorName = "WorkPay Agent";
      } else if (r.actorType === "SYSTEM" || r.actorType === "PAYPAL") {
        actorRoleTitle = "Platform Engine";
        actorName = "WorkPay Platform";
      }

      const { title, description } = describeEvent(r.type, r.payload, {
        isSelf,
        actorType: r.actorType,
        actorId: r.actorId,
        actorName,
        actorRoleTitle,
      });

      return {
        id: r.id,
        type: r.type,
        occurredAt: r.occurredAt.toISOString(),
        actorType: r.actorType,
        actorId: r.actorId,
        actorName: isSelf ? "You" : actorName,
        actorRoleTitle,
        isSelf,
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

