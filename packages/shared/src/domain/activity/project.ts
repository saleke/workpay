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
  const s = String(status || "")
    .trim()
    .toUpperCase();
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
      return "Evidence Submitted";
    case "AWAITING_CLIENT_REVIEW":
      return "Awaiting Client Review";
    case "AWAITING_EXTERNAL_REVIEW":
      return "Awaiting External Review";
    case "REVIEW_ACCEPTED":
      return "Review Accepted";
    case "REJECTED":
      return "Rejected";
    case "REVISION_REQUIRED":
      return "Revision Requested";
    case "HUMAN_REVIEW":
      return "Independent review needed";
    case "PAYMENT_RELEASE":
      return "Payment Release Policy";
    case "COMPLETED":
      return "Completed";
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
  const act = String(actionType || "")
    .trim()
    .toUpperCase();
  switch (act) {
    case "CREATE_PLAN":
      return {
        title: "Specification Synthesized",
        description:
          "Tenfo Agent compiled formal requirements, scope boundaries, and acceptance checks.",
      };
    case "SELECT_PROVIDER":
      return {
        title: "Specialist Matched",
        description:
          "Tenfo Agent evaluated specialist capabilities and presented an eligible candidate.",
      };
    case "REQUEST_CLARIFICATION":
      return {
        title: "Clarification Requested",
        description:
          "Tenfo Agent identified technical ambiguities and requested prompt clarification.",
      };
    case "SUBMIT_OFFER":
      return {
        title: "Terms Proposed",
        description: "Tenfo Agent submitted formal commercial terms to the specialist.",
      };
    case "ACCEPT_OFFER":
      return {
        title: "Terms Finalized",
        description: "Tenfo Agent recorded the agreed execution terms.",
      };
    case "VERIFY_SUBMISSION":
      return {
        title: "Verification Executed",
        description: "Tenfo Agent executed automated evidence checks against the agreed criteria.",
      };
    case "TRIGGER_CAPTURE":
      return {
        title: "Simulated capture requested",
        description:
          "The workflow requested a simulated capture after the approval gate; no funds moved.",
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
        description: "Tenfo Agent completed an automated task for this agreement.",
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
        title: "Payment policy evaluated",
        description: `Deterministic payment policy evaluated ${act} (${code}).`,
      };
    }
    case "PAYMENT_AUTHORIZATION_REQUESTED": {
      const { name: subj, isSelf } = resolveSubject(context, "Task Owner");
      return {
        title: "Authorization requested",
        description: isSelf
          ? "You initiated payment authorization."
          : `${subj} initiated payment authorization.`,
      };
    }
    case "PAYMENT_AUTHORIZED": {
      const { name: subj, isSelf } = resolveSubject(context, "Task Owner");
      const money = formatMoney(p.amount);
      return {
        title: "Simulated authorization recorded",
        description: isSelf
          ? `You recorded a simulated authorization of ${money}; no funds were held or moved.`
          : `${subj} recorded a simulated authorization of ${money}; no funds were held or moved.`,
      };
    }
    case "PAYMENT_AUTHORIZATION_FAILED":
      return {
        title: "Payment authorization failed",
        description: String(p.reason ?? "The payment authorization failed."),
      };
    case "CAPTURE_COMMAND_CREATED":
      return {
        title: "Simulated capture approved by policy",
        description: "Deterministic policy confirmed that the simulated capture path was eligible.",
      };
    case "PAYMENT_CAPTURED": {
      const money = formatMoney(p.amount);
      return {
        title: "Simulated capture recorded",
        description: `The policy recorded simulated capture for ${money}; no funds were charged or paid.`,
      };
    }
    case "PAYMENT_CAPTURE_FAILED":
      return {
        title: "Capture failed",
        description: String(p.reason ?? "The capture could not be completed."),
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
    case "BUYER_REVIEW_DECISION_RECORDED": {
      const { name: subj, isSelf } = resolveSubject(context, "Task Owner");
      const decision = String(p.decision ?? "updated")
        .replaceAll("_", " ")
        .toLowerCase();
      return {
        title: "Buyer review recorded",
        description: isSelf
          ? `You recorded the delivery decision: ${decision}.`
          : `${subj} recorded the delivery decision: ${decision}.`,
      };
    }
    case "VERIFICATION_STARTED":
      return {
        title: "Verification running",
        description: "Executing deterministic and semantic checks against the Definition of Done.",
      };
    case "VERIFICATION_PASSED":
      return {
        title: "Automated checks passed",
        description: "Automated evidence checks passed; buyer review is still required.",
      };
    case "VERIFICATION_FAILED": {
      const failed = (p.failedRequirements as string[])?.join(", ");
      return {
        title: "Automated check failed",
        description: `A deterministic evidence check failed${failed ? `: ${failed}` : "."} Buyer review is still required.`,
      };
    }
    case "VERIFICATION_UNCERTAIN":
      return {
        title: "Verification is uncertain",
        description:
          "Automated checks could not confidently assess the deliverable. The parties should use their agreed independent-review or evidence process; Tenfo does not decide the result.",
      };
    case "CASE_OPENED":
      return {
        title: "Case opened",
        description: `A case was opened for ${String(p.category || "a platform issue").toLowerCase()} (${String(p.severity || "standard").toLowerCase()} priority).`,
      };
    case "CASE_RESOLVED": {
      const { name: subj, isSelf } = resolveSubject(context, "Platform reviewer");
      const outcome = String(p.outcome || "resolved");
      return {
        title: "Platform case updated",
        description: isSelf
          ? `You updated the platform exception case with outcome: ${outcome}.`
          : `${subj} updated the platform exception case with outcome: ${outcome}.`,
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
