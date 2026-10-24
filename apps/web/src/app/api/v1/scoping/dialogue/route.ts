import { type NextRequest } from "next/server";
import { jsonError, jsonOk, resolveActorAsync } from "@/lib/server/api";
import { processScopingTurn, scopingRequestSchema } from "@workpay/shared/domain/scoping";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const parsed = scopingRequestSchema.parse(body);

    const actor = await resolveActorAsync(req);

    const state = await processScopingTurn({
      sessionId: parsed.sessionId,
      message: parsed.message,
      selectedOptionId: parsed.selectedOptionId,
      activeSlotKey: parsed.activeSlotKey,
      customBudgetMinor: parsed.customBudgetMinor,
      slots: parsed.slots,
      history: parsed.history,
      literacyLevel: parsed.literacyLevel,
    });

    return jsonOk({
      data: state,
      actor: actor.id ? { id: actor.id, role: actor.role } : null,
    });
  } catch (error) {
    return jsonError(error);
  }
}
