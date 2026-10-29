import {
  appendIntakeVersion,
  composeProfessionalBriefRequestSchema,
  evaluateIntakeReadiness,
  getIntakeSession,
  recordProfessionalBriefProposal,
} from "@workpay/shared/domain/intake";
import {
  getIntakeAIClient,
  INTAKE_PROFESSIONAL_BRIEF_PROMPT_VERSION,
} from "@workpay/shared/integrations/ai";
import { conflict } from "@workpay/shared/platform";
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

    const { interpretation, scopeAssessment } = current.version;
    if (!interpretation || !scopeAssessment) {
      throw conflict(
        "Confirm the task interpretation and assess its scope before composing a brief.",
      );
    }
    const client = getIntakeAIClient();
    const proposal = await client.composeProfessionalBrief({
      sources: current.version.sources,
      confirmedIntent: interpretation,
      clarificationAnswers: current.version.clarificationAnswers.map(({ question, answer }) => ({
        question,
        answer,
      })),
      budget: current.version.budget.meaning,
    });
    const snapshot = recordProfessionalBriefProposal(current.version, proposal, {
      operation: "compose_professional_brief",
      provider: client.name,
      model: client.modelId,
      promptVersion: INTAKE_PROFESSIONAL_BRIEF_PROMPT_VERSION,
      recordedAt: new Date().toISOString(),
    });
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
