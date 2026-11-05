"use client";

import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import {
  ArrowLeft,
  ArrowUpRight,
  Check,
  Clock3,
  Inbox,
  MessageCircle,
  Search,
  ShieldCheck,
  Sparkles,
} from "lucide-react";
import { ProviderAvatar } from "@/components/provider/provider-avatar";
import { ConversationThread } from "@/components/task-room/conversation-thread";
import { Button } from "@/components/ui/button";
import {
  getMessageInbox,
  getTaskConversationMessages,
  markTaskConversationRead,
  respondToTaskConversation,
  withdrawTaskConversation,
} from "@/lib/api/endpoints";
import type { MessageInboxConversationDto, TaskConversationDto } from "@/lib/api/types";
import { formatMinorMoney } from "@/lib/format";
import { cn } from "@/lib/utils";

type InboxFilter = "all" | "unread" | "needs-response";

function messageTime(value: string | null): string {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const today = new Date();
  if (date.toDateString() === today.toDateString()) {
    return date.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  }
  return date.toLocaleDateString([], { month: "short", day: "numeric" });
}

function conversationState(conversation: MessageInboxConversationDto): {
  label: string;
  tone: string;
} {
  if (conversation.status === "CONTACT_PENDING") {
    return { label: "Request awaiting response", tone: "text-amber-800 bg-amber-50" };
  }
  if (conversation.status === "OPEN" && conversation.hasWorkExecution) {
    return { label: "Work assigned", tone: "text-blue-800 bg-blue-50" };
  }
  if (conversation.status === "OPEN") {
    return { label: "Discussion · no work assigned", tone: "text-sky-800 bg-sky-50" };
  }
  if (conversation.status === "DECLINED") {
    return { label: "Request declined", tone: "text-slate-700 bg-slate-100" };
  }
  if (conversation.status === "WITHDRAWN") {
    return { label: "Discussion withdrawn", tone: "text-slate-700 bg-slate-100" };
  }
  return { label: "Closed", tone: "text-slate-700 bg-slate-100" };
}

function MessagesPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const selectedId = searchParams.get("conversation");
  const [conversations, setConversations] = useState<MessageInboxConversationDto[]>([]);
  const [currentUserId, setCurrentUserId] = useState("");
  const [selectedConversation, setSelectedConversation] = useState<TaskConversationDto | null>(
    null,
  );
  const [loadingInbox, setLoadingInbox] = useState(true);
  const [loadingConversation, setLoadingConversation] = useState(false);
  const [responding, setResponding] = useState(false);
  const [withdrawing, setWithdrawing] = useState(false);
  const [showWithdrawForm, setShowWithdrawForm] = useState(false);
  const [withdrawNote, setWithdrawNote] = useState("");
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<InboxFilter>("all");
  const [inboxError, setInboxError] = useState<string | null>(null);
  const [conversationError, setConversationError] = useState<string | null>(null);
  const [refreshVersion, setRefreshVersion] = useState(0);

  const refreshInbox = useCallback(async () => {
    const result = await getMessageInbox();
    if (result.error || !result.data) {
      setInboxError(result.error?.message ?? "Messages could not be loaded.");
      setLoadingInbox(false);
      return;
    }
    setCurrentUserId(result.data.currentUserId);
    setConversations(result.data.conversations);
    setInboxError(null);
    setLoadingInbox(false);
  }, []);

  useEffect(() => {
    void refreshInbox();
    const timer = window.setInterval(() => void refreshInbox(), 10_000);
    const onInboxChange = () => void refreshInbox();
    window.addEventListener("workpay_messages_inbox_change", onInboxChange);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener("workpay_messages_inbox_change", onInboxChange);
    };
  }, [refreshInbox]);

  useEffect(() => {
    if (!selectedId || !currentUserId) {
      setSelectedConversation(null);
      setLoadingConversation(false);
      return;
    }

    let active = true;
    setLoadingConversation(true);
    setSelectedConversation(null);
    setConversationError(null);
    void getTaskConversationMessages(selectedId).then(async (result) => {
      if (!active) return;
      if (result.error || !result.data) {
        setConversationError(result.error?.message ?? "This conversation could not be opened.");
        setLoadingConversation(false);
        return;
      }
      setSelectedConversation(result.data);
      setLoadingConversation(false);
      const readResult = await markTaskConversationRead(
        selectedId,
        result.data.messages.at(-1)?.sequence ?? 0,
      );
      if (!active) return;
      if (readResult.error) {
        setConversationError(
          `Conversation opened, but its read status could not be updated: ${readResult.error.message}`,
        );
      } else {
        window.dispatchEvent(new Event("workpay_messages_inbox_change"));
        await refreshInbox();
      }
    });
    return () => {
      active = false;
    };
  }, [selectedId, currentUserId, refreshInbox, refreshVersion]);

  const onViewed = useCallback(
    (lastReadSequence: number) => {
      if (!selectedId) return;
      void markTaskConversationRead(selectedId, lastReadSequence).then((result) => {
        if (result.error) {
          setConversationError(
            `Conversation opened, but its read status could not be updated: ${result.error.message}`,
          );
          return;
        }
        window.dispatchEvent(new Event("workpay_messages_inbox_change"));
        void refreshInbox();
      });
    },
    [selectedId, refreshInbox],
  );

  const groups = useMemo(() => {
    const needle = search.trim().toLocaleLowerCase();
    const filtered = conversations.filter((conversation) => {
      if (filter === "unread" && conversation.unreadCount === 0) return false;
      if (
        filter === "needs-response" &&
        !(
          conversation.status === "CONTACT_PENDING" &&
          conversation.otherParticipant.role === "client"
        )
      ) {
        return false;
      }
      if (
        needle &&
        !`${conversation.otherParticipant.displayName} ${conversation.taskTitle}`
          .toLocaleLowerCase()
          .includes(needle)
      ) {
        return false;
      }
      return true;
    });
    const grouped = new Map<
      string,
      {
        participant: MessageInboxConversationDto["otherParticipant"];
        conversations: MessageInboxConversationDto[];
      }
    >();
    for (const conversation of filtered) {
      const participantId = conversation.otherParticipant.userId;
      const existing = grouped.get(participantId);
      if (existing) existing.conversations.push(conversation);
      else {
        grouped.set(participantId, {
          participant: conversation.otherParticipant,
          conversations: [conversation],
        });
      }
    }
    return [...grouped.values()];
  }, [conversations, filter, search]);

  const selectedSummary = conversations.find((conversation) => conversation.id === selectedId);
  useEffect(() => {
    const requestedFilter = searchParams.get("filter");
    if (
      requestedFilter === "all" ||
      requestedFilter === "unread" ||
      requestedFilter === "needs-response"
    ) {
      setFilter(requestedFilter);
    }
  }, [searchParams]);

  const selectConversation = (conversationId: string | null) => {
    const params = new URLSearchParams(searchParams.toString());
    if (conversationId) params.set("conversation", conversationId);
    else params.delete("conversation");
    const query = params.toString();
    router.push(query ? `/messages?${query}` : "/messages", { scroll: false });
  };

  const respond = async (decision: "accept" | "decline") => {
    if (!selectedId) return;
    setResponding(true);
    setConversationError(null);
    const result = await respondToTaskConversation(selectedId, decision);
    setResponding(false);
    if (result.error) {
      setConversationError(result.error.message);
      return;
    }
    await refreshInbox();
    setRefreshVersion((version) => version + 1);
  };

  const withdraw = async () => {
    if (!selectedId) return;
    setWithdrawing(true);
    setConversationError(null);
    const result = await withdrawTaskConversation(selectedId, withdrawNote.trim() || undefined);
    setWithdrawing(false);
    if (result.error) {
      setConversationError(result.error.message);
      return;
    }
    setShowWithdrawForm(false);
    setWithdrawNote("");
    await refreshInbox();
    setRefreshVersion((version) => version + 1);
  };

  const selectedIsPendingForProfessional =
    selectedSummary?.status === "CONTACT_PENDING" &&
    selectedConversation?.providerUserId === currentUserId;
  const selectedIsOpenDiscussion =
    selectedSummary?.status === "OPEN" && !selectedSummary.hasWorkExecution;

  return (
    <div className="space-y-5">
      <header className="flex flex-col gap-3 border-b border-[var(--wp-border)] pb-5 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[var(--wp-accent)]">
            WorkPay · private communication
          </p>
          <h1 className="mt-1 text-3xl font-semibold tracking-tight text-[var(--wp-text-primary)]">
            Messages
          </h1>
          <p className="mt-1 max-w-2xl text-sm text-[var(--wp-text-secondary)]">
            Every thread stays attached to the work it is about. A conversation is not a work
            commitment; assignment happens separately through WorkPay.
          </p>
        </div>
        <div className="flex items-center gap-2 text-xs text-[var(--wp-text-secondary)]">
          <ShieldCheck className="h-4 w-4 text-emerald-700" />
          Private, task-scoped conversations
        </div>
      </header>

      <div className="grid h-[calc(100dvh-15.5rem)] min-h-[36rem] grid-cols-1 overflow-hidden rounded-2xl border border-[var(--wp-border)] bg-white shadow-sm lg:grid-cols-[18rem_minmax(0,1fr)_17rem]">
        <aside
          className={cn(
            "min-h-0 flex-col border-r border-[var(--wp-border)] bg-white",
            selectedId ? "hidden lg:flex" : "flex",
          )}
          aria-label="Conversation inbox"
        >
          <div className="space-y-3 border-b border-[var(--wp-border)] p-4">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold">Your conversations</h2>
              <span className="rounded-full bg-[var(--wp-surface-subtle)] px-2 py-0.5 text-xs text-[var(--wp-text-secondary)]">
                {conversations.length}
              </span>
            </div>
            <label className="relative block">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--wp-text-secondary)]" />
              <input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search people or work"
                aria-label="Search conversations"
                className="h-10 w-full rounded-xl border border-[var(--wp-border)] bg-[var(--wp-canvas)] pl-9 pr-3 text-sm outline-none transition focus:border-[var(--wp-accent)] focus:ring-2 focus:ring-[var(--wp-accent)]/15"
              />
            </label>
            <div
              className="flex gap-1 overflow-x-auto"
              role="group"
              aria-label="Filter conversations"
            >
              {(
                [
                  ["all", "All"],
                  ["unread", "Unread"],
                  ["needs-response", "Needs response"],
                ] as const
              ).map(([value, label]) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => setFilter(value)}
                  aria-pressed={filter === value}
                  className={cn(
                    "whitespace-nowrap rounded-full px-3 py-1.5 text-xs font-medium transition",
                    filter === value
                      ? "bg-[var(--wp-text-primary)] text-white"
                      : "bg-[var(--wp-surface-subtle)] text-[var(--wp-text-secondary)] hover:bg-[var(--wp-border)]",
                  )}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto p-2">
            {inboxError ? (
              <p
                role="alert"
                className="m-2 rounded-lg border border-rose-200 bg-rose-50 p-3 text-xs text-rose-900"
              >
                {inboxError}
              </p>
            ) : null}
            {loadingInbox && conversations.length === 0 ? (
              <p className="p-4 text-sm text-[var(--wp-text-secondary)]">Loading messages…</p>
            ) : null}
            {!loadingInbox && conversations.length === 0 ? (
              <div className="px-5 py-12 text-center">
                <Inbox className="mx-auto h-8 w-8 text-[var(--wp-text-secondary)]" />
                <h3 className="mt-3 text-sm font-semibold">No conversations yet</h3>
                <p className="mt-1 text-xs leading-5 text-[var(--wp-text-secondary)]">
                  When you contact a professional or receive a request, the private work thread will
                  appear here.
                </p>
                <Link
                  href="/tasks"
                  className="mt-4 inline-flex items-center gap-1 text-xs font-semibold text-[var(--wp-accent)] hover:underline"
                >
                  Browse your tasks <ArrowUpRight className="h-3.5 w-3.5" />
                </Link>
              </div>
            ) : null}
            {groups.length === 0 && conversations.length > 0 ? (
              <p className="p-4 text-sm text-[var(--wp-text-secondary)]">
                No conversations match this search or filter.
              </p>
            ) : null}
            <ul className="space-y-3">
              {groups.map((group) => (
                <li key={group.participant.userId}>
                  <div className="flex items-center gap-2 px-2 pb-1.5 pt-1">
                    <ProviderAvatar
                      displayName={group.participant.displayName}
                      image={group.participant.image}
                      className="h-8 w-8"
                    />
                    <div className="min-w-0">
                      <p className="truncate text-xs font-semibold text-[var(--wp-text-primary)]">
                        {group.participant.displayName}
                      </p>
                      <p className="text-[10px] capitalize text-[var(--wp-text-secondary)]">
                        {group.participant.role}
                        {group.conversations.length > 1
                          ? ` · ${group.conversations.length} work threads`
                          : ""}
                      </p>
                    </div>
                  </div>
                  <ul className="space-y-1">
                    {group.conversations.map((conversation) => {
                      const status = conversationState(conversation);
                      const active = conversation.id === selectedId;
                      return (
                        <li key={conversation.id}>
                          <button
                            type="button"
                            onClick={() => selectConversation(conversation.id)}
                            aria-current={active ? "page" : undefined}
                            className={cn(
                              "w-full rounded-xl border px-3 py-2.5 text-left transition",
                              active
                                ? "border-[var(--wp-accent)]/40 bg-[var(--wp-accent-subtle)]"
                                : "border-transparent hover:border-[var(--wp-border)] hover:bg-[var(--wp-canvas)]",
                            )}
                          >
                            <span className="flex items-start justify-between gap-2">
                              <span className="min-w-0">
                                <span className="block truncate text-xs font-semibold text-[var(--wp-text-primary)]">
                                  {conversation.taskTitle}
                                </span>
                                <span className="mt-1 block truncate text-[11px] text-[var(--wp-text-secondary)]">
                                  {conversation.lastMessage?.authorUserId === currentUserId
                                    ? "You: "
                                    : ""}
                                  {conversation.lastMessage?.body ?? "No messages yet"}
                                </span>
                              </span>
                              <span className="shrink-0 text-[10px] text-[var(--wp-text-secondary)]">
                                {messageTime(
                                  conversation.lastMessage?.createdAt ?? conversation.updatedAt,
                                )}
                              </span>
                            </span>
                            <span className="mt-2 flex items-center justify-between gap-2">
                              <span
                                className={cn(
                                  "max-w-[13rem] truncate rounded-full px-2 py-0.5 text-[9px] font-medium",
                                  status.tone,
                                )}
                              >
                                {status.label}
                              </span>
                              {conversation.unreadCount > 0 ? (
                                <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-[var(--wp-accent)] px-1.5 text-[10px] font-bold text-white">
                                  {conversation.unreadCount > 99 ? "99+" : conversation.unreadCount}
                                </span>
                              ) : null}
                            </span>
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                </li>
              ))}
            </ul>
          </div>
        </aside>

        <section
          className={cn(
            "min-h-0 min-w-0 flex-col bg-[var(--wp-canvas)]",
            selectedId ? "flex" : "hidden lg:flex",
          )}
          aria-label="Selected conversation"
        >
          {selectedSummary ? (
            <div className="flex min-h-[4.5rem] items-center gap-3 border-b border-[var(--wp-border)] bg-white px-4 py-3">
              <button
                type="button"
                onClick={() => selectConversation(null)}
                className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-[var(--wp-text-secondary)] hover:bg-[var(--wp-surface-subtle)] lg:hidden"
                aria-label="Back to conversations"
              >
                <ArrowLeft className="h-4 w-4" />
              </button>
              <ProviderAvatar
                displayName={selectedSummary.otherParticipant.displayName}
                image={selectedSummary.otherParticipant.image}
                className="h-10 w-10"
              />
              <div className="min-w-0 flex-1">
                <h2 className="truncate text-sm font-semibold">
                  {selectedSummary.otherParticipant.displayName}
                </h2>
                <p className="truncate text-xs text-[var(--wp-text-secondary)]">
                  {selectedSummary.taskTitle}
                </p>
              </div>
              <span
                className={cn(
                  "hidden max-w-52 rounded-full px-2.5 py-1 text-[10px] font-medium sm:inline-flex",
                  conversationState(selectedSummary).tone,
                )}
              >
                {conversationState(selectedSummary).label}
              </span>
            </div>
          ) : selectedId ? (
            <div className="flex min-h-[4.5rem] items-center gap-3 border-b border-[var(--wp-border)] bg-white px-4 py-3">
              <button
                type="button"
                onClick={() => selectConversation(null)}
                className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-[var(--wp-text-secondary)] hover:bg-[var(--wp-surface-subtle)] lg:hidden"
                aria-label="Back to conversations"
              >
                <ArrowLeft className="h-4 w-4" />
              </button>
              <p className="text-sm font-semibold">Conversation unavailable</p>
            </div>
          ) : null}

          {selectedIsPendingForProfessional ? (
            <div className="border-b border-amber-200 bg-amber-50 px-4 py-3">
              <div className="mx-auto flex max-w-3xl flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="text-sm font-semibold text-amber-950">
                    A client wants to start a discussion
                  </p>
                  <p className="mt-0.5 text-xs text-amber-900">
                    Starting a discussion opens messaging only. It does not assign work or commit
                    you to the task.
                  </p>
                </div>
                <div className="flex shrink-0 gap-2">
                  <Button disabled={responding} onClick={() => void respond("accept")}>
                    <MessageCircle className="mr-1.5 h-4 w-4" />
                    {responding ? "Updating…" : "Start discussion"}
                  </Button>
                  <Button
                    variant="outline"
                    disabled={responding}
                    onClick={() => void respond("decline")}
                  >
                    Decline
                  </Button>
                </div>
              </div>
            </div>
          ) : null}

          {selectedIsOpenDiscussion && selectedConversation?.providerUserId === currentUserId ? (
            <div className="border-b border-[var(--wp-border)] bg-white px-4 py-2.5">
              {showWithdrawForm ? (
                <div className="mx-auto flex max-w-3xl flex-col gap-2 sm:flex-row sm:items-end">
                  <label className="flex-1 text-xs font-medium">
                    Optional note to the client
                    <input
                      value={withdrawNote}
                      onChange={(event) => setWithdrawNote(event.target.value)}
                      maxLength={1000}
                      className="mt-1 h-9 w-full rounded-lg border border-[var(--wp-border)] px-3 text-sm"
                    />
                  </label>
                  <div className="flex gap-2">
                    <Button disabled={withdrawing} onClick={() => void withdraw()}>
                      {withdrawing ? "Closing…" : "Confirm withdrawal"}
                    </Button>
                    <Button
                      variant="outline"
                      disabled={withdrawing}
                      onClick={() => setShowWithdrawForm(false)}
                    >
                      Keep discussion open
                    </Button>
                  </div>
                </div>
              ) : (
                <div className="mx-auto flex max-w-3xl items-center justify-between gap-3">
                  <p className="text-xs text-[var(--wp-text-secondary)]">
                    No assignment exists. If you cannot continue, close this discussion clearly for
                    the client.
                  </p>
                  <Button
                    variant="outline"
                    className="shrink-0"
                    onClick={() => setShowWithdrawForm(true)}
                  >
                    Withdraw from discussion
                  </Button>
                </div>
              )}
            </div>
          ) : null}

          {selectedSummary && selectedConversation ? (
            <details className="border-b border-[var(--wp-border)] bg-white px-4 py-2 lg:hidden">
              <summary className="cursor-pointer py-1 text-xs font-semibold text-[var(--wp-text-primary)]">
                Work details · {selectedSummary.taskTitle}
              </summary>
              <div className="space-y-2 pb-2 pt-2 text-xs text-[var(--wp-text-secondary)]">
                <p>{selectedConversation.currentContractSnapshot.summary}</p>
                <p>
                  Buyer budget ceiling:{" "}
                  {formatMinorMoney(selectedConversation.currentContractSnapshot.budget)}
                  {selectedConversation.currentContractSnapshot.agreedPrice
                    ? ` · Agreed price: ${formatMinorMoney(selectedConversation.currentContractSnapshot.agreedPrice)}`
                    : ""}
                </p>
                <p>
                  {selectedConversation.currentContractSnapshot.requirements.length} confirmed
                  requirement
                  {selectedConversation.currentContractSnapshot.requirements.length === 1
                    ? ""
                    : "s"}
                  {" · "}
                  {selectedSummary.hasWorkExecution
                    ? "Assignment exists"
                    : "No work assignment yet"}
                </p>
              </div>
            </details>
          ) : null}

          <div className="min-h-0 flex-1 overflow-y-auto p-3 sm:p-5">
            {conversationError ? (
              <p
                role="alert"
                className="mb-3 rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-900"
              >
                {conversationError}
              </p>
            ) : null}
            {loadingConversation ? (
              <div className="grid h-full place-items-center text-sm text-[var(--wp-text-secondary)]">
                Opening this work thread…
              </div>
            ) : null}
            {!selectedId ? (
              <div className="grid h-full place-items-center">
                <div className="max-w-sm text-center">
                  <div className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-white text-[var(--wp-accent)] shadow-sm">
                    <MessageCircle className="h-6 w-6" />
                  </div>
                  <h3 className="mt-4 text-base font-semibold">Choose a work thread</h3>
                  <p className="mt-1 text-sm leading-6 text-[var(--wp-text-secondary)]">
                    Threads with the same person are grouped together, while each task keeps its own
                    private conversation and terms.
                  </p>
                </div>
              </div>
            ) : null}
            {selectedConversation && currentUserId ? (
              <ConversationThread
                key={selectedConversation.id}
                conversation={selectedConversation}
                currentUserId={currentUserId}
                inboxMode
                onViewed={onViewed}
              />
            ) : null}
          </div>
        </section>

        <aside
          className={cn(
            "min-h-0 flex-col border-l border-[var(--wp-border)] bg-white",
            selectedId ? "hidden lg:flex" : "hidden",
          )}
          aria-label="Work thread details"
        >
          {selectedSummary && selectedConversation ? (
            <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-4">
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-[0.13em] text-[var(--wp-text-secondary)]">
                  Work context
                </p>
                <h3 className="mt-2 text-base font-semibold leading-snug">
                  {selectedSummary.taskTitle}
                </h3>
                <span
                  className={cn(
                    "mt-2 inline-flex rounded-full px-2.5 py-1 text-[10px] font-medium",
                    conversationState(selectedSummary).tone,
                  )}
                >
                  {conversationState(selectedSummary).label}
                </span>
              </div>
              <div className="rounded-xl border border-[var(--wp-border)] bg-[var(--wp-canvas)] p-3">
                <p className="text-xs font-semibold">What this discussion is about</p>
                <p className="mt-1.5 text-xs leading-5 text-[var(--wp-text-secondary)]">
                  {selectedConversation.currentContractSnapshot.summary ||
                    selectedConversation.currentContractSnapshot.title}
                </p>
                <div className="mt-3 space-y-2 border-t border-[var(--wp-border)] pt-3 text-xs">
                  <p className="flex justify-between gap-2">
                    <span className="text-[var(--wp-text-secondary)]">Buyer budget ceiling</span>
                    <span className="font-medium">
                      {formatMinorMoney(selectedConversation.currentContractSnapshot.budget)}
                    </span>
                  </p>
                  {selectedConversation.currentContractSnapshot.agreedPrice ? (
                    <p className="flex justify-between gap-2">
                      <span className="text-[var(--wp-text-secondary)]">Agreed price</span>
                      <span className="font-medium">
                        {formatMinorMoney(selectedConversation.currentContractSnapshot.agreedPrice)}
                      </span>
                    </p>
                  ) : null}
                  <p className="flex justify-between gap-2">
                    <span className="text-[var(--wp-text-secondary)]">Terms reviewed</span>
                    <span className="font-medium">
                      Version {selectedConversation.contactApprovedContractVersion}
                    </span>
                  </p>
                  {selectedConversation.currentContractSnapshot.deadline ? (
                    <p className="flex items-center justify-between gap-2">
                      <span className="inline-flex items-center gap-1 text-[var(--wp-text-secondary)]">
                        <Clock3 className="h-3.5 w-3.5" /> Target date
                      </span>
                      <time className="font-medium">
                        {new Date(
                          selectedConversation.currentContractSnapshot.deadline,
                        ).toLocaleDateString()}
                      </time>
                    </p>
                  ) : null}
                </div>
              </div>

              {selectedSummary.status === "OPEN" && selectedSummary.hasWorkExecution ? (
                <div className="rounded-xl border border-blue-200 bg-blue-50 p-3">
                  <p className="flex items-center gap-1.5 text-xs font-semibold text-blue-900">
                    <Check className="h-3.5 w-3.5" /> Assignment is active
                  </p>
                  <p className="mt-1 text-xs leading-5 text-blue-900">
                    This same thread continues for delivery and follow-up. Use the exact assignment
                    terms for work decisions.
                  </p>
                </div>
              ) : selectedSummary.status === "OPEN" ? (
                <div className="rounded-xl border border-sky-200 bg-sky-50 p-3">
                  <p className="flex items-center gap-1.5 text-xs font-semibold text-sky-900">
                    <Sparkles className="h-3.5 w-3.5" /> Discussion only
                  </p>
                  <p className="mt-1 text-xs leading-5 text-sky-900">
                    Messages do not change the scope or assign the work. Both sides must complete
                    the separate WorkPay assignment flow.
                  </p>
                </div>
              ) : null}

              <div className="space-y-2">
                <p className="text-[10px] font-semibold uppercase tracking-[0.13em] text-[var(--wp-text-secondary)]">
                  Scope at a glance
                </p>
                <p className="text-xs text-[var(--wp-text-secondary)]">
                  {selectedConversation.currentContractSnapshot.requirements.length} confirmed
                  requirement
                  {selectedConversation.currentContractSnapshot.requirements.length === 1
                    ? ""
                    : "s"}
                </p>
                {selectedConversation.currentContractSnapshot.included.length ? (
                  <ul className="space-y-1 text-xs text-[var(--wp-text-secondary)]">
                    {selectedConversation.currentContractSnapshot.included
                      .slice(0, 3)
                      .map((item) => (
                        <li key={item} className="flex gap-1.5">
                          <Check className="mt-0.5 h-3 w-3 shrink-0 text-emerald-700" />
                          <span className="line-clamp-2">{item}</span>
                        </li>
                      ))}
                  </ul>
                ) : null}
              </div>

              <Link
                href={
                  currentUserId === selectedConversation.buyerUserId
                    ? `/tasks/${selectedConversation.taskId}`
                    : "/provider"
                }
                className="inline-flex w-full items-center justify-center gap-2 rounded-xl border border-[var(--wp-border)] px-3 py-2.5 text-xs font-semibold text-[var(--wp-text-primary)] transition hover:bg-[var(--wp-surface-subtle)]"
              >
                {currentUserId === selectedConversation.buyerUserId
                  ? "Open task workspace"
                  : "Open Work Studio"}
                <ArrowUpRight className="h-3.5 w-3.5" />
              </Link>
            </div>
          ) : null}
        </aside>
      </div>
    </div>
  );
}

export default function MessagesPage() {
  return (
    <Suspense
      fallback={
        <div className="grid min-h-96 place-items-center text-sm text-[var(--wp-text-secondary)]">
          Loading Messages…
        </div>
      }
    >
      <MessagesPageContent />
    </Suspense>
  );
}
