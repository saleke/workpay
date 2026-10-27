import {
  appendIntakeVersion,
  getIntakeSession,
  recordAnswerOptionSuggestions,
  resolveIntakeCommunicationStyle,
  suggestAnswerOptionsRequestSchema,
} from "@workpay/shared/domain/intake";
import { conflict } from "@workpay/shared/platform";
import {
  getIntakeAIClient,
  INTAKE_ANSWER_OPTIONS_PROMPT_VERSION,
} from "@workpay/shared/integrations/ai";
import { getDb, jsonError, jsonOk } from "@/lib/server/api";
import { requireIntakeBuyer } from "@/lib/server/intake-auth";
import {
  assertExpectedIntakeVersion,
  parseIntakeRequest,
  toIntakeResponse,
} from "@/lib/server/intake-request";

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string; unknownId: string }> },
) {
  try {
    const actor = await requireIntakeBuyer(req);
    const body = await parseIntakeRequest(req, suggestAnswerOptionsRequestSchema);
    const { id, unknownId } = await params;
    const db = getDb();
    const current = await getIntakeSession(db, { sessionId: id, userId: actor.id });
    assertExpectedIntakeVersion(current, body.expectedVersion);

    const version = current.version;
    if (version.interpretation === null || version.interpretationConfirmationSourceId === null) {
      throw conflict("Confirm the interpretation before requesting answer options.");
    }
    const question = version.scopeAssessment?.criticalUnknowns.find(
      ({ id: questionId }) =>
        questionId === unknownId && version.unresolvedCriticalUnknownIds.includes(questionId),
    );
    if (!question) {
      throw conflict("Answer options can only be requested for the current scope question.");
    }

    const client = getIntakeAIClient();
    const proposal = await client.suggestAnswerOptions({
      sources: version.sources,
      confirmedIntent: version.interpretation,
      question: {
        question: question.question,
        whyItMatters: question.whyItMatters,
        impact: question.impact,
      },
      communicationStyle: resolveIntakeCommunicationStyle(version),
    });
    const nextVersion = recordAnswerOptionSuggestions(version, unknownId, proposal, {
      operation: "suggest_answer_options",
      provider: client.name,
      model: client.modelId,
      promptVersion: INTAKE_ANSWER_OPTIONS_PROMPT_VERSION,
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
