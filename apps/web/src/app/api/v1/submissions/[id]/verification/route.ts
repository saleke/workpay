import { desc, eq } from "drizzle-orm";
import { getDb, jsonError, jsonOk } from "@/lib/server/api";
import { verificationRuns, verificationResults, evidence } from "@workpay/shared/db/schema/verification";
import { contractRequirements } from "@workpay/shared/db/schema/contracts";
import type { VerificationDto, VerificationResultDto } from "@/lib/api/types";

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id: submissionId } = await params;
    const db = getDb();

    const [run] = await db
      .select()
      .from(verificationRuns)
      .where(eq(verificationRuns.submissionId, submissionId))
      .orderBy(desc(verificationRuns.startedAt))
      .limit(1);

    if (!run) {
      return jsonError({ code: "NOT_FOUND", message: "Verification not found for submission" }, 404);
    }

    const results = await db
      .select()
      .from(verificationResults)
      .where(eq(verificationResults.verificationRunId, run.id));

    const evidenceRows = await db
      .select()
      .from(evidence)
      .where(eq(evidence.verificationRunId, run.id));

    const reqs = await db
      .select()
      .from(contractRequirements)
      .where(eq(contractRequirements.contractId, run.contractId));

    const reqMap = new Map(reqs.map((r) => [r.key, r.statement]));

    const resultsDto: VerificationResultDto[] = results.map((res) => {
      const relatedEvidence = evidenceRows.filter(
        (ev) => ev.verificationResultId === res.id,
      );

      const detail = (res.detail ?? {}) as Record<string, unknown>;
      const expected = detail.expected ? String(detail.expected) : null;
      const actual = detail.actual ? String(detail.actual) : null;

      return {
        id: res.id,
        verificationRunId: res.verificationRunId,
        requirementKey: res.requirementKey,
        statement: reqMap.get(res.requirementKey) ?? res.requirementKey,
        method: res.method as "DETERMINISTIC" | "SEMANTIC" | "HUMAN",
        outcome: res.outcome as "PASS" | "FAIL" | "UNCERTAIN",
        expected,
        actual,
        explanation: res.rationale,
        evidence: relatedEvidence.map((ev) => ({
          id: ev.id,
          requirementKey: res.requirementKey,
          type: ev.type,
          label: ev.type,
          value: ev.description,
          detail: ev.payload ? JSON.stringify(ev.payload) : null,
        })),
      };
    });

    const data: VerificationDto = {
      id: run.id,
      taskId: run.taskId,
      submissionId: run.submissionId,
      contractId: run.contractId,
      contractVersion: run.contractVersion,
      status: run.status as "RUNNING" | "COMPLETED" | "FAILED",
      outcome: run.outcome as "PASS" | "FAIL" | "UNCERTAIN" | null,
      passedRequirements: run.passedCount,
      failedRequirements: run.failedCount,
      results: resultsDto,
      createdAt: run.startedAt.toISOString(),
    };

    return jsonOk(data);
  } catch (err) {
    return jsonError(err);
  }
}
