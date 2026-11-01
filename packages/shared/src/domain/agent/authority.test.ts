import { describe, expect, it } from "vitest";
import { evaluateAgentAuthority, type AgentAuthorityInput } from "./authority.js";

function base(overrides: Partial<AgentAuthorityInput> = {}): AgentAuthorityInput {
  return {
    actionType: "REQUEST_VERIFICATION",
    actor: { kind: "AGENT", onBehalfOfUserId: "user_1" },
    task: {
      userId: "user_1",
      status: "CREATED",
      budgetMinor: 10000,
      committedMinor: 0,
      terminal: false,
    },
    stepCount: 0,
    maxSteps: 40,
    ...overrides,
  };
}

describe("agent authority", () => {
  it("allows bounded verification coordination within the mandate", () => {
    expect(evaluateAgentAuthority(base()).allowed).toBe(true);
  });

  it("rejects a non-agent actor", () => {
    const decision = evaluateAgentAuthority(base({ actor: { kind: "USER" } }));
    expect(decision.allowed).toBe(false);
    expect(decision.reasonCode).toBe("agent.not_agent");
  });

  it("rejects actions on another principal's task", () => {
    const decision = evaluateAgentAuthority(
      base({ actor: { kind: "AGENT", onBehalfOfUserId: "user_other" } }),
    );
    expect(decision.reasonCode).toBe("agent.not_owner");
  });

  it("rejects once the step budget is exhausted", () => {
    const decision = evaluateAgentAuthority(base({ stepCount: 40, maxSteps: 40 }));
    expect(decision.reasonCode).toBe("agent.step_budget_exhausted");
  });

  it("rejects after the task reaches a terminal state", () => {
    const decision = evaluateAgentAuthority(
      base({
        task: {
          userId: "user_1",
          status: "COMPLETED",
          budgetMinor: 10000,
          committedMinor: 0,
          terminal: true,
        },
      }),
    );
    expect(decision.reasonCode).toBe("agent.task_terminal");
  });

  it("blocks a commercial action regardless of budget", () => {
    const decision = evaluateAgentAuthority(
      base({ actionType: "ACCEPT_OFFER", amountMinor: 10001 }),
    );
    expect(decision.allowed).toBe(false);
    expect(decision.reasonCode).toBe("agent.explicit_authority_required");
  });

  it("does not let an agent accept an offer even at exactly the budget", () => {
    const decision = evaluateAgentAuthority(
      base({ actionType: "ACCEPT_OFFER", amountMinor: 10000 }),
    );
    expect(decision.allowed).toBe(false);
    expect(decision.reasonCode).toBe("agent.explicit_authority_required");
  });

  it("marks retired payment authority as still requiring policy defense in depth", () => {
    expect(
      evaluateAgentAuthority(base({ actionType: "AUTHORIZE_PAYMENT", amountMinor: 5000 }))
        .requiresPolicyGate,
    ).toBe(true);
    expect(evaluateAgentAuthority(base({ actionType: "REQUEST_VERIFICATION" })).requiresPolicyGate).toBe(
      false,
    );
  });

  it("rejects authorize before considering an amount", () => {
    const decision = evaluateAgentAuthority(base({ actionType: "AUTHORIZE_PAYMENT" }));
    expect(decision.reasonCode).toBe("agent.explicit_authority_required");
  });
});
