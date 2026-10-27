import {
  appendIntakeVersion,
  assessIntakeScopeRequestSchema,
  getIntakeSession,
  recordScopeAssessment,
} from "@workpay/shared/domain/intake";
import { conflict } from "@workpay/shared/platform";
import {
  getIntakeAIClient,
  INTAKE_SCOPE_ASSESSMENT_PROMPT_VERSION,
} from "@workpay/shared/integrations/ai";
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
    const body = await parseIntakeRequest(req, assessIntakeScopeRequestSchema);
    const { id } = await params;
    const db = getDb();
    const current = await getIntakeSession(db, { sessionId: id, userId: actor.id });
    assertExpectedIntakeVersion(current, body.expectedVersion);
    if (
      current.version.interpretation === null ||
      current.version.interpretationConfirmationSourceId === null
    ) {
      throw conflict("Confirm the interpretation before assessing scope and budget.");
    }
    if (current.version.unresolvedCriticalUnknownIds.length > 0) {
      throw conflict("Answer the current scope question before reassessing the remaining scope.");
    }

    const client = getIntakeAIClient();
    const previousQuestions = (current.version.scopeAssessment?.criticalUnknowns ?? []).map(
      ({ question }) => {
        const prefix = `Answer to "${question}": `;
        const response = current.version.sources.find(
          (source) => source.kind === "user_message" && source.content.startsWith(prefix),
        );
        return {
          question,
          answer: response ? response.content.slice(prefix.length) : null,
        };
      },
    );
    const proposal = await client.assessScope({
      sources: current.version.sources,
      confirmedIntent: current.version.interpretation,
      previousQuestions,
    });
    const nextVersion = recordScopeAssessment(current.version, proposal, {
      operation: "assess_scope",
      provider: client.name,
      model: client.modelId,
      promptVersion: INTAKE_SCOPE_ASSESSMENT_PROMPT_VERSION,
      recordedAt: new Date().toISOString(),
    });
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
