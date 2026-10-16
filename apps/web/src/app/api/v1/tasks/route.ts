import { z } from "zod";
import { money } from "@workpay/shared/platform";
import { createTask, listTasksForUser } from "@workpay/shared/domain";
import {
  getCorrelationId,
  getDb,
  jsonError,
  jsonOk,
  resolveActor,
  withTransaction,
  withIdempotency,
} from "@/lib/server/api";

const createTaskSchema = z.object({
  title: z.string().min(1).max(255),
  rawRequest: z.string().min(1),
  budgetMinor: z.number().int().nonnegative(),
  currency: z.literal("USD"),
  desiredDeadline: z.string().nullable().optional(),
});

export async function GET(req: Request) {
  try {
    const actor = resolveActor(req, "buyer");
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

export async function POST(req: Request) {
  try {
    const actor = resolveActor(req, "buyer");
    const correlationId = getCorrelationId(req);
    const body = await req.json();
    const parsed = createTaskSchema.parse(body);

    return withIdempotency("create_task", req, parsed, async () => {
      const result = await withTransaction(async (tx) => {
        return createTask(tx, {
          actor,
          title: parsed.title,
          rawRequest: parsed.rawRequest,
          budget: money(parsed.budgetMinor, parsed.currency),
          desiredDeadline: parsed.desiredDeadline ? new Date(parsed.desiredDeadline) : null,
          correlationId,
        });
      });

      const t = result.task;
      const data = {
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
      };

      return { status: 201, data };
    });
  } catch (err) {
    return jsonError(err);
  }
}
