import {
  appendIntakeVersion,
  composeProfessionalBriefRequestSchema,
  evaluateIntakeReadiness,
  getIntakeSession,
  recordProfessionalBriefProposal,
} from "@workpay/shared/domain/intake";
import { conflict } from "@workpay/shared/platform";
import { getDb, jsonError, jsonOk } from "@/lib/server/api";
import { requireIntakeBuyer } from "@/lib/server/intake-auth";
import { composeProfessionalBriefProposal } from "@/lib/server/professional-brief";
import {
  assertExpectedIntakeVersion,
  parseIntakeRequest,
  toIntakeResponse,
} from "@/lib/server/intake-request";

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const actor = await requireIntakeBuyer(req);
    const body = await parseIntakeRequest(req, composeProfessionalBriefRequestSchema);
    const { id } = await params;
    const db = getDb();
    const current = await getIntakeSession(db, { sessionId: id, userId: actor.id });
    assertExpectedIntakeVersion(current, body.expectedVersion);
    if (!evaluateIntakeReadiness(current.version).ready) {
      throw conflict(
        "Complete and confirm the intake details before composing a professional brief.",
      );
    }

    const { proposal, operation } = await composeProfessionalBriefProposal(current.version);
    const snapshot = recordProfessionalBriefProposal(current.version, proposal, operation);
    const result = await appendIntakeVersion(db, {
      sessionId: id,
      userId: actor.id,
      expectedVersion: body.expectedVersion,
      snapshot,
    });
    return jsonOk({ data: toIntakeResponse(result) });
  } catch (error) {
    return jsonError(error);
  }
}
