import { z } from "zod";
import { eq } from "drizzle-orm";
import {
  getCorrelationId,
  getDb,
  jsonError,
  resolveActor,
  withIdempotency,
  withTransaction,
} from "@/lib/server/api";
import { cases, caseImpacts } from "@workpay/shared/db/schema/cases";
import { resolveCase } from "@workpay/shared/domain";
import { notFound } from "@workpay/shared/platform";
import type { CaseDto } from "@/lib/api/types";

const resolveCaseSchema = z.object({
  outcome: z.enum([
    "UPHOLD_SYSTEM_DECISION",
    "OVERRIDE_VERIFICATION",
    "REQUIRE_REVISION",
    "REQUIRE_NEW_EVIDENCE",
    "AMEND_CONTRACT",
    "CANCEL_TASK",
    "RELEASE_PAYMENT",
    "REFUND_PAYMENT",
    "VOID_PAYMENT",
    "NO_ACTION",
  ]),
  note: z.string().optional(),
});

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id: caseId } = await params;
    const actor = resolveActor(req, "admin_reviewer");
    const correlationId = getCorrelationId(req);
    const body = await req.json();
    const parsed = resolveCaseSchema.parse(body);

    return withIdempotency("resolve_case", req, { caseId, ...parsed }, async () => {
      await withTransaction((tx) =>
        resolveCase(tx, {
          caseId,
          outcome: parsed.outcome,
          rationale: parsed.note || `Reviewer chose outcome ${parsed.outcome}`,
          actor,
          correlationId,
        }),
      );

      const db = getDb();
      const [updated] = await db.select().from(cases).where(eq(cases.id, caseId)).limit(1);
      if (!updated) throw notFound("Case");

      const impacts = await db
        .select()
        .from(caseImpacts)
        .where(eq(caseImpacts.caseId, caseId));

      const data: CaseDto = {
        id: updated.id,
        taskId: updated.taskId,
        type: updated.type,
        category: updated.category,
        status: updated.status,
        severity: updated.severity,
        title: updated.title,
        summary: updated.description,
        blocksPaymentCapture: updated.blocksPaymentCapture,
        impacts: impacts.map((imp) => ({
          id: imp.id,
          caseId: imp.caseId,
          kind: imp.impact,
          detail: typeof imp.detail === "string" ? imp.detail : imp.detail ? JSON.stringify(imp.detail) : null,
        })),
        createdAt: updated.openedAt.toISOString(),
        resolvedAt: updated.resolvedAt?.toISOString() ?? null,
      };

      return { status: 200, data };
    });
  } catch (err) {
    return jsonError(err);
  }
}
