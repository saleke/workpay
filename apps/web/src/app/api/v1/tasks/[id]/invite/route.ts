import { eq } from "drizzle-orm";
import { z } from "zod";
import {
  getCorrelationId,
  getDb,
  jsonError,
  jsonOk,
  resolveActor,
  withTransaction,
} from "@/lib/server/api";
import {
  assignExecution,
  acceptAssignment,
  ensurePaymentForAgreement,
  authorizePayment,
  getActiveContractForTask,
  getContractWithDetails,
  getTaskById,
  transitionTask,
} from "@workpay/shared/domain";
import { providers, capabilities as capabilitiesTable } from "@workpay/shared/db/schema/providers";
import { users } from "@workpay/shared/db/schema/identity";
import { commercialAgreements, negotiations } from "@workpay/shared/db/schema/negotiation";
import { workExecutions } from "@workpay/shared/db/schema/execution";
import { approvals, workContracts } from "@workpay/shared/db/schema/contracts";
import { tasks } from "@workpay/shared/db/schema/tasks";
import { appendEvent } from "@workpay/shared/events";
import { hashObject } from "@workpay/shared/platform";
import { newId } from "@workpay/shared/platform";
import { conflict, notFound } from "@workpay/shared/platform";
import type { TaskInvitationDto } from "@/lib/api/types";

const acceptInvitationSchema = z.object({
  displayName: z.string().trim().min(2).max(128),
  payoutEmail: z.string().trim().email(),
  bio: z.string().trim().max(500).optional(),
  capabilities: z.array(z.string().trim()).default([]),
});

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id: taskId } = await params;
    const db = getDb();
    const task = await getTaskById(db, taskId);

    if (!task) {
      throw notFound("Task");
    }

    const activeContract = await getActiveContractForTask(db, taskId);
    if (!activeContract) {
      throw notFound("Work Agreement");
    }

    const details = await getContractWithDetails(db, activeContract.id);
    if (!details) {
      throw notFound("Work Agreement Details");
    }

    const [execution] = await db
      .select()
      .from(workExecutions)
      .where(eq(workExecutions.taskId, taskId))
      .limit(1);

    let assignedSpecialistName: string | null = null;
    if (execution) {
      const [p] = await db
        .select()
        .from(providers)
        .where(eq(providers.id, execution.providerId))
        .limit(1);
      assignedSpecialistName = p?.displayName ?? null;
    }

    const dto: TaskInvitationDto = {
      taskId: task.id,
      taskTitle: task.title,
      taskRequest: task.rawRequest,
      budgetMinor: task.budgetMinor,
      currency: task.currency,
      deadline: task.desiredDeadline?.toISOString() ?? activeContract.deadline?.toISOString() ?? null,
      contractId: details.contract.id,
      contractVersion: details.contract.version,
      contractHash: details.contract.contractHash,
      requirements: details.requirements.map((r) => ({
        id: r.id,
        key: r.key,
        statement: r.statement,
        acceptanceRelevant: r.acceptanceRelevant,
      })),
      isAssigned: Boolean(execution),
      assignedSpecialistName,
    };

    return jsonOk(dto);
  } catch (err) {
    return jsonError(err);
  }
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id: taskId } = await params;
    const body = await req.json();
    const parsed = acceptInvitationSchema.parse(body);
    const correlationId = getCorrelationId(req);
    const db = getDb();

    const task = await getTaskById(db, taskId);
    if (!task) {
      throw notFound("Task");
    }

    if (
      task.status !== "CONTRACT_REVIEW" &&
      task.status !== "APPROVED" &&
      task.status !== "PROVIDER_SEARCH"
    ) {
      throw conflict(`This task cannot be assigned in status ${task.status}.`);
    }

    const activeContract = await getActiveContractForTask(db, taskId);
    if (!activeContract) {
      throw conflict("No approved work agreement found for this task.");
    }

    const [existingExecution] = await db
      .select()
      .from(workExecutions)
      .where(eq(workExecutions.taskId, taskId))
      .limit(1);

    if (existingExecution) {
      throw conflict("This work agreement has already been accepted and assigned to another specialist.");
    }

    // 1. Create or resolve user
    const emailSanitized = parsed.payoutEmail.toLowerCase().trim();
    const [existingUser] = await db
      .select()
      .from(users)
      .where(eq(users.email, emailSanitized))
      .limit(1);

    let userId: string;
    if (existingUser) {
      userId = existingUser.id;
    } else {
      userId = newId("user");
      await db.insert(users).values({
        id: userId,
        email: emailSanitized,
        name: parsed.displayName,
        role: "provider",
      });
    }

    // 2. Create or resolve specialist (provider) profile
    const [existingProvider] = await db
      .select()
      .from(providers)
      .where(eq(providers.userId, userId))
      .limit(1);

    let providerId: string;
    if (existingProvider) {
      providerId = existingProvider.id;
      await db
        .update(providers)
        .set({
          displayName: parsed.displayName,
          payoutEmail: parsed.payoutEmail,
          bio: parsed.bio ?? existingProvider.bio,
          status: "ACTIVE",
          updatedAt: new Date(),
        })
        .where(eq(providers.id, providerId));
    } else {
      providerId = newId("provider");
      await db.insert(providers).values({
        id: providerId,
        userId,
        type: "HUMAN",
        displayName: parsed.displayName,
        status: "ACTIVE",
        bio: parsed.bio ?? "Specialist in Talent Network",
        hourlyRateMinor: 5000,
        currency: "USD",
        payoutEmail: parsed.payoutEmail,
      });
    }

    if (parsed.capabilities && parsed.capabilities.length > 0) {
      for (const tag of parsed.capabilities) {
        await db
          .insert(capabilitiesTable)
          .values({
            id: newId("cap"),
            providerId,
            tag,
            proficiency: 4,
          })
          .onConflictDoNothing();
      }
    }

    const actor = { kind: "USER" as const, id: userId, role: "provider" as const };

    // 3. Complete atomic assignment & PayPal authorization hold
    const result = await withTransaction(async (tx) => {
      const agreementId = newId("agreement");
      const deliveryDeadline =
        activeContract.deadline ??
        task.desiredDeadline ??
        new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

      const agreementHash = hashObject({
        agreementId,
        taskId: task.id,
        contractId: activeContract.id,
        contractVersion: activeContract.version,
        contractHash: activeContract.contractHash,
        providerId,
        agreedPriceMinor: activeContract.budgetMinor,
        currency: activeContract.currency,
        deliveryDeadline: deliveryDeadline.toISOString(),
        paymentTerms: "FULL_ON_ACCEPTANCE",
      });

      const negotiationId = newId("nego");
      await tx.insert(negotiations).values({
        id: negotiationId,
        taskId: task.id,
        contractId: activeContract.id,
        providerId,
        status: "ACCEPTED",
        maxRounds: 1,
        currentRound: 1,
      });

      await tx.insert(commercialAgreements).values({
        id: agreementId,
        taskId: task.id,
        contractId: activeContract.id,
        negotiationId,
        providerId,
        contractVersion: activeContract.version,
        status: "PENDING_AUTHORIZATION",
        agreedPriceMinor: activeContract.budgetMinor,
        currency: activeContract.currency,
        deliveryDeadline,
        paymentTerms: "FULL_ON_ACCEPTANCE",
        agreementHash,
      });

      // Secure payment in PayPal authorization hold
      const payment = await ensurePaymentForAgreement(tx, {
        taskId: task.id,
        agreementId,
        actor,
        correlationId,
      });

      if (activeContract.status === "AWAITING_APPROVAL") {
        await tx.insert(approvals).values({
          id: newId("approval"),
          contractId: activeContract.id,
          approvedBy: task.userId,
          contractHash: activeContract.contractHash,
        });

        await tx
          .update(workContracts)
          .set({
            status: "ACTIVE",
            approvedBy: task.userId,
            approvedAt: new Date(),
            updatedAt: new Date(),
          })
          .where(eq(workContracts.id, activeContract.id));
      }

      // Assign execution and acknowledge terms
      const execution = await assignExecution(tx, {
        taskId: task.id,
        contractId: activeContract.id,
        contractVersion: activeContract.version,
        contractHash: activeContract.contractHash,
        agreementId,
        providerId,
      });

      await acceptAssignment(tx, {
        executionId: execution.id,
        providerId,
        actor,
        correlationId,
      });

      // Advance task state machine through valid forward transitions
      const [currentTask] = await tx.select().from(tasks).where(eq(tasks.id, task.id)).limit(1);
      const currentStatus = currentTask?.status ?? task.status;

      const transitionsToPerform: Array<"APPROVED" | "PROVIDER_SEARCH" | "AGREEMENT_READY" | "PAYMENT_AUTHORIZATION" | "WORK_IN_PROGRESS"> = [];
      if (currentStatus === "CONTRACT_REVIEW") transitionsToPerform.push("APPROVED");
      if (currentStatus === "CONTRACT_REVIEW" || currentStatus === "APPROVED") transitionsToPerform.push("PROVIDER_SEARCH");
      if (currentStatus === "CONTRACT_REVIEW" || currentStatus === "APPROVED" || currentStatus === "PROVIDER_SEARCH" || currentStatus === "NEGOTIATION") transitionsToPerform.push("AGREEMENT_READY");
      if (currentStatus === "CONTRACT_REVIEW" || currentStatus === "APPROVED" || currentStatus === "PROVIDER_SEARCH" || currentStatus === "NEGOTIATION" || currentStatus === "AGREEMENT_READY") transitionsToPerform.push("PAYMENT_AUTHORIZATION");
      transitionsToPerform.push("WORK_IN_PROGRESS");

      for (const nextStatus of transitionsToPerform) {
        await transitionTask(tx, {
          taskId: task.id,
          to: nextStatus,
          actor,
          correlationId,
        });
      }

      await appendEvent(tx, {
        type: "PROVIDER_INVITATION_ACCEPTED",
        aggregateId: task.id,
        taskId: task.id,
        actor: { type: "USER", id: userId },
        correlationId,
        payload: {
          taskId: task.id,
          providerId,
          displayName: parsed.displayName,
          payoutEmail: parsed.payoutEmail,
        },
      });

      return { execution, payment };
    });

    // Authorize payment outside transaction (network call to PayPal gateway)
    await authorizePayment({
      paymentId: result.payment.id,
      actor,
      correlationId,
    });

    const response = jsonOk({
      ok: true,
      executionId: result.execution.id,
      taskId: task.id,
      redirectUrl: "/provider",
    });

    // Set persona cookie to provider
    response.cookies.set("workpay_persona", "provider", { path: "/", maxAge: 31536000 });
    return response;
  } catch (err) {
    return jsonError(err);
  }
}
