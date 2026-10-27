import { getIntakeSession } from "@workpay/shared/domain/intake";
import { getDb, jsonError, jsonOk } from "@/lib/server/api";
import { requireIntakeBuyer } from "@/lib/server/intake-auth";
import { toIntakeResponse } from "@/lib/server/intake-request";

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const actor = await requireIntakeBuyer(req);
    const { id } = await params;
    const result = await getIntakeSession(getDb(), {
      sessionId: id,
      userId: actor.id,
    });

    return jsonOk({ data: toIntakeResponse(result) });
  } catch (error) {
    return jsonError(error);
  }
}
