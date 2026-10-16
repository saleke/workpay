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
  captureIfAllowed,
  ensureAgent,
  getPaymentForTask,
  transitionTask,
} from "@workpay/shared/domain";
import { newId } from "@workpay/shared/platform";
import { logger } from "@workpay/shared/platform";

let isRunning = true;

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
        title: "Contract ready for review",
        body: `A new contract draft is ready for review on "${taskTitle}".`,
      };
    case "CONTRACT_APPROVED":
      return {
        title: "Contract approved",
        body: `Contract approved for "${taskTitle}". Agent is now searching for matching providers.`,
      };
    case "PROVIDER_SELECTED":
      return {
        title: "Provider selected",
        body: `Candidate provider selected for "${taskTitle}". Negotiation started.`,
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
        title: "Payment authorized",
        body: `Escrow hold authorized for "${taskTitle}". Provider is starting work.`,
      };
    case "WORK_STARTED":
      return {
        title: "Work in progress",
        body: `The provider has started working on "${taskTitle}".`,
      };
    case "WORK_SUBMITTED":
      return {
        title: "Deliverable submitted",
        body: `Provider submitted work for "${taskTitle}". Automated verification has commenced.`,
      };
    case "VERIFICATION_COMPLETED": {
      const outcome = String(payload.outcome || "COMPLETED");
      return {
        title: `Verification: ${outcome}`,
        body: `Deliverable verification for "${taskTitle}" finished with outcome: ${outcome}.`,
      };
    }
    case "PAYMENT_CAPTURED":
      return {
        title: "Payment released",
        body: `Payment captured and released to provider for "${taskTitle}".`,
      };
    case "TASK_COMPLETED":
      return {
        title: "Task completed",
        body: `Task "${taskTitle}" is now complete.`,
      };
    case "CASE_OPENED":
      return {
        title: "Review case opened",
        body: `A review case was opened for "${taskTitle}": ${String(payload.title || payload.category || "")}.`,
      };
    case "CASE_RESOLVED":
      return {
        title: "Review case resolved",
        body: `The review case for "${taskTitle}" has been resolved with outcome: ${String(payload.outcome || "")}.`,
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
        if (ev.type === "WORK_SUBMITTED" && task) {
          const submissionId = String(payload.submissionId || "");
          if (submissionId) {
            const existingRuns = await db
              .select()
              .from(verificationRuns)
              .where(eq(verificationRuns.submissionId, submissionId))
              .limit(1);

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

              if (verResult.outcome === "PASS") {
                const payment = await getPaymentForTask(db, task.id);
                if (payment && payment.status === "AUTHORIZED") {
                  const capResult = await captureIfAllowed({
                    paymentId: payment.id,
                    actor: agentActor,
                    correlationId: ev.correlationId,
                  });

                  if (capResult.captured) {
                    await withTransaction((tx) =>
                      transitionTask(tx, {
                        taskId: task.id,
                        to: "COMPLETED",
                        actor: agentActor,
                        correlationId: ev.correlationId,
                        patch: { completedAt: new Date() },
                      }),
                    );
                  }
                }
              }
            }
          }
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
}

if (process.env.NODE_ENV !== "test") {
  main().catch((err) => {
    logger.error({ err: String(err) }, "Worker fatal error");
    process.exitCode = 1;
  });
}
