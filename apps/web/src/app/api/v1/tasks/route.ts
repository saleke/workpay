import { listTasksForUser } from "@workpay/shared/domain";
import { getDb, jsonError, jsonOk, resolveActorAsync } from "@/lib/server/api";

export async function GET(req: Request) {
  try {
    const actor = await resolveActorAsync(req, "buyer");
    const db = getDb();
    const rows = await listTasksForUser(db, actor.id as string);

    const data = rows.map((t) => ({
      id: t.id,
      userId: t.userId,
      title: t.title,
      rawRequest: t.rawRequest,
      status: t.status,
      budgetMinor: t.budgetMinor,
      currency: t.currency,
      desiredDeadline: t.desiredDeadline?.toISOString() ?? null,
      plannerSource: t.plannerSource,
      createdAt: t.createdAt.toISOString(),
      updatedAt: t.updatedAt.toISOString(),
    }));

    return jsonOk(data);
  } catch (err) {
    return jsonError(err);
  }
}

export async function POST() {
  try {
    return jsonError(
      {
        code: "APPROVED_INTAKE_REQUIRED",
        message:
          "Direct task creation is paused until approved intake briefs are connected to the later task workflow.",
      },
      410,
    );
  } catch (error) {
    return jsonError(error);
  }
}
