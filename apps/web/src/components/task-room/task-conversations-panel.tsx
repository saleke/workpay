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
  ].filter(
    (candidate, index, list) =>
      candidate.eligible !== false &&
      list.findIndex((other) => other.providerId === candidate.providerId) === index,
  );
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
            Connect when you’re ready
          </p>
          <h2
            id={`conversation-heading-${taskId}`}
            className="mt-1 text-lg font-semibold tracking-tight text-[var(--charcoal)] sm:text-xl"
          >
            Professional conversation
          </h2>
          <p className="mt-2 max-w-3xl text-sm leading-relaxed text-[var(--text-muted)]">
            Messages stay between you and the selected professional. They do not change the
            agreement or payment. Nothing is sent until you review the person and approve the exact
            contact request.
          </p>
        </div>
        <span className="inline-flex w-fit shrink-0 items-center rounded-full border border-[var(--wp-border)] bg-[var(--wp-surface-subtle)] px-3 py-1 text-xs font-medium text-[var(--wp-text-secondary)]">
          Buyer chooses
        </span>
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
        <div className="space-y-4 border-t border-[var(--wp-border)] pt-5">
          <div className="flex flex-wrap items-end justify-between gap-2">
            <div>
              <h3 className="font-semibold tracking-tight text-[var(--charcoal)]">
                Choose a professional
              </h3>
              <p className="mt-1 text-xs text-[var(--text-muted)]">
                {candidates.length} {candidates.length === 1 ? "person" : "people"} available
              </p>
            </div>
            <span className="rounded-full bg-[var(--wp-surface-subtle)] px-2.5 py-1 text-xs text-[var(--text-muted)]">
              Profiles, not recommendations
            </span>
          </div>
          <p className="text-sm text-[var(--text-muted)]">
            Review each person’s profile and choose whom you want to contact. WorkPay does not rank,
            endorse, or contact anyone automatically.
          </p>
          <fieldset className="overflow-hidden rounded-2xl border border-[var(--wp-border)] bg-white">
            <legend className="sr-only">Available professionals</legend>
            {candidates.map((candidate) => (
              <label
                key={candidate.providerId}
                className={`group flex cursor-pointer items-start gap-3.5 border-b border-[var(--wp-border)] px-3.5 py-4 last:border-b-0 transition-colors sm:items-center sm:px-4 ${
                  providerId === candidate.providerId
                    ? "bg-[var(--wp-accent-subtle)]/55"
                    : "hover:bg-[var(--wp-surface-subtle)]"
                }`}
              >
                <span className="relative shrink-0">
                  <ProviderAvatar
                    displayName={candidate.displayName}
                    image={candidate.image}
                    className="h-12 w-12 sm:h-14 sm:w-14"
                  />
                  <span
                    aria-label="Available"
                    className="absolute bottom-0 right-0 h-3.5 w-3.5 rounded-full border-2 border-white bg-emerald-500"
                  />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
                    <span className="text-sm font-semibold text-[var(--wp-text-primary)]">
                      {candidate.displayName}
                    </span>
                    <span className="text-[11px] font-medium text-[var(--wp-success)]">
                      Available
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
                          className="rounded-full bg-[var(--wp-surface-subtle)] px-2 py-0.5 text-[10px] font-medium text-[var(--wp-text-secondary)]"
                        >
                          {formatCapability(tag)}
                        </span>
                      ))}
                      {candidate.capabilities.length > 3 ? (
                        <span className="px-1 py-0.5 text-[10px] text-[var(--wp-text-secondary)]">
                          +{candidate.capabilities.length - 3} more
                        </span>
                      ) : null}
                    </span>
                  ) : null}
                </span>
                <span className="shrink-0">
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
                </span>
              </label>
            ))}
          </fieldset>
          {selectedCandidate ? (
            <div className="rounded-2xl border border-[var(--wp-border)] bg-[var(--wp-surface-subtle)] p-4 sm:p-5">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0">
                  <p className="text-xs font-semibold uppercase tracking-[0.1em] text-[var(--text-muted)]">
                    Agreement shared with your request
                  </p>
                  <p className="mt-1 font-semibold text-[var(--charcoal)]">{contract.title}</p>
                  <p className="mt-1 line-clamp-2 text-sm leading-relaxed text-[var(--text-muted)]">
                    {contract.summary}
                  </p>
                </div>
                <span className="shrink-0 rounded-full border border-[var(--wp-border)] bg-white px-2.5 py-1 text-xs font-medium text-[var(--wp-text-secondary)]">
                  Version {contract.version}
                </span>
              </div>
              <div className="mt-4 flex flex-wrap gap-x-5 gap-y-2 border-t border-[var(--wp-border)] pt-3 text-xs text-[var(--wp-text-secondary)]">
                <span>{contract.requirements.length} acceptance criteria</span>
                <span>
                  {contract.currency} {formatAmount(contract.budgetMinor)} agreed budget
                </span>
              </div>
            </div>
          ) : (
            <p className="rounded-xl border border-dashed border-[var(--wp-border-strong)] px-4 py-3 text-sm text-[var(--wp-text-secondary)]">
              Select a profile to review the agreement and prepare your contact request.
            </p>
          )}
          {selectedCandidate ? (
            <>
              <label className="block space-y-2 text-sm">
                <span className="font-medium text-[var(--charcoal)]">Your first message</span>
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
              </label>
              <p className="text-xs leading-relaxed text-[var(--text-muted)]">
                Review the selected professional, agreement version, and exact message. The
                professional can accept or decline; no payment is authorized by this contact
                request.
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
                  with the agreement details shown above.
                </span>
              </label>
              <Button
                type="button"
                disabled={!providerId || !initialMessage.trim() || !contactApproved || sending}
                onClick={() => void beginContact()}
                className="min-h-11 w-full sm:w-auto"
              >
                {sending ? "Sending contact request…" : "Approve and send contact request"}
              </Button>
            </>
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
