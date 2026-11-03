import { z } from "zod";
import { getIntakeAIClient } from "@workpay/shared/integrations/ai";
import { getFirstContactContext } from "@workpay/shared/domain";
import { getDb, jsonError, jsonOk } from "@/lib/server/api";
import { requireTaskOwner } from "@/lib/server/conversation-auth";

const draftMessageSchema = z
  .object({
    providerId: z.string().min(1).max(64),
    expectedContractVersion: z.number().int().positive(),
    expectedContractHash: z.string().regex(/^[a-f0-9]{64}$/i),
    tone: z.enum(["warm", "direct", "professional"]),
    buyerNote: z.string().trim().max(800).default(""),
    existingDraft: z.string().max(5_000).default(""),
  })
  .strict();

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id: taskId } = await params;
    const { actor } = await requireTaskOwner(req, taskId);
    const body = draftMessageSchema.parse(await req.json());
    const context = await getFirstContactContext(getDb(), {
      taskId,
      buyerUserId: actor.id,
      providerId: body.providerId,
      expectedContractVersion: body.expectedContractVersion,
      expectedContractHash: body.expectedContractHash,
    });

    const message = await getIntakeAIClient().draftFirstContactMessage({
      task: {
        title: context.task.title.slice(0, 300),
        request: context.task.rawRequest.slice(0, 4_000),
      },
      agreement: {
        title: context.contract.title.slice(0, 300),
        summary: context.contract.summary.slice(0, 2_000),
        requirements: context.snapshot.requirements
          .filter((requirement) => requirement.acceptanceRelevant)
          .slice(0, 20)
          .map((requirement) => requirement.statement.slice(0, 500)),
        included: context.snapshot.included.slice(0, 12).map((item) => item.slice(0, 500)),
        excluded: context.snapshot.excluded.slice(0, 12).map((item) => item.slice(0, 500)),
      },
      professional: {
        displayName: context.professional.displayName.slice(0, 160),
        bio: context.professional.bio?.slice(0, 1_000) ?? null,
        capabilities: context.professional.capabilities.slice(0, 15),
      },
      buyerNote: body.buyerNote,
      existingDraft: body.existingDraft,
      tone: body.tone,
    });

    return jsonOk({ message });
  } catch (error) {
    return jsonError(error);
  }
}
