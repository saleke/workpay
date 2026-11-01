"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { listProviderConversations, respondToTaskConversation } from "@/lib/api/endpoints";
import type { TaskConversationDto } from "@/lib/api/types";
import { ConversationThread } from "@/components/task-room/conversation-thread";

export function ProviderConversationInbox() {
  const [conversations, setConversations] = useState<TaskConversationDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

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

  const respond = async (id: string, response: "accept" | "decline") => {
    setBusyId(id);
    setError(null);
    const result = await respondToTaskConversation(id, response);
    setBusyId(null);
    if (result.error) {
      setError(result.error.message);
      return;
    }
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
          Review the buyer’s message and exact approved agreement before opening a private
          conversation.
        </p>
      </div>
      {error ? (
        <p
          role="alert"
          className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700"
        >
          {error}
        </p>
      ) : null}
      {loading ? (
        <p className="text-sm text-[var(--text-muted)]" role="status">
          Loading contact requests…
        </p>
      ) : null}
      {!loading && conversations.length === 0 ? (
        <p className="rounded-xl border border-dashed border-[var(--border-subtle)] p-5 text-sm text-[var(--text-muted)]">
          No buyer contact requests yet.
        </p>
      ) : null}
      <div className="space-y-4">
        {conversations.map((conversation) => (
          <article key={conversation.id} className="workpay-card space-y-4 p-5">
            <header>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h3 className="font-semibold">{conversation.contractSnapshot.title}</h3>
                <span className="text-xs text-[var(--text-muted)]">
                  {conversation.status === "CONTACT_PENDING"
                    ? "Awaiting your response"
                    : "Conversation open"}
                </span>
              </div>
              <p className="mt-1 text-sm text-[var(--text-muted)]">
                Agreement version {conversation.contactApprovedContractVersion} ·{" "}
                {conversation.contractSnapshot.budget.currency}{" "}
                {formatAmount(conversation.contractSnapshot.budget.amountMinor)}
              </p>
            </header>
            <div className="rounded-lg bg-[var(--surface-subtle)] p-3 text-sm">
              <p className="font-medium">Agreed work snapshot</p>
              <p className="mt-1">{conversation.contractSnapshot.summary}</p>
              <p className="mt-2 text-xs">
                {conversation.contractSnapshot.requirements.length} requirements ·{" "}
                {conversation.contractSnapshot.included.length} inclusions ·{" "}
                {conversation.contractSnapshot.excluded.length} exclusions
              </p>
            </div>
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
          </article>
        ))}
      </div>
    </section>
  );
}

function formatAmount(amountMinor: number): string {
  return (amountMinor / 100).toFixed(2);
}
