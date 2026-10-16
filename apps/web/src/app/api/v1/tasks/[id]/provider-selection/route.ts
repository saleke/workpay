import { desc, eq } from "drizzle-orm";
import { getDb, jsonError, jsonOk } from "@/lib/server/api";
import { providerSelections } from "@workpay/shared/db/schema/providers";
import type { ProviderSelectionDto, ProviderSnapshotDto } from "@/lib/api/types";

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id: taskId } = await params;
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
    const topPick = candidates.find((c) => c.providerId === selection.providerId) ?? candidates[0] ?? null;
    const alternatives = candidates.filter((c) => c.providerId !== selection.providerId);

    const data: ProviderSelectionDto = {
      id: selection.id,
      taskId: selection.taskId,
      contractId: selection.contractId,
      status: selection.status as "SELECTED" | "FAILED" | "EXPIRED",
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
