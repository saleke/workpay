"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ProviderAvatar } from "@/components/provider/provider-avatar";
import {
  draftFirstContactMessage,
  getTaskConversations,
  startProviderSearch,
  startTaskConversation,
  type FirstContactTone,
} from "@/lib/api/endpoints";
import type {
  ContractDto,
  ProviderSelectionDto,
  ProviderSnapshotDto,
  TaskConversationDto,
} from "@/lib/api/types";
import { ConversationThread } from "./conversation-thread";

interface FirstContactDraft {
  message: string;
  tone: FirstContactTone;
  buyerNote: string;
}

interface ConversationLifecycleSummary {
  pending: number;
  open: number;
  declined: number;
  withdrawn: number;
}

export function TaskConversationsPanel({
  taskId,
  buyerUserId,
  contract,
  selection,
  onSelectionChanged,
  onTaskChanged,
  onLifecycleChange,
}: {
  taskId: string;
  buyerUserId: string;
  contract: ContractDto | null;
  selection: ProviderSelectionDto | null;
  onSelectionChanged?: () => void;
  onTaskChanged?: () => void;
  onLifecycleChange?: (summary: ConversationLifecycleSummary) => void;
}) {
  const [conversations, setConversations] = useState<TaskConversationDto[]>([]);
  const [providerId, setProviderId] = useState("");
  const [draftsByProvider, setDraftsByProvider] = useState<Record<string, FirstContactDraft>>({});
  const [contactApproval, setContactApproval] = useState<{
    providerId: string;
    contractHash: string;
    message: string;
  } | null>(null);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [drafting, setDrafting] = useState(false);
  const [discovering, setDiscovering] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [draftError, setDraftError] = useState<string | null>(null);
  const scrolledConversationRef = useRef<string | null>(null);

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
  const activeProviderIds = new Set(
    conversations
      .filter(
        (conversation) =>
          conversation.status === "CONTACT_PENDING" || conversation.status === "OPEN",
      )
      .map((conversation) => conversation.providerId),
  );
  const lifecycleSummary: ConversationLifecycleSummary = {
    pending: conversations.filter((conversation) => conversation.status === "CONTACT_PENDING")
      .length,
    open: conversations.filter((conversation) => conversation.status === "OPEN").length,
    declined: conversations.filter((conversation) => conversation.status === "DECLINED").length,
    withdrawn: conversations.filter((conversation) => conversation.status === "WITHDRAWN").length,
  };
  const selectedDraft = draftsByProvider[providerId] ?? {
    message: "",
    tone: "warm" as const,
    buyerNote: "",
  };
  const initialMessage = selectedDraft.message;
  const contactApproved =
    contactApproval?.providerId === providerId &&
    contactApproval.contractHash === contract?.contractHash &&
    contactApproval.message === initialMessage;

  const updateDraftForProvider = (targetProviderId: string, patch: Partial<FirstContactDraft>) => {
    setDraftsByProvider((current) => ({
      ...current,
      [targetProviderId]: {
        message: "",
        tone: "warm",
        buyerNote: "",
        ...current[targetProviderId],
        ...patch,
      },
    }));
  };

  const updateSelectedDraft = (patch: Partial<FirstContactDraft>) => {
    if (!providerId) return;
    updateDraftForProvider(providerId, patch);
  };

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

  useEffect(() => {
    if (loading || conversations.length === 0) return;
    const conversationId = new URLSearchParams(window.location.search).get("conversation");
    if (!conversationId || scrolledConversationRef.current === conversationId) return;
    const frame = window.requestAnimationFrame(() => {
      const target = document.getElementById(`conversation-${conversationId}`);
      if (!target || target.offsetParent === null) return;
      target.scrollIntoView({ behavior: "smooth", block: "start" });
      scrolledConversationRef.current = conversationId;
    });
    return () => window.cancelAnimationFrame(frame);
  }, [conversations, loading]);

  useEffect(() => {
    setProviderId("");
    setDraftsByProvider({});
    setContactApproval(null);
    setDraftError(null);
  }, [taskId]);

  useEffect(() => {
    onLifecycleChange?.(lifecycleSummary);
  }, [
    lifecycleSummary.pending,
    lifecycleSummary.open,
    lifecycleSummary.declined,
    lifecycleSummary.withdrawn,
    onLifecycleChange,
  ]);

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
    setDraftsByProvider((current) => ({
      ...current,
      [selectedCandidate.providerId]: { message: "", tone: "warm", buyerNote: "" },
    }));
    setContactApproval(null);
    await refresh();
  };

  const draftWithAI = async () => {
    if (!contract || !selectedCandidate) return;
    const targetProviderId = selectedCandidate.providerId;
    setDrafting(true);
    setDraftError(null);
    const result = await draftFirstContactMessage(taskId, {
      providerId: targetProviderId,
      expectedContractVersion: contract.version,
      expectedContractHash: contract.contractHash,
      tone: selectedDraft.tone,
      buyerNote: selectedDraft.buyerNote,
      existingDraft: initialMessage,
    });
    setDrafting(false);
    if (result.error) {
      setDraftError(result.error.message);
      return;
    }
    if (!result.data?.message) {
      setDraftError("The AI service returned an empty draft. Your current message is unchanged.");
      return;
    }
    updateDraftForProvider(targetProviderId, { message: result.data.message });
    setDraftError(null);
    setContactApproval(null);
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
        <div className="flex shrink-0 flex-wrap gap-2">
          {lifecycleSummary.pending > 0 ? (
            <span className="inline-flex w-fit items-center rounded-full border border-amber-200 bg-amber-50 px-3 py-1 text-xs font-semibold text-amber-900">
              {lifecycleSummary.pending} awaiting response
            </span>
          ) : null}
          {lifecycleSummary.open > 0 ? (
            <span className="inline-flex w-fit items-center rounded-full border border-sky-200 bg-sky-50 px-3 py-1 text-xs font-semibold text-sky-900">
              {lifecycleSummary.open} discussion{lifecycleSummary.open === 1 ? "" : "s"} open
            </span>
          ) : null}
          {contract?.status === "ACTIVE" && contract.approvedAt && candidates.length > 0 ? (
            <span className="inline-flex w-fit items-center rounded-full border border-[var(--wp-border)] bg-[var(--wp-surface-subtle)] px-3 py-1 text-xs font-medium text-[var(--wp-text-secondary)]">
              {candidates.length} available
            </span>
          ) : null}
        </div>
      </div>

      {conversations.map((conversation) => (
        <div
          key={conversation.id}
          id={`conversation-${conversation.id}`}
          className="scroll-mt-24 space-y-3 border-t border-[var(--border-subtle)] pt-4"
        >
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="font-medium">{candidateName(candidates, conversation.providerId)}</h3>
            <span className="text-xs text-[var(--text-muted)]">
              {conversation.status === "CONTACT_PENDING"
                ? "Waiting for professional"
                : conversation.status === "OPEN"
                  ? conversation.hasWorkExecution
                    ? "Assignment created"
                    : "Discussion open · not committed"
                  : conversation.status === "DECLINED"
                    ? "Contact declined"
                    : conversation.status === "WITHDRAWN"
                      ? "Professional withdrew"
                      : "Closed"}
            </span>
          </div>
          {conversation.messages.at(-1) ? (
            <p className="line-clamp-2 rounded-lg bg-white px-3 py-2 text-sm text-[var(--wp-text-secondary)]">
              <span className="font-medium text-[var(--wp-text-primary)]">
                {conversation.messages.at(-1)?.authorUserId === buyerUserId
                  ? "You: "
                  : `${candidateName(candidates, conversation.providerId)}: `}
              </span>
              {conversation.messages.at(-1)?.body}
            </p>
          ) : null}
          <Link
            href={`/messages?conversation=${encodeURIComponent(conversation.id)}`}
            className="inline-flex min-h-9 items-center justify-center rounded-lg border border-[var(--wp-border)] bg-white px-3 py-2 text-sm font-semibold text-[var(--wp-text-primary)] transition hover:bg-[var(--wp-surface-subtle)]"
          >
            Open in Messages
          </Link>
          <ConversationThread
            conversation={conversation}
            currentUserId={buyerUserId}
            hideMessages
            onAgreementChanged={() => {
              void refresh();
              onTaskChanged?.();
            }}
          />
        </div>
      ))}

      {conversations.some(
        (conversation) => conversation.status === "DECLINED" || conversation.status === "WITHDRAWN",
      ) ? (
        <p className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-950">
          A professional is no longer available for at least one conversation. Your approved scope
          remains unchanged; you can contact another available profile. No work commitment was made.
        </p>
      ) : null}

      {contract?.status === "ACTIVE" && contract.approvedAt && candidates.length > 0 ? (
        <div className="space-y-6 border-t border-[var(--wp-border)] pt-5">
          <div className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[var(--wp-accent)]">
                  Who to contact
                </p>
                <h3 className="mt-1 text-lg font-semibold tracking-tight text-[var(--charcoal)]">
                  Available professionals
                </h3>
              </div>
              <span className="rounded-full border border-[var(--wp-border)] bg-white px-2.5 py-1 text-xs font-medium text-[var(--wp-text-secondary)]">
                {candidates.length} profiles
              </span>
            </div>
            <div className="space-y-2" role="group" aria-label="Available professionals">
              {candidates.map((candidate) => {
                const isSelected = providerId === candidate.providerId;
                const activeConversation = conversations.find(
                  (conversation) => conversation.providerId === candidate.providerId,
                );
                const requestState = activeConversation?.status;

                return (
                  <button
                    key={candidate.providerId}
                    type="button"
                    onClick={() => {
                      if (activeProviderIds.has(candidate.providerId)) return;
                      setProviderId(candidate.providerId);
                      setContactApproval(null);
                      setDraftError(null);
                    }}
                    disabled={drafting || sending || activeProviderIds.has(candidate.providerId)}
                    className={`flex w-full cursor-pointer items-start gap-3 rounded-2xl border p-3 text-left transition-all sm:gap-4 sm:p-4 ${
                      isSelected
                        ? "border-[var(--wp-accent)] bg-[var(--wp-accent-subtle)]/45 shadow-sm"
                        : "border-[var(--wp-border)] bg-white hover:border-[var(--wp-border-strong)] hover:bg-[var(--wp-surface-subtle)]"
                    } ${activeProviderIds.has(candidate.providerId) ? "cursor-default opacity-90" : ""}`}
                    aria-pressed={isSelected}
                    aria-label={`Select ${candidate.displayName}`}
                  >
                    <ProviderAvatar
                      displayName={candidate.displayName}
                      image={candidate.image}
                      className="h-12 w-12 shrink-0 sm:h-14 sm:w-14"
                    />
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <span className="min-w-0 flex-1 break-words text-base font-semibold leading-snug text-[var(--wp-text-primary)]">
                          {candidate.displayName}
                        </span>
                        <span
                          className={`inline-flex rounded-full px-2 py-0.5 text-xs font-semibold ${
                            requestState === "CONTACT_PENDING"
                              ? "bg-amber-100 text-amber-900"
                              : requestState === "OPEN"
                                ? "bg-sky-100 text-sky-900"
                                : "bg-emerald-100 text-emerald-900"
                          }`}
                        >
                          {requestState === "CONTACT_PENDING"
                            ? "Waiting"
                            : requestState === "OPEN"
                              ? "Open"
                              : "Available"}
                        </span>
                      </div>
                      <p className="mt-1 line-clamp-3 text-sm leading-relaxed text-[var(--text-muted)]">
                        {candidate.bio?.trim() || "This professional has not added a summary yet."}
                      </p>
                      {candidate.capabilities?.length ? (
                        <div className="mt-2 flex flex-wrap gap-1.5">
                          {candidate.capabilities.slice(0, 3).map(({ tag }) => (
                            <span
                              key={tag}
                              className="rounded-full border border-[var(--wp-border)] bg-[var(--wp-surface-subtle)] px-2 py-0.5 text-xs font-medium text-[var(--wp-text-secondary)]"
                            >
                              {formatCapability(tag)}
                            </span>
                          ))}
                          {candidate.capabilities.length > 3 ? (
                            <span className="px-1 py-0.5 text-xs text-[var(--wp-text-secondary)]">
                              +{candidate.capabilities.length - 3} more
                            </span>
                          ) : null}
                        </div>
                      ) : null}
                      {requestState ? (
                        <p className="mt-2 text-xs font-medium text-[var(--wp-accent)]">
                          {requestState === "CONTACT_PENDING"
                            ? "Request already sent"
                            : "Discussion already open"}
                        </p>
                      ) : null}
                    </div>
                    <span className="hidden shrink-0 self-center rounded-full border border-[var(--wp-border)] bg-white px-2 py-1 text-xs font-semibold text-[var(--wp-text-secondary)] sm:inline-flex">
                      {isSelected ? "Selected" : "Choose"}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="space-y-5 rounded-2xl border border-[var(--wp-border)] bg-[var(--wp-surface-subtle)] p-4 sm:p-6">
            {selectedCandidate ? (
              <>
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div className="min-w-0">
                    <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[var(--text-muted)]">
                      01 · Scope & agreement
                    </p>
                    <p className="mt-1 font-semibold text-[var(--charcoal)]">{contract.title}</p>
                    <p className="mt-1 text-sm leading-relaxed text-[var(--text-muted)]">
                      {contract.summary}
                    </p>
                  </div>
                  <span className="shrink-0 rounded-full border border-[var(--wp-border)] bg-white px-2.5 py-1 text-xs font-medium text-[var(--wp-text-secondary)]">
                    v{contract.version}
                  </span>
                </div>

                <dl className="grid gap-2">
                  <div className="rounded-xl border border-[var(--wp-border)] bg-white p-3">
                    <dt className="text-xs text-[var(--text-muted)]">Agreed checks</dt>
                    <dd className="mt-1 text-sm font-semibold text-[var(--charcoal)]">
                      {contract.requirements.length}{" "}
                      {contract.requirements.length === 1 ? "criterion" : "criteria"}
                    </dd>
                  </div>
                  <div className="rounded-xl border border-[var(--wp-border)] bg-white p-3">
                    <dt className="text-xs text-[var(--text-muted)]">Budget ceiling</dt>
                    <dd className="mt-1 text-sm font-semibold text-[var(--charcoal)]">
                      {contract.currency} {formatAmount(contract.budgetMinor)}
                    </dd>
                    <dd className="mt-1 text-xs leading-relaxed text-[var(--text-muted)]">
                      Approved maximum, not a binding price for the professional.
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

                <div className="space-y-4 rounded-2xl border border-[var(--wp-border)] bg-white p-4">
                  <div className="flex items-start gap-3">
                    <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[var(--wp-accent-subtle)] text-xs font-semibold text-[var(--wp-accent)]">
                      02
                    </span>
                    <div>
                      <h4 className="font-semibold text-[var(--charcoal)]">
                        Prepare the first message
                      </h4>
                      <p className="mt-1 text-sm text-[var(--text-muted)]">
                        Prewritten for {selectedCandidate.displayName}. You finalise before sending.
                      </p>
                    </div>
                  </div>

                  <div className="grid gap-3">
                    <label className="block space-y-2 text-sm">
                      <span className="font-medium text-[var(--charcoal)]">Tone</span>
                      <select
                        value={selectedDraft.tone}
                        onChange={(event) =>
                          updateSelectedDraft({
                            tone:
                              event.target.value === "direct" ||
                              event.target.value === "professional"
                                ? event.target.value
                                : "warm",
                          })
                        }
                        disabled={drafting || sending}
                        className="min-h-11 w-full rounded-xl border border-[var(--wp-border-strong)] bg-white px-3.5 py-2 text-sm text-[var(--charcoal)] focus:outline-none focus:ring-2 focus:ring-[var(--wp-accent)]/40"
                      >
                        <option value="warm">Warm and approachable</option>
                        <option value="direct">Direct and concise</option>
                        <option value="professional">Professional and polished</option>
                      </select>
                    </label>
                    <label className="block space-y-2 text-sm">
                      <span className="font-medium text-[var(--charcoal)]">
                        Optional detail or question
                      </span>
                      <input
                        value={selectedDraft.buyerNote}
                        onChange={(event) => updateSelectedDraft({ buyerNote: event.target.value })}
                        maxLength={800}
                        disabled={drafting || sending}
                        className="min-h-11 w-full rounded-xl border border-[var(--wp-border-strong)] bg-white px-3.5 py-2 text-sm text-[var(--charcoal)] placeholder:text-[var(--text-muted)] focus:outline-none focus:ring-2 focus:ring-[var(--wp-accent)]/40"
                        placeholder="Add context or ask a question"
                      />
                    </label>
                  </div>

                  <label className="block space-y-2 text-sm">
                    <span className="font-medium text-[var(--charcoal)]">
                      Message to {selectedCandidate.displayName}
                    </span>
                    <textarea
                      value={initialMessage}
                      onChange={(event) => {
                        updateSelectedDraft({ message: event.target.value });
                        setContactApproval(null);
                      }}
                      rows={4}
                      maxLength={5_000}
                      disabled={drafting || sending}
                      className="w-full resize-y rounded-xl border border-[var(--wp-border-strong)] bg-white px-3.5 py-3 text-sm leading-relaxed text-[var(--charcoal)] placeholder:text-[var(--text-muted)] focus:outline-none focus:ring-2 focus:ring-[var(--wp-accent)]/40"
                      placeholder="Introduce yourself and ask any remaining non-binding questions."
                    />
                    <span className="block text-right text-xs text-[var(--text-muted)]">
                      {initialMessage.length} / 5,000
                    </span>
                  </label>

                  <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                    <Button
                      type="button"
                      variant="outline"
                      disabled={drafting || sending}
                      onClick={() => void draftWithAI()}
                      className="min-h-10"
                      aria-live="polite"
                    >
                      {drafting
                        ? "Preparing a draft…"
                        : initialMessage.trim()
                          ? "Improve draft with AI"
                          : "Draft with AI"}
                    </Button>
                    <span className="text-xs leading-relaxed text-[var(--text-muted)]">
                      AI helps refine wording only; the final message remains yours to approve.
                    </span>
                  </div>

                  {draftError ? (
                    <p
                      className="rounded-lg border border-[var(--wp-danger)]/25 bg-[var(--wp-danger-subtle)] px-3 py-2.5 text-sm text-[var(--wp-danger)]"
                      role="alert"
                    >
                      {draftError}
                    </p>
                  ) : null}

                  <p className="rounded-lg bg-[var(--wp-surface-subtle)] px-3 py-2.5 text-sm leading-relaxed text-[var(--wp-text-secondary)]">
                    Nothing is sent until you approve the exact message shown here. This request
                    does not change the agreement or authorize a payment.
                  </p>

                  <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-[var(--wp-border)] bg-white p-3.5 text-sm leading-relaxed text-[var(--wp-text-secondary)]">
                    <input
                      type="checkbox"
                      checked={contactApproved}
                      onChange={(event) =>
                        setContactApproval(
                          event.target.checked && contract
                            ? {
                                providerId,
                                contractHash: contract.contractHash,
                                message: initialMessage,
                              }
                            : null,
                        )
                      }
                      className="mt-0.5 h-4 w-4 shrink-0 accent-[var(--wp-accent)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--wp-accent)]"
                    />
                    <span>
                      I approve sending this exact message to {selectedCandidate.displayName} with
                      the scope and agreement shown above. The professional may accept or decline.
                    </span>
                  </label>

                  <Button
                    type="button"
                    disabled={
                      !providerId ||
                      !initialMessage.trim() ||
                      !contactApproved ||
                      sending ||
                      drafting
                    }
                    onClick={() => void beginContact()}
                    className="min-h-11 w-full"
                  >
                    {sending ? "Sending contact request…" : "Approve and send contact request"}
                  </Button>
                </div>
              </>
            ) : (
              <p className="rounded-xl border border-dashed border-[var(--wp-border-strong)] px-4 py-3 text-sm text-[var(--wp-text-secondary)]">
                Select a profile to review the agreement and prepare your contact request.
              </p>
            )}
          </div>
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
