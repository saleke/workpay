import { z } from "zod";
import { getCorrelationId, jsonError, resolveActor, withIdempotency, withTransaction } from "@/lib/server/api";
import { approveContract } from "@workpay/shared/domain";
import type { ApprovalResultDto } from "@/lib/api/types";

const approveSchema = z.object({
  expectedHash: z.string().min(1),
});

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id: contractId } = await params;
    const actor = resolveActor(req, "buyer");
    const correlationId = getCorrelationId(req);
    const body = await req.json();
    const parsed = approveSchema.parse(body);

    return withIdempotency("approve_contract", req, { contractId, ...parsed }, async () => {
      const updated = await withTransaction(async (tx) => {
        return approveContract(tx, {
          contractId,
          expectedHash: parsed.expectedHash,
          actor,
          correlationId,
        });
      });

      const data: ApprovalResultDto = {
        contractId: updated.id,
        status: updated.status,
        contractHash: updated.contractHash,
      };

      return { status: 200, data };
    });
  } catch (err) {
    return jsonError(err);
  }
}
