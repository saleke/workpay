"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
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
      className="workpay-card space-y-5 p-5"
      aria-labelledby={`conversation-heading-${taskId}`}
    >
      <div>
        <h2 id={`conversation-heading-${taskId}`} className="text-lg font-semibold">
          Professional conversation
        </h2>
        <p className="mt-1 text-sm text-[var(--text-muted)]">
          Messages are private to you and the selected professional. Messages do not change the
          agreement or payment. Nothing is sent until you review the professional and explicitly
          approve the exact contact request.
        </p>
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
        <div className="space-y-3 border-t border-[var(--border-subtle)] pt-4">
          <h3 className="font-medium">Choose a professional</h3>
          <p className="text-sm text-[var(--text-muted)]">
            These available profiles are shown without automatic selection or endorsement. Review
            their self-described skills and experience before deciding.
          </p>
          <fieldset className="space-y-3">
            <legend className="sr-only">Available professionals</legend>
            {candidates.map((candidate) => (
              <label
                key={candidate.providerId}
                className={`block cursor-pointer rounded-lg border p-4 ${
                  providerId === candidate.providerId
                    ? "border-[var(--wp-accent)] bg-[var(--wp-accent)]/5"
                    : "border-border"
                }`}
              >
                <span className="flex items-start gap-3">
                  <input
                    type="radio"
                    name={`professional-${taskId}`}
                    value={candidate.providerId}
                    checked={providerId === candidate.providerId}
                    onChange={() => {
                      setProviderId(candidate.providerId);
                      setContactApproved(false);
                    }}
                    className="mt-1"
                  />
                  <span className="min-w-0 flex-1">
                    <span className="font-medium">{candidate.displayName}</span>
                    {candidate.bio ? (
                      <span className="mt-1 block text-sm text-[var(--text-muted)]">
                        {candidate.bio}
                      </span>
                    ) : null}
                    <span className="mt-2 block text-xs text-[var(--text-muted)]">
                      {candidate.capabilities?.length
                        ? `Self-described skills: ${candidate.capabilities
                            .map(({ tag, proficiency }) => `${tag} (${proficiency}/5)`)
                            .join(", ")}`
                        : "No skills listed"}
                    </span>
                    <span className="mt-2 block text-xs text-[var(--text-muted)]">
                      {candidate.completedTasks ?? 0} completed tasks recorded
                      {candidate.priceMinor !== undefined
                        ? ` · Profile rate ${formatProfileRate(candidate.priceMinor, candidate.currency ?? contract.currency)} (not a quote)`
                        : ""}
                    </span>
                  </span>
                </span>
              </label>
            ))}
          </fieldset>
          {selectedCandidate ? (
            <div className="rounded-lg border border-border bg-muted/40 p-3 text-sm">
              <p className="font-medium">
                Exact terms to be shared: {contract.title}, version {contract.version}
              </p>
              <p className="mt-1">{contract.summary}</p>
              <p className="mt-2">
                {contract.requirements.length} requirements · {contract.currency}{" "}
                {formatAmount(contract.budgetMinor)}
              </p>
            </div>
          ) : null}
          <label className="block space-y-1 text-sm">
            <span>First message</span>
            <textarea
              value={initialMessage}
              onChange={(event) => {
                setInitialMessage(event.target.value);
                setContactApproved(false);
              }}
              rows={4}
              maxLength={5_000}
              className="w-full rounded-md border border-input bg-background px-3 py-2"
              placeholder="Introduce yourself and ask any remaining non-binding questions."
            />
          </label>
          <p className="text-xs text-[var(--text-muted)]">
            Review the selected professional, agreement version, and exact message. Approving sends
            this contact request; no payment is authorized. Chat opens only if the professional
            accepts.
          </p>
          <label className="flex items-start gap-2 text-sm">
            <input
              type="checkbox"
              checked={contactApproved}
              onChange={(event) => setContactApproved(event.target.checked)}
              className="mt-1"
            />
            <span>
              I approve sending this exact message to {selectedCandidate?.displayName ?? "the selected professional"} with the
              terms shown above.
            </span>
          </label>
          {error ? (
            <p className="text-sm text-destructive" role="alert">
              {error}
            </p>
          ) : null}
          <Button
            type="button"
            disabled={!providerId || !initialMessage.trim() || !contactApproved || sending}
            onClick={() => void beginContact()}
          >
            {sending ? "Sending contact request…" : "Approve and send this contact request"}
          </Button>
        </div>
      ) : null}
      {contract?.status === "ACTIVE" &&
      contract.approvedAt &&
      (!selection || selection.status === "FAILED" || selection.status === "EXPIRED") ? (
        <div className="space-y-2 border-t border-[var(--border-subtle)] pt-4">
          <p className="text-sm text-[var(--text-muted)]">
            Browse available profiles. WorkPay will not choose or contact anyone for you.
          </p>
          <Button type="button" onClick={() => void findProfessionals()} disabled={discovering}>
            {discovering ? "Finding available professionals…" : "Find available professionals"}
          </Button>
        </div>
      ) : null}
      {loading ? (
        <p className="text-sm text-[var(--text-muted)]" role="status">
          Loading conversations…
        </p>
      ) : null}
      {error && !selectedCandidate ? (
        <p className="text-sm text-destructive" role="alert">
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

function formatProfileRate(amountMinor: number, currency: string): string {
  return new Intl.NumberFormat(undefined, { style: "currency", currency }).format(amountMinor / 100);
}
