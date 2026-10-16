/**
 * Negotiation service (Component 5).
 *
 * A bounded exchange of offers between the buyer agent and a provider. Every
 * offer passes through the guardrails before it is stored, and the negotiation
 * always terminates: it is round-limited, and only a price within the contract
 * budget can be accepted.
 *
 * Accepting an offer creates the CommercialAgreement, the frozen commercial
 * terms the payment authorizes against. The agreement pins the contract version
 * it was struck against, so a later contract change makes it visibly stale.
 */
import { desc, eq, and } from "drizzle-orm";
import type { Database } from "../../db/client.js";
import { commercialAgreements, negotiations, offers } from "../../db/schema/negotiation.js";
import { workContracts } from "../../db/schema/contracts.js";
import { tasks } from "../../db/schema/tasks.js";
import { appendEvent } from "../../events/outbox.js";
import { hashObject } from "../../platform/hashing.js";
import { money, type Money } from "../../platform/money.js";
import { newId } from "../../platform/ids.js";
import { conflict, notFound, policyDenied } from "../../platform/errors.js";
import type { Actor } from "../identity/authorize.js";
import { toEventActor } from "../context.js";
import { canAcceptOffer, validateOffer, DEFAULT_MAX_ROUNDS } from "./guardrails.js";

export async function startNegotiation(
  tx: Database,
  options: {
    taskId: string;
    contractId: string;
    providerId: string;
    actor: Actor;
    correlationId: string;
    maxRounds?: number;
  },
) {
  const negotiationId = newId("nego");
  await tx.insert(negotiations).values({
    id: negotiationId,
    taskId: options.taskId,
    contractId: options.contractId,
    providerId: options.providerId,
    status: "INITIATED",
    maxRounds: options.maxRounds ?? DEFAULT_MAX_ROUNDS,
    currentRound: 0,
    turn: "BUYER_AGENT",
  });

  await appendEvent(tx, {
    type: "NEGOTIATION_STARTED",
    aggregateId: negotiationId,
    taskId: options.taskId,
    actor: toEventActor(options.actor),
    correlationId: options.correlationId,
    payload: {
      taskId: options.taskId,
      negotiationId,
      contractId: options.contractId,
      providerId: options.providerId,
    },
  });

  return negotiationId;
}

async function loadNegotiationContext(tx: Database, negotiationId: string) {
  const [negotiation] = await tx
    .select()
    .from(negotiations)
    .where(eq(negotiations.id, negotiationId))
    .limit(1);
  if (!negotiation) throw notFound("Negotiation");
  const [contract] = await tx
    .select()
    .from(workContracts)
    .where(eq(workContracts.id, negotiation.contractId))
    .limit(1);
  if (!contract) throw notFound("Contract");
  const [task] = await tx.select().from(tasks).where(eq(tasks.id, negotiation.taskId)).limit(1);
  if (!task) throw notFound("Task");
  return { negotiation, contract, task };
}

/** Read-only inputs the buyer agent needs to draft its next offer. */
export interface BuyerOfferContext {
  taskId: string;
  contractSummary: string;
  budgetMinor: number;
  currency: string;
  round: number;
  desiredDeadline: string;
  providerAskingMinor?: number;
}

/** A concrete buyer-agent offer, already drafted by the agent. */
export interface BuyerOfferDraft {
  priceMinor: number;
  deliveryDeadline: Date;
  message?: string | null;
}

/**
 * Read the context for the buyer agent's next offer. This is deliberately
 * read-only and network-free: the caller drafts the offer with the AI adapter
 * outside any transaction, then calls `submitBuyerAgentOffer` with the result.
 */
export async function prepareBuyerOffer(
  db: Database,
  negotiationId: string,
): Promise<BuyerOfferContext> {
  const { negotiation, contract, task } = await loadNegotiationContext(db, negotiationId);
  if (negotiation.status === "ACCEPTED" || negotiation.status === "REJECTED") {
    throw conflict("The negotiation has already ended");
  }
  if (negotiation.turn !== "BUYER_AGENT") {
    throw conflict("It is not the buyer agent's turn");
  }

  const budget = money(contract.budgetMinor, contract.currency as Money["currency"]);
  const desiredDeadline = (
    contract.deadline ??
    task.desiredDeadline ??
    new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
  ).toISOString();

  // The most recent provider ask, if any, informs the agent's counter.
  const [lastProviderOffer] = await db
    .select()
    .from(offers)
    .where(and(eq(offers.negotiationId, negotiation.id), eq(offers.submittedBy, "PROVIDER")))
    .orderBy(desc(offers.version))
    .limit(1);

  return {
    taskId: task.id,
    contractSummary: contract.summary,
    budgetMinor: budget.amountMinor,
    currency: budget.currency,
    round: negotiation.currentRound,
    desiredDeadline,
    ...(lastProviderOffer ? { providerAskingMinor: lastProviderOffer.priceMinor } : {}),
  };
}

/** Validate and store the buyer agent's next offer. */
export async function submitBuyerAgentOffer(
  tx: Database,
  options: {
    negotiationId: string;
    actor: Actor;
    correlationId: string;
    draft: BuyerOfferDraft;
  },
) {
  const { negotiation, contract, task } = await loadNegotiationContext(tx, options.negotiationId);
  if (negotiation.status === "ACCEPTED" || negotiation.status === "REJECTED") {
    throw conflict("The negotiation has already ended");
  }
  if (negotiation.turn !== "BUYER_AGENT") {
    throw conflict("It is not the buyer agent's turn");
  }

  const budget = money(contract.budgetMinor, contract.currency as Money["currency"]);
  const deliveryDeadline = options.draft.deliveryDeadline;
  const validation = validateOffer({
    submittedBy: "BUYER_AGENT",
    priceMinor: options.draft.priceMinor,
    currency: budget.currency,
    budget,
    currentRound: negotiation.currentRound,
    maxRounds: negotiation.maxRounds,
    deliveryDeadline,
    now: new Date(),
  });
  if (!validation.ok) {
    throw policyDenied(
      validation.reasonCode ?? "offer.invalid",
      validation.message ?? "Offer rejected by guardrails",
    );
  }

  const [latestOffer] = await tx
    .select({ version: offers.version })
    .from(offers)
    .where(eq(offers.negotiationId, negotiation.id))
    .orderBy(desc(offers.version))
    .limit(1);
  const version = (latestOffer?.version ?? 0) + 1;

  const offerId = newId("offer");
  await tx.insert(offers).values({
    id: offerId,
    negotiationId: negotiation.id,
    taskId: task.id,
    version,
    submittedBy: "BUYER_AGENT",
    status: "PENDING",
    priceMinor: options.draft.priceMinor,
    currency: budget.currency,
    deliveryDeadline,
    message: options.draft.message ?? null,
  });

  await tx
    .update(negotiations)
    .set({
      status: "OFFER_SENT",
      currentRound: negotiation.currentRound + 1,
      turn: "PROVIDER",
      updatedAt: new Date(),
    })
    .where(eq(negotiations.id, negotiation.id));

  await appendEvent(tx, {
    type: "OFFER_CREATED",
    aggregateId: negotiation.id,
    taskId: task.id,
    actor: toEventActor(options.actor),
    correlationId: options.correlationId,
    payload: {
      taskId: task.id,
      negotiationId: negotiation.id,
      offerId,
      version,
      submittedBy: "BUYER_AGENT",
      price: { amountMinor: options.draft.priceMinor, currency: budget.currency },
      deliveryDeadline: deliveryDeadline.toISOString(),
    },
  });

  return { offerId, priceMinor: options.draft.priceMinor, version };
}

/** Record a provider's counteroffer. */
export async function submitProviderOffer(
  tx: Database,
  options: {
    negotiationId: string;
    actor: Actor;
    correlationId: string;
    priceMinor: number;
    deliveryDeadline: Date;
    message?: string;
  },
) {
  const { negotiation, contract, task } = await loadNegotiationContext(tx, options.negotiationId);
  if (negotiation.status === "ACCEPTED" || negotiation.status === "REJECTED") {
    throw conflict("The negotiation has already ended");
  }
  if (negotiation.turn !== "PROVIDER") {
    throw conflict("It is not the provider's turn");
  }

  const budget = money(contract.budgetMinor, contract.currency as Money["currency"]);
  const validation = validateOffer({
    submittedBy: "PROVIDER",
    priceMinor: options.priceMinor,
    currency: budget.currency,
    budget,
    currentRound: negotiation.currentRound,
    maxRounds: negotiation.maxRounds,
    deliveryDeadline: options.deliveryDeadline,
    now: new Date(),
  });
  if (!validation.ok) {
    throw policyDenied(
      validation.reasonCode ?? "offer.invalid",
      validation.message ?? "Offer rejected by guardrails",
    );
  }

  const [latestOffer] = await tx
    .select({ version: offers.version })
    .from(offers)
    .where(eq(offers.negotiationId, negotiation.id))
    .orderBy(desc(offers.version))
    .limit(1);
  const version = (latestOffer?.version ?? 0) + 1;

  const offerId = newId("offer");
  await tx.insert(offers).values({
    id: offerId,
    negotiationId: negotiation.id,
    taskId: task.id,
    version,
    submittedBy: "PROVIDER",
    status: "PENDING",
    priceMinor: options.priceMinor,
    currency: budget.currency,
    deliveryDeadline: options.deliveryDeadline,
    message: options.message ?? null,
  });

  await tx
    .update(negotiations)
    .set({
      status: "COUNTEROFFER_RECEIVED",
      currentRound: negotiation.currentRound + 1,
      turn: "BUYER_AGENT",
      updatedAt: new Date(),
    })
    .where(eq(negotiations.id, negotiation.id));

  await appendEvent(tx, {
    type: "COUNTEROFFER_RECEIVED",
    aggregateId: negotiation.id,
    taskId: task.id,
    actor: toEventActor(options.actor),
    correlationId: options.correlationId,
    payload: {
      taskId: task.id,
      negotiationId: negotiation.id,
      offerId,
      price: { amountMinor: options.priceMinor, currency: budget.currency },
    },
  });

  return { offerId, version };
}

/** Accept an offer and create the commercial agreement. */
export async function acceptOffer(
  tx: Database,
  options: {
    offerId: string;
    actor: Actor;
    correlationId: string;
    acceptedBy: "BUYER_AGENT" | "PROVIDER";
  },
) {
  const [offer] = await tx.select().from(offers).where(eq(offers.id, options.offerId)).limit(1);
  if (!offer) throw notFound("Offer");
  if (offer.status !== "PENDING") throw conflict(`Offer is already ${offer.status}`);

  const { negotiation, contract, task } = await loadNegotiationContext(tx, offer.negotiationId);

  const budget = money(contract.budgetMinor, contract.currency as Money["currency"]);
  const acceptance = canAcceptOffer({
    priceMinor: offer.priceMinor,
    currency: offer.currency,
    budget,
  });
  if (!acceptance.ok) {
    throw policyDenied(
      acceptance.reasonCode ?? "accept.invalid",
      acceptance.message ?? "Offer cannot be accepted",
    );
  }

  // Supersede every other pending offer. Exactly one offer becomes ACCEPTED.
  await tx
    .update(offers)
    .set({ status: "SUPERSEDED", resolvedAt: new Date() })
    .where(and(eq(offers.negotiationId, negotiation.id), eq(offers.status, "PENDING")));
  await tx
    .update(offers)
    .set({ status: "ACCEPTED", resolvedAt: new Date() })
    .where(eq(offers.id, offer.id));

  await tx
    .update(negotiations)
    .set({ status: "ACCEPTED", acceptedOfferId: offer.id, updatedAt: new Date() })
    .where(eq(negotiations.id, negotiation.id));

  const agreedPrice = money(offer.priceMinor, offer.currency as Money["currency"]);
  const agreementId = newId("agreement");
  const agreementHash = hashObject({
    agreementId,
    taskId: task.id,
    contractId: contract.id,
    contractVersion: contract.version,
    contractHash: contract.contractHash,
    providerId: negotiation.providerId,
    agreedPriceMinor: agreedPrice.amountMinor,
    currency: agreedPrice.currency,
    deliveryDeadline: offer.deliveryDeadline.toISOString(),
    paymentTerms: "FULL_ON_ACCEPTANCE",
  });

  await tx.insert(commercialAgreements).values({
    id: agreementId,
    taskId: task.id,
    contractId: contract.id,
    negotiationId: negotiation.id,
    providerId: negotiation.providerId,
    contractVersion: contract.version,
    status: "PENDING_AUTHORIZATION",
    agreedPriceMinor: agreedPrice.amountMinor,
    currency: agreedPrice.currency,
    deliveryDeadline: offer.deliveryDeadline,
    paymentTerms: "FULL_ON_ACCEPTANCE",
    agreementHash,
  });

  await appendEvent(tx, {
    type: "OFFER_ACCEPTED",
    aggregateId: negotiation.id,
    taskId: task.id,
    actor: toEventActor(options.actor),
    correlationId: options.correlationId,
    payload: {
      taskId: task.id,
      negotiationId: negotiation.id,
      offerId: offer.id,
      acceptedBy: options.acceptedBy,
    },
  });

  await appendEvent(tx, {
    type: "COMMERCIAL_AGREEMENT_CREATED",
    aggregateId: agreementId,
    taskId: task.id,
    actor: toEventActor(options.actor),
    correlationId: options.correlationId,
    payload: {
      taskId: task.id,
      agreementId,
      contractId: contract.id,
      contractVersion: contract.version,
      providerId: negotiation.providerId,
      agreementHash,
      agreedPrice: { amountMinor: agreedPrice.amountMinor, currency: agreedPrice.currency },
    },
  });

  return {
    agreementId,
    agreedPrice,
    contractVersion: contract.version,
    contractHash: contract.contractHash,
  };
}

export async function getNegotiationWithOffers(db: Database, negotiationId: string) {
  const [negotiation] = await db
    .select()
    .from(negotiations)
    .where(eq(negotiations.id, negotiationId))
    .limit(1);
  if (!negotiation) return null;
  const offerRows = await db
    .select()
    .from(offers)
    .where(eq(offers.negotiationId, negotiationId))
    .orderBy(offers.version);
  return { negotiation, offers: offerRows };
}
