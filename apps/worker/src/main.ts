/**
 * WorkPay background worker process (Component 14 & 18).
 *
 * Runs long-lived background jobs:
 * 1. Transactional outbox event consumption and dispatch (Component 12).
 * 2. Automated notification generation (in-app notifications projection).
 * 3. Asynchronous deliverable verification and conditional payment capture.
 * 4. Graceful termination on SIGINT/SIGTERM.
 */
import { eq } from "drizzle-orm";
import { createServer, type Server } from "node:http";
import { getDb, withTransaction } from "@workpay/shared/db/client";
import { events, notifications, outboxEvents } from "@workpay/shared/db/schema/infra";
import { verificationRuns } from "@workpay/shared/db/schema/verification";
import { tasks } from "@workpay/shared/db/schema/tasks";
import {
  claimOutboxBatch,
  markOutboxPublished,
  markOutboxFailed,
} from "@workpay/shared/events/outbox";
import {
  agentVerifySubmission,
  canTransition,
  captureIfAllowed,
  ensureAgent,
  getPaymentForTask,
  systemActor,
  transitionTask,
} from "@workpay/shared/domain";
import { newId } from "@workpay/shared/platform";
import { logger } from "@workpay/shared/platform";

let isRunning = true;
let healthServer: Server | null = null;

async function startHealthServer(): Promise<Server> {
  const port = Number(process.env.WORKER_HEALTH_PORT ?? 3001);
  if (!Number.isSafeInteger(port) || port < 1 || port > 65_535) {
    throw new Error("WORKER_HEALTH_PORT must be a valid TCP port");
  }
  const server = createServer(async (request, response) => {
    response.setHeader("Content-Type", "application/json");
    response.setHeader("Cache-Control", "no-store");
    if (request.url === "/health") {
      response.statusCode = isRunning ? 200 : 503;
      response.end(JSON.stringify({ status: isRunning ? "ok" : "stopping", service: "workpay-worker" }));
      return;
    }
    if (request.url === "/ready") {
      try {
        await getDb().select({ id: outboxEvents.id }).from(outboxEvents).limit(1);
        response.statusCode = isRunning ? 200 : 503;
        response.end(
          JSON.stringify({
            status: isRunning ? "ready" : "stopping",
            service: "workpay-worker",
            database: "reachable",
          }),
        );
      } catch {
        response.statusCode = 503;
        response.end(
          JSON.stringify({
            status: "not_ready",
            service: "workpay-worker",
            database: "unreachable",
          }),
        );
      }
      return;
    }
    response.statusCode = 404;
    response.end(JSON.stringify({ status: "not_found" }));
  });
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, "0.0.0.0", () => {
      server.off("error", reject);
      resolve();
    });
  });
  logger.info({ port }, "Worker health server started");
  return server;
}

async function captureAndCompleteIfAllowed(
  taskId: string,
  correlationId: string,
): Promise<void> {
  const db = getDb();
  const payment = await getPaymentForTask(db, taskId);
  if (payment?.status === "AUTHORIZED") {
    await captureIfAllowed({
      paymentId: payment.id,
      actor: systemActor(),
      correlationId,
    });
  }

  const currentPayment = await getPaymentForTask(db, taskId);
  if (currentPayment?.status !== "CAPTURED") return;
  await withTransaction(async (tx) => {
    const [currentTask] = await tx
      .select()
      .from(tasks)
      .where(eq(tasks.id, taskId))
      .for("update")
      .limit(1);
    if (!currentTask || currentTask.status === "COMPLETED") return;
    if (!canTransition(currentTask.status, "COMPLETED")) return;
    await transitionTask(tx, {
      taskId,
      to: "COMPLETED",
      actor: systemActor(),
      correlationId,
      patch: { completedAt: new Date() },
    });
  });
}

/**
 * Maps domain events into user-friendly notifications.
 */
function getNotificationContent(
  eventType: string,
  taskTitle: string,
  payload: Record<string, unknown>,
): { title: string; body: string } | null {
  switch (eventType) {
    case "TASK_CREATED":
      return {
        title: "Task created",
        body: `Your task "${taskTitle}" has been created and is ready for planning.`,
      };
    case "CONTRACT_CREATED":
      return {
        title: "Work agreement ready for review",
        body: `A new work agreement draft is ready for review on "${taskTitle}".`,
      };
    case "CONTRACT_APPROVED":
      return {
        title: "Work agreement approved",
        body: `Work agreement approved for "${taskTitle}". You can now review available professionals; nobody has been contacted.`,
      };
    case "PROVIDER_SELECTED":
      return {
        title: "Specialist matched",
        body: `Candidate specialist matched for "${taskTitle}". Negotiation started.`,
      };
    case "OFFER_CREATED":
      return {
        title: "Offer sent",
        body: `A negotiation offer was submitted for "${taskTitle}".`,
      };
    case "AGREEMENT_REACHED":
      return {
        title: "Agreement reached",
        body: `Terms agreed for "${taskTitle}". Payment authorization required.`,
      };
    case "PAYMENT_AUTHORIZED":
      return {
        title: "Simulated authorization recorded",
        body: `Payment-policy simulation recorded authorization for "${taskTitle}". No funds were held or moved.`,
      };
    case "WORK_STARTED":
      return {
        title: "Work in progress",
        body: `The specialist has started working on "${taskTitle}".`,
      };
    case "WORK_SUBMITTED":
      return {
        title: "Deliverable submitted",
        body: `Specialist submitted work for "${taskTitle}". Automated verification against Definition of Done has commenced.`,
      };
    case "VERIFICATION_COMPLETED": {
      const outcome = String(payload.outcome || "COMPLETED");
      const title =
        outcome === "PASS"
          ? "Deliverable verified"
          : outcome === "FAIL"
            ? "Revision requested"
            : outcome === "HUMAN_REVIEW"
              ? "Independent review may be needed"
              : `Verification ${outcome.toLowerCase()}`;
      const body =
        outcome === "PASS"
          ? `All acceptance criteria confirmed for "${taskTitle}". The simulated capture path is eligible for policy review.`
          : outcome === "FAIL"
            ? `Deliverable did not meet all acceptance criteria for "${taskTitle}". Revision requested from specialist.`
            : `Verification flagged an ambiguity on "${taskTitle}". Payment remains blocked unless the parties use an agreed independent review process.`;
      return { title, body };
    }
    case "PAYMENT_CAPTURED":
      return {
        title: "Simulated capture recorded",
        body: `The policy simulation recorded capture for "${taskTitle}". No funds were charged or paid.`,
      };
    case "TASK_COMPLETED":
      return {
        title: "Task completed",
        body: `Task "${taskTitle}" is now complete and settled.`,
      };
    case "CASE_OPENED":
      return {
        title: "Platform exception recorded",
        body: `A blocking platform exception was recorded for "${taskTitle}": ${String(payload.title || payload.category || "Technical review")}.`,
      };
    case "CASE_RESOLVED":
      return {
        title: "Platform exception reconciled",
        body: `The operational exception for "${taskTitle}" was reconciled with outcome: ${String(payload.outcome || "reconciliation complete")}.`,
      };
    default:
      return null;
  }
}

/**
 * Processes a single batch of outbox events atomically.
 */
export async function processOutboxBatch(batchSize = 25): Promise<number> {
  const db = getDb();

  // 1. Claim batch with FOR UPDATE SKIP LOCKED
  const claimed = await withTransaction(async (tx) => {
    return claimOutboxBatch(tx, batchSize);
  });

  if (claimed.length === 0) {
    return 0;
  }

  logger.info({ count: claimed.length }, "Claimed outbox events batch");

  for (const item of claimed) {
    try {
      // 2. Fetch the original domain event
      const [ev] = await db.select().from(events).where(eq(events.id, item.eventId)).limit(1);

      if (ev) {
        // 3. Find the task
        const [task] = ev.taskId
          ? await db.select().from(tasks).where(eq(tasks.id, ev.taskId)).limit(1)
          : [null];

        const payload = (ev.payload ?? {}) as Record<string, unknown>;

        // 4. Generate notification if applicable
        if (task) {
          const content = getNotificationContent(ev.type, task.title, payload);
          if (content) {
            await db
              .insert(notifications)
              .values({
                id: newId("notif"),
                userId: task.userId,
                taskId: task.id,
                eventId: ev.id,
                type: ev.type,
                title: content.title,
                body: content.body,
                href: `/tasks/${task.id}`,
              })
              .onConflictDoNothing();
          }
        }

        // 5. Handle event-specific workflows
        if (ev.type === "SUBMISSION_SUBMITTED" && task) {
          const submissionId = String(payload.submissionId || "");
          if (submissionId) {
            const existingRuns = await db
              .select()
              .from(verificationRuns)
              .where(eq(verificationRuns.submissionId, submissionId))
              .limit(1);

            let verificationOutcome = existingRuns[0]?.outcome ?? null;
            if (existingRuns.length === 0) {
              logger.info({ taskId: task.id, submissionId }, "Triggering async verification for submission");
              const { actor: agentActor } = await ensureAgent({
                taskId: task.id,
                userId: task.userId,
              });

              const verResult = await agentVerifySubmission({
                taskId: task.id,
                submissionId,
                actor: agentActor,
                correlationId: ev.correlationId,
              });
              verificationOutcome = verResult.outcome;
            }
            if (verificationOutcome === "PASS") {
              await captureAndCompleteIfAllowed(task.id, ev.correlationId);
            }
          }
        }

        if (
          ev.type === "INDEPENDENT_REVIEW_REPORTED" &&
          task &&
          payload.outcome === "PASS"
        ) {
          await captureAndCompleteIfAllowed(task.id, ev.correlationId);
        }
      }

      // 6. Mark published
      await withTransaction(async (tx) => {
        await markOutboxPublished(tx, item.id);
      });
    } catch (err) {
      logger.error({ outboxId: item.id, err: String(err) }, "Failed to process outbox event");
      await withTransaction(async (tx) => {
        await markOutboxFailed(tx, item.id, err instanceof Error ? err.message : String(err));
      });
    }
  }

  return claimed.length;
}

/**
 * Worker main event loop.
 */
async function main(): Promise<void> {
  logger.info("WorkPay background worker process started");
  healthServer = await startHealthServer();

  const shutdown = () => {
    logger.info("Shutting down WorkPay background worker...");
    isRunning = false;
  };

  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);

  while (isRunning) {
    try {
      const processed = await processOutboxBatch();
      if (processed === 0) {
        // Sleep 1s when queue is idle
        await new Promise((resolve) => setTimeout(resolve, 1000));
      }
    } catch (err) {
      logger.error({ err: String(err) }, "Error in outbox processing loop");
      await new Promise((resolve) => setTimeout(resolve, 2000));
    }
  }

  logger.info("WorkPay background worker terminated gracefully");
  if (healthServer) {
    await new Promise<void>((resolve) => healthServer?.close(() => resolve()));
    healthServer = null;
  }
}

if (process.env.NODE_ENV !== "test") {
  main().catch((err) => {
    logger.error({ err: String(err) }, "Worker fatal error");
    process.exitCode = 1;
  });
}
