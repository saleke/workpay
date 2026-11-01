import { desc, eq } from "drizzle-orm";
import { getDb, jsonError, jsonOk } from "@/lib/server/api";
import { providerSelections } from "@workpay/shared/db/schema/providers";
import type { ProviderSelectionDto, ProviderSnapshotDto } from "@/lib/api/types";
import { requireTaskOwner } from "@/lib/server/conversation-auth";

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id: taskId } = await params;
    await requireTaskOwner(req, taskId);
    const db = getDb();

    const [selection] = await db
      .select()
      .from(providerSelections)
      .where(eq(providerSelections.taskId, taskId))
      .orderBy(desc(providerSelections.createdAt))
      .limit(1);

    if (!selection) {
      return jsonOk(null);
    }

    const candidates = (selection.candidates as ProviderSnapshotDto[]) ?? [];
    const topPick = selection.providerId
      ? candidates.find((c) => c.providerId === selection.providerId) ?? null
      : null;
    const alternatives = candidates.filter((c) => c.providerId !== selection.providerId);

    const data: ProviderSelectionDto = {
      id: selection.id,
      taskId: selection.taskId,
      contractId: selection.contractId,
      status: selection.status as ProviderSelectionDto["status"],
      provider: topPick,
      alternatives,
      reason: selection.reason,
      createdAt: selection.createdAt.toISOString(),
    };

    return jsonOk(data);
  } catch (err) {
    return jsonError(err);
  }
}
