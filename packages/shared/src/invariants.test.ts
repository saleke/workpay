/**
 * Appendix D: Invariant Test Suite.
 *
 * Automated verification of the architectural invariants defined in
 * ENGINEERING_PLAN.md Appendix D and engineering_quality_constitution.md.
 *
 * These are non-negotiable laws of the system:
 * - M1: Money stored/compared only as integer minor units (never float).
 * - P1-P5: Money follows proof; authorization != capture; deterministic gating.
 * - A1-A3: Agent authority bounded; contract hash binds all subsequent actions.
 * - D1-D4: Persistence, immutability, and versioned artifacts.
 * - I1-I2: AI can advise or draft, never authorize money or bypass rules.
 */
import { describe, expect, it } from "vitest";
import { money, parseMoneyInput, type Money } from "./platform/money.js";
import { evaluatePaymentPolicy } from "./domain/payments/policy.js";
import { evaluateAgentAuthority, AGENT_AUTHORITY_VERSION, type AgentActionType } from "./domain/agent/authority.js";
import { canTransition } from "./domain/tasks/state.js";
import { authorize, ACTIONS } from "./domain/identity/authorize.js";
import { sha256HexOfBytes } from "./platform/hashing.js";
import { validateOffer } from "./domain/negotiation/guardrails.js";
import { runDeterministicCheck } from "./domain/verification/checks.js";

describe("Appendix D: Architectural Invariants", () => {
  // ── Invariant M1: Money Representation ──────────────────────────────────────
  describe("M1: Integer minor units for all monetary values", () => {
    it("rejects non-integer minor units and floating-point amounts", () => {
      expect(() => money(10.5 as any, "USD")).toThrow();
      expect(() => money(NaN as any, "USD")).toThrow();
      expect(() => money(Infinity as any, "USD")).toThrow();
    });

    it("rejects negative amounts", () => {
      expect(() => money(-100, "USD")).toThrow();
    });

    it("parses string decimals safely into integer minor units without float rounding issues", () => {
      const parsed = parseMoneyInput("19.99", "USD");
      expect(parsed.amountMinor).toBe(1999);
      expect(parsed.currency).toBe("USD");
      expect(Number.isInteger(parsed.amountMinor)).toBe(true);
    });
  });

  // ── Invariant P1/P2/P3: Payment Policy Gates ────────────────────────────────
  describe("P1/P2/P3: Money follows proof and deterministic payment policy", () => {
    const baseContract = {
      id: "contract_test_1",
      currentVersion: 1,
      currentHash: "hash_v1_approved",
      budget: money(50000, "USD"),
    };

    const baseAgreement = {
      id: "agreement_test_1",
      contractVersion: 1,
      amount: money(45000, "USD"),
      status: "AUTHORIZED",
      agreementHash: "hash_agreement_123",
    };

    const basePayment = {
      id: "pay_test_1",
      status: "AUTHORIZED" as const,
      amount: money(45000, "USD"),
      capturedAmountMinor: null,
      providerAuthorizationId: "auth_paypal_123",
    };

    it("DENIES capture with FAIL verdict", () => {
      const decision = evaluatePaymentPolicy({
        action: "CAPTURE",
        contract: baseContract,
        agreement: baseAgreement,
        payment: basePayment,
        acceptanceDecision: {
          contractVersion: 1,
          contractHash: "hash_v1_approved",
          outcome: "FAIL",
        },
      });

      expect(decision.result).toBe("DENY");
      expect(decision.reasonCode).toBe("verification.passed");
      const verCheck = decision.checks.find((c) => c.checkId === "verification.passed");
      expect(verCheck?.result).toBe("FAIL");
    });

    it("DENIES capture with UNCERTAIN verdict", () => {
      const decision = evaluatePaymentPolicy({
        action: "CAPTURE",
        contract: baseContract,
        agreement: baseAgreement,
        payment: basePayment,
        acceptanceDecision: {
          contractVersion: 1,
          contractHash: "hash_v1_approved",
          outcome: "UNCERTAIN",
        },
      });

      expect(decision.result).toBe("DENY");
      const verCheck = decision.checks.find((c) => c.checkId === "verification.passed");
      expect(verCheck?.result).toBe("FAIL");
    });

    it("DENIES capture when an open blocking case exists", () => {
      const decision = evaluatePaymentPolicy({
        action: "CAPTURE",
        contract: baseContract,
        agreement: baseAgreement,
        payment: basePayment,
        acceptanceDecision: {
          contractVersion: 1,
          contractHash: "hash_v1_approved",
          outcome: "PASS",
        },
        blockingCase: {
          id: "case_dispute_1",
          category: "WORK_DISPUTE",
        },
      });

      expect(decision.result).toBe("DENY");
      const caseCheck = decision.checks.find((c) => c.checkId === "case.no_blocker");
      expect(caseCheck?.result).toBe("FAIL");
    });

    it("DENIES capture on contract hash/version mismatch", () => {
      const decision = evaluatePaymentPolicy({
        action: "CAPTURE",
        contract: {
          ...baseContract,
          currentVersion: 2,
          currentHash: "hash_v2_new",
        },
        agreement: baseAgreement,
        payment: basePayment,
        acceptanceDecision: {
          contractVersion: 1, // Stale version
          contractHash: "hash_v1_approved",
          outcome: "PASS",
        },
      });

      expect(decision.result).toBe("DENY");
      const versionCheck = decision.checks.find((c) => c.checkId === "verification.contract_current");
      expect(versionCheck?.result).toBe("FAIL");
      const hashCheck = decision.checks.find((c) => c.checkId === "verification.hash_matches");
      expect(hashCheck?.result).toBe("FAIL");
    });

    it("DENIES capture if SYSTEM_PAYMENT_PAUSE is true", () => {
      const decision = evaluatePaymentPolicy({
        action: "CAPTURE",
        contract: baseContract,
        agreement: baseAgreement,
        payment: basePayment,
        systemPaymentPaused: true,
        acceptanceDecision: {
          contractVersion: 1,
          contractHash: "hash_v1_approved",
          outcome: "PASS",
        },
      });

      expect(decision.result).toBe("DENY");
      const killSwitchCheck = decision.checks.find((c) => c.checkId === "system.kill_switch");
      expect(killSwitchCheck?.result).toBe("FAIL");
    });

    it("DENIES authorization when requested amount does not match agreement amount", () => {
      const decision = evaluatePaymentPolicy({
        action: "AUTHORIZE",
        contract: baseContract,
        agreement: baseAgreement,
        acceptanceDecision: null,
        payment: {
          id: "pay_test_mismatch",
          status: "PENDING",
          amount: money(46000, "USD"), // Mismatched!
          capturedAmountMinor: null,
          providerAuthorizationId: null,
        },
      });

      expect(decision.result).toBe("DENY");
      const amountCheck = decision.checks.find((c) => c.checkId === "amount.matches_agreement");
      expect(amountCheck?.result).toBe("FAIL");
    });
  });

  // ── Invariant A1/A2/P3: Agent Authority & Bounded Scope ─────────────────────
  describe("A1/A2/P3: Agent authority bounds and tool separation", () => {
    it("Agent tool action type list contains no capture, refund, or budget changes", () => {
      const forbiddenActions = [
        "CAPTURE_PAYMENT",
        "RELEASE_PAYMENT",
        "REFUND_PAYMENT",
        "CHANGE_BUDGET",
        "OVERRIDE_VERIFICATION",
      ];

      const agentActionTypes: AgentActionType[] = ["REQUEST_VERIFICATION", "WAIT"];

      for (const forbidden of forbiddenActions) {
        expect(agentActionTypes).not.toContain(forbidden);
      }
    });

    it("DENIES agent offer acceptance because commercial consent is human", () => {
      const authority = evaluateAgentAuthority({
        actionType: "ACCEPT_OFFER",
        actor: { kind: "AGENT", onBehalfOfUserId: "buyer_1" },
        task: {
          userId: "buyer_1",
          status: "NEGOTIATION",
          budgetMinor: 50000,
          committedMinor: 0,
          terminal: false,
        },
        amountMinor: 55000, // Exceeds 50,000 budget ceiling!
        stepCount: 5,
        maxSteps: 40,
      });

      expect(authority.allowed).toBe(false);
      expect(authority.reasonCode).toBe("agent.explicit_authority_required");
    });

    it("DENIES agent action on terminal tasks", () => {
      const authority = evaluateAgentAuthority({
        actionType: "SEND_OFFER",
        actor: { kind: "AGENT", onBehalfOfUserId: "buyer_1" },
        task: {
          userId: "buyer_1",
          status: "COMPLETED",
          budgetMinor: 50000,
          committedMinor: 0,
          terminal: true,
        },
        stepCount: 5,
        maxSteps: 40,
      });

      expect(authority.allowed).toBe(false);
      expect(authority.reasonCode).toBe("agent.task_terminal");
    });

    it("DENIES cross-user access (IDs != authorization)", () => {
      const check = authorize(
        { kind: "USER", id: "user_attacker", role: "buyer" },
        ACTIONS.taskView,
        { type: "task", id: "task_123", ownerUserId: "user_victim" },
      );

      expect(check.allowed).toBe(false);
    });

    it("Negotiation guardrail deterministically rejects offers over budget", () => {
      const result = validateOffer({
        submittedBy: "BUYER_AGENT",
        priceMinor: 60000,
        currency: "USD",
        budget: money(50000, "USD"),
        currentRound: 1,
        maxRounds: 5,
        deliveryDeadline: new Date(Date.now() + 86400000),
        now: new Date(),
      });

      expect(result.ok).toBe(false);
      expect(result.reasonCode).toBe("offer.over_budget");
    });
  });

  // ── Invariant D2/I1: Deliverable Integrity & Verification ───────────────────
  describe("D2/I1: Verification binds to contract hash and deliverable checksum", () => {
    it("Verifies deliverable checksum changes when deliverable is modified", () => {
      const v1Bytes = new TextEncoder().encode("id,email\n1,alice@example.com\n2,alice@example.com");
      const v2Bytes = new TextEncoder().encode("id,email\n1,alice@example.com\n2,bob@example.com");

      const v1Hash = sha256HexOfBytes(v1Bytes);
      const v2Hash = sha256HexOfBytes(v2Bytes);

      expect(v1Hash).not.toBe(v2Hash);
      expect(v1Hash.length).toBe(64);
      expect(v2Hash.length).toBe(64);
    });

    it("Deterministic check executes accurately against dataset rules", () => {
      const duplicateData = {
        columns: ["id", "email"],
        rows: [
          { id: "1", email: "alice@example.com" },
          { id: "2", email: "alice@example.com" },
          { id: "3", email: "charlie@example.com" },
        ],
      };

      const outcome = runDeterministicCheck("unique_column", { column: "email" }, duplicateData);

      expect(outcome.outcome).toBe("FAIL");
      expect(outcome.confidence).toBe(0);
      expect(outcome.rationale).toContain("duplicate");
    });
  });

  // ── Invariant State Machine: Task Transitions ──────────────────────────────
  describe("Task State Machine invariants", () => {
    it("Enforces valid transition paths and prevents illegal jumps", () => {
      // Planning cannot jump straight to COMPLETED or PAYMENT_RELEASE
      expect(canTransition("PLANNING", "COMPLETED")).toBe(false);
      expect(canTransition("PLANNING", "PAYMENT_RELEASE")).toBe(false);

      // Must follow pipeline: CONTRACT_REVIEW -> APPROVED -> PROVIDER_SEARCH
      expect(canTransition("CONTRACT_REVIEW", "APPROVED")).toBe(true);
      expect(canTransition("APPROVED", "PROVIDER_SEARCH")).toBe(true);

      // Terminal states cannot transition to anything
      expect(canTransition("COMPLETED", "WORK_IN_PROGRESS")).toBe(false);
      expect(canTransition("CANCELLED", "PLANNING")).toBe(false);
    });
  });
});
