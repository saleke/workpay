/**
 * Buyer agent orchestrator (Component 11).
 *
 * This is where the agent's bounded autonomy becomes concrete. Each method
 * performs one agent-owned step of the pipeline:
 *
 *   plan -> draft contract -> select provider -> open negotiation ->
 *   accept offer -> authorize payment -> request verification
 *
 * Every method runs the authority policy first, records what it did, and lets
 * the deterministic services do the actual work. Human and provider steps
 * (approving a contract, counteroffering, submitting work) are handled by the
 * API, not here, because the agent must not approve its own work.
 *
 * Transactions are owned here. Database-only steps are wrapped in a single
 * transaction so the business state and its events commit together (D1). Steps
 * that call the payment gateway or the AI are split so that no transaction is
 * held open across a network call (P4).
 */
import { desc, eq } from "drizzle-orm";
import type { Database } from "../../db/client.js";
import { withTransaction } from "../../db/client.js";
import { tasks, workSpecifications } from "../../db/schema/tasks.js";
import { workContracts } from "../../db/schema/contracts.js";
import { offers, commercialAgreements } from "../../db/schema/negotiation.js";
import { agentRuns } from "../../db/schema/agent.js";
import { payments } from "../../db/schema/payments.js";
import { isTerminal, type TaskStatus } from "../tasks/state.js";
import { transitionTask } from "../tasks/service.js";
import { planTask } from "../planning/service.js";
import { extractPlanSnapshot } from "../contracts/plan-snapshot.js";
import { draftContract } from "../contracts/service.js";
import { runProviderSelection } from "../providers/service.js";
import {
  startNegotiation,
  prepareBuyerOffer,
  submitBuyerAgentOffer,
  acceptOffer,
} from "../negotiation/service.js";
import { ensurePaymentForAgreement, authorizePayment } from "../payments/service.js";
import { assignExecution, markSubmissionAccepted, requestRevision } from "../execution/service.js";
import { workExecutions } from "../../db/schema/execution.js";
import { startVerification, executeVerification } from "../verification/service.js";
import { getAIClient } from "../../integrations/ai/index.js";
import { startAgentRun, recordAgentAction } from "./service.js";
import { evaluateAgentAuthority, type AgentActionType } from "./authority.js";
import type { Actor } from "../identity/authorize.js";

/** The agent actor for a run. The id is the run id; the principal is the buyer. */
export function agentActorFor(agentRunId: string, userId: string): Actor {
  return { kind: "AGENT", id: agentRunId, onBehalfOfUserId: userId };
}

async function loadTask(tx: Database, taskId: string) {
  const [task] = await tx.select().from(tasks).where(eq(tasks.id, taskId)).limit(1);
  if (!task) throw new Error(`Task ${taskId} not found`);
  return task;
}

/** Run the authority policy and persist the decision on the action record. */
async function authorized(
  tx: Database,
  options: {
    agentRunId: string;
    taskId: string;
    userId: string;
    actionType: AgentActionType;
    status: TaskStatus;
    budgetMinor: number;
    committedMinor: number;
    amountMinor?: number;
    actor: Actor;
    correlationId: string;
  },
): Promise<{ allowed: boolean; reasonCode: string; reason: string }> {
  const [run] = await tx
    .select()
    .from(agentRuns)
    .where(eq(agentRuns.id, options.agentRunId))
    .limit(1);

  const decision = evaluateAgentAuthority({
    actionType: options.actionType,
    actor: { kind: "AGENT", onBehalfOfUserId: options.userId },
    task: {
      userId: options.userId,
      status: options.status,
      budgetMinor: options.budgetMinor,
      committedMinor: options.committedMinor,
      terminal: isTerminal(options.status),
    },
    stepCount: run?.stepCount ?? 0,
    maxSteps: run?.maxSteps ?? 40,
    ...(options.amountMinor !== undefined ? { amountMinor: options.amountMinor } : {}),
  });

  await recordAgentAction(tx, {
    agentRunId: options.agentRunId,
    taskId: options.taskId,
    actionType: options.actionType,
    status: decision.allowed ? "APPROVED" : "REJECTED",
    authorityAllowed: decision.allowed,
    authorityReason: decision.reasonCode,
    reasonCode: decision.reasonCode,
    actor: options.actor,
    correlationId: options.correlationId,
  });

  return decision;
}

/** Ensure the agent run exists and return the agent actor. */
export async function ensureAgent(options: {
  taskId: string;
  userId: string;
}): Promise<{ agentRunId: string; actor: Actor }> {
  return withTransaction(async (tx) => {
    const run = await startAgentRun(tx, {
      taskId: options.taskId,
      goal: "Take the task from request to verified delivery within the buyer's contract",
      actor: { kind: "SYSTEM", id: null },
    });
    return { agentRunId: run.id, actor: agentActorFor(run.id, options.userId) };
  });
}

/** Plan the task and draft the contract for buyer review. */
export async function agentPlanAndDraftContract(options: {
  taskId: string;
  actor: Actor;
  correlationId: string;
}) {
  return withTransaction(async (tx) => {
    const task = await loadTask(tx, options.taskId);
    const decision = await authorized(tx, {
      agentRunId: options.actor.id as string,
      taskId: task.id,
      userId: task.userId,
      actionType: "CREATE_PLAN",
      status: task.status,
      budgetMinor: task.budgetMinor,
      committedMinor: 0,
      actor: options.actor,
      correlationId: options.correlationId,
    });
    if (!decision.allowed) return { ok: false as const, reasonCode: decision.reasonCode };

    await transitionTask(tx, {
      taskId: task.id,
      to: "PLANNING",
      actor: options.actor,
      correlationId: options.correlationId,
    });
    const plan = await planTask(tx, {
      taskId: task.id,
      actor: options.actor,
      correlationId: options.correlationId,
    });
    const contract = await draftContract(tx, {
      taskId: task.id,
      actor: options.actor,
      correlationId: options.correlationId,
    });
    await transitionTask(tx, {
      taskId: task.id,
      to: "CONTRACT_REVIEW",
      actor: options.actor,
      correlationId: options.correlationId,
      patch: { plannerSource: plan.planSource },
    });

    return { ok: true as const, plan, contract };
  });
}

/**
 * Select a provider and start a negotiation. Requires an ACTIVE contract, so
 * the buyer must have approved it first.
 */
export async function agentSelectProviderAndNegotiate(options: {
  taskId: string;
  actor: Actor;
  correlationId: string;
}) {
  return withTransaction(async (tx) => {
    const task = await loadTask(tx, options.taskId);
    if (task.status !== "APPROVED") {
      return { ok: false as const, reasonCode: "agent.task_not_approved" };
    }
    const [contract] = await tx
      .select()
      .from(workContracts)
      .where(eq(workContracts.taskId, task.id))
      .orderBy(desc(workContracts.version))
      .limit(1);
    if (!contract || contract.status !== "ACTIVE") {
      return { ok: false as const, reasonCode: "agent.contract_not_active" };
    }

    const decision = await authorized(tx, {
      agentRunId: options.actor.id as string,
      taskId: task.id,
      userId: task.userId,
      actionType: "SELECT_PROVIDER",
      status: task.status,
      budgetMinor: task.budgetMinor,
      committedMinor: 0,
      actor: options.actor,
      correlationId: options.correlationId,
    });
    if (!decision.allowed) return { ok: false as const, reasonCode: decision.reasonCode };

    await transitionTask(tx, {
      taskId: task.id,
      to: "PROVIDER_SEARCH",
      actor: options.actor,
      correlationId: options.correlationId,
    });

    const [latestSpec] = await tx
      .select()
      .from(workSpecifications)
      .where(eq(workSpecifications.taskId, task.id))
      .orderBy(desc(workSpecifications.version))
      .limit(1);
    const requiredTags = latestSpec ? extractPlanSnapshot(latestSpec).capabilityTags : [];

    const selection = await runProviderSelection(tx, {
      taskId: task.id,
      contractId: contract.id,
      requiredTags,
      actor: options.actor,
      correlationId: options.correlationId,
    });

    if (!selection.selection.selected) {
      return {
        ok: false as const,
        reasonCode: "agent.no_provider",
        selectionId: selection.selectionId,
      };
    }

    const negotiationId = await startNegotiation(tx, {
      taskId: task.id,
      contractId: contract.id,
      providerId: selection.selection.selected.providerId,
      actor: options.actor,
      correlationId: options.correlationId,
    });
    await transitionTask(tx, {
      taskId: task.id,
      to: "NEGOTIATION",
      actor: options.actor,
      correlationId: options.correlationId,
    });

    return {
      ok: true as const,
      selection,
      negotiationId,
      providerId: selection.selection.selected.providerId,
    };
  });
}

/** The agent sends its opening offer. */
export async function agentSendOffer(options: {
  taskId: string;
  negotiationId: string;
  actor: Actor;
  correlationId: string;
}) {
  // Authority is checked and recorded, and the negotiation context is read, in
  // one short transaction. The AI draft happens outside any transaction (P4),
  // then the offer is validated and stored in a second transaction.
  const prepared = await withTransaction(async (tx) => {
    const task = await loadTask(tx, options.taskId);
    const decision = await authorized(tx, {
      agentRunId: options.actor.id as string,
      taskId: task.id,
      userId: task.userId,
      actionType: "SEND_OFFER",
      status: task.status,
      budgetMinor: task.budgetMinor,
      committedMinor: 0,
      actor: options.actor,
      correlationId: options.correlationId,
    });
    if (!decision.allowed) return { ok: false as const, reasonCode: decision.reasonCode };

    const context = await prepareBuyerOffer(tx, options.negotiationId);
    return { ok: true as const, context };
  });
  if (!prepared.ok) return prepared;

  const ai = getAIClient();
  const draft = await ai.draftOffer({
    taskId: prepared.context.taskId,
    contractSummary: prepared.context.contractSummary,
    budgetMinor: prepared.context.budgetMinor,
    currency: prepared.context.currency,
    round: prepared.context.round,
    ...(prepared.context.providerAskingMinor !== undefined
      ? { providerAskingMinor: prepared.context.providerAskingMinor }
      : {}),
    desiredDeadline: prepared.context.desiredDeadline,
  });

  const offer = await withTransaction((tx) =>
    submitBuyerAgentOffer(tx, {
      negotiationId: options.negotiationId,
      actor: options.actor,
      correlationId: options.correlationId,
      draft: {
        priceMinor: draft.priceMinor,
        deliveryDeadline: new Date(draft.deliveryDeadline),
        message: draft.message,
      },
    }),
  );
  return { ok: true as const, offer };
}

/** The agent accepts a provider offer within budget, creating the agreement. */
export async function agentAcceptOffer(options: {
  taskId: string;
  offerId: string;
  actor: Actor;
  correlationId: string;
}) {
  return withTransaction(async (tx) => {
    const task = await loadTask(tx, options.taskId);
    const [offer] = await tx.select().from(offers).where(eq(offers.id, options.offerId)).limit(1);
    if (!offer) return { ok: false as const, reasonCode: "agent.offer_not_found" };

    const decision = await authorized(tx, {
      agentRunId: options.actor.id as string,
      taskId: task.id,
      userId: task.userId,
      actionType: "ACCEPT_OFFER",
      status: task.status,
      budgetMinor: task.budgetMinor,
      committedMinor: 0,
      amountMinor: offer.priceMinor,
      actor: options.actor,
      correlationId: options.correlationId,
    });
    if (!decision.allowed) return { ok: false as const, reasonCode: decision.reasonCode };

    const agreement = await acceptOffer(tx, {
      offerId: options.offerId,
      actor: options.actor,
      correlationId: options.correlationId,
      acceptedBy: "BUYER_AGENT",
    });
    await transitionTask(tx, {
      taskId: task.id,
      to: "AGREEMENT_READY",
      actor: options.actor,
      correlationId: options.correlationId,
    });
    return { ok: true as const, agreement };
  });
}

/**
 * Authorize payment for the agreed amount and open execution. Authority is
 * checked first, then the deterministic payment policy (the policy gate). The
 * gateway call lives outside any transaction (P4).
 */
export async function agentAuthorizeAndAssign(options: {
  taskId: string;
  agreementId: string;
  contractId: string;
  providerId: string;
  actor: Actor;
  correlationId: string;
}) {
  const prepared = await withTransaction(async (tx) => {
    const task = await loadTask(tx, options.taskId);
    const [agreement] = await tx
      .select()
      .from(commercialAgreements)
      .where(eq(commercialAgreements.id, options.agreementId))
      .limit(1);
    if (!agreement) return { ok: false as const, reasonCode: "agent.agreement_not_found" };

    const decision = await authorized(tx, {
      agentRunId: options.actor.id as string,
      taskId: task.id,
      userId: task.userId,
      actionType: "AUTHORIZE_PAYMENT",
      status: task.status,
      budgetMinor: task.budgetMinor,
      committedMinor: 0,
      amountMinor: agreement.agreedPriceMinor,
      actor: options.actor,
      correlationId: options.correlationId,
    });
    if (!decision.allowed) return { ok: false as const, reasonCode: decision.reasonCode };

    await transitionTask(tx, {
      taskId: task.id,
      to: "PAYMENT_AUTHORIZATION",
      actor: options.actor,
      correlationId: options.correlationId,
    });
    const payment = await ensurePaymentForAgreement(tx, {
      taskId: task.id,
      agreementId: options.agreementId,
      actor: options.actor,
      correlationId: options.correlationId,
    });
    return { ok: true as const, paymentId: payment.id };
  });

  if (!prepared.ok) return prepared;

  // Network call outside any transaction.
  const outcome = await authorizePayment({
    paymentId: prepared.paymentId,
    actor: options.actor,
    correlationId: options.correlationId,
  });
  if (outcome.decision.result === "DENY") {
    await withTransaction((tx) =>
      transitionTask(tx, {
        taskId: options.taskId,
        to: "AGREEMENT_READY",
        actor: options.actor,
        correlationId: options.correlationId,
      }),
    );
    return {
      ok: false as const,
      reasonCode: outcome.decision.reasonCode,
      paymentId: prepared.paymentId,
    };
  }

  return withTransaction(async (tx) => {
    const [payment] = await tx
      .select()
      .from(payments)
      .where(eq(payments.id, prepared.paymentId))
      .limit(1);
    if (!payment || payment.status !== "AUTHORIZED") {
      return {
        ok: false as const,
        reasonCode: "agent.payment_not_authorized",
        paymentId: prepared.paymentId,
      };
    }
    const [contract] = await tx
      .select()
      .from(workContracts)
      .where(eq(workContracts.id, options.contractId))
      .limit(1);
    if (!contract) return { ok: false as const, reasonCode: "agent.contract_not_found" };

    const execution = await assignExecution(tx, {
      taskId: options.taskId,
      contractId: contract.id,
      contractVersion: contract.version,
      contractHash: contract.contractHash,
      agreementId: options.agreementId,
      providerId: options.providerId,
    });
    await transitionTask(tx, {
      taskId: options.taskId,
      to: "WORK_IN_PROGRESS",
      actor: options.actor,
      correlationId: options.correlationId,
    });
    return { ok: true as const, paymentId: prepared.paymentId, executionId: execution.id };
  });
}

/**
 * Request verification for a submission and apply the outcome to the task
 * status. This is the step that produces the intentional FAIL-then-PASS.
 */
export async function agentVerifySubmission(options: {
  taskId: string;
  submissionId: string;
  actor: Actor;
  correlationId: string;
}) {
  const verificationRunId = await withTransaction(async (tx) => {
    await transitionTask(tx, {
      taskId: options.taskId,
      to: "VERIFYING",
      actor: options.actor,
      correlationId: options.correlationId,
    });
    return startVerification(tx, {
      submissionId: options.submissionId,
      actor: options.actor,
      correlationId: options.correlationId,
    });
  });

  const outcome = await executeVerification({
    verificationRunId,
    actor: options.actor,
    correlationId: options.correlationId,
  });

  const next: TaskStatus =
    outcome.outcome === "PASS"
      ? "PAYMENT_RELEASE"
      : outcome.outcome === "FAIL"
        ? "REVISION_REQUIRED"
        : "HUMAN_REVIEW";
  await withTransaction(async (tx) => {
    if (outcome.outcome === "PASS" || outcome.outcome === "FAIL") {
      const [execution] = await tx
        .select()
        .from(workExecutions)
        .where(eq(workExecutions.taskId, options.taskId))
        .limit(1);
      if (execution) {
        if (outcome.outcome === "PASS") {
          await markSubmissionAccepted(tx, {
            executionId: execution.id,
            submissionId: options.submissionId,
          });
        } else {
          await requestRevision(tx, {
            executionId: execution.id,
            submissionId: options.submissionId,
            actor: options.actor,
            correlationId: options.correlationId,
            reason: "Automated acceptance checks failed; a revision is required.",
          });
        }
      }
    }
    await transitionTask(tx, {
      taskId: options.taskId,
      to: next,
      actor: options.actor,
      correlationId: options.correlationId,
    });
  });

  return {
    ok: true as const,
    outcome: outcome.outcome,
    verificationRunId,
    acceptanceDecisionId: outcome.acceptanceDecisionId,
  };
}
