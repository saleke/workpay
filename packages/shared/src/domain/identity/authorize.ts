/**
 * Centralized authorization service (Component 13).
 *
 * Authorization answers "may this actor perform this operation on this
 * resource", using the actor's role plus object-level facts. It is the only
 * way into sensitive operations; route handlers must never inline a role check.
 *
 * Two deliberate separations:
 *  - Authentication (who you are) is Auth.js. Authorization (what you may do)
 *    is here. Neither is inferred from a URL or a client-supplied id.
 *  - Authorization is not business policy. A buyer may be allowed to request a
 *    capture while the payment policy still refuses it. Both gates run.
 *
 * Every decision carries a policy version so old decisions stay interpretable
 * and a change to the rules is auditable.
 */
import { authorizationError } from "../../platform/errors.js";

export const AUTHORIZATION_POLICY_VERSION = "authz-v1";

export type Role = "buyer" | "provider" | "admin_reviewer";

export type ActorKind = "USER" | "PROVIDER" | "AGENT" | "SYSTEM" | "REVIEWER" | "PAYPAL";

export interface Actor {
  kind: ActorKind;
  /**
   * Authenticated principal id. Human actors always use their `users.id`;
   * agents use an agent-run id. Domain profile ids belong on the resource,
   * never in the human actor identity. Null for SYSTEM.
   */
  id: string | null;
  /** Present for human actors. */
  role?: Role;
  /** For agents: the user on whose behalf the agent acts. */
  onBehalfOfUserId?: string;
}

export interface AuthorizationDecision {
  allowed: boolean;
  reason: string;
  policyVersion: string;
}

/**
 * Resource facts needed for object-level checks. Only the fields relevant to
 * the action need to be present; a missing required field denies by default
 * (fail closed).
 */
export interface ResourceFacts {
  type: string;
  id: string;
  /** User id that owns the resource. */
  ownerUserId?: string | null;
  /** Provider id associated with the resource. */
  providerId?: string | null;
  /** User id that owns the associated provider profile. */
  providerUserId?: string | null;
  /** Task-local status, used where the plan constrains the operation. */
  status?: string;
  /** Arbitrary extra facts the specific policy needs. */
  [key: string]: unknown;
}

export const ACTIONS = {
  taskCreate: "task:create",
  taskView: "task:view",
  taskCancel: "task:cancel",
  taskFilesUpload: "task:files:upload",
  clarificationCreate: "clarification:create",
  contractView: "contract:view",
  contractApprove: "contract:approve",
  providerSelectionView: "provider-selection:view",
  submissionCreate: "submission:create",
  submissionView: "submission:view",
  verificationView: "verification:view",
  verificationReview: "verification:review",
  caseView: "case:view",
  caseCreate: "case:create",
  caseResolve: "case:resolve",
  paymentView: "payment:view",
  paymentAuthorize: "payment:authorize",
  paymentCapture: "payment:capture",
  providerWorkView: "provider-work:view",
  providerWorkAccept: "provider-work:accept",
  providerWorkStart: "provider-work:start",
  notificationView: "notification:view",
  eventStream: "events:stream",
} as const;

export type Action = (typeof ACTIONS)[keyof typeof ACTIONS];

type PolicyFn = (actor: Actor, resource: ResourceFacts) => AuthorizationDecision;

function allow(reason: string): AuthorizationDecision {
  return { allowed: true, reason, policyVersion: AUTHORIZATION_POLICY_VERSION };
}
function deny(reason: string): AuthorizationDecision {
  return { allowed: false, reason, policyVersion: AUTHORIZATION_POLICY_VERSION };
}

/** The effective user id for ownership checks (agents borrow their user). */
function effectiveUserId(actor: Actor): string | null {
  if (actor.kind === "AGENT") return actor.onBehalfOfUserId ?? null;
  return actor.id;
}

function isOwner(actor: Actor, resource: ResourceFacts): boolean {
  const userId = effectiveUserId(actor);
  return userId !== null && resource.ownerUserId !== null && userId === resource.ownerUserId;
}

function isProviderParty(actor: Actor, resource: ResourceFacts): boolean {
  return (
    (actor.kind === "USER" || actor.kind === "PROVIDER") &&
    actor.id !== null &&
    resource.providerUserId !== null &&
    actor.id === resource.providerUserId
  );
}

/**
 * Role-based + object-level policy table. Each entry is the single place the
 * rule for that action lives. Fail closed: unknown action denies.
 */
const POLICIES: Partial<Record<Action, PolicyFn>> = {
  [ACTIONS.taskCreate]: (actor) =>
    actor.kind === "USER"
      ? allow("Authenticated user may create tasks")
      : deny("Only an authenticated user may create a task"),

  [ACTIONS.taskView]: (actor, resource) => {
    if (isOwner(actor, resource)) return allow("Task belongs to the actor");
    return deny("Task does not belong to the actor");
  },

  [ACTIONS.taskCancel]: (actor, resource) =>
    isOwner(actor, resource) ? allow("Owner may cancel") : deny("Only the owner may cancel"),

  [ACTIONS.taskFilesUpload]: (actor, resource) =>
    isOwner(actor, resource) ? allow("Owner may upload files") : deny("Only the owner may upload"),

  [ACTIONS.clarificationCreate]: (actor, resource) =>
    isOwner(actor, resource) ? allow("Owner may answer") : deny("Only the owner may answer"),

  [ACTIONS.contractView]: (actor, resource) => {
    if (isOwner(actor, resource)) return allow("Contract belongs to actor");
    if (isProviderParty(actor, resource)) {
      return allow("Provider is a party to the contract");
    }
    return deny("Actor is not a party to the contract");
  },

  [ACTIONS.contractApprove]: (actor, resource) => {
    if (!isOwner(actor, resource)) return deny("Only the task owner may approve");
    // A contract can only be approved while it is awaiting approval.
    if (resource.status !== undefined && resource.status !== "AWAITING_APPROVAL") {
      return deny(`Contract is not awaiting approval (status ${resource.status})`);
    }
    return allow("Owner may approve a pending contract");
  },

  [ACTIONS.providerSelectionView]: (actor, resource) => {
    if (isOwner(actor, resource)) return allow("Task owner may view");
    return deny("Provider selection is visible to the task owner");
  },

  [ACTIONS.submissionCreate]: (actor, resource) => {
    if (!isProviderParty(actor, resource)) return deny("Not the assigned provider");
    if (resource.status !== undefined && !["ACCEPTED", "IN_PROGRESS"].includes(resource.status)) {
      return deny(`Execution is not open for submission (status ${resource.status})`);
    }
    return allow("Assigned provider may submit while in progress");
  },

  [ACTIONS.submissionView]: (actor, resource) => {
    if (isOwner(actor, resource)) return allow("Task owner may view");
    if (isProviderParty(actor, resource)) {
      return allow("Provider may view own submission");
    }
    return deny("Not a party to the submission");
  },

  [ACTIONS.verificationView]: (actor, resource) =>
    isOwner(actor, resource)
      ? allow("Task owner may view")
      : deny("Verification is visible to the task owner"),

  [ACTIONS.verificationReview]: () =>
    deny("Independent review must use a scoped review engagement"),

  [ACTIONS.caseView]: (actor, resource) => {
    if (isOwner(actor, resource)) return allow("Task owner may view");
    if (isProviderParty(actor, resource)) {
      return allow("Provider may view own case");
    }
    return deny("Not a party to the case");
  },

  [ACTIONS.caseCreate]: (actor, resource) => {
    if (isOwner(actor, resource)) return allow("Owner may open a case");
    if (isProviderParty(actor, resource)) {
      return allow("Provider may open a case on own work");
    }
    return deny("Not a party to the task");
  },

  [ACTIONS.caseResolve]: (actor) =>
    actor.kind === "SYSTEM"
      ? allow("System reconciliation may resolve an operational exception")
      : deny("Humans cannot adjudicate a WorkPay case"),

  [ACTIONS.paymentView]: (actor, resource) => {
    if (isOwner(actor, resource)) return allow("Task owner may view payment");
    return deny("Payment is visible to the task owner");
  },

  [ACTIONS.paymentAuthorize]: (actor, resource) => {
    // A buyer may request authorization, but the payment policy still decides.
    if (!isOwner(actor, resource)) return deny("Only the task owner may request authorization");
    return allow("Owner may request authorization");
  },

  [ACTIONS.paymentCapture]: (actor) => {
    // Capture is never a user action. It is triggered by the system after the
    // policy engine produces an ALLOW decision.
    if (actor.kind === "SYSTEM") return allow("System may request capture after policy ALLOW");
    return deny("Capture is not a user-initiated action");
  },

  [ACTIONS.providerWorkView]: (actor, resource) =>
    isProviderParty(actor, resource)
      ? allow("Provider may view own work")
      : deny("Not the assigned provider"),

  [ACTIONS.providerWorkAccept]: (actor, resource) => {
    if (!isProviderParty(actor, resource)) {
      return deny("Not the assigned provider");
    }
    if (resource.status !== undefined && resource.status !== "ASSIGNED") {
      return deny(`Execution cannot be accepted from status ${resource.status}`);
    }
    return allow("Assigned provider may accept");
  },

  [ACTIONS.providerWorkStart]: (actor, resource) => {
    if (!isProviderParty(actor, resource)) {
      return deny("Not the assigned provider");
    }
    if (resource.status !== undefined && resource.status !== "ACCEPTED") {
      return deny(`Execution cannot be started from status ${resource.status}`);
    }
    return allow("Assigned provider may start accepted work");
  },

  [ACTIONS.notificationView]: (actor, resource) =>
    isOwner(actor, resource) ? allow("Own notifications") : deny("Not your notifications"),

  [ACTIONS.eventStream]: (actor, resource) => {
    if (isOwner(actor, resource)) return allow("Owner may stream");
    return deny("Not a party to the task");
  },
};

/**
 * Evaluate the policy for an action. Unknown actions deny (fail closed).
 */
export function authorize(
  actor: Actor,
  action: Action,
  resource: ResourceFacts,
): AuthorizationDecision {
  const policy = POLICIES[action];
  if (!policy) {
    return deny(`No policy for action ${action}`);
  }
  return policy(actor, resource);
}

/**
 * Throwing wrapper. Use in route handlers and jobs where a denied action should
 * stop execution. The thrown error maps to HTTP 403.
 */
export function requireAuthorized(actor: Actor, action: Action, resource: ResourceFacts): void {
  const decision = authorize(actor, action, resource);
  if (!decision.allowed) {
    throw authorizationError(decision.reason);
  }
}

export function isAction(value: string): value is Action {
  return (Object.values(ACTIONS) as string[]).includes(value);
}
