import { z } from "zod";
import {
  getCorrelationId,
  getDb,
  jsonError,
  jsonOk,
  withIdempotency,
  withTransaction,
} from "@/lib/server/api";
import { requireAuthenticatedSession } from "@/lib/server/conversation-auth";
import { buildWorkCommitmentDto } from "@/lib/server/work-commitment";
import { getConversationWorkCommitment, proposeWorkCommitment } from "@workpay/shared/domain";
import { AppError } from "@workpay/shared/platform";

const proposalSchema = z
  .object({
    amountMinor: z.number().int().nonnegative(),
    currency: z.literal("USD"),
    deliveryDeadline: z.string().datetime().nullable(),
  })
  .strict();

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id: conversationId } = await params;
    const { user } = await requireAuthenticatedSession(req);
    const commitment = await getConversationWorkCommitment(getDb(), {
      conversationId,
      userId: user.id,
    });
    return jsonOk(commitment ? await buildWorkCommitmentDto(getDb(), commitment.id) : null);
  } catch (error) {
    return jsonError(error);
  }
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id: conversationId } = await params;
    const { actor, user } = await requireAuthenticatedSession(req);
    if (!req.headers.get("idempotency-key")) {
      throw new AppError("VALIDATION_ERROR", "Idempotency-Key is required.");
    }
    const body = proposalSchema.parse(await req.json());
    return withIdempotency(
      "propose_work_commitment",
      req,
      { conversationId, userId: user.id, ...body },
      async () => {
        const commitment = await withTransaction((tx) =>
          proposeWorkCommitment(tx, {
            conversationId,
            buyerUserId: user.id,
            amountMinor: body.amountMinor,
            currency: body.currency,
            deliveryDeadline: body.deliveryDeadline ? new Date(body.deliveryDeadline) : null,
            actor,
            correlationId: getCorrelationId(req),
          }),
        );
        const data = await buildWorkCommitmentDto(getDb(), commitment.id);
        return { status: 201, data };
      },
    );
  } catch (error) {
    return jsonError(error);
  }
}
