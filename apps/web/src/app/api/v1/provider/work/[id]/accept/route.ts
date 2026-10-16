import { eq } from "drizzle-orm";
import {
  getCorrelationId,
  getDb,
  jsonError,
  resolveActor,
  withIdempotency,
  withTransaction,
} from "@/lib/server/api";
import { workExecutions } from "@workpay/shared/db/schema/execution";
import { acceptAssignment } from "@workpay/shared/domain";
import { buildProviderWorkDto } from "@/lib/server/provider";
import { notFound } from "@workpay/shared/platform";

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id: executionId } = await params;
    const actor = resolveActor(req, "provider");
    const correlationId = getCorrelationId(req);
    const db = getDb();

    const [execution] = await db
      .select()
      .from(workExecutions)
      .where(eq(workExecutions.id, executionId))
      .limit(1);

    if (!execution) throw notFound("Execution");

    return withIdempotency("accept_provider_work", req, { executionId }, async () => {
      await withTransaction((tx) =>
        acceptAssignment(tx, {
          executionId,
          providerId: execution.providerId,
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
