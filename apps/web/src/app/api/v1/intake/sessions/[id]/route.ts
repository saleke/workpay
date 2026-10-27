import { getIntakeSession } from "@workpay/shared/domain/intake";
import { getDb, jsonError, jsonOk } from "@/lib/server/api";
import { requireIntakeBuyer } from "@/lib/server/intake-auth";

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const actor = await requireIntakeBuyer(req);
    const { id } = await params;
    const result = await getIntakeSession(getDb(), {
      sessionId: id,
      userId: actor.id,
    });

    return jsonOk({
      data: {
        sessionId: result.session.id,
        version: result.version.version,
        status: result.session.status,
        originalRequest: result.session.originalRequest,
        intake: result.version,
      },
    });
  } catch (error) {
    return jsonError(error);
  }
}
