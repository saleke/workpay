import { and, eq } from "drizzle-orm";
import { getDb, jsonError, jsonOk } from "@/lib/server/api";
import { buildProviderWorkDto } from "@/lib/server/provider";
import { requireProviderPrincipal } from "@/lib/server/conversation-auth";
import { workExecutions } from "@workpay/shared/db/schema/execution";
import { notFound } from "@workpay/shared/platform";

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id: executionId } = await params;
    const { provider } = await requireProviderPrincipal(req);
    const db = getDb();
    const [execution] = await db
      .select({ id: workExecutions.id })
      .from(workExecutions)
      .where(
        and(eq(workExecutions.id, executionId), eq(workExecutions.providerId, provider.id)),
      )
      .limit(1);
    if (!execution) throw notFound("Execution");
    const data = await buildProviderWorkDto(db, executionId);
    return jsonOk(data);
  } catch (err) {
    return jsonError(err);
  }
}
