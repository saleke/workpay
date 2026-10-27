import {
  getIntakeAIClient,
  INTAKE_INTERPRETATION_PROMPT_VERSION,
} from "@workpay/shared/integrations/ai";
import {
  appendIntakeVersion,
  getIntakeSession,
  interpretIntakeRequestSchema,
  recordIntentInterpretation,
  resolveIntakeCommunicationStyle,
} from "@workpay/shared/domain/intake";
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
    const body = await parseIntakeRequest(req, interpretIntakeRequestSchema);
    const { id } = await params;
    const db = getDb();
    const current = await getIntakeSession(db, { sessionId: id, userId: actor.id });
    assertExpectedIntakeVersion(current, body.expectedVersion);
    if (current.version.interpretation !== null) {
      throw conflict("An interpretation already exists. Confirm it or submit a correction first.");
    }

    const client = getIntakeAIClient();
    const proposal = await client.interpretIntent({
      sources: current.version.sources,
      priorProposal: current.version.correctionContext,
      communicationStyle: resolveIntakeCommunicationStyle(current.version),
    });
    const nextVersion = recordIntentInterpretation(current.version, proposal, {
      operation: "interpret_intent",
      provider: client.name,
      model: client.modelId,
      promptVersion: INTAKE_INTERPRETATION_PROMPT_VERSION,
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
