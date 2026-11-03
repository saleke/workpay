import { and, eq, inArray } from "drizzle-orm";
import { taskConversations } from "@workpay/shared/db/schema/conversations";
import { getDb, jsonError, jsonOk } from "@/lib/server/api";
import { requireProviderUser } from "@/lib/server/conversation-auth";

export async function GET(req: Request) {
  try {
    const actor = await requireProviderUser(req);
    const rows = await getDb()
      .select({ status: taskConversations.status })
      .from(taskConversations)
      .where(
        and(
          eq(taskConversations.providerUserId, actor.id),
          inArray(taskConversations.status, ["CONTACT_PENDING", "OPEN"]),
        ),
      )
      .limit(100);
    const pendingCount = rows.filter(({ status }) => status === "CONTACT_PENDING").length;
    const openCount = rows.filter(({ status }) => status === "OPEN").length;
    return jsonOk({ pendingCount, openCount, totalCount: pendingCount + openCount });
  } catch (error) {
    return jsonError(error);
  }
}
