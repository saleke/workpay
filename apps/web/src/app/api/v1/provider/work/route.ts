import { desc, eq } from "drizzle-orm";
import { getDb, jsonError, jsonOk, resolveActorAsync } from "@/lib/server/api";
import { workExecutions } from "@workpay/shared/db/schema/execution";
import { commercialAgreements } from "@workpay/shared/db/schema/negotiation";
import { providers } from "@workpay/shared/db/schema/providers";
import { buildProviderWorkDto } from "@/lib/server/provider";

export async function GET(req: Request) {
  try {
    const actor = await resolveActorAsync(req, "provider");
    const db = getDb();

    let providerId: string | null = null;
    if (actor.kind === "PROVIDER") {
      providerId = actor.id === "usr_provider_bob" ? "pro_dataclean_apex" : actor.id;
    } else {
      const [p] = await db
        .select({ id: providers.id })
        .from(providers)
        .where(eq(providers.userId, actor.id as string))
        .limit(1);
      if (p) providerId = p.id;
    }

    if (!providerId) {
      return jsonOk([]);
    }

    const executions = await db
      .select({ id: workExecutions.id })
      .from(workExecutions)
      .innerJoin(
        commercialAgreements,
        eq(workExecutions.agreementId, commercialAgreements.id),
      )
      .where(eq(commercialAgreements.providerId, providerId))
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
