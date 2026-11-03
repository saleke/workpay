"use client";

import { useEffect, useState } from "react";
import { Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ProviderAvatar } from "@/components/provider/provider-avatar";
import {
  getTaskConversations,
  startProviderSearch,
  startTaskConversation,
} from "@/lib/api/endpoints";
import type {
  ContractDto,
  ProviderSelectionDto,
  ProviderSnapshotDto,
  TaskConversationDto,
} from "@/lib/api/types";
import { ConversationThread } from "./conversation-thread";

export function TaskConversationsPanel({
  taskId,
  buyerUserId,
  contract,
  selection,
  onSelectionChanged,
  onTaskChanged,
}: {
  taskId: string;
  buyerUserId: string;
  contract: ContractDto | null;
  selection: ProviderSelectionDto | null;
  onSelectionChanged?: () => void;
  onTaskChanged?: () => void;
}) {
  const [conversations, setConversations] = useState<TaskConversationDto[]>([]);
  const [providerId, setProviderId] = useState("");
  const [initialMessage, setInitialMessage] = useState("");
  const [contactApproved, setContactApproved] = useState(false);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [discovering, setDiscovering] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const candidates = [
    ...(selection?.provider ? [selection.provider] : []),
    ...(selection?.alternatives ?? []),
  ]
    .filter(
      (candidate, index, list) =>
        candidate.eligible !== false &&
        list.findIndex((other) => other.providerId === candidate.providerId) === index,
    )
    .sort((left, right) => {
      const leftName = left.displayName.trim().toLowerCase();
      const rightName = right.displayName.trim().toLowerCase();
      return leftName < rightName ? -1 : leftName > rightName ? 1 : 0;
    });
  const selectedCandidate = candidates.find((candidate) => candidate.providerId === providerId);

  const refresh = async () => {
    const result = await getTaskConversations(taskId);
    setLoading(false);
    if (result.error) {
      setError(result.error.message);
      return;
    }
    setError(null);
    setConversations(result.data ?? []);
  };

  useEffect(() => {
    void refresh();
    const timer = setInterval(() => void refresh(), 8_000);
    return () => clearInterval(timer);
  }, [taskId]);

  const beginContact = async () => {
    if (!contract || !selectedCandidate || !initialMessage.trim()) return;
    setSending(true);
    setError(null);
    const result = await startTaskConversation(taskId, {
      providerId: selectedCandidate.providerId,
      expectedContractVersion: contract.version,
      expectedContractHash: contract.contractHash,
      initialMessage,
      clientMessageId: crypto.randomUUID(),
    });
    setSending(false);
    if (result.error) {
      setError(result.error.message);
      return;
    }
    setInitialMessage("");
    setContactApproved(false);
    await refresh();
  };

  const findProfessionals = async () => {
    setDiscovering(true);
    setError(null);
    const result = await startProviderSearch(taskId);
    setDiscovering(false);
    if (result.error) {
      setError(result.error.message);
      return;
    }
    onSelectionChanged?.();
  };

  return (
    <section
      className="workpay-card space-y-6 p-5 sm:p-6"
      aria-labelledby={`conversation-heading-${taskId}`}
    >
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[var(--wp-accent)]">
            Professional selection
          </p>
          <h2
            id={`conversation-heading-${taskId}`}
            className="mt-1 text-lg font-semibold tracking-tight text-[var(--charcoal)] sm:text-xl"
          >
            Choose a professional
          </h2>
          <p className="mt-2 max-w-3xl text-sm leading-relaxed text-[var(--text-muted)]">
            Profiles are shown alphabetically, not ranked. Compare each person’s details and decide
            whether to reach out; WorkPay does not endorse or contact anyone on your behalf.
          </p>
        </div>
        {contract?.status === "ACTIVE" && contract.approvedAt && candidates.length > 0 ? (
          <span className="inline-flex w-fit shrink-0 items-center rounded-full border border-[var(--wp-border)] bg-[var(--wp-surface-subtle)] px-3 py-1 text-xs font-medium text-[var(--wp-text-secondary)]">
            {candidates.length} {candidates.length === 1 ? "profile" : "profiles"} to review
          </span>
        ) : null}
      </div>

      {conversations.map((conversation) => (
        <div
          key={conversation.id}
          className="space-y-3 border-t border-[var(--border-subtle)] pt-4"
        >
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="font-medium">{candidateName(candidates, conversation.providerId)}</h3>
            <span className="text-xs text-[var(--text-muted)]">
              {conversation.status === "CONTACT_PENDING"
                ? "Waiting for professional"
                : conversation.status === "OPEN"
                  ? "Conversation open"
                  : conversation.status === "DECLINED"
                    ? "Contact declined"
                    : "Closed"}
            </span>
          </div>
          <ConversationThread
            conversation={conversation}
            currentUserId={buyerUserId}
            onAgreementChanged={() => {
              void refresh();
              onTaskChanged?.();
            }}
          />
        </div>
      ))}

      {contract?.status === "ACTIVE" && contract.approvedAt && candidates.length > 0 ? (
        <div className="space-y-5 border-t border-[var(--wp-border)] pt-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h3 className="font-semibold tracking-tight text-[var(--charcoal)]">
                Available professional profiles
              </h3>
              <p className="mt-1 text-sm text-[var(--text-muted)]">
                Select a profile to review the agreement and prepare a contact request.
              </p>
            </div>
            <span className="rounded-lg border border-[var(--wp-border)] bg-white px-2.5 py-1.5 text-xs font-medium text-[var(--wp-text-secondary)]">
              You make the choice
            </span>
          </div>
          <fieldset className="grid gap-2.5">
            <legend className="sr-only">Available professionals</legend>
            {candidates.map((candidate) => (
              <label
                key={candidate.providerId}
                className={`group flex cursor-pointer items-start gap-3.5 rounded-2xl border p-3.5 transition-all sm:items-center sm:gap-4 sm:p-4 ${
                  providerId === candidate.providerId
                    ? "border-[var(--wp-accent)] bg-[var(--wp-accent-subtle)]/45 shadow-sm"
                    : "border-[var(--wp-border)] bg-white hover:border-[var(--wp-border-strong)] hover:bg-[var(--wp-surface-subtle)]"
                }`}
              >
                <span className="relative shrink-0">
                  <ProviderAvatar
                    displayName={candidate.displayName}
                    image={candidate.image}
                    className="h-12 w-12 sm:h-14 sm:w-14"
                  />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
                    <span className="text-sm font-semibold text-[var(--wp-text-primary)] sm:text-base">
                      {candidate.displayName}
                    </span>
                  </span>
                  <span className="mt-1 block line-clamp-2 text-[13px] leading-relaxed text-[var(--text-muted)]">
                    {candidate.bio?.trim() || "This professional has not added a summary yet."}
                  </span>
                  {candidate.capabilities?.length ? (
                    <span className="mt-2 flex flex-wrap gap-1.5">
                      {candidate.capabilities.slice(0, 3).map(({ tag }) => (
                        <span
                          key={tag}
                          className="rounded-full border border-[var(--wp-border)] bg-[var(--wp-surface-subtle)] px-2.5 py-1 text-[11px] font-medium text-[var(--wp-text-secondary)]"
                        >
                          {formatCapability(tag)}
                        </span>
                      ))}
                      {candidate.capabilities.length > 3 ? (
                        <span className="px-1 py-1 text-[11px] text-[var(--wp-text-secondary)]">
                          +{candidate.capabilities.length - 3} more
                        </span>
                      ) : null}
                    </span>
                  ) : null}
                </span>
                <span className="flex shrink-0 flex-col items-center gap-1">
                  <input
                    type="radio"
                    name={`professional-${taskId}`}
                    value={candidate.providerId}
                    checked={providerId === candidate.providerId}
                    onChange={() => {
                      setProviderId(candidate.providerId);
                      setContactApproved(false);
                    }}
                    aria-label={`Select ${candidate.displayName}`}
                    className="mt-1 h-4 w-4 accent-[var(--wp-accent)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--wp-accent)] sm:mt-0"
                  />
                  <span className="sr-only">
                    {providerId === candidate.providerId ? "Selected" : "Select"}
                  </span>
                </span>
              </label>
            ))}
          </fieldset>
          {selectedCandidate ? (
            <div className="space-y-4 rounded-2xl border border-[var(--wp-border)] bg-[var(--wp-surface-subtle)] p-4 sm:p-5">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0">
                  <p className="text-xs font-semibold uppercase tracking-[0.1em] text-[var(--text-muted)]">
                    01 · Review the agreement
                  </p>
                  <p className="mt-1 font-semibold text-[var(--charcoal)]">{contract.title}</p>
                  <p className="mt-1 text-sm leading-relaxed text-[var(--text-muted)]">
                    {contract.summary}
                  </p>
                </div>
                <span className="shrink-0 rounded-full border border-[var(--wp-border)] bg-white px-2.5 py-1 text-xs font-medium text-[var(--wp-text-secondary)]">
                  Version {contract.version}
                </span>
              </div>
              <dl className="grid gap-2 sm:grid-cols-2">
                <div className="rounded-xl border border-[var(--wp-border)] bg-white p-3">
                  <dt className="text-xs text-[var(--text-muted)]">Agreed checks</dt>
                  <dd className="mt-1 text-sm font-semibold text-[var(--charcoal)]">
                    {contract.requirements.length}{" "}
                    {contract.requirements.length === 1 ? "criterion" : "criteria"}
                  </dd>
                </div>
                <div className="rounded-xl border border-[var(--wp-border)] bg-white p-3">
                  <dt className="text-xs text-[var(--text-muted)]">Agreed budget</dt>
                  <dd className="mt-1 text-sm font-semibold text-[var(--charcoal)]">
                    {contract.currency} {formatAmount(contract.budgetMinor)}
                  </dd>
                </div>
              </dl>
              {contract.requirements.length > 0 ? (
                <details className="rounded-xl border border-[var(--wp-border)] bg-white">
                  <summary className="cursor-pointer px-3.5 py-3 text-sm font-medium text-[var(--wp-text-secondary)] marker:text-[var(--wp-accent)]">
                    Read all {contract.requirements.length} agreed checks
                  </summary>
                  <ol className="grid gap-2 border-t border-[var(--wp-border)] px-4 py-3">
                    {contract.requirements.map((requirement, index) => (
                      <li
                        key={requirement.key}
                        className="flex items-start gap-3 text-sm leading-relaxed text-[var(--wp-text-secondary)]"
                      >
                        <span className="font-mono text-xs text-[var(--text-muted)]">
                          {index + 1}.
                        </span>
                        <span>{requirement.statement}</span>
                      </li>
                    ))}
                  </ol>
                </details>
              ) : null}
            </div>
          ) : (
            <p className="rounded-xl border border-dashed border-[var(--wp-border-strong)] px-4 py-3 text-sm text-[var(--wp-text-secondary)]">
              Select a profile to review the agreement and prepare your contact request.
            </p>
          )}
          {selectedCandidate ? (
            <div className="space-y-4 rounded-2xl border border-[var(--wp-border)] p-4 sm:p-5">
              <div className="flex items-start gap-3">
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[var(--wp-accent-subtle)] text-xs font-semibold text-[var(--wp-accent)]">
                  02
                </span>
                <div>
                  <h4 className="font-semibold text-[var(--charcoal)]">
                    Prepare your contact request
                  </h4>
                  <p className="mt-1 text-sm text-[var(--text-muted)]">
                    Your message will be sent with the agreement details above.
                  </p>
                </div>
              </div>
              <label className="block space-y-2 text-sm">
                <span className="font-medium text-[var(--charcoal)]">
                  Message to {selectedCandidate.displayName}
                </span>
                <textarea
                  value={initialMessage}
                  onChange={(event) => {
                    setInitialMessage(event.target.value);
                    setContactApproved(false);
                  }}
                  rows={4}
                  maxLength={5_000}
                  className="w-full resize-y rounded-xl border border-[var(--wp-border-strong)] bg-white px-3.5 py-3 text-sm leading-relaxed text-[var(--charcoal)] placeholder:text-[var(--text-muted)] focus:outline-none focus:ring-2 focus:ring-[var(--wp-accent)]/40"
                  placeholder="Introduce yourself and ask any remaining non-binding questions."
                />
                <span className="block text-right text-xs text-[var(--text-muted)]">
                  {initialMessage.length} / 5,000
                </span>
              </label>
              <p className="rounded-lg bg-[var(--wp-surface-subtle)] px-3 py-2.5 text-sm leading-relaxed text-[var(--wp-text-secondary)]">
                Nothing is sent until you approve the exact message below. This request does not
                change the agreement or authorize a payment.
              </p>
              <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-[var(--wp-border)] bg-white p-3.5 text-sm leading-relaxed text-[var(--wp-text-secondary)]">
                <input
                  type="checkbox"
                  checked={contactApproved}
                  onChange={(event) => setContactApproved(event.target.checked)}
                  className="mt-0.5 h-4 w-4 shrink-0 accent-[var(--wp-accent)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--wp-accent)]"
                />
                <span>
                  I approve sending this exact message to{" "}
                  <span className="font-semibold text-[var(--charcoal)]">
                    {selectedCandidate.displayName}
                  </span>{" "}
                  with the agreement version and scope details shown above. The professional may
                  accept or decline.
                </span>
              </label>
              <Button
                type="button"
                disabled={!providerId || !initialMessage.trim() || !contactApproved || sending}
                onClick={() => void beginContact()}
                className="min-h-11 w-full"
              >
                {sending ? "Sending contact request…" : "Approve and send contact request"}
              </Button>
            </div>
          ) : null}
        </div>
      ) : null}
      {contract?.status === "ACTIVE" && contract.approvedAt && candidates.length === 0 ? (
        <div className="flex flex-col gap-4 rounded-2xl border border-[var(--wp-border)] bg-[var(--wp-surface-subtle)] p-5 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex gap-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-white text-[var(--wp-text-secondary)]">
              <Users className="h-4 w-4" />
            </span>
            <div>
              <h3 className="font-semibold text-[var(--charcoal)]">
                {discovering
                  ? "Finding available professionals…"
                  : selection?.status === "FAILED"
                    ? "Professional search didn’t complete"
                    : selection?.status === "EXPIRED"
                      ? "This professional search has expired"
                      : "No professional profiles to show yet"}
              </h3>
              <p className="mt-1 max-w-xl text-sm leading-relaxed text-[var(--text-muted)]">
                {discovering
                  ? "You can keep working while we look for eligible profiles."
                  : "WorkPay won’t select or contact anyone for you. When profiles are available, you can review each one and choose whether to reach out."}
              </p>
            </div>
          </div>
          {(!selection || selection.status === "FAILED" || selection.status === "EXPIRED") && (
            <Button
              type="button"
              onClick={() => void findProfessionals()}
              disabled={discovering}
              className="min-h-10 shrink-0"
            >
              {discovering ? "Searching…" : "Find professionals"}
            </Button>
          )}
        </div>
      ) : null}
      {loading ? (
        <p
          className="rounded-xl border border-[var(--wp-border)] bg-[var(--wp-surface-subtle)] px-4 py-3 text-sm text-[var(--text-muted)]"
          role="status"
        >
          Loading conversations…
        </p>
      ) : null}
      {error ? (
        <p
          className="rounded-xl border border-[var(--wp-danger)]/25 bg-[var(--wp-danger-subtle)] px-4 py-3 text-sm text-[var(--wp-danger)]"
          role="alert"
        >
          {error}
        </p>
      ) : null}
    </section>
  );
}

function candidateName(candidates: ProviderSnapshotDto[], providerId: string): string {
  return (
    candidates.find((candidate) => candidate.providerId === providerId)?.displayName ??
    "Selected professional"
  );
}

function formatAmount(amountMinor: number): string {
  return (amountMinor / 100).toFixed(2);
}

function formatCapability(tag: string): string {
  return tag.replace(/[_-]+/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}
