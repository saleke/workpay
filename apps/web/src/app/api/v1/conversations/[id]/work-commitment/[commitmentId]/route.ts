import { z } from "zod";
import {
  confirmWorkCommitment,
  respondToWorkCommitment,
  withdrawWorkCommitment,
} from "@workpay/shared/domain";
import { AppError } from "@workpay/shared/platform";
import {
  getCorrelationId,
  getDb,
  jsonError,
  withIdempotency,
  withTransaction,
} from "@/lib/server/api";
import { requireAuthenticatedSession } from "@/lib/server/conversation-auth";
import { buildWorkCommitmentDto } from "@/lib/server/work-commitment";

const actionSchema = z
  .object({
    action: z.enum(["PROVIDER_ACCEPT", "PROVIDER_DECLINE", "BUYER_CONFIRM", "BUYER_WITHDRAW"]),
    note: z.string().trim().max(1_000).optional(),
  })
  .strict();

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string; commitmentId: string }> },
) {
  try {
    const { id: conversationId, commitmentId } = await params;
    const { actor, user } = await requireAuthenticatedSession(req);
    if (!req.headers.get("idempotency-key")) {
      throw new AppError("VALIDATION_ERROR", "Idempotency-Key is required.");
    }
    const body = actionSchema.parse(await req.json());
    return withIdempotency(
      "decide_work_commitment",
      req,
      { conversationId, commitmentId, userId: user.id, ...body },
      async () => {
        await withTransaction(async (tx) => {
          if (body.action === "PROVIDER_ACCEPT" || body.action === "PROVIDER_DECLINE") {
            const result = await respondToWorkCommitment(tx, {
              commitmentId,
              providerUserId: user.id,
              response: body.action === "PROVIDER_ACCEPT" ? "ACCEPT" : "DECLINE",
              ...(body.note ? { note: body.note } : {}),
              actor,
              correlationId: getCorrelationId(req),
            });
            if (result.conversationId !== conversationId) {
              throw new AppError("NOT_FOUND", "Work proposal not found.");
            }
            return;
          }
          if (body.action === "BUYER_WITHDRAW") {
            const result = await withdrawWorkCommitment(tx, {
              commitmentId,
              buyerUserId: user.id,
              actor,
              correlationId: getCorrelationId(req),
            });
            if (result.conversationId !== conversationId) {
              throw new AppError("NOT_FOUND", "Work proposal not found.");
            }
            return;
          }
          const result = await confirmWorkCommitment(tx, {
            commitmentId,
            buyerUserId: user.id,
            actor,
            correlationId: getCorrelationId(req),
          });
          if (result.commitment.conversationId !== conversationId) {
            throw new AppError("NOT_FOUND", "Work proposal not found.");
          }
        });
        const data = await buildWorkCommitmentDto(getDb(), commitmentId);
        return { status: 200, data };
      },
    );
  } catch (error) {
    return jsonError(error);
  }
}
