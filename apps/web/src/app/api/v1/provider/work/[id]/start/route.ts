import { and, eq } from "drizzle-orm";
import {
  getCorrelationId,
  getDb,
  jsonError,
  withIdempotency,
  withTransaction,
} from "@/lib/server/api";
import { workExecutions } from "@workpay/shared/db/schema/execution";
import { startWork } from "@workpay/shared/domain";
import { buildProviderWorkDto } from "@/lib/server/provider";
import { notFound } from "@workpay/shared/platform";
import { requireProviderPrincipal } from "@/lib/server/conversation-auth";

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id: executionId } = await params;
    const { actor, provider } = await requireProviderPrincipal(req);
    const correlationId = getCorrelationId(req);
    const db = getDb();

    const [execution] = await db
      .select()
      .from(workExecutions)
      .where(
        and(eq(workExecutions.id, executionId), eq(workExecutions.providerId, provider.id)),
      )
      .limit(1);

    if (!execution) throw notFound("Execution");

    return withIdempotency("start_provider_work", req, { executionId }, async () => {
      await withTransaction((tx) =>
        startWork(tx, {
          executionId,
          providerId: provider.id,
          actor,
          correlationId,
        }),
      );

      const data = await buildProviderWorkDto(db, executionId);
      return { status: 200, data };
    });
  } catch (err) {
    return jsonError(err);
  }
}
