import { and, eq } from "drizzle-orm";
import {
  getCorrelationId,
  getDb,
  jsonError,
  jsonOk,
  withTransaction,
} from "@/lib/server/api";
import {
  submissionArtifacts,
  workExecutions,
  workSubmissions,
} from "@workpay/shared/db/schema/execution";
import {
  createSubmission,
  submitWork,
} from "@workpay/shared/domain";
import { buildStorageKey, getObjectStorage } from "@workpay/shared/integrations";
import { notFound, sha256HexOfBytes } from "@workpay/shared/platform";
import type { SubmissionDto } from "@/lib/api/types";
import { requireProviderPrincipal } from "@/lib/server/conversation-auth";

export async function POST(req: Request) {
  try {
    const { actor, provider } = await requireProviderPrincipal(req);
    const correlationId = getCorrelationId(req);
    const db = getDb();

    const formData = await req.formData();
    const executionId = formData.get("executionId") as string;
    const note = (formData.get("note") as string) || "";
    const file = formData.get("file") as File | null;

    if (!executionId) {
      return jsonError({ code: "VALIDATION_ERROR", message: "executionId is required" }, 400);
    }
    if (!(file instanceof File)) {
      return jsonError({ code: "VALIDATION_ERROR", message: "Deliverable file is required" }, 400);
    }
    if (file.size === 0 || file.size > 25 * 1024 * 1024) {
      return jsonError(
        {
          code: "VALIDATION_ERROR",
          message: "Deliverable files must contain data and be no larger than 25 MB.",
        },
        422,
      );
    }

    const [execution] = await db
      .select()
      .from(workExecutions)
      .where(
        and(eq(workExecutions.id, executionId), eq(workExecutions.providerId, provider.id)),
      )
      .limit(1);

    if (!execution) throw notFound("Execution");

    // 1. Read file bytes and compute SHA-256 checksum (invariant D4 / D2)
    const arrayBuffer = await file.arrayBuffer();
    const buffer = new Uint8Array(arrayBuffer);
    const checksum = sha256HexOfBytes(buffer);

    // 2. Create versioned submission & submit deliverable
    const submission = await createSubmission({
      executionId: execution.id,
      providerId: provider.id,
      actor,
      correlationId,
      artifacts: [
        {
          type: "PRIMARY_DELIVERABLE",
          filename: file.name,
          contentType: file.type || "application/octet-stream",
          bytes: buffer,
        },
      ],
      notes: note,
    });
    await withTransaction(async (tx) => {
      await submitWork(tx, {
        submissionId: submission.id,
        providerId: provider.id,
        actor,
        correlationId,
      });
    });

    const artifactRows = await db
      .select()
      .from(submissionArtifacts)
      .where(eq(submissionArtifacts.submissionId, submission.id));
    const data: SubmissionDto = {
      id: submission.id,
      executionId: submission.executionId,
      version: submission.version,
      status: submission.status,
      note: submission.notes,
      artifacts: artifactRows.map((artifact) => ({
        id: artifact.id,
        submissionId: artifact.submissionId,
        type: artifact.type as "PRIMARY_DELIVERABLE" | "SUPPORTING_FILE" | "EVIDENCE",
        filename: artifact.filename,
        contentType: artifact.contentType ?? "application/octet-stream",
        sizeBytes: artifact.sizeBytes,
        checksum: artifact.sha256 ?? checksum,
        createdAt: artifact.createdAt.toISOString(),
      })),
      createdAt: submission.createdAt.toISOString(),
    };

    return jsonOk(data, 201);
  } catch (err) {
    return jsonError(err);
  }
}
