import { and, desc, eq, inArray } from "drizzle-orm";
import { withTransaction, type Database } from "../../db/client.js";
import { contractChangeRequests } from "../../db/schema/contract-changes.js";
import { paymentOperations, payments } from "../../db/schema/payments.js";
import { commercialAgreements } from "../../db/schema/negotiation.js";
import {
  approvals,
  acceptanceRules,
  contractRequirements,
  scopeItems,
  workContracts,
} from "../../db/schema/contracts.js";
import { tasks } from "../../db/schema/tasks.js";
import { workExecutions, workSubmissions } from "../../db/schema/execution.js";
import { taskConversations } from "../../db/schema/conversations.js";
import { appendEvent } from "../../events/outbox.js";
import { getPaymentGateway } from "../../integrations/payments/index.js";
import { paypalRequestId } from "../../integrations/payments/idempotency.js";
import { conflict, notFound, validationError } from "../../platform/errors.js";
import { hashObject } from "../../platform/hashing.js";
import { newId } from "../../platform/ids.js";
import { logger } from "../../platform/logger.js";
import { money, type Money } from "../../platform/money.js";
import type { Actor } from "../identity/authorize.js";
import { toEventActor } from "../context.js";
import { canTransition } from "../tasks/state.js";
import { transitionTask } from "../tasks/service.js";
import {
  applyContractChange,
  contractChangePatchSchema,
  contractChangeTermsSchema,
  planPaymentAdjustment,
  type ContractChangePatch,
  type ContractChangeTerms,
  type PaymentAdjustmentPlan,
} from "./changes.js";
import { buildAcceptancePlan, compileContract } from "./compiler.js";

const UNRESOLVED_STATUSES = [
  "PROPOSED",
  "ACCEPTED_PENDING_ACTIVATION",
  "ACTIVATING",
  "ACTIVATION_RECONCILIATION_REQUIRED",
  "CANCELLATION_PENDING",
] as const;

async function loadCurrentContract(tx: Database, conversationId: string) {
  const [conversation] = await tx
    .select()
    .from(taskConversations)
    .where(eq(taskConversations.id, conversationId))
    .for("update")
    .limit(1);
  if (!conversation) throw notFound("Conversation");
  if (conversation.status !== "OPEN")
    throw conflict("Changes can only be proposed in an open conversation.");

  const [contract] = await tx
    .select()
    .from(workContracts)
    .where(and(eq(workContracts.taskId, conversation.taskId), eq(workContracts.status, "ACTIVE")))
    .orderBy(desc(workContracts.version))
    .limit(1);
  if (
    !contract ||
    !contract.approvedAt ||
    contract.version !== conversation.currentContractVersion ||
    contract.contractHash !== conversation.currentContractHash
  ) {
    throw conflict(
      "The approved agreement has changed. Changes must be proposed against its current version.",
    );
  }
  return { conversation, contract };
}

async function readContractTerms(tx: Database, contract: typeof workContracts.$inferSelect) {
  const [requirements, scopes, rules, agreement] = await Promise.all([
    tx.select().from(contractRequirements).where(eq(contractRequirements.contractId, contract.id)),
    tx.select().from(scopeItems).where(eq(scopeItems.contractId, contract.id)),
    tx.select().from(acceptanceRules).where(eq(acceptanceRules.contractId, contract.id)),
    tx
      .select()
      .from(commercialAgreements)
      .where(eq(commercialAgreements.taskId, contract.taskId))
      .limit(1),
  ]);
  if (requirements.length === 0) throw conflict("The agreement has no requirements to amend.");

  return {
    title: contract.title,
    summary: contract.summary,
    requirements: requirements.map((item) => ({
      key: item.key,
      statement: item.statement,
      acceptanceRelevant: item.acceptanceRelevant,
    })),
    included: scopes.filter((item) => item.type === "INCLUDED").map((item) => item.statement),
    excluded: scopes.filter((item) => item.type === "EXCLUDED").map((item) => item.statement),
    acceptanceRules: rules.map((rule) => ({
      requirementKey: rule.requirementKey,
      method: rule.method,
      ...(rule.params && typeof rule.params === "object"
        ? { params: rule.params as Record<string, unknown> }
        : {}),
      ...(rule.instructions ? { instructions: rule.instructions } : {}),
    })),
    budget: { amountMinor: contract.budgetMinor, currency: contract.currency },
    agreedPriceMinor: agreement[0]?.agreedPriceMinor ?? null,
    deadline: contract.deadline?.toISOString() ?? null,
  } satisfies ContractChangeTerms;
}

export async function createContractChangeRequest(
  tx: Database,
  input: {
    conversationId: string;
    actor: Actor;
    expectedContractVersion: number;
    expectedContractHash: string;
    reason: string;
    patch: ContractChangePatch;
    correlationId: string;
  },
) {
  const { conversation, contract } = await loadCurrentContract(tx, input.conversationId);
  const proposerUserId = input.actor.id;
  if (
    !proposerUserId ||
    (proposerUserId !== conversation.buyerUserId && proposerUserId !== conversation.providerUserId)
  ) {
    throw notFound("Conversation");
  }
  if (
    contract.version !== input.expectedContractVersion ||
    contract.contractHash !== input.expectedContractHash
  ) {
    throw conflict(
      "The agreement changed since it was reviewed. Refresh before proposing a change.",
    );
  }
  const reason = input.reason.trim();
  if (reason.length < 8 || reason.length > 2_000) {
    throw conflict("Explain the reason for the change in 8 to 2,000 characters.");
  }
  const parsedPatch = contractChangePatchSchema.safeParse(input.patch);
  if (!parsedPatch.success) {
    throw validationError("The proposed agreement changes are invalid.", {
      issues: parsedPatch.error.issues.map((issue) => ({
        path: issue.path.join("."),
        message: issue.message,
      })),
    });
  }
  const patch = parsedPatch.data;

  const [unresolved] = await tx
    .select({ id: contractChangeRequests.id })
    .from(contractChangeRequests)
    .where(
      and(
        eq(contractChangeRequests.taskId, conversation.taskId),
        inArray(contractChangeRequests.status, [...UNRESOLVED_STATUSES]),
      ),
    )
    .limit(1);
  if (unresolved) {
    throw conflict("Resolve the existing task change proposal before starting another.");
  }

  const baseTerms = await readContractTerms(tx, contract);
  const proposed = applyContractChange(baseTerms, patch, conversation.taskId);
  const [payment] = await tx
    .select()
    .from(payments)
    .where(eq(payments.taskId, conversation.taskId))
    .limit(1);
  const targetPrice = proposed.terms.agreedPriceMinor;
  if (payment && targetPrice === null) {
    throw conflict("A paid agreement change must include an agreed price.");
  }
  const paymentAdjustmentPlan =
    targetPrice === null
      ? { action: "NO_FINANCIAL_ADJUSTMENT" as const }
      : planPaymentAdjustment(payment ?? null, targetPrice);
  if (paymentAdjustmentPlan.action === "RECONCILIATION_REQUIRED") {
    throw conflict("Reconcile the current PayPal state before proposing a financial change.");
  }
  const respondentUserId =
    proposerUserId === conversation.buyerUserId
      ? conversation.providerUserId
      : conversation.buyerUserId;
  const changeRequestId = newId("chg");
  const [changeRequest] = await tx
    .insert(contractChangeRequests)
    .values({
      id: changeRequestId,
      taskId: conversation.taskId,
      conversationId: conversation.id,
      baseContractId: contract.id,
      baseContractVersion: contract.version,
      baseContractHash: contract.contractHash,
      proposerUserId,
      respondentUserId,
      reason,
      proposedTerms: proposed.terms,
      proposedTermsHash: proposed.hash,
      proposedContractHash: proposed.contractHash,
      proposedBudgetMinor: proposed.terms.budget.amountMinor,
      proposedAgreedPriceMinor: proposed.terms.agreedPriceMinor,
      currency: proposed.terms.budget.currency,
      paymentAdjustmentPlan,
      status: "PROPOSED",
    })
    .returning();
  if (!changeRequest) throw new Error("Contract change proposal insert returned no row.");

  await appendEvent(tx, {
    type: "CONTRACT_CHANGE_PROPOSED",
    aggregateId: contract.id,
    taskId: conversation.taskId,
    actor: toEventActor(input.actor),
    correlationId: input.correlationId,
    payload: {
      taskId: conversation.taskId,
      conversationId: conversation.id,
      changeRequestId,
      baseContractVersion: contract.version,
      proposedTermsHash: proposed.hash,
      proposedBudgetMinor: proposed.terms.budget.amountMinor,
      currency: proposed.terms.budget.currency,
    },
  });
  return changeRequest;
}

export async function decideContractChangeRequest(
  tx: Database,
  input: {
    conversationId: string;
    changeRequestId: string;
    actor: Actor;
    decision: "accept" | "decline" | "withdraw" | "request-cancellation" | "confirm-cancellation";
    note?: string;
    correlationId: string;
  },
) {
  const [request] = await tx
    .select()
    .from(contractChangeRequests)
    .where(
      and(
        eq(contractChangeRequests.id, input.changeRequestId),
        eq(contractChangeRequests.conversationId, input.conversationId),
      ),
    )
    .for("update")
    .limit(1);
  if (!request) throw notFound("Change proposal");

  if (!input.actor.id) throw notFound("Change proposal");
  let status:
    "ACCEPTED_PENDING_ACTIVATION" | "CANCELLATION_PENDING" | "CANCELLED" | "DECLINED" | "WITHDRAWN";
  let cancellationRequestedBy = request.cancellationRequestedBy;
  if (request.status === "PROPOSED") {
    const expectedActor =
      input.decision === "withdraw" ? request.proposerUserId : request.respondentUserId;
    if (input.actor.id !== expectedActor) throw notFound("Change proposal");
    if (input.decision === "accept") status = "ACCEPTED_PENDING_ACTIVATION";
    else if (input.decision === "decline") status = "DECLINED";
    else if (input.decision === "withdraw") status = "WITHDRAWN";
    else throw conflict("This change proposal is no longer awaiting this decision.");
  } else if (
    request.status === "ACCEPTED_PENDING_ACTIVATION" &&
    input.decision === "request-cancellation"
  ) {
    if (![request.proposerUserId, request.respondentUserId].includes(input.actor.id)) {
      throw notFound("Change proposal");
    }
    status = "CANCELLATION_PENDING";
    cancellationRequestedBy = input.actor.id;
  } else if (
    request.status === "CANCELLATION_PENDING" &&
    input.decision === "confirm-cancellation"
  ) {
    if (
      ![request.proposerUserId, request.respondentUserId].includes(input.actor.id) ||
      input.actor.id === request.cancellationRequestedBy
    ) {
      throw notFound("Change proposal");
    }
    status = "CANCELLED";
  } else {
    throw conflict("This change proposal is no longer awaiting this decision.");
  }
  const responseNote = input.note?.trim() || null;
  if (responseNote && responseNote.length > 2_000) {
    throw conflict("The response note cannot exceed 2,000 characters.");
  }
  let paymentAdjustmentPlan: PaymentAdjustmentPlan | null = null;
  if (input.decision === "accept") {
    const [payment] = await tx
      .select()
      .from(payments)
      .where(eq(payments.taskId, request.taskId))
      .limit(1);
    const targetPrice = request.proposedAgreedPriceMinor;
    if (payment && targetPrice === null) {
      throw conflict("A paid agreement change must include an agreed price.");
    }
    paymentAdjustmentPlan =
      targetPrice === null
        ? { action: "NO_FINANCIAL_ADJUSTMENT" }
        : planPaymentAdjustment(payment ?? null, targetPrice);
    if (paymentAdjustmentPlan.action === "RECONCILIATION_REQUIRED") {
      throw conflict(
        "PayPal is processing or its latest outcome is unknown. Reconcile the current payment before accepting a change.",
      );
    }
  }
  const [updated] = await tx
    .update(contractChangeRequests)
    .set({
      status,
      responseNote,
      paymentAdjustmentPlan,
      cancellationRequestedBy,
      respondedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(contractChangeRequests.id, request.id),
        eq(contractChangeRequests.status, request.status),
      ),
    )
    .returning();
  if (!updated) throw conflict("This change proposal is no longer awaiting a response.");

  await appendEvent(tx, {
    type: "CONTRACT_CHANGE_DECIDED",
    aggregateId: request.baseContractId,
    taskId: request.taskId,
    actor: toEventActor(input.actor),
    correlationId: input.correlationId,
    payload: {
      taskId: request.taskId,
      conversationId: request.conversationId,
      changeRequestId: request.id,
      decision: status,
      proposedTermsHash: request.proposedTermsHash,
      ...(input.decision === "accept" && paymentAdjustmentPlan
        ? { paymentAdjustmentAction: paymentAdjustmentPlan.action }
        : {}),
    },
  });
  return updated;
}

function validateProposedTerms(
  request: typeof contractChangeRequests.$inferSelect,
  taskId: string,
): ContractChangeTerms {
  const parsedTerms = contractChangeTermsSchema.safeParse(request.proposedTerms);
  if (!parsedTerms.success) {
    throw conflict("The saved change proposal is invalid and cannot be activated.");
  }
  const terms = parsedTerms.data;
  const compiled = compileContract({
    taskId,
    title: terms.title,
    summary: terms.summary,
    requirements: terms.requirements,
    scopeIncluded: terms.included,
    scopeExcluded: terms.excluded,
    acceptanceRules: terms.acceptanceRules,
    budgetMinor: terms.budget.amountMinor,
    currency: terms.budget.currency,
    deadline: terms.deadline,
  });
  const proposedTermsHash = hashObject({
    contractHash: compiled.contractHash,
    agreedPriceMinor: terms.agreedPriceMinor,
  });
  if (
    compiled.contractHash !== request.proposedContractHash ||
    proposedTermsHash !== request.proposedTermsHash
  ) {
    throw conflict("The proposed agreement snapshot failed its integrity check.");
  }
  return terms;
}

async function finalizeContractChangeRequest(
  tx: Database,
  input: {
    conversationId: string;
    changeRequestId: string;
    actor: Actor;
    correlationId: string;
  },
) {
  const [request] = await tx
    .select()
    .from(contractChangeRequests)
    .where(
      and(
        eq(contractChangeRequests.id, input.changeRequestId),
        eq(contractChangeRequests.conversationId, input.conversationId),
      ),
    )
    .for("update")
    .limit(1);
  if (!request) throw notFound("Change proposal");

  const [conversation] = await tx
    .select()
    .from(taskConversations)
    .where(eq(taskConversations.id, request.conversationId))
    .for("update")
    .limit(1);
  if (
    !conversation ||
    !input.actor.id ||
    ![conversation.buyerUserId, conversation.providerUserId].includes(input.actor.id)
  ) {
    throw notFound("Change proposal");
  }
  if (request.status === "ACTIVATED" && request.activatedContractId) {
    return {
      changeRequest: request,
      contractId: request.activatedContractId,
      status: "ACTIVATED" as const,
    };
  }
  if (!["ACCEPTED_PENDING_ACTIVATION", "ACTIVATING"].includes(request.status)) {
    throw conflict("Both participants must accept the change before activation.");
  }
  if (conversation.status !== "OPEN") throw conflict("The conversation is not open.");

  const [task] = await tx
    .select()
    .from(tasks)
    .where(eq(tasks.id, request.taskId))
    .for("update")
    .limit(1);
  if (!task) throw notFound("Task");
  if (["COMPLETED", "CANCELLED", "EXPIRED"].includes(task.status)) {
    throw conflict("A completed, cancelled, or expired task cannot be amended.");
  }

  const [baseContract] = await tx
    .select()
    .from(workContracts)
    .where(
      and(
        eq(workContracts.taskId, request.taskId),
        eq(workContracts.status, "ACTIVE"),
        eq(workContracts.version, request.baseContractVersion),
        eq(workContracts.contractHash, request.baseContractHash),
      ),
    )
    .for("update")
    .limit(1);
  if (
    !baseContract ||
    conversation.currentContractVersion !== baseContract.version ||
    conversation.currentContractHash !== baseContract.contractHash
  ) {
    throw conflict("The original agreement is no longer current. This change cannot be activated.");
  }

  const [submittedWork] = await tx
    .select({ id: workSubmissions.id })
    .from(workSubmissions)
    .where(
      and(
        eq(workSubmissions.taskId, task.id),
        inArray(workSubmissions.status, ["SUBMITTED", "UNDER_REVIEW", "ACCEPTED"]),
      ),
    )
    .limit(1);
  if (submittedWork) {
    throw conflict(
      "A deliverable is under review or already accepted. Resolve its review before changing the contract.",
    );
  }

  const terms = validateProposedTerms(request, task.id);
  const compiled = compileContract({
    taskId: task.id,
    title: terms.title,
    summary: terms.summary,
    requirements: terms.requirements,
    scopeIncluded: terms.included,
    scopeExcluded: terms.excluded,
    acceptanceRules: terms.acceptanceRules,
    budgetMinor: terms.budget.amountMinor,
    currency: terms.budget.currency,
    deadline: terms.deadline,
  });

  const [agreement] = await tx
    .select()
    .from(commercialAgreements)
    .where(eq(commercialAgreements.taskId, task.id))
    .for("update")
    .limit(1);
  const [payment] = await tx
    .select()
    .from(payments)
    .where(eq(payments.taskId, task.id))
    .for("update")
    .limit(1);
  const targetPrice = terms.agreedPriceMinor;
  if ((agreement || payment) && targetPrice === null) {
    throw conflict("A change to a funded agreement must include its agreed price.");
  }
  const adjustment =
    targetPrice === null
      ? { action: "NO_FINANCIAL_ADJUSTMENT" as const }
      : planPaymentAdjustment(payment ?? null, targetPrice);
  const preAuthorizationState =
    !payment || ["PENDING", "FAILED", "VOIDED"].includes(payment.status);
  if (
    adjustment.action !== "NO_FINANCIAL_ADJUSTMENT" &&
    !(adjustment.action === "AUTHORIZE_NEW_TOTAL" && preAuthorizationState)
  ) {
    throw conflict(
      `This change needs ${adjustment.action.replaceAll("_", " ").toLowerCase()} before activation. The existing contract remains in effect.`,
      { paymentAdjustmentAction: adjustment.action },
    );
  }
  if (agreement && targetPrice === null) {
    throw conflict("A commercial agreement requires a confirmed price.");
  }

  const nextVersion = baseContract.version + 1;
  const contractId = newId("contract");
  const now = new Date();
  const [newContract] = await tx
    .insert(workContracts)
    .values({
      id: contractId,
      taskId: task.id,
      version: nextVersion,
      status: "ACTIVE",
      title: terms.title,
      summary: terms.summary,
      contractHash: compiled.contractHash,
      budgetMinor: terms.budget.amountMinor,
      currency: terms.budget.currency,
      deadline: terms.deadline ? new Date(terms.deadline) : null,
      acceptancePlan: buildAcceptancePlan(terms.acceptanceRules),
      approvedBy: conversation.buyerUserId,
      approvedAt: now,
      createdAt: now,
      updatedAt: now,
    })
    .returning();
  if (!newContract) throw new Error("Amended contract insert returned no row.");

  await tx.insert(contractRequirements).values(
    terms.requirements.map((requirement) => ({
      id: newId("creq"),
      contractId,
      key: requirement.key,
      statement: requirement.statement,
      acceptanceRelevant: requirement.acceptanceRelevant,
    })),
  );
  const scopeRows = [
    ...terms.included.map((statement, position) => ({
      id: newId("scope"),
      contractId,
      type: "INCLUDED" as const,
      statement,
      position,
    })),
    ...terms.excluded.map((statement, position) => ({
      id: newId("scope"),
      contractId,
      type: "EXCLUDED" as const,
      statement,
      position,
    })),
  ];
  if (scopeRows.length) await tx.insert(scopeItems).values(scopeRows);
  if (terms.acceptanceRules.length) {
    await tx.insert(acceptanceRules).values(
      terms.acceptanceRules.map((rule, position) => ({
        id: newId("accrule"),
        contractId,
        requirementKey: rule.requirementKey,
        method: rule.method,
        params: rule.params ?? null,
        instructions: rule.instructions ?? null,
        position,
      })),
    );
  }
  await tx.insert(approvals).values({
    id: newId("approval"),
    contractId,
    approvedBy: conversation.buyerUserId,
    contractHash: compiled.contractHash,
    createdAt: now,
  });
  await tx
    .update(workContracts)
    .set({ status: "EXPIRED", updatedAt: now })
    .where(eq(workContracts.id, baseContract.id));

  let baseAgreementSnapshot: Record<string, unknown> | null = null;
  let activatedAgreement = agreement;
  if (agreement) {
    if (targetPrice === null) throw conflict("A commercial agreement requires a confirmed price.");
    baseAgreementSnapshot = { ...agreement };
    const agreementHash = hashObject({
      agreementId: agreement.id,
      taskId: task.id,
      contractId,
      contractVersion: nextVersion,
      contractHash: compiled.contractHash,
      providerId: agreement.providerId,
      agreedPriceMinor: targetPrice,
      currency: agreement.currency,
      deliveryDeadline: terms.deadline,
      paymentTerms: agreement.paymentTerms,
    });
    await tx
      .update(commercialAgreements)
      .set({
        contractId,
        contractVersion: nextVersion,
        agreedPriceMinor: targetPrice,
        currency: terms.budget.currency,
        deliveryDeadline: terms.deadline ? new Date(terms.deadline) : null,
        agreementHash,
        status: preAuthorizationState ? "PENDING_AUTHORIZATION" : agreement.status,
        updatedAt: now,
      })
      .where(eq(commercialAgreements.id, agreement.id));
    activatedAgreement = {
      ...agreement,
      contractId,
      contractVersion: nextVersion,
      agreedPriceMinor: targetPrice,
      currency: terms.budget.currency,
      deliveryDeadline: terms.deadline ? new Date(terms.deadline) : null,
      agreementHash,
      status: preAuthorizationState ? "PENDING_AUTHORIZATION" : agreement.status,
      updatedAt: now,
    };
  } else if (terms.agreedPriceMinor !== null) {
    const agreementId = newId("agreement");
    const agreementHash = hashObject({
      agreementId,
      taskId: task.id,
      contractId,
      contractVersion: nextVersion,
      contractHash: compiled.contractHash,
      providerId: conversation.providerId,
      agreedPriceMinor: terms.agreedPriceMinor,
      currency: terms.budget.currency,
      deliveryDeadline: terms.deadline,
      paymentTerms: "FULL_ON_ACCEPTANCE",
      sourceConversationId: conversation.id,
    });
    const [createdAgreement] = await tx
      .insert(commercialAgreements)
      .values({
        id: agreementId,
        taskId: task.id,
        contractId,
        sourceConversationId: conversation.id,
        providerId: conversation.providerId,
        contractVersion: nextVersion,
        status: "PENDING_AUTHORIZATION",
        agreedPriceMinor: terms.agreedPriceMinor,
        currency: terms.budget.currency,
        deliveryDeadline: terms.deadline ? new Date(terms.deadline) : null,
        paymentTerms: "FULL_ON_ACCEPTANCE",
        agreementHash,
        createdAt: now,
        updatedAt: now,
      })
      .returning();
    if (!createdAgreement) throw new Error("Commercial agreement insert returned no row.");
    activatedAgreement = createdAgreement;
  }
  if (payment && targetPrice !== null) {
    await tx
      .update(payments)
      .set(
        preAuthorizationState
          ? {
              amountMinor: targetPrice,
              currency: terms.budget.currency,
              status: "PENDING",
              providerAuthorizationId: null,
              providerOrderId: null,
              authorizedAt: null,
              updatedAt: now,
            }
          : { updatedAt: now },
      )
      .where(eq(payments.id, payment.id));
  }

  const [execution] = await tx
    .select()
    .from(workExecutions)
    .where(eq(workExecutions.taskId, task.id))
    .for("update")
    .limit(1);
  if (execution) {
    await tx
      .update(workExecutions)
      .set({
        contractId,
        contractVersion: nextVersion,
        contractHash: compiled.contractHash,
      })
      .where(eq(workExecutions.id, execution.id));
  }

  await tx
    .update(taskConversations)
    .set({
      currentContractVersion: nextVersion,
      currentContractHash: compiled.contractHash,
      currentContractSnapshot: {
        id: contractId,
        version: nextVersion,
        hash: compiled.contractHash,
        title: terms.title,
        summary: terms.summary,
        requirements: terms.requirements,
        included: terms.included,
        excluded: terms.excluded,
        acceptanceRules: terms.acceptanceRules,
        budget: terms.budget,
        agreedPrice:
          terms.agreedPriceMinor === null
            ? null
            : {
                amountMinor: terms.agreedPriceMinor,
                currency: terms.budget.currency,
              },
        deadline: terms.deadline,
      },
      updatedAt: now,
    })
    .where(eq(taskConversations.id, conversation.id));
  const [activatedRequest] = await tx
    .update(contractChangeRequests)
    .set({
      status: "ACTIVATED",
      paymentAdjustmentPlan: adjustment,
      baseAgreementSnapshot,
      activatedContractId: contractId,
      activatedAt: now,
      updatedAt: now,
    })
    .where(
      and(
        eq(contractChangeRequests.id, request.id),
        inArray(contractChangeRequests.status, ["ACCEPTED_PENDING_ACTIVATION", "ACTIVATING"]),
      ),
    )
    .returning();
  if (!activatedRequest) throw conflict("The change proposal could not be activated concurrently.");

  await appendEvent(tx, {
    type: "CONTRACT_CHANGE_ACTIVATED",
    aggregateId: contractId,
    taskId: task.id,
    actor: toEventActor(input.actor),
    correlationId: input.correlationId,
    payload: {
      taskId: task.id,
      conversationId: conversation.id,
      changeRequestId: request.id,
      previousContractVersion: baseContract.version,
      contractId,
      contractVersion: nextVersion,
      contractHash: compiled.contractHash,
      paymentAdjustmentAction: adjustment.action,
    },
  });
  if (!agreement && activatedAgreement) {
    await appendEvent(tx, {
      type: "COMMERCIAL_AGREEMENT_CREATED",
      aggregateId: activatedAgreement.id,
      taskId: task.id,
      actor: toEventActor(input.actor),
      correlationId: input.correlationId,
      payload: {
        taskId: task.id,
        agreementId: activatedAgreement.id,
        contractId,
        contractVersion: nextVersion,
        providerId: conversation.providerId,
        agreementHash: activatedAgreement.agreementHash,
        agreedPrice: {
          amountMinor: activatedAgreement.agreedPriceMinor,
          currency: activatedAgreement.currency,
        },
      },
    });
  }
  if (activatedAgreement && canTransition(task.status, "AGREEMENT_READY")) {
    await transitionTask(tx, {
      taskId: task.id,
      to: "AGREEMENT_READY",
      actor: input.actor,
      correlationId: input.correlationId,
    });
  }
  await appendEvent(tx, {
    type: "CONTRACT_AMENDED",
    aggregateId: contractId,
    taskId: task.id,
    actor: toEventActor(input.actor),
    correlationId: input.correlationId,
    payload: {
      taskId: task.id,
      contractId,
      fromVersion: baseContract.version,
      toVersion: nextVersion,
      reason: request.reason,
    },
  });

  return {
    changeRequest: activatedRequest,
    contractId,
    contractVersion: nextVersion,
    contractHash: compiled.contractHash,
    paymentAdjustment: adjustment,
    status: "ACTIVATED" as const,
  };
}

async function setActivationFailure(
  input: {
    conversationId: string;
    changeRequestId: string;
    actor: Actor;
    correlationId: string;
  },
  outcome: "FAILED" | "RECONCILIATION_REQUIRED",
  message: string,
  paymentAdjustmentAction: string,
) {
  const status = outcome === "FAILED" ? "ACTIVATION_FAILED" : "ACTIVATION_RECONCILIATION_REQUIRED";
  await withTransaction(async (tx) => {
    const [request] = await tx
      .select()
      .from(contractChangeRequests)
      .where(
        and(
          eq(contractChangeRequests.id, input.changeRequestId),
          eq(contractChangeRequests.conversationId, input.conversationId),
          eq(contractChangeRequests.status, "ACTIVATING"),
        ),
      )
      .for("update")
      .limit(1);
    if (!request) throw conflict("The contract change is no longer being activated.");
    await tx
      .update(contractChangeRequests)
      .set({ status, responseNote: message, updatedAt: new Date() })
      .where(eq(contractChangeRequests.id, request.id));
    await appendEvent(tx, {
      type: "CONTRACT_CHANGE_ACTIVATION_FAILED",
      aggregateId: request.baseContractId,
      taskId: request.taskId,
      actor: toEventActor(input.actor),
      correlationId: input.correlationId,
      payload: {
        taskId: request.taskId,
        conversationId: request.conversationId,
        changeRequestId: request.id,
        outcome,
        paymentAdjustmentAction,
      },
    });
  });
  throw conflict(message);
}

type ReauthorizationPlan = {
  requestId: string;
  taskId: string;
  paymentId: string;
  oldAuthorizationId: string;
  oldAmountMinor: number;
  targetAmountMinor: number;
  currency: Money["currency"];
  authorizeKey: string;
  orderId: string;
};

async function finishReauthorization(
  input: {
    conversationId: string;
    changeRequestId: string;
    actor: Actor;
    correlationId: string;
  },
  plan: ReauthorizationPlan,
  authorization: { authorizationId: string; providerOrderId?: string },
) {
  return withTransaction(async (tx) => {
    const [request] = await tx
      .select()
      .from(contractChangeRequests)
      .where(eq(contractChangeRequests.id, plan.requestId))
      .for("update")
      .limit(1);
    if (request?.status === "ACTIVATED" && request.activatedContractId) {
      return {
        changeRequest: request,
        contractId: request.activatedContractId,
        status: "ACTIVATED" as const,
      };
    }

    const [payment] = await tx
      .select()
      .from(payments)
      .where(eq(payments.id, plan.paymentId))
      .for("update")
      .limit(1);
    if (
      !request ||
      request.status !== "ACTIVATING" ||
      !payment ||
      payment.status !== "AUTHORIZED"
    ) {
      throw conflict(
        "PayPal completed the authorization change, but WorkPay state changed unexpectedly. Reconciliation is required.",
      );
    }

    const paymentStillUsesOldAuthorization =
      payment.providerAuthorizationId === plan.oldAuthorizationId &&
      payment.amountMinor === plan.oldAmountMinor;
    const paymentAlreadyUsesNewAuthorization =
      payment.providerAuthorizationId === authorization.authorizationId &&
      payment.amountMinor === plan.targetAmountMinor;
    if (!paymentStillUsesOldAuthorization && !paymentAlreadyUsesNewAuthorization) {
      throw conflict(
        "PayPal completed the authorization change, but WorkPay state changed unexpectedly. Reconciliation is required.",
      );
    }
    if (paymentStillUsesOldAuthorization) {
      await tx
        .update(payments)
        .set({
          amountMinor: plan.targetAmountMinor,
          currency: plan.currency,
          providerAuthorizationId: authorization.authorizationId,
          providerOrderId: authorization.providerOrderId ?? null,
          authorizedAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(payments.id, payment.id));
    }
    return finalizeContractChangeRequest(tx, input);
  });
}

/**
 * Handles only the replacement of an existing authorization. Changes that
 * need post-capture settlement remain blocked until the payment model supports
 * multiple authorization/capture legs and payout reconciliation.
 */
export async function activateContractChangeRequest(input: {
  conversationId: string;
  changeRequestId: string;
  actor: Actor;
  correlationId: string;
}) {
  const prepared = await withTransaction(async (tx) => {
    const [request] = await tx
      .select()
      .from(contractChangeRequests)
      .where(
        and(
          eq(contractChangeRequests.id, input.changeRequestId),
          eq(contractChangeRequests.conversationId, input.conversationId),
        ),
      )
      .for("update")
      .limit(1);
    if (!request) throw notFound("Change proposal");

    const [conversation] = await tx
      .select()
      .from(taskConversations)
      .where(eq(taskConversations.id, request.conversationId))
      .for("update")
      .limit(1);
    if (
      !conversation ||
      !input.actor.id ||
      ![conversation.buyerUserId, conversation.providerUserId].includes(input.actor.id)
    ) {
      throw notFound("Change proposal");
    }
    if (request.status === "ACTIVATING") {
      const operations = await tx
        .select()
        .from(paymentOperations)
        .where(
          inArray(paymentOperations.idempotencyKey, [
            paypalRequestId("contract-change-authorize", request.id),
            paypalRequestId("contract-change-void", request.id),
          ]),
        );
      const authorization = operations.find(
        (operation) =>
          operation.idempotencyKey === paypalRequestId("contract-change-authorize", request.id),
      );
      const voidOperation = operations.find(
        (operation) =>
          operation.idempotencyKey === paypalRequestId("contract-change-void", request.id),
      );
      if (
        authorization?.status === "SUCCEEDED" &&
        authorization.providerOperationId &&
        voidOperation?.status === "SUCCEEDED" &&
        voidOperation.providerOperationId
      ) {
        const providerOrderId =
          authorization.rawResponse &&
          typeof authorization.rawResponse === "object" &&
          "providerOrderId" in authorization.rawResponse &&
          typeof authorization.rawResponse.providerOrderId === "string"
            ? authorization.rawResponse.providerOrderId
            : undefined;
        return {
          kind: "resume" as const,
          plan: {
            requestId: request.id,
            taskId: request.taskId,
            paymentId: authorization.paymentId,
            oldAuthorizationId: voidOperation.providerOperationId,
            oldAmountMinor: voidOperation.amountMinor,
            targetAmountMinor: authorization.amountMinor,
            currency: authorization.currency as Money["currency"],
            authorizeKey: authorization.idempotencyKey,
            orderId: `amendment:${request.id}`,
          },
          authorization: {
            authorizationId: authorization.providerOperationId,
            ...(providerOrderId ? { providerOrderId } : {}),
          },
        };
      }
      throw conflict(
        "PayPal activation is in progress or requires reconciliation. WorkPay will not repeat an uncertain payment operation.",
      );
    }
    if (request.status === "ACTIVATED" && request.activatedContractId) {
      return {
        kind: "complete" as const,
        result: {
          changeRequest: request,
          contractId: request.activatedContractId,
          status: "ACTIVATED" as const,
        },
      };
    }
    if (request.status !== "ACCEPTED_PENDING_ACTIVATION") {
      throw conflict(
        request.status === "ACTIVATING"
          ? "PayPal activation is already in progress."
          : request.status === "ACTIVATION_RECONCILIATION_REQUIRED"
            ? "PayPal's outcome must be reconciled before this change can proceed."
            : "Both participants must accept the change before activation.",
      );
    }
    if (conversation.status !== "OPEN") throw conflict("The conversation is not open.");

    const [task] = await tx
      .select()
      .from(tasks)
      .where(eq(tasks.id, request.taskId))
      .for("update")
      .limit(1);
    if (!task) throw notFound("Task");
    if (["COMPLETED", "CANCELLED", "EXPIRED"].includes(task.status)) {
      throw conflict("A completed, cancelled, or expired task cannot be amended.");
    }

    const [baseContract] = await tx
      .select()
      .from(workContracts)
      .where(
        and(
          eq(workContracts.taskId, request.taskId),
          eq(workContracts.status, "ACTIVE"),
          eq(workContracts.version, request.baseContractVersion),
          eq(workContracts.contractHash, request.baseContractHash),
        ),
      )
      .for("update")
      .limit(1);
    if (
      !baseContract ||
      conversation.currentContractVersion !== baseContract.version ||
      conversation.currentContractHash !== baseContract.contractHash
    ) {
      throw conflict(
        "The original agreement is no longer current. This change cannot be activated.",
      );
    }

    const [submittedWork] = await tx
      .select({ id: workSubmissions.id })
      .from(workSubmissions)
      .where(
        and(
          eq(workSubmissions.taskId, task.id),
          inArray(workSubmissions.status, ["SUBMITTED", "UNDER_REVIEW", "ACCEPTED"]),
        ),
      )
      .limit(1);
    if (submittedWork) {
      throw conflict(
        "A deliverable is under review or already accepted. Resolve its review before changing the contract.",
      );
    }

    const terms = validateProposedTerms(request, task.id);
    const [agreement] = await tx
      .select()
      .from(commercialAgreements)
      .where(eq(commercialAgreements.taskId, task.id))
      .for("update")
      .limit(1);
    const [payment] = await tx
      .select()
      .from(payments)
      .where(eq(payments.taskId, task.id))
      .for("update")
      .limit(1);
    const targetPrice = terms.agreedPriceMinor;
    if ((agreement || payment) && targetPrice === null) {
      throw conflict("A change to a funded agreement must include its agreed price.");
    }
    const adjustment =
      targetPrice === null
        ? { action: "NO_FINANCIAL_ADJUSTMENT" as const }
        : planPaymentAdjustment(payment ?? null, targetPrice);
    const preAuthorizationState =
      !payment || ["PENDING", "FAILED", "VOIDED"].includes(payment.status);
    if (
      adjustment.action === "NO_FINANCIAL_ADJUSTMENT" ||
      (adjustment.action === "AUTHORIZE_NEW_TOTAL" && preAuthorizationState)
    ) {
      return {
        kind: "complete" as const,
        result: await finalizeContractChangeRequest(tx, input),
      };
    }
    if (adjustment.action !== "VOID_AND_REAUTHORIZE" || !payment || targetPrice === null) {
      throw conflict(
        `This change needs ${adjustment.action.replaceAll("_", " ").toLowerCase()} before activation. The existing contract remains in effect.`,
        { paymentAdjustmentAction: adjustment.action },
      );
    }
    if (!payment.providerAuthorizationId || targetPrice === 0) {
      throw conflict("The current PayPal authorization cannot be safely replaced.");
    }

    const authorizeKey = paypalRequestId("contract-change-authorize", request.id);
    const now = new Date();
    await tx
      .update(contractChangeRequests)
      .set({
        status: "ACTIVATING",
        paymentAdjustmentPlan: adjustment,
        updatedAt: now,
      })
      .where(
        and(
          eq(contractChangeRequests.id, request.id),
          eq(contractChangeRequests.status, "ACCEPTED_PENDING_ACTIVATION"),
        ),
      );
    await tx.insert(paymentOperations).values({
      id: newId("poper"),
      paymentId: payment.id,
      taskId: payment.taskId,
      action: "AUTHORIZE",
      status: "PENDING",
      amountMinor: targetPrice,
      currency: terms.budget.currency,
      idempotencyKey: authorizeKey,
      requestHash: hashObject({
        orderId: `amendment:${request.id}`,
        amount: money(targetPrice, terms.budget.currency as Money["currency"]),
        idempotencyKey: authorizeKey,
      }),
    });
    return {
      kind: "reauthorize" as const,
      requestId: request.id,
      taskId: task.id,
      paymentId: payment.id,
      oldAuthorizationId: payment.providerAuthorizationId,
      oldAmountMinor: payment.amountMinor,
      targetAmountMinor: targetPrice,
      currency: terms.budget.currency as Money["currency"],
      authorizeKey,
      orderId: `amendment:${request.id}`,
    };
  });

  if (prepared.kind === "complete") return prepared.result;
  if (prepared.kind === "resume") {
    return finishReauthorization(input, prepared.plan, prepared.authorization);
  }

  const gateway = getPaymentGateway();
  const targetAmount = money(prepared.targetAmountMinor, prepared.currency);
  let authorization: Awaited<ReturnType<typeof gateway.authorize>>;
  try {
    authorization = await gateway.authorize({
      orderId: prepared.orderId,
      amount: targetAmount,
      description: `Amended WorkPay task ${prepared.taskId}`,
      idempotencyKey: prepared.authorizeKey,
    });
  } catch (error) {
    logger.warn(
      { err: String(error), changeRequestId: prepared.requestId },
      "amendment authorization outcome unknown",
    );
    authorization = { status: "UNKNOWN", errorMessage: "Authorization outcome unknown" };
  }
  const authorizationId =
    authorization.status === "SUCCESS" ? authorization.authorizationId : undefined;
  const authorizationStatus =
    authorization.status === "SUCCESS" && authorizationId
      ? "SUCCEEDED"
      : authorization.status === "DECLINED"
        ? "FAILED"
        : "UNKNOWN";
  await withTransaction(async (tx) => {
    await tx
      .update(paymentOperations)
      .set({
        status: authorizationStatus,
        providerOperationId: authorizationId ?? null,
        rawResponse: authorization as unknown as Record<string, unknown>,
        errorCode: authorization.errorCode ?? null,
        errorMessage: authorization.errorMessage ?? null,
      })
      .where(eq(paymentOperations.idempotencyKey, prepared.authorizeKey));
  });
  if (authorizationStatus !== "SUCCEEDED" || !authorizationId) {
    return setActivationFailure(
      input,
      authorizationStatus === "FAILED" ? "FAILED" : "RECONCILIATION_REQUIRED",
      authorizationStatus === "FAILED"
        ? "PayPal declined the new authorization. The current contract remains active."
        : "PayPal's authorization outcome is unknown. Reconcile it before proceeding.",
      "VOID_AND_REAUTHORIZE",
    );
  }

  const voidKey = paypalRequestId("contract-change-void", prepared.requestId);
  await withTransaction(async (tx) => {
    await tx.insert(paymentOperations).values({
      id: newId("poper"),
      paymentId: prepared.paymentId,
      taskId: prepared.taskId,
      action: "VOID",
      status: "PENDING",
      amountMinor: prepared.oldAmountMinor,
      currency: prepared.currency,
      idempotencyKey: voidKey,
      requestHash: hashObject({
        authorizationId: prepared.oldAuthorizationId,
        idempotencyKey: voidKey,
      }),
    });
  });
  let voidResult: Awaited<ReturnType<typeof gateway.void>>;
  try {
    voidResult = await gateway.void({
      authorizationId: prepared.oldAuthorizationId,
      idempotencyKey: voidKey,
    });
  } catch (error) {
    logger.warn(
      { err: String(error), changeRequestId: prepared.requestId },
      "previous amendment authorization void outcome unknown",
    );
    voidResult = { status: "UNKNOWN", errorMessage: "Void outcome unknown" };
  }
  await withTransaction(async (tx) => {
    await tx
      .update(paymentOperations)
      .set({
        status:
          voidResult.status === "SUCCESS"
            ? "SUCCEEDED"
            : voidResult.status === "DECLINED"
              ? "FAILED"
              : "UNKNOWN",
        providerOperationId: prepared.oldAuthorizationId,
        rawResponse: voidResult as unknown as Record<string, unknown>,
        errorCode: voidResult.errorCode ?? null,
        errorMessage: voidResult.errorMessage ?? null,
      })
      .where(eq(paymentOperations.idempotencyKey, voidKey));
  });
  if (voidResult.status !== "SUCCESS") {
    return setActivationFailure(
      input,
      "RECONCILIATION_REQUIRED",
      "The replacement authorization succeeded, but PayPal did not confirm release of the previous hold. Reconciliation is required; the contract remains unchanged.",
      "VOID_AND_REAUTHORIZE",
    );
  }

  return finishReauthorization(input, prepared, {
    authorizationId,
    ...(authorization.providerOrderId ? { providerOrderId: authorization.providerOrderId } : {}),
  });
}

export async function listContractChangeRequests(
  db: Database,
  input: { conversationId: string; userId: string },
) {
  const [conversation] = await db
    .select({
      buyerUserId: taskConversations.buyerUserId,
      providerUserId: taskConversations.providerUserId,
    })
    .from(taskConversations)
    .where(eq(taskConversations.id, input.conversationId))
    .limit(1);
  if (
    !conversation ||
    (conversation.buyerUserId !== input.userId && conversation.providerUserId !== input.userId)
  ) {
    throw notFound("Conversation");
  }
  return db
    .select()
    .from(contractChangeRequests)
    .where(eq(contractChangeRequests.conversationId, input.conversationId))
    .orderBy(desc(contractChangeRequests.createdAt));
}
