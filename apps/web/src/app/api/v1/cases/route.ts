import { desc, eq } from "drizzle-orm";
import { getDb, jsonError, jsonOk } from "@/lib/server/api";
import { cases, caseImpacts } from "@workpay/shared/db/schema/cases";
import type { CaseDto } from "@/lib/api/types";

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const taskId = url.searchParams.get("taskId");
    const db = getDb();

    let query = db.select().from(cases);
    if (taskId) {
      query = query.where(eq(cases.taskId, taskId)) as typeof query;
    }

    const rows = await query.orderBy(desc(cases.openedAt)).limit(50);
    const impacts = await db.select().from(caseImpacts);

    const data: CaseDto[] = rows.map((c) => {
      const relatedImpacts = impacts.filter((imp) => imp.caseId === c.id);
      return {
        id: c.id,
        taskId: c.taskId,
        type: c.type,
        category: c.category,
        status: c.status,
        severity: c.severity,
        title: c.title,
        summary: c.description,
        blocksPaymentCapture: c.blocksPaymentCapture,
        impacts: relatedImpacts.map((imp) => ({
          id: imp.id,
          caseId: imp.caseId,
          kind: imp.impact,
          detail: typeof imp.detail === "string" ? imp.detail : imp.detail ? JSON.stringify(imp.detail) : null,
        })),
        createdAt: c.openedAt.toISOString(),
        resolvedAt: c.resolvedAt?.toISOString() ?? null,
      };
    });

    return jsonOk(data);
  } catch (err) {
    return jsonError(err);
  }
}
