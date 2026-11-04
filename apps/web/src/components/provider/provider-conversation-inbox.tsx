"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import {
  listProviderConversations,
  respondToTaskConversation,
  withdrawTaskConversation,
} from "@/lib/api/endpoints";
import type { TaskConversationDto } from "@/lib/api/types";
import { ConversationThread } from "@/components/task-room/conversation-thread";

export function ProviderConversationInbox() {
  const [conversations, setConversations] = useState<TaskConversationDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [withdrawalOpenId, setWithdrawalOpenId] = useState<string | null>(null);
  const [withdrawalNote, setWithdrawalNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const scrolledConversationRef = useRef<string | null>(null);
  const orderedConversations = [...conversations].sort((left, right) => {
    const priority = (status: TaskConversationDto["status"]) =>
      status === "CONTACT_PENDING" ? 0 : status === "OPEN" ? 1 : 2;
    return priority(left.status) - priority(right.status);
  });
  const pendingCount = conversations.filter(
    (conversation) => conversation.status === "CONTACT_PENDING",
  ).length;
  const openCount = conversations.filter((conversation) => conversation.status === "OPEN").length;

  const refresh = async () => {
    const result = await listProviderConversations();
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
  }, []);

  useEffect(() => {
    if (loading || conversations.length === 0) return;
    const conversationId = new URLSearchParams(window.location.search).get("conversation");
    if (!conversationId || scrolledConversationRef.current === conversationId) return;
    const frame = window.requestAnimationFrame(() => {
      const target = document.getElementById(`conversation-${conversationId}`);
      if (!target) return;
      target.scrollIntoView({ behavior: "smooth", block: "start" });
      scrolledConversationRef.current = conversationId;
    });
    return () => window.cancelAnimationFrame(frame);
  }, [conversations, loading]);

  const respond = async (id: string, response: "accept" | "decline") => {
    setBusyId(id);
    setError(null);
    const result = await respondToTaskConversation(id, response);
    setBusyId(null);
    if (result.error) {
      setError(result.error.message);
      return;
    }
    window.dispatchEvent(new Event("workpay_provider_inbox_change"));
    await refresh();
  };

  const withdraw = async (id: string) => {
    setBusyId(id);
    setError(null);
    const result = await withdrawTaskConversation(id, withdrawalNote);
    setBusyId(null);
    if (result.error) {
      setError(result.error.message);
      return;
    }
    setWithdrawalOpenId(null);
    setWithdrawalNote("");
    await refresh();
  };

  return (
    <section className="space-y-4" aria-labelledby="provider-conversations-heading">
      <div>
        <h2
          id="provider-conversations-heading"
          className="text-xl font-semibold text-[var(--charcoal)]"
        >
          Buyer contact requests
        </h2>
        <p className="mt-1 text-sm text-[var(--text-muted)]">
          Review each buyer’s message and approved scope. Accepting opens a private discussion only;
          it does not commit you to the work or move funds. Your conversation history stays here.
        </p>
        <div className="mt-3 flex flex-wrap gap-2" aria-label="Conversation summary">
          <span className="rounded-full border border-amber-200 bg-amber-50 px-3 py-1 text-xs font-medium text-amber-900">
            {pendingCount} awaiting your response
          </span>
          <span className="rounded-full border border-sky-200 bg-sky-50 px-3 py-1 text-xs font-medium text-sky-900">
            {openCount} open discussion{openCount === 1 ? "" : "s"}
          </span>
        </div>
      </div>
      {error ? (
        <div
          role="alert"
          className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700"
        >
          <p>{error}</p>
          {error.toLowerCase().includes("professional profile") ? (
            <Link
              href="/settings?tab=work-preferences"
              className="mt-2 inline-flex items-center gap-1 font-semibold text-red-900 underline underline-offset-2"
            >
              Create or complete your professional profile
            </Link>
          ) : null}
        </div>
      ) : null}
      {loading ? (
        <p className="text-sm text-[var(--text-muted)]" role="status">
          Loading contact requests…
        </p>
      ) : null}
      {!loading && conversations.length === 0 ? (
        <p className="rounded-xl border border-dashed border-[var(--border-subtle)] p-5 text-sm text-[var(--text-muted)]">
          No buyer contacts yet.
        </p>
      ) : null}
      <div className="space-y-4">
        {orderedConversations.map((conversation) => (
          <article
            key={conversation.id}
            id={`conversation-${conversation.id}`}
            className={`workpay-card space-y-4 p-5 ${
              conversation.status === "CONTACT_PENDING"
                ? "border-[var(--wp-accent)]/50 shadow-sm"
                : ""
            }`}
          >
            <header>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h3 className="font-semibold">{conversation.contractSnapshot.title}</h3>
                <span className="text-xs text-[var(--text-muted)]">
                  {conversation.status === "CONTACT_PENDING"
                    ? "Awaiting your response"
                    : conversation.status === "OPEN"
                      ? "Discussion open · not a work commitment"
                      : conversation.status === "DECLINED"
                        ? "Request declined"
                        : conversation.status === "WITHDRAWN"
                          ? "Discussion withdrawn"
                          : "Conversation closed"}
                </span>
              </div>
              <p className="mt-1 text-sm text-[var(--text-muted)]">
                Approved scope v{conversation.contactApprovedContractVersion}
                <span className="mx-2" aria-hidden="true">
                  ·
                </span>
                Budget ceiling: {conversation.contractSnapshot.budget.currency}{" "}
                {formatAmount(conversation.contractSnapshot.budget.amountMinor)}
              </p>
            </header>
            <p className="text-xs leading-relaxed text-[var(--text-muted)]">
              This is the buyer’s approved maximum, not a price you have accepted. Work is not
              committed until the exact terms and assignment are explicitly accepted.
            </p>
            <div className="rounded-xl border border-[var(--wp-border)] bg-[var(--wp-surface-subtle)] p-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-[var(--text-muted)]">
                Scope at a glance
              </p>
              <p className="mt-1.5 text-sm font-medium leading-relaxed text-[var(--charcoal)]">
                <span className="line-clamp-3">{conversation.contractSnapshot.summary}</span>
              </p>
              <div className="mt-3 flex flex-wrap gap-2 text-xs text-[var(--text-muted)]">
                <span className="rounded-full bg-white px-2.5 py-1">
                  {conversation.contractSnapshot.requirements.length} review checks
                </span>
                {conversation.contractSnapshot.deadline ? (
                  <span className="rounded-full bg-white px-2.5 py-1">
                    Due{" "}
                    {new Date(conversation.contractSnapshot.deadline).toLocaleDateString(
                      undefined,
                      { dateStyle: "medium" },
                    )}
                  </span>
                ) : null}
                <span className="rounded-full bg-white px-2.5 py-1">
                  {conversation.contractSnapshot.included.length} included ·{" "}
                  {conversation.contractSnapshot.excluded.length} excluded
                </span>
              </div>
            </div>
            <details className="rounded-xl border border-[var(--wp-border)] bg-white">
              <summary className="cursor-pointer px-4 py-3 text-sm font-medium text-[var(--wp-text-secondary)]">
                Review all requirements and boundaries
              </summary>
              <div className="space-y-4 border-t border-[var(--wp-border)] px-4 py-4 text-sm">
                {conversation.contractSnapshot.requirements.length > 0 ? (
                  <div>
                    <h4 className="font-semibold">Requirements</h4>
                    <ul className="mt-2 list-disc space-y-1.5 pl-5 text-[var(--wp-text-secondary)]">
                      {conversation.contractSnapshot.requirements.map((requirement) => (
                        <li key={requirement.key}>{requirement.statement}</li>
                      ))}
                    </ul>
                  </div>
                ) : null}
                {conversation.contractSnapshot.included.length > 0 ? (
                  <div>
                    <h4 className="font-semibold">Included</h4>
                    <ul className="mt-2 list-disc space-y-1.5 pl-5 text-[var(--wp-text-secondary)]">
                      {conversation.contractSnapshot.included.map((item) => (
                        <li key={item}>{item}</li>
                      ))}
                    </ul>
                  </div>
                ) : null}
                {conversation.contractSnapshot.excluded.length > 0 ? (
                  <div>
                    <h4 className="font-semibold">Not included</h4>
                    <ul className="mt-2 list-disc space-y-1.5 pl-5 text-[var(--wp-text-secondary)]">
                      {conversation.contractSnapshot.excluded.map((item) => (
                        <li key={item}>{item}</li>
                      ))}
                    </ul>
                  </div>
                ) : null}
              </div>
            </details>
            <ConversationThread
              conversation={conversation}
              currentUserId={conversation.providerUserId}
              onAgreementChanged={() => void refresh()}
            />
            {conversation.status === "CONTACT_PENDING" ? (
              <div className="flex flex-wrap gap-2 border-t border-[var(--border-subtle)] pt-4">
                <Button
                  type="button"
                  disabled={busyId === conversation.id}
                  onClick={() => void respond(conversation.id, "accept")}
                >
                  {busyId === conversation.id ? "Saving…" : "Accept and open conversation"}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  disabled={busyId === conversation.id}
                  onClick={() => void respond(conversation.id, "decline")}
                >
                  Decline request
                </Button>
              </div>
            ) : null}
            {conversation.status === "OPEN" && conversation.hasWorkExecution !== true ? (
              <div className="space-y-3 border-t border-[var(--border-subtle)] pt-4">
                {withdrawalOpenId === conversation.id ? (
                  <div className="space-y-3 rounded-lg border border-amber-300 bg-amber-50 p-4">
                    <p className="text-sm text-amber-950">
                      This ends the discussion and notifies the buyer. It is only available before a
                      work assignment exists; it cannot cancel assigned work.
                    </p>
                    <label
                      htmlFor={`withdrawal-note-${conversation.id}`}
                      className="block text-sm font-medium text-amber-950"
                    >
                      Optional note to the buyer
                    </label>
                    <textarea
                      id={`withdrawal-note-${conversation.id}`}
                      value={withdrawalNote}
                      onChange={(event) => setWithdrawalNote(event.target.value)}
                      maxLength={500}
                      rows={3}
                      className="w-full rounded-md border border-amber-300 bg-white px-3 py-2 text-sm text-foreground"
                    />
                    <div className="flex flex-wrap gap-2">
                      <Button
                        type="button"
                        variant="outline"
                        disabled={busyId === conversation.id}
                        onClick={() => {
                          setWithdrawalOpenId(null);
                          setWithdrawalNote("");
                        }}
                      >
                        Keep discussion open
                      </Button>
                      <Button
                        type="button"
                        disabled={busyId === conversation.id}
                        onClick={() => void withdraw(conversation.id)}
                      >
                        {busyId === conversation.id ? "Withdrawing…" : "Confirm withdrawal"}
                      </Button>
                    </div>
                  </div>
                ) : (
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setWithdrawalOpenId(conversation.id)}
                  >
                    I can’t continue this discussion
                  </Button>
                )}
              </div>
            ) : null}
            {conversation.status === "OPEN" && conversation.hasWorkExecution ? (
              <p className="border-t border-[var(--border-subtle)] pt-4 text-sm text-amber-800">
                A work assignment exists. This discussion cannot cancel or reassign it; use the
                assignment workflow and contact the buyer about any issue.
              </p>
            ) : null}
          </article>
        ))}
      </div>
    </section>
  );
}

function formatAmount(amountMinor: number): string {
  return (amountMinor / 100).toFixed(2);
}
