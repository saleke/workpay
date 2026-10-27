import {
  createIntakeSessionRequestSchema,
  createIntakeSession,
} from "@workpay/shared/domain/intake";
import { getDb, jsonError, jsonOk } from "@/lib/server/api";
import { requireIntakeBuyer } from "@/lib/server/intake-auth";

export async function POST(req: Request) {
  try {
    const actor = await requireIntakeBuyer(req);
    const body = createIntakeSessionRequestSchema.parse(await req.json());
    const result = await createIntakeSession(getDb(), {
      userId: actor.id!,
      originalRequest: body.originalRequest,
    });

    return jsonOk(
      {
        data: {
          sessionId: result.session.id,
          version: result.version.version,
          status: result.session.status,
          originalRequest: result.session.originalRequest,
          intake: result.version,
        },
      },
      201,
    );
  } catch (error) {
    return jsonError(error);
  }
}
