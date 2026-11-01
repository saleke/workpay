import { desc, eq } from "drizzle-orm";
import { getDb, jsonError, jsonOk } from "@/lib/server/api";
import { workExecutions } from "@workpay/shared/db/schema/execution";
import { commercialAgreements } from "@workpay/shared/db/schema/negotiation";
import { buildProviderWorkDto } from "@/lib/server/provider";
import { requireProviderPrincipal } from "@/lib/server/conversation-auth";

export async function GET(req: Request) {
  try {
    const { provider } = await requireProviderPrincipal(req);
    const db = getDb();

    const executions = await db
      .select({ id: workExecutions.id })
      .from(workExecutions)
      .innerJoin(
        commercialAgreements,
        eq(workExecutions.agreementId, commercialAgreements.id),
      )
      .where(eq(commercialAgreements.providerId, provider.id))
      .orderBy(desc(workExecutions.createdAt))
      .limit(50);

    const data = await Promise.all(
      executions.map((e) => buildProviderWorkDto(db, e.id)),
    );

    return jsonOk(data);
  } catch (err) {
    return jsonError(err);
  }
}
