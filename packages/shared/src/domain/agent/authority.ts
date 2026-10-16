/**
 * Buyer agent authority policy (Component 11), version v1.
 *
 * The agent is bounded. It may propose and, for a fixed set of reversible
 * actions, act. But the authority layer sits between "the agent wants to do X"
 * and "X happens", and it refuses anything outside the agent's mandate:
 *
 *  - the agent may never spend beyond the buyer's budget,
 *  - the agent may never act on a task it does not own,
 *  - the agent may never act once its step budget is exhausted, and
 *  - the agent may never act on a task that has reached a terminal state.
 *
 * Authority is not the payment policy. An action may be authorized by this
 * policy and still be refused by the deterministic payment policy later. Both
 * gates run; neither is optional.
 *
 * This module is pure so the rules can be tested exhaustively without a model
 * or a database.
 */

export const AGENT_AUTHORITY_VERSION = "agent-authority-v1";

export type AgentActionType =
  | "CREATE_PLAN"
  | "REQUEST_CLARIFICATION"
  | "CREATE_CONTRACT"
  | "SELECT_PROVIDER"
  | "START_NEGOTIATION"
  | "SEND_OFFER"
  | "ACCEPT_OFFER"
  | "AUTHORIZE_PAYMENT"
  | "REQUEST_VERIFICATION"
  | "REQUEST_REVISION"
  | "OPEN_CASE"
  | "WAIT"
  | "COMPLETE_TASK";

/** Actions that move money and therefore require an amount within budget. */
const MONEY_ACTIONS: ReadonlySet<AgentActionType> = new Set(["ACCEPT_OFFER", "AUTHORIZE_PAYMENT"]);

/** Actions that require the deterministic payment policy engine to also allow. */
const POLICY_GATED_ACTIONS: ReadonlySet<AgentActionType> = new Set(["AUTHORIZE_PAYMENT"]);

export interface AgentAuthorityInput {
  actionType: AgentActionType;
  actor: {
    kind: string;
    onBehalfOfUserId?: string | null;
  };
  task: {
    userId: string;
    status: string;
    budgetMinor: number;
    /** Already committed or in-flight minor units (e.g. an outstanding agreement). */
    committedMinor: number;
    terminal: boolean;
  };
  stepCount: number;
  maxSteps: number;
  /** Present for money actions. */
  amountMinor?: number;
}

export interface AgentAuthorityDecision {
  allowed: boolean;
  reasonCode: string;
  reason: string;
  /** True when the caller must still run the deterministic payment policy. */
  requiresPolicyGate: boolean;
}

export function evaluateAgentAuthority(input: AgentAuthorityInput): AgentAuthorityDecision {
  const deny = (reasonCode: string, reason: string): AgentAuthorityDecision => ({
    allowed: false,
    reasonCode,
    reason,
    requiresPolicyGate: POLICY_GATED_ACTIONS.has(input.actionType),
  });

  if (input.actor.kind !== "AGENT") {
    return deny("agent.not_agent", "Only the buyer agent is subject to this authority policy");
  }
  if (input.stepCount >= input.maxSteps) {
    return deny("agent.step_budget_exhausted", "The agent has used its step budget");
  }
  if (input.actor.onBehalfOfUserId !== input.task.userId) {
    return deny("agent.not_owner", "The agent may only act on tasks owned by its principal");
  }
  if (input.task.terminal) {
    return deny("agent.task_terminal", "The task is in a terminal state");
  }

  if (MONEY_ACTIONS.has(input.actionType)) {
    if (typeof input.amountMinor !== "number") {
      return deny("agent.missing_amount", "A money action requires an amount");
    }
    if (input.task.committedMinor + input.amountMinor > input.task.budgetMinor) {
      return deny(
        "agent.over_budget",
        `Action would commit ${input.task.committedMinor + input.amountMinor} above the budget ${input.task.budgetMinor}`,
      );
    }
  }

  return {
    allowed: true,
    reasonCode: "agent.allowed",
    reason: "Within the agent's authority",
    requiresPolicyGate: POLICY_GATED_ACTIONS.has(input.actionType),
  };
}
