import { describe, expect, it } from "vitest";
import { assertTransition, canTransition, isTerminal } from "./state.js";

describe("task state machine", () => {
  it("allows the documented happy path", () => {
    expect(canTransition("CREATED", "PLANNING")).toBe(true);
    expect(canTransition("PLANNING", "CONTRACT_REVIEW")).toBe(true);
    expect(canTransition("CONTRACT_REVIEW", "APPROVED")).toBe(true);
    expect(canTransition("APPROVED", "PROVIDER_SEARCH")).toBe(true);
    expect(canTransition("PROVIDER_SEARCH", "NEGOTIATION")).toBe(true);
    expect(canTransition("NEGOTIATION", "AGREEMENT_READY")).toBe(true);
    expect(canTransition("AGREEMENT_READY", "PAYMENT_AUTHORIZATION")).toBe(true);
    expect(canTransition("PAYMENT_AUTHORIZATION", "WORK_IN_PROGRESS")).toBe(true);
    expect(canTransition("WORK_IN_PROGRESS", "SUBMITTED")).toBe(true);
    expect(canTransition("SUBMITTED", "VERIFYING")).toBe(true);
    expect(canTransition("VERIFYING", "PAYMENT_RELEASE")).toBe(true);
    expect(canTransition("PAYMENT_RELEASE", "COMPLETED")).toBe(true);
  });

  it("allows the revision loop and the human-review branch", () => {
    expect(canTransition("VERIFYING", "REVISION_REQUIRED")).toBe(true);
    expect(canTransition("REVISION_REQUIRED", "WORK_IN_PROGRESS")).toBe(true);
    expect(canTransition("VERIFYING", "HUMAN_REVIEW")).toBe(true);
    expect(canTransition("HUMAN_REVIEW", "PAYMENT_RELEASE")).toBe(true);
    expect(canTransition("HUMAN_REVIEW", "REVISION_REQUIRED")).toBe(true);
  });

  it("rejects illegal jumps", () => {
    expect(canTransition("CREATED", "COMPLETED")).toBe(false);
    expect(canTransition("CREATED", "PAYMENT_RELEASE")).toBe(false);
    expect(canTransition("APPROVED", "WORK_IN_PROGRESS")).toBe(false);
    expect(() => assertTransition("CREATED", "COMPLETED")).toThrow(/Illegal task transition/);
  });

  it("treats COMPLETED, CANCELLED and EXPIRED as terminal", () => {
    expect(isTerminal("COMPLETED")).toBe(true);
    expect(isTerminal("CANCELLED")).toBe(true);
    expect(isTerminal("EXPIRED")).toBe(true);
    expect(isTerminal("WORK_IN_PROGRESS")).toBe(false);
  });
});
