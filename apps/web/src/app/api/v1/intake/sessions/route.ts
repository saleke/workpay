import {
  createIntakeSessionRequestSchema,
  createIntakeSession,
} from "@workpay/shared/domain/intake";
import { getDb, jsonError, jsonOk } from "@/lib/server/api";
import { requireIntakeBuyer } from "@/lib/server/intake-auth";
import { parseIntakeRequest, toIntakeResponse } from "@/lib/server/intake-request";

export async function POST(req: Request) {
  try {
    const actor = await requireIntakeBuyer(req);
    const body = await parseIntakeRequest(req, createIntakeSessionRequestSchema);
    const result = await createIntakeSession(getDb(), {
      userId: actor.id,
      originalRequest: body.originalRequest,
    });

    return jsonOk({ data: toIntakeResponse(result) }, 201);
  } catch (error) {
    return jsonError(error);
  }
}
