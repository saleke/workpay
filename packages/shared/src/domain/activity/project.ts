/**
 * Activity projection (Component 12).
 *
 * The event store is the source of truth for "what happened". This module turns
 * the append-only events for a task into a human-readable timeline. It is a
 * projection, never a source of authority: the timeline explains the state, it
 * does not decide it.
 */
import { asc, eq } from "drizzle-orm";
import type { Database } from "../../db/client.js";
import { events } from "../../db/schema/infra.js";

export interface EventDescribeContext {
  actorType?: string | null;
  actorId?: string | null;
  actorName?: string | null;
  actorRoleTitle?: string | null;
  isSelf?: boolean;
}

export interface ActivityEntry {
  id: string;
  type: string;
  occurredAt: string;
  actorType: string;
  actorId: string | null;
  actorName?: string | null;
  actorRoleTitle?: string | null;
  isSelf?: boolean;
  title: string;
  description: string;
  visibility: string;
}

function humanizeStatus(status: unknown): string {
  const s = String(status || "").trim().toUpperCase();
  switch (s) {
    case "DRAFT":
      return "Draft";
    case "PLANNING":
    case "CREATED":
      return "Drafting Specification";
    case "AWAITING_CLARIFICATION":
      return "Clarification Needed";
    case "CONTRACT_REVIEW":
    case "AGREEMENT_READY":
      return "Awaiting Sign-off";
    case "APPROVED":
    case "PROVIDER_SEARCH":
      return "Matching Specialist";
    case "NEGOTIATION":
      return "Terms Negotiation";
    case "PAYMENT_AUTHORIZATION":
      return "Payment Authorization";
    case "WORK_IN_PROGRESS":
      return "In Execution";
    case "SUBMITTED":
    case "VERIFYING":
      return "Verifying Proof";
    case "REVISION_REQUIRED":
      return "Revision Requested";
    case "HUMAN_REVIEW":
      return "In Arbitration";
    case "PAYMENT_RELEASE":
    case "COMPLETED":
      return "Settled";
    case "CANCELLED":
    case "EXPIRED":
      return "Closed";
    case "DISPUTED":
      return "Disputed";
    default:
      if (!s) return "Updated";
      return s
        .toLowerCase()
        .split("_")
        .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
        .join(" ");
  }
}

function humanizeAgentAction(actionType: unknown): { title: string; description: string } {
  const act = String(actionType || "").trim().toUpperCase();
  switch (act) {
    case "CREATE_PLAN":
      return {
        title: "Specification Synthesized",
        description: "WorkPay Agent compiled formal requirements, scope boundaries, and acceptance checks.",
      };
    case "SELECT_PROVIDER":
      return {
        title: "Specialist Matched",
        description: "WorkPay Agent evaluated specialist capabilities and matched a candidate provider.",
      };
    case "REQUEST_CLARIFICATION":
      return {
        title: "Clarification Requested",
        description: "WorkPay Agent identified technical ambiguities and requested prompt clarification.",
      };
    case "SUBMIT_OFFER":
      return {
        title: "Terms Proposed",
        description: "WorkPay Agent submitted formal commercial terms to the specialist.",
      };
    case "ACCEPT_OFFER":
      return {
        title: "Terms Finalized",
        description: "WorkPay Agent and specialist agreed to execution terms.",
      };
    case "VERIFY_SUBMISSION":
      return {
        title: "Verification Executed",
        description: "WorkPay Agent executed automated proof checks against the Definition of Done.",
      };
    case "TRIGGER_CAPTURE":
      return {
        title: "Settlement Dispatched",
        description: "WorkPay Agent confirmed proof verification and dispatched direct capture of PayPal funds.",
      };
    default: {
      const cleanName = act
        ? act
            .toLowerCase()
            .split("_")
            .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
            .join(" ")
        : "Autonomous Task";
      return {
        title: cleanName,
        description: "WorkPay Agent completed an automated task for this agreement.",
      };
    }
  }
}

function resolveSubject(
  ctx?: EventDescribeContext,
  fallback: string = "Task Owner",
): { name: string; isSelf: boolean } {
  if (ctx?.isSelf) {
    return { name: "You", isSelf: true };
  }
  if (ctx?.actorName) {
    if (ctx.actorRoleTitle && ctx.actorName !== ctx.actorRoleTitle) {
      return { name: `${ctx.actorName} (${ctx.actorRoleTitle})`, isSelf: false };
    }
    return { name: ctx.actorName, isSelf: false };
  }
  return { name: fallback, isSelf: false };
}

/** Turn an event type, payload, and optional perspective context into human-facing prose. */
export function describeEvent(
  type: string,
  payload: unknown,
  context?: EventDescribeContext,
): { title: string; description: string } {
  const p = (payload ?? {}) as Record<string, unknown>;
  switch (type) {
    case "TASK_CREATED": {
      const { name: subj, isSelf } = resolveSubject(context, "Task Owner");
      return {
        title: "Task created",
        description: isSelf
          ? "You created this task and initialized the specification."
          : `${subj} created this task and initialized the specification.`,
      };
    }
    case "TASK_STATUS_CHANGED":
      return {
        title: "Status updated",
        description: `Status transitioned from ${humanizeStatus(p.from)} to ${humanizeStatus(p.to)}.`,
      };
    case "WORK_SPEC_CREATED":
      return {
        title: "Work specification ready",
        description: `Technical specification compiled with ${
          p.requirementCount ?? 0
        } verifiable requirement(s).`,
      };
    case "CLARIFICATION_REQUESTED": {
      const { name: subj, isSelf } = resolveSubject(context, "Task Owner");
      const qCount = (p.questions as string[])?.length ?? 1;
      return {
        title: "Clarification requested",
        description: isSelf
          ? `You requested clarification on ${qCount} specification item(s).`
          : `${subj} requested clarification on ${qCount} specification item(s).`,
      };
    }
    case "CLARIFICATION_ANSWERED": {
      const { name: subj, isSelf } = resolveSubject(context, "Task Owner");
      return {
        title: "Clarification provided",
        description: isSelf
          ? "You provided answers to the outstanding specification questions."
          : `${subj} provided answers to the outstanding specification questions.`,
      };
    }
    case "CONTRACT_CREATED":
      return {
        title: "Work agreement drafted",
        description: "A formal work agreement is ready for review and sign-off.",
      };
    case "CONTRACT_APPROVED": {
      const { name: subj, isSelf } = resolveSubject(context, "Task Owner");
      return {
        title: "Work agreement approved",
        description: isSelf
          ? "You approved the work agreement and finalized its specification terms."
          : `${subj} approved the work agreement and finalized its specification terms.`,
      };
    }
    case "PROVIDER_SEARCH_STARTED":
      return {
        title: "Searching for specialist",
        description: "Evaluating specialist capabilities to match this task.",
      };
    case "PROVIDER_SELECTED": {
      const providerName =
        (p.provider as { displayName?: string })?.displayName ??
        (p.displayName as string) ??
        "A specialist";
      return {
        title: "Specialist matched",
        description: `${providerName} was matched for this assignment.`,
      };
    }
    case "PROVIDER_SELECTION_FAILED":
      return {
        title: "No specialist matched",
        description: String(p.reason ?? "No active specialist met the required capabilities."),
      };
    case "NEGOTIATION_STARTED":
      return {
        title: "Terms negotiation started",
        description: "Negotiating delivery terms and timeline with the candidate specialist.",
      };
    case "OFFER_CREATED": {
      const { name: subj, isSelf } = resolveSubject(context, "Task Owner");
      const money = formatMoney(p.price);
      return {
        title: "Terms proposed",
        description: isSelf
          ? `You proposed agreement terms of ${money}.`
          : `${subj} proposed agreement terms of ${money}.`,
      };
    }
    case "COUNTEROFFER_RECEIVED": {
      const { name: subj, isSelf } = resolveSubject(context, "Specialist");
      const money = formatMoney(p.price);
      return {
        title: "Counteroffer received",
        description: isSelf
          ? `You submitted a counteroffer of ${money}.`
          : `${subj} submitted a counteroffer of ${money}.`,
      };
    }
    case "OFFER_ACCEPTED": {
      const { name: subj, isSelf } = resolveSubject(context, "Task Owner");
      return {
        title: "Terms agreed",
        description: isSelf
          ? "You agreed to the proposed agreement terms."
          : `${subj} agreed to the proposed agreement terms.`,
      };
    }
    case "COMMERCIAL_AGREEMENT_CREATED":
      return {
        title: "Agreement reached",
        description: `Agreed price ${formatMoney(p.agreedPrice)} confirmed between parties.`,
      };
    case "PAYMENT_POLICY_EVALUATED": {
      const act = String(p.action || "CAPTURE").toLowerCase();
      const code = String(p.reasonCode || p.result || "APPROVED");
      return {
        title: "Settlement policy evaluated",
        description: `Deterministic settlement rule evaluated for ${act} (${code}).`,
      };
    }
    case "PAYMENT_AUTHORIZATION_REQUESTED": {
      const { name: subj, isSelf } = resolveSubject(context, "Task Owner");
      return {
        title: "Authorizing payment hold",
        description: isSelf
          ? "You initiated the PayPal authorization hold."
          : `${subj} initiated the PayPal authorization hold.`,
      };
    }
    case "PAYMENT_AUTHORIZED": {
      const { name: subj, isSelf } = resolveSubject(context, "Task Owner");
      const money = formatMoney(p.amount);
      return {
        title: "Payment hold secured",
        description: isSelf
          ? `You secured a non-custodial PayPal payment hold of ${money}.`
          : `${subj} secured a non-custodial PayPal payment hold of ${money}.`,
      };
    }
    case "PAYMENT_AUTHORIZATION_FAILED":
      return {
        title: "Payment authorization failed",
        description: String(p.reason ?? "The PayPal authorization hold could not be secured."),
      };
    case "CAPTURE_COMMAND_CREATED":
      return {
        title: "Settlement approved by policy",
        description: "Deterministic policy confirmed verification checks and approved settlement.",
      };
    case "PAYMENT_CAPTURED": {
      const money = formatMoney(p.amount);
      return {
        title: "Payment released",
        description: `Payment of ${money} captured from PayPal authorization hold and settled directly to specialist.`,
      };
    }
    case "PAYMENT_CAPTURE_FAILED":
      return {
        title: "Payment settlement failed",
        description: String(p.reason ?? "The capture transaction could not be executed."),
      };
    case "PROVIDER_ACCEPTED": {
      const { name: subj, isSelf } = resolveSubject(context, "Specialist");
      return {
        title: "Assignment accepted",
        description: isSelf
          ? "You accepted this assignment and committed to the scope."
          : `${subj} accepted this assignment and committed to the scope.`,
      };
    }
    case "WORK_STARTED": {
      const { name: subj, isSelf } = resolveSubject(context, "Specialist");
      return {
        title: "Work commenced",
        description: isSelf
          ? "You commenced work on the deliverables."
          : `${subj} commenced work on the deliverables.`,
      };
    }
    case "SUBMISSION_CREATED": {
      const { name: subj, isSelf } = resolveSubject(context, "Specialist");
      return {
        title: "Draft deliverable attached",
        description: isSelf
          ? "You attached a draft deliverable."
          : `${subj} attached a draft deliverable.`,
      };
    }
    case "SUBMISSION_SUBMITTED": {
      const { name: subj, isSelf } = resolveSubject(context, "Specialist");
      return {
        title: "Deliverables submitted",
        description: isSelf
          ? "You submitted deliverables for automated verification."
          : `${subj} submitted deliverables for automated verification.`,
      };
    }
    case "REVISION_REQUESTED": {
      const { name: subj, isSelf } = resolveSubject(context, "Task Owner");
      const reason = p.reason ? `: ${String(p.reason)}` : ".";
      return {
        title: "Revision requested",
        description: isSelf
          ? `You requested revisions on the deliverable${reason}`
          : `${subj} requested revisions on the deliverable${reason}`,
      };
    }
    case "VERIFICATION_STARTED":
      return {
        title: "Verification running",
        description: "Executing deterministic and semantic checks against the Definition of Done.",
      };
    case "VERIFICATION_PASSED":
      return {
        title: "Verification passed",
        description: "All acceptance criteria and proof requirements confirmed.",
      };
    case "VERIFICATION_FAILED": {
      const failed = (p.failedRequirements as string[])?.join(", ");
      return {
        title: "Verification failed",
        description: `Deliverable did not meet acceptance criteria${failed ? `: ${failed}` : "."}`,
      };
    }
    case "VERIFICATION_UNCERTAIN":
      return {
        title: "Human review required",
        description: "Automated checks flagged an ambiguity in deliverables. Case routed to arbitration.",
      };
    case "CASE_OPENED":
      return {
        title: "Arbitration case opened",
        description: `Review case opened for ${String(p.category || "deliverable review").toLowerCase()} (${String(p.severity || "standard").toLowerCase()} priority).`,
      };
    case "CASE_RESOLVED": {
      const { name: subj, isSelf } = resolveSubject(context, "Arbitrator");
      const outcome = String(p.outcome || "resolved");
      return {
        title: "Arbitration ruling issued",
        description: isSelf
          ? `You resolved the arbitration case with outcome: ${outcome}.`
          : `${subj} resolved the arbitration case with outcome: ${outcome}.`,
      };
    }
    case "AGENT_ACTION_RECORDED":
      return humanizeAgentAction(p.actionType);
    case "AGENT_AUTHORITY_DENIED": {
      const actionInfo = humanizeAgentAction(p.actionType);
      return {
        title: "Agent action held",
        description: `Autonomous action (${actionInfo.title}) held by policy: ${String(p.reason ?? "requires human approval")}.`,
      };
    }
    case "AUDIT_CHECKIN_SUBMITTED": {
      const { name: subj, isSelf } = resolveSubject(context, "Specialist");
      const st = String(p.status || "ON_TRACK");
      const statusLabel =
        st === "ON_TRACK"
          ? "On Track"
          : st === "MILESTONE_DRAFT"
            ? "Draft Milestone Ready"
            : "Assistance Needed";
      const notes = p.notes ? `: "${String(p.notes)}"` : ".";
      return {
        title: `Progress Audit: ${statusLabel}`,
        description: isSelf
          ? `You recorded a progress update (${statusLabel})${notes}`
          : `${subj} recorded a progress update (${statusLabel})${notes}`,
      };
    }
    case "PROVIDER_INVITATION_ACCEPTED": {
      const { name: subj, isSelf } = resolveSubject(context, "Specialist");
      const payout = p.payoutEmail ? ` with payout address ${String(p.payoutEmail)}` : "";
      return {
        title: "Specialist accepted invitation",
        description: isSelf
          ? `You accepted the assignment invitation${payout}.`
          : `${subj} accepted the assignment invitation${payout}.`,
      };
    }
    default:
      return {
        title: humanizeStatus(type),
        description: "",
      };
  }
}

function formatMoney(value: unknown): string {
  const m = value as { amountMinor?: number; currency?: string } | undefined;
  if (!m || typeof m.amountMinor !== "number") return "";
  return `${(m.amountMinor / 100).toFixed(2)} ${m.currency ?? ""}`.trim();
}

/**
 * Project the timeline for a task. `maxVisibility` filters by audience, so a
 * specialist never sees ADMIN/INTERNAL events and a task owner sees USER events.
 */
export async function getTaskActivity(
  db: Database,
  taskId: string,
  options?: { allowedVisibilities?: string[]; viewerId?: string | null },
): Promise<ActivityEntry[]> {
  const rows = await db
    .select()
    .from(events)
    .where(eq(events.taskId, taskId))
    .orderBy(asc(events.occurredAt));

  const allowed = options?.allowedVisibilities;
  return rows
    .filter((row) => !allowed || allowed.includes(row.visibility))
    .map((row) => {
      const isSelf = Boolean(options?.viewerId && row.actorId && options.viewerId === row.actorId);
      const { title, description } = describeEvent(row.type, row.payload, {
        isSelf,
        actorType: row.actorType,
        actorId: row.actorId,
      });
      return {
        id: row.id,
        type: row.type,
        occurredAt: row.occurredAt.toISOString(),
        actorType: row.actorType,
        actorId: row.actorId,
        isSelf,
        title,
        description,
        visibility: row.visibility,
      };
    });
}

