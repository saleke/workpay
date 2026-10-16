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

export interface ActivityEntry {
  id: string;
  type: string;
  occurredAt: string;
  actorType: string;
  actorId: string | null;
  title: string;
  description: string;
  visibility: string;
}

/** Turn an event type and payload into buyer-facing prose. */
export function describeEvent(
  type: string,
  payload: unknown,
): { title: string; description: string } {
  const p = (payload ?? {}) as Record<string, unknown>;
  switch (type) {
    case "TASK_CREATED":
      return { title: "Task created", description: "The buyer submitted a new task." };
    case "TASK_STATUS_CHANGED":
      return { title: "Status updated", description: `Moved from ${p.from} to ${p.to}.` };
    case "WORK_SPEC_CREATED":
      return {
        title: "Work specification ready",
        description: `A ${String(p.planSource ?? "planner").toLowerCase()} plan with ${
          p.requirementCount ?? 0
        } requirement(s) was produced.`,
      };
    case "CLARIFICATION_REQUESTED":
      return {
        title: "Clarification requested",
        description: `${(p.questions as string[])?.length ?? 0} question(s) sent to the buyer.`,
      };
    case "CLARIFICATION_ANSWERED":
      return {
        title: "Clarification answered",
        description: "The buyer answered a clarifying question.",
      };
    case "CONTRACT_CREATED":
      return {
        title: "Contract drafted",
        description: "A contract is ready for the buyer to review and approve.",
      };
    case "CONTRACT_APPROVED":
      return {
        title: "Contract approved",
        description: "The buyer approved the contract and froze its terms.",
      };
    case "PROVIDER_SEARCH_STARTED":
      return { title: "Finding a provider", description: "Searching for an eligible provider." };
    case "PROVIDER_SELECTED":
      return {
        title: "Provider selected",
        description: `${(p.provider as { displayName?: string })?.displayName ?? "A provider"} was selected.`,
      };
    case "PROVIDER_SELECTION_FAILED":
      return {
        title: "No provider found",
        description: String(p.reason ?? "No eligible provider."),
      };
    case "NEGOTIATION_STARTED":
      return {
        title: "Negotiation started",
        description: "The buyer agent is negotiating the price.",
      };
    case "OFFER_CREATED":
      return { title: "Offer sent", description: `An offer of ${formatMoney(p.price)} was sent.` };
    case "COUNTEROFFER_RECEIVED":
      return {
        title: "Counteroffer received",
        description: `The provider countered with ${formatMoney(p.price)}.`,
      };
    case "OFFER_ACCEPTED":
      return { title: "Offer accepted", description: "The price was agreed." };
    case "COMMERCIAL_AGREEMENT_CREATED":
      return {
        title: "Agreement reached",
        description: `Agreed price ${formatMoney(p.agreedPrice)}.`,
      };
    case "PAYMENT_POLICY_EVALUATED":
      return {
        title: `Payment policy: ${p.action}`,
        description: `Decision ${p.result} (${p.reasonCode}).`,
      };
    case "PAYMENT_AUTHORIZATION_REQUESTED":
      return { title: "Authorizing payment", description: "Holding the agreed amount." };
    case "PAYMENT_AUTHORIZED":
      return {
        title: "Payment authorized",
        description: `${formatMoney(p.amount)} is on hold until the work passes.`,
      };
    case "PAYMENT_AUTHORIZATION_FAILED":
      return { title: "Authorization failed", description: String(p.reason ?? "declined") };
    case "CAPTURE_COMMAND_CREATED":
      return {
        title: "Release approved by policy",
        description: "The payment policy allowed the release.",
      };
    case "PAYMENT_CAPTURED":
      return {
        title: "Payment released",
        description: `${formatMoney(p.amount)} was paid to the provider.`,
      };
    case "PAYMENT_CAPTURE_FAILED":
      return { title: "Payment release failed", description: String(p.reason ?? "declined") };
    case "PROVIDER_ACCEPTED":
      return { title: "Provider accepted", description: "The provider accepted the assignment." };
    case "WORK_STARTED":
      return { title: "Work started", description: "The provider began the work." };
    case "SUBMISSION_CREATED":
      return {
        title: "Draft submitted",
        description: "The provider attached a draft deliverable.",
      };
    case "SUBMISSION_SUBMITTED":
      return {
        title: "Deliverable submitted",
        description: "The provider submitted the work for review.",
      };
    case "REVISION_REQUESTED":
      return { title: "Revision requested", description: String(p.reason ?? "Changes required.") };
    case "VERIFICATION_STARTED":
      return { title: "Checking the work", description: "Running the acceptance checks." };
    case "VERIFICATION_PASSED":
      return { title: "Checks passed", description: "All acceptance requirements passed." };
    case "VERIFICATION_FAILED":
      return {
        title: "Checks failed",
        description: `Failed: ${(p.failedRequirements as string[])?.join(", ") ?? "unknown"}.`,
      };
    case "VERIFICATION_UNCERTAIN":
      return { title: "Needs human review", description: "The automated checks could not decide." };
    case "CASE_OPENED":
      return { title: "Case opened", description: `${p.category} (${p.severity}).` };
    case "CASE_RESOLVED":
      return { title: "Case resolved", description: String(p.outcome ?? "") };
    case "AGENT_ACTION_RECORDED":
      return { title: `Agent: ${p.actionType}`, description: `Action ${p.status}.` };
    case "AGENT_AUTHORITY_DENIED":
      return { title: "Agent action blocked", description: `${p.actionType}: ${p.reason}.` };
    default:
      return { title: type, description: "" };
  }
}

function formatMoney(value: unknown): string {
  const m = value as { amountMinor?: number; currency?: string } | undefined;
  if (!m || typeof m.amountMinor !== "number") return "";
  return `${(m.amountMinor / 100).toFixed(2)} ${m.currency ?? ""}`.trim();
}

/**
 * Project the timeline for a task. `maxVisibility` filters by audience, so a
 * provider never sees ADMIN/INTERNAL events and a buyer sees USER events.
 */
export async function getTaskActivity(
  db: Database,
  taskId: string,
  options?: { allowedVisibilities?: string[] },
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
      const { title, description } = describeEvent(row.type, row.payload);
      return {
        id: row.id,
        type: row.type,
        occurredAt: row.occurredAt.toISOString(),
        actorType: row.actorType,
        actorId: row.actorId,
        title,
        description,
        visibility: row.visibility,
      };
    });
}
