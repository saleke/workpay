/**
 * Negotiation guardrails (Component 5).
 *
 * The agent negotiates on the buyer's behalf, so the guardrails are what keep a
 * helpful model from committing the buyer to more than they offered:
 *
 *  - the buyer agent can never propose a price above the contract budget;
 *  - the number of rounds is bounded, so a negotiation always terminates;
 *  - an offer can only be accepted while the price is within the budget;
 *  - deadlines must be in the future and within a sane horizon.
 *
 * These are pure functions. The service layer calls them before persisting an
 * offer, and the same checks are enforced when an offer arrives from a provider.
 */
import { money, type Money } from "../../platform/money.js";

export const DEFAULT_MAX_ROUNDS = 4;
export const MAX_DEADLINE_DAYS = 120;

export type OfferParty = "BUYER_AGENT" | "PROVIDER";

export interface OfferValidationInput {
  submittedBy: OfferParty;
  priceMinor: number;
  currency: string;
  budget: Money;
  currentRound: number;
  maxRounds: number;
  deliveryDeadline: Date;
  now: Date;
}

export interface ValidationResult {
  ok: boolean;
  reasonCode?: string;
  message?: string;
}

function invalid(reasonCode: string, message: string): ValidationResult {
  return { ok: false, reasonCode, message };
}

export function validateOffer(input: OfferValidationInput): ValidationResult {
  if (!Number.isSafeInteger(input.priceMinor) || input.priceMinor < 0) {
    return invalid("offer.invalid_price", "Offer price must be a non-negative integer");
  }
  if (input.currency !== input.budget.currency) {
    return invalid("offer.currency_mismatch", "Offer currency does not match the budget");
  }
  if (input.currentRound >= input.maxRounds) {
    return invalid("offer.round_limit", "The negotiation has reached its round limit");
  }
  if (input.deliveryDeadline.getTime() <= input.now.getTime()) {
    return invalid("offer.deadline_past", "The delivery deadline must be in the future");
  }
  const horizonMs = MAX_DEADLINE_DAYS * 24 * 60 * 60 * 1000;
  if (input.deliveryDeadline.getTime() - input.now.getTime() > horizonMs) {
    return invalid(
      "offer.deadline_too_far",
      `The delivery deadline must be within ${MAX_DEADLINE_DAYS} days`,
    );
  }

  // The buyer agent is the party whose ceiling we protect. A provider may ask
  // for more than the budget (the buyer simply will not accept).
  if (input.submittedBy === "BUYER_AGENT" && input.priceMinor > input.budget.amountMinor) {
    return invalid("offer.over_budget", "The buyer agent may not offer above the contract budget");
  }

  return { ok: true };
}

export function canAcceptOffer(input: {
  priceMinor: number;
  currency: string;
  budget: Money;
}): ValidationResult {
  if (input.currency !== input.budget.currency) {
    return invalid("accept.currency_mismatch", "Currency mismatch");
  }
  if (input.priceMinor > input.budget.amountMinor) {
    return invalid("accept.over_budget", "Cannot accept an offer above the contract budget");
  }
  return { ok: true };
}

/** Discount a buyer-agent offer target to leave a little headroom. */
export function openingOffer(budget: Money, ratio = 0.7): Money {
  return money(Math.floor(budget.amountMinor * ratio), budget.currency);
}
