import { discoverProviders } from "@workpay/shared/domain";
import { getCorrelationId, getDb, jsonError, jsonOk, withTransaction } from "@/lib/server/api";
import { requireTaskOwner } from "@/lib/server/conversation-auth";

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id: taskId } = await params;
    const { actor } = await requireTaskOwner(req, taskId);
    const selection = await withTransaction((tx) =>
      discoverProviders(tx, {
        taskId,
        buyerUserId: actor.id,
        actor,
        correlationId: getCorrelationId(req),
      }),
    );
    return jsonOk(selection, selection.status === "FAILED" ? 200 : 201);
  } catch (error) {
    return jsonError(error);
  }
}
