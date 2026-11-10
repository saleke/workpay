import { describe, expect, it } from "vitest";
import { canUseProfessionalProfile, requiresSimulatedPayment } from "./account-class.js";

describe("work account compatibility", () => {
  it("keeps normal member work compatible", () => {
    const input = { buyerClass: "MEMBER", providerClass: "MEMBER", evaluationMode: false } as const;
    expect(canUseProfessionalProfile(input)).toBe(true);
    expect(requiresSimulatedPayment(input)).toBe(false);
  });

  it("keeps evaluator fixture work simulated", () => {
    const input = {
      buyerClass: "DEMO_FIXTURE",
      providerClass: "DEMO_FIXTURE",
      evaluationMode: true,
    } as const;
    expect(canUseProfessionalProfile(input)).toBe(true);
    expect(requiresSimulatedPayment(input)).toBe(true);
  });

  it("lets members use evaluation professionals only in evaluator mode", () => {
    const enabled = {
      buyerClass: "MEMBER",
      providerClass: "DEMO_FIXTURE",
      evaluationMode: true,
    } as const;
    expect(canUseProfessionalProfile(enabled)).toBe(true);
    expect(requiresSimulatedPayment(enabled)).toBe(true);
    expect(canUseProfessionalProfile({ ...enabled, evaluationMode: false })).toBe(false);
  });

  it("never exposes real member professionals to evaluator fixture buyers", () => {
    expect(
      canUseProfessionalProfile({
        buyerClass: "DEMO_FIXTURE",
        providerClass: "MEMBER",
        evaluationMode: true,
      }),
    ).toBe(false);
  });
});
