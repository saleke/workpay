import { describe, expect, it } from "vitest";
import { money } from "../../platform/money.js";
import { canAcceptOffer, openingOffer, validateOffer } from "./guardrails.js";

const budget = money(10000, "USD");
const now = new Date("2026-01-01T00:00:00.000Z");
const soon = new Date("2026-01-05T00:00:00.000Z");

describe("negotiation guardrails", () => {
  it("allows a buyer-agent offer within budget", () => {
    const result = validateOffer({
      submittedBy: "BUYER_AGENT",
      priceMinor: 8000,
      currency: "USD",
      budget,
      currentRound: 0,
      maxRounds: 4,
      deliveryDeadline: soon,
      now,
    });
    expect(result.ok).toBe(true);
  });

  it("blocks a buyer-agent offer above the budget", () => {
    const result = validateOffer({
      submittedBy: "BUYER_AGENT",
      priceMinor: 10001,
      currency: "USD",
      budget,
      currentRound: 0,
      maxRounds: 4,
      deliveryDeadline: soon,
      now,
    });
    expect(result.ok).toBe(false);
    expect(result.reasonCode).toBe("offer.over_budget");
  });

  it("allows a provider to ask above budget (the buyer simply will not accept)", () => {
    const result = validateOffer({
      submittedBy: "PROVIDER",
      priceMinor: 50000,
      currency: "USD",
      budget,
      currentRound: 0,
      maxRounds: 4,
      deliveryDeadline: soon,
      now,
    });
    expect(result.ok).toBe(true);
  });

  it("enforces the round limit", () => {
    const result = validateOffer({
      submittedBy: "PROVIDER",
      priceMinor: 1000,
      currency: "USD",
      budget,
      currentRound: 4,
      maxRounds: 4,
      deliveryDeadline: soon,
      now,
    });
    expect(result.reasonCode).toBe("offer.round_limit");
  });

  it("rejects past deadlines and far-future deadlines", () => {
    const past = validateOffer({
      submittedBy: "PROVIDER",
      priceMinor: 1000,
      currency: "USD",
      budget,
      currentRound: 0,
      maxRounds: 4,
      deliveryDeadline: new Date("2025-12-31T00:00:00.000Z"),
      now,
    });
    expect(past.reasonCode).toBe("offer.deadline_past");

    const far = validateOffer({
      submittedBy: "PROVIDER",
      priceMinor: 1000,
      currency: "USD",
      budget,
      currentRound: 0,
      maxRounds: 4,
      deliveryDeadline: new Date("2027-01-01T00:00:00.000Z"),
      now,
    });
    expect(far.reasonCode).toBe("offer.deadline_too_far");
  });

  it("only accepts offers within budget", () => {
    expect(canAcceptOffer({ priceMinor: 10000, currency: "USD", budget }).ok).toBe(true);
    expect(canAcceptOffer({ priceMinor: 10001, currency: "USD", budget }).reasonCode).toBe(
      "accept.over_budget",
    );
  });

  it("computes a deterministic opening offer", () => {
    expect(openingOffer(budget).amountMinor).toBe(7000);
  });
});
