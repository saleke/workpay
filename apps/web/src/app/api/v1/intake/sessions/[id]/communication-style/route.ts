import {
  appendIntakeVersion,
  communicationStyleDecisionRequestSchema,
  getIntakeSession,
  recordCommunicationStylePreference,
} from "@workpay/shared/domain/intake";
import { getDb, jsonError, jsonOk } from "@/lib/server/api";
import { requireIntakeBuyer } from "@/lib/server/intake-auth";
import {
  assertExpectedIntakeVersion,
  parseIntakeRequest,
  toIntakeResponse,
} from "@/lib/server/intake-request";

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const actor = await requireIntakeBuyer(req);
    const body = await parseIntakeRequest(req, communicationStyleDecisionRequestSchema);
    const { id } = await params;
    const db = getDb();
    const current = await getIntakeSession(db, { sessionId: id, userId: actor.id });
    assertExpectedIntakeVersion(current, body.expectedVersion);

    const nextVersion = recordCommunicationStylePreference(current.version, body.style);
    const result = await appendIntakeVersion(db, {
      sessionId: id,
      userId: actor.id,
      expectedVersion: body.expectedVersion,
      snapshot: nextVersion,
    });
    return jsonOk({ data: toIntakeResponse(result) });
  } catch (error) {
    return jsonError(error);
  }
}
