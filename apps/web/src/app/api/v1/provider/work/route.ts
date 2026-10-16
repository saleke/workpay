import { desc } from "drizzle-orm";
import { getDb, jsonError, jsonOk, resolveActor } from "@/lib/server/api";
import { workExecutions } from "@workpay/shared/db/schema/execution";
import { buildProviderWorkDto } from "@/lib/server/provider";

export async function GET(req: Request) {
  try {
    const actor = resolveActor(req, "provider");
    const db = getDb();

    const executions = await db
      .select({ id: workExecutions.id })
      .from(workExecutions)
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
