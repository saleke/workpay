"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ProviderAvatar } from "@/components/provider/provider-avatar";
import { rankCandidatesByScope } from "@workpay/shared/provider-relevance";
import {
  draftFirstContactMessage,
  getTaskConversations,
  startProviderSearch,
  startTaskConversation,
  type FirstContactTone,
} from "@/lib/api/endpoints";
import type { ContractDto, ProviderSelectionDto, TaskConversationDto } from "@/lib/api/types";

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
  contract,
  selection,
  onSelectionChanged,
  onLifecycleChange,
}: {
  taskId: string;
  contract: ContractDto | null;
  selection: ProviderSelectionDto | null;
  onSelectionChanged?: () => void;
  onLifecycleChange?: (summary: ConversationLifecycleSummary) => void;
}) {
  const router = useRouter();
  const [conversations, setConversations] = useState<TaskConversationDto[]>([]);
  const [providerId, setProviderId] = useState("");
  const [draftsByProvider, setDraftsByProvider] = useState<Record<string, FirstContactDraft>>({});
  const [contactApproval, setContactApproval] = useState<{
    providerId: string;
    contractHash: string;
    message: string;
  } | null>(null);
  const [loading, setLoading] = useState(true);
  const [lifecycleReady, setLifecycleReady] = useState(false);
  const [sending, setSending] = useState(false);
  const [drafting, setDrafting] = useState(false);
  const [discovering, setDiscovering] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [draftError, setDraftError] = useState<string | null>(null);

  const approvedScope = contract
    ? [
        contract.title,
        contract.summary,
        ...contract.requirements.map((requirement) => requirement.statement),
        ...contract.scope.filter((item) => item.type === "INCLUDED").map((item) => item.statement),
      ].join(" ")
    : null;
  const candidates = rankCandidatesByScope(
    [
      ...(selection?.provider ? [selection.provider] : []),
      ...(selection?.alternatives ?? []),
    ].filter(
      (candidate, index, list) =>
        candidate.eligible !== false &&
        list.findIndex((other) => other.providerId === candidate.providerId) === index,
    ),
    approvedScope,
  );
  const selectedCandidate = candidates.find((candidate) => candidate.providerId === providerId);
  const selectedConversation = conversations.find(
    (conversation) =>
      conversation.providerId === providerId &&
      (conversation.status === "CONTACT_PENDING" || conversation.status === "OPEN"),
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
    setLifecycleReady(true);
  };

  useEffect(() => {
    void refresh();
    const timer = setInterval(() => void refresh(), 8_000);
    return () => clearInterval(timer);
  }, [taskId]);

  useEffect(() => {
    setProviderId("");
    setDraftsByProvider({});
    setContactApproval(null);
    setDraftError(null);
    setLifecycleReady(false);
  }, [taskId]);

  useEffect(() => {
    if (!lifecycleReady) return;
    onLifecycleChange?.(lifecycleSummary);
  }, [
    lifecycleSummary.pending,
    lifecycleSummary.open,
    lifecycleSummary.declined,
    lifecycleSummary.withdrawn,
    lifecycleReady,
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
    <section className="space-y-6" aria-labelledby={`conversation-heading-${taskId}`}>
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
            Profiles with self-described capability labels that overlap the approved scope appear
            first. This is a sorting aid, not verification or endorsement; every eligible profile
            remains available for you to review.
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
            {candidates.some((candidate) => candidate.evaluationProfile) ? (
              <p className="rounded-xl border border-violet-200 bg-violet-50 px-3 py-2 text-xs text-violet-900">
                Evaluation profiles use simulated payment.
              </p>
            ) : null}
            <div className="space-y-2" role="group" aria-label="Available professionals">
              {candidates.map((candidate) => {
                const isSelected = providerId === candidate.providerId;
                const candidateConversations = conversations.filter(
                  (conversation) => conversation.providerId === candidate.providerId,
                );
                const candidateConversation = candidateConversations.find(
                  (conversation) =>
                    conversation.status === "CONTACT_PENDING" || conversation.status === "OPEN",
                );
                const latestConversation = candidateConversations[0];
                const requestState = candidateConversation?.status ?? latestConversation?.status;
                const matchedCapabilities = new Set(candidate.matchedCapabilities);
                const orderedCapabilities = [...(candidate.capabilities ?? [])].sort(
                  (left, right) =>
                    Number(matchedCapabilities.has(right.tag)) -
                    Number(matchedCapabilities.has(left.tag)),
                );
                const matchedLabels = orderedCapabilities.filter(({ tag }) =>
                  matchedCapabilities.has(tag),
                );
                const displayedCapabilities = [
                  ...matchedLabels,
                  ...orderedCapabilities
                    .filter(({ tag }) => !matchedCapabilities.has(tag))
                    .slice(0, Math.max(0, 3 - matchedLabels.length)),
                ];
                const hiddenCapabilityCount =
                  orderedCapabilities.length - displayedCapabilities.length;

                return (
                  <button
                    key={candidate.providerId}
                    type="button"
                    onClick={() => {
                      if (candidateConversation) {
                        router.push(
                          `/messages?conversation=${encodeURIComponent(candidateConversation.id)}`,
                        );
                        return;
                      }
                      setProviderId(candidate.providerId);
                      setContactApproval(null);
                      setDraftError(null);
                    }}
                    disabled={drafting || sending}
                    className={`flex w-full cursor-pointer flex-col gap-3 rounded-2xl border p-3 text-left transition-all sm:flex-row sm:items-start sm:gap-4 sm:p-4 ${
                      isSelected
                        ? "border-[var(--wp-accent)] bg-[var(--wp-accent-subtle)]/45 shadow-sm"
                        : "border-[var(--wp-border)] bg-white hover:border-[var(--wp-border-strong)] hover:bg-[var(--wp-surface-subtle)]"
                    }`}
                    aria-pressed={isSelected}
                    aria-label={
                      candidateConversation
                        ? `Open contact options for ${candidate.displayName}`
                        : `Select ${candidate.displayName}`
                    }
                  >
                    <div className="flex w-full min-w-0 items-start gap-3 sm:flex-1 sm:gap-4">
                      <ProviderAvatar
                        displayName={candidate.displayName}
                        image={candidate.image}
                        className="h-12 w-12 shrink-0 sm:h-14 sm:w-14"
                      />
                      <div className="min-w-0 flex-1">
                        <span className="block w-full text-base font-semibold leading-snug text-[var(--wp-text-primary)]">
                          {candidate.displayName}
                        </span>
                        <div className="mt-1.5 flex flex-wrap gap-1.5">
                          {candidate.evaluationProfile ? (
                            <span className="rounded-full border border-violet-200 bg-violet-50 px-2 py-0.5 text-[10px] font-semibold text-violet-800">
                              Evaluation profile
                            </span>
                          ) : null}
                          <span
                            className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-semibold sm:text-xs ${
                              requestState === "CONTACT_PENDING"
                                ? "bg-amber-100 text-amber-900"
                                : requestState === "OPEN"
                                  ? "bg-sky-100 text-sky-900"
                                  : requestState
                                    ? "bg-slate-100 text-slate-800"
                                    : "bg-emerald-100 text-emerald-900"
                            }`}
                          >
                            {requestState === "CONTACT_PENDING"
                              ? "Awaiting response"
                              : requestState === "OPEN"
                                ? "Conversation open"
                                : requestState === "DECLINED"
                                  ? "Contact declined"
                                  : requestState === "WITHDRAWN"
                                    ? "Withdrawn"
                                    : requestState === "CLOSED"
                                      ? "Closed"
                                      : "Available"}
                          </span>
                        </div>
                        <p className="mt-2 line-clamp-3 text-sm leading-relaxed text-[var(--text-muted)]">
                          {candidate.bio?.trim() ||
                            "This professional has not added a summary yet."}
                        </p>
                        {candidate.capabilities?.length ? (
                          <div className="mt-2 flex flex-wrap gap-1.5">
                            {displayedCapabilities.map(({ tag }) => (
                              <span
                                key={tag}
                                className={`rounded-full border px-2 py-0.5 text-xs font-medium ${
                                  matchedCapabilities.has(tag)
                                    ? "border-[var(--wp-accent)]/30 bg-[var(--wp-accent-subtle)] text-[var(--wp-accent)]"
                                    : "border-[var(--wp-border)] bg-[var(--wp-surface-subtle)] text-[var(--wp-text-secondary)]"
                                }`}
                              >
                                {formatCapability(tag)}
                              </span>
                            ))}
                            {hiddenCapabilityCount > 0 ? (
                              <span className="px-1 py-0.5 text-xs text-[var(--wp-text-secondary)]">
                                +{hiddenCapabilityCount} more
                              </span>
                            ) : null}
                          </div>
                        ) : null}
                        {candidate.matchedCapabilities.length > 0 ? (
                          <p className="mt-2 text-xs font-medium text-[var(--wp-accent)]">
                            {candidate.matchedCapabilities.length} direct scope{" "}
                            {candidate.matchedCapabilities.length === 1 ? "match" : "matches"}
                          </p>
                        ) : null}
                      </div>
                    </div>
                    <span className="inline-flex min-h-8 shrink-0 self-end items-center rounded-full border border-[var(--wp-border)] bg-white px-3 py-1 text-xs font-semibold text-[var(--wp-text-secondary)] sm:self-center">
                      {candidateConversation
                        ? "Open inbox"
                        : isSelected
                          ? "Selected"
                          : latestConversation
                            ? "Contact again"
                            : "Choose"}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="space-y-5 rounded-2xl border border-[var(--wp-border)] bg-[var(--wp-surface-subtle)] p-4 sm:p-6">
            {selectedCandidate ? (
              selectedConversation ? (
                <div
                  className="space-y-4 rounded-2xl border border-[var(--wp-border)] bg-white p-4 sm:p-5"
                  role="status"
                >
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[var(--wp-accent)]">
                      You already contacted {selectedCandidate.displayName}
                    </p>
                    <h4 className="mt-1 text-lg font-semibold text-[var(--charcoal)]">
                      {selectedConversation.status === "CONTACT_PENDING"
                        ? "Waiting for their response"
                        : selectedConversation.status === "OPEN"
                          ? "Your conversation is open"
                          : selectedConversation.status === "DECLINED"
                            ? "They declined this contact request"
                            : selectedConversation.status === "WITHDRAWN"
                              ? "This contact was withdrawn"
                              : "This conversation is closed"}
                    </h4>
                    <p className="mt-1 text-sm leading-relaxed text-[var(--text-muted)]">
                      Continue from the Messages inbox to keep the conversation and its task context
                      together.
                    </p>
                  </div>
                  <Link
                    href={`/messages?conversation=${encodeURIComponent(selectedConversation.id)}`}
                    className="inline-flex min-h-11 w-full items-center justify-center rounded-xl bg-[var(--wp-accent)] px-4 py-2 text-sm font-semibold text-white transition hover:brightness-95 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--wp-accent)] sm:w-auto"
                  >
                    Open conversation in Messages
                  </Link>
                </div>
              ) : (
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
                          Prewritten for {selectedCandidate.displayName}. You finalise before
                          sending.
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
                          onChange={(event) =>
                            updateSelectedDraft({ buyerNote: event.target.value })
                          }
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
                          ? "Polishing wording…"
                          : initialMessage.trim()
                            ? "Polish wording"
                            : "Draft a clearer message"}
                      </Button>
                      <span className="text-xs leading-relaxed text-[var(--text-muted)]">
                        AI can help refine the wording only; the final message remains yours to
                        approve.
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
              )
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
                    ? "No professionals are available yet"
                    : selection?.status === "EXPIRED"
                      ? "This professional search has expired"
                      : "No professional profiles to show yet"}
              </h3>
              <p className="mt-1 max-w-xl text-sm leading-relaxed text-[var(--text-muted)]">
                {discovering
                  ? "You can keep working while we look for eligible profiles."
                  : selection?.reason ||
                    "When profiles are available, you can review each one and choose whether to reach out."}
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

function formatAmount(amountMinor: number): string {
  return (amountMinor / 100).toFixed(2);
}

function formatCapability(tag: string): string {
  return tag.replace(/[_-]+/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}
