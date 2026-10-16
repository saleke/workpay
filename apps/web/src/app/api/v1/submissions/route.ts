import { eq } from "drizzle-orm";
import {
  getCorrelationId,
  getDb,
  jsonError,
  jsonOk,
  resolveActor,
  withTransaction,
} from "@/lib/server/api";
import { workExecutions, workSubmissions } from "@workpay/shared/db/schema/execution";
import {
  agentVerifySubmission,
  captureIfAllowed,
  createSubmission,
  ensureAgent,
  getPaymentForTask,
  getTaskById,
  submitWork,
  transitionTask,
} from "@workpay/shared/domain";
import { buildStorageKey, getObjectStorage } from "@workpay/shared/integrations";
import { notFound, sha256HexOfBytes } from "@workpay/shared/platform";
import type { SubmissionDto } from "@/lib/api/types";

export async function POST(req: Request) {
  try {
    const actor = resolveActor(req, "provider");
    const correlationId = getCorrelationId(req);
    const db = getDb();

    const formData = await req.formData();
    const executionId = formData.get("executionId") as string;
    const note = (formData.get("note") as string) || "";
    const file = formData.get("file") as File | null;

    if (!executionId) {
      return jsonError({ code: "VALIDATION_ERROR", message: "executionId is required" }, 400);
    }
    if (!file) {
      return jsonError({ code: "VALIDATION_ERROR", message: "Deliverable file is required" }, 400);
    }

    const [execution] = await db
      .select()
      .from(workExecutions)
      .where(eq(workExecutions.id, executionId))
      .limit(1);

    if (!execution) throw notFound("Execution");

    const task = await getTaskById(db, execution.taskId);
    if (!task) throw notFound("Task");

    // 1. Read file bytes and compute SHA-256 checksum (invariant D4 / D2)
    const arrayBuffer = await file.arrayBuffer();
    const buffer = new Uint8Array(arrayBuffer);
    const checksum = sha256HexOfBytes(buffer);

    // 2. Create versioned submission & submit deliverable
    const submission = await withTransaction(async (tx) => {
      const created = await createSubmission(tx, {
        executionId: execution.id,
        providerId: execution.providerId,
        actor,
        correlationId,
        artifacts: [
          {
            type: "PRIMARY_DELIVERABLE",
            filename: file.name,
            contentType: file.type || "text/csv",
            bytes: buffer,
          },
        ],
        notes: note,
      });

      await submitWork(tx, {
        submissionId: created.id,
        providerId: execution.providerId,
        actor,
        correlationId,
      });

      return created;
    });

    // 3. Trigger verification
    const { actor: agentActor } = await ensureAgent({
      taskId: execution.taskId,
      userId: task.userId,
    });

    const verificationResult = await agentVerifySubmission({
      taskId: execution.taskId,
      submissionId: submission.id,
      actor: agentActor,
      correlationId,
    });

    // 5. If verification PASSED, trigger payment capture and complete task!
    if (verificationResult.outcome === "PASS") {
      const payment = await getPaymentForTask(db, execution.taskId);
      if (payment && payment.status === "AUTHORIZED") {
        const captureResult = await captureIfAllowed({
          paymentId: payment.id,
          actor: agentActor,
          correlationId,
        });

        if (captureResult.captured) {
          await withTransaction((tx) =>
            transitionTask(tx, {
              taskId: execution.taskId,
              to: "COMPLETED",
              actor: agentActor,
              correlationId,
              patch: { completedAt: new Date() },
            }),
          );
        }
      }
    }

    const data: SubmissionDto = {
      id: submission.id,
      executionId: submission.executionId,
      version: submission.version,
      status: submission.status,
      note: submission.notes,
      artifacts: [
        {
          id: `art_${submission.id}`,
          submissionId: submission.id,
          type: "PRIMARY_DELIVERABLE",
          filename: file.name,
          contentType: file.type || "text/csv",
          sizeBytes: buffer.byteLength,
          checksum,
          createdAt: submission.createdAt.toISOString(),
        },
      ],
      createdAt: submission.createdAt.toISOString(),
    };

    return jsonOk(data, 201);
  } catch (err) {
    return jsonError(err);
  }
}
