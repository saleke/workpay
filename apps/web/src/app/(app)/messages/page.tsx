"use client";

import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import {
  ArrowLeft,
  ArrowUpRight,
  BriefcaseBusiness,
  ChevronDown,
  Clock3,
  Inbox,
  MessageCircle,
  Search,
  ShieldCheck,
} from "lucide-react";
import { ProviderAvatar } from "@/components/provider/provider-avatar";
import { ConversationThread } from "@/components/task-room/conversation-thread";
import { WorkCommitmentPanel } from "@/components/commitments/work-commitment-panel";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Sheet, SheetContent, SheetDescription, SheetTitle } from "@/components/ui/sheet";
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

interface ParticipantInboxGroup {
  participant: MessageInboxConversationDto["otherParticipant"];
  conversations: MessageInboxConversationDto[];
  latestConversation: MessageInboxConversationDto;
  unreadCount: number;
  needsResponse: boolean;
}

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

function conversationActivityTime(conversation: MessageInboxConversationDto): number {
  const updatedAt = Date.parse(conversation.updatedAt);
  const latestMessageAt = conversation.lastMessage
    ? Date.parse(conversation.lastMessage.createdAt)
    : Number.NaN;
  return Math.max(
    Number.isNaN(updatedAt) ? 0 : updatedAt,
    Number.isNaN(latestMessageAt) ? 0 : latestMessageAt,
  );
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
  if (conversation.workCommitmentStatus === "AWAITING_PROVIDER") {
    return { label: "Work proposed · professional deciding", tone: "text-amber-900 bg-amber-50" };
  }
  if (conversation.workCommitmentStatus === "AWAITING_CLIENT") {
    return {
      label: "Professional accepted · client decision",
      tone: "text-emerald-900 bg-emerald-50",
    };
  }
  if (conversation.workCommitmentStatus === "CONFIRMED") {
    return { label: "Mutual commitment confirmed", tone: "text-emerald-900 bg-emerald-50" };
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
  const [workContextOpen, setWorkContextOpen] = useState(false);
  const [inboxError, setInboxError] = useState<string | null>(null);
  const [conversationError, setConversationError] = useState<string | null>(null);
  const [refreshVersion, setRefreshVersion] = useState(0);
  const selectedSummary = conversations.find((conversation) => conversation.id === selectedId);

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
  }, [
    selectedId,
    selectedSummary?.status,
    selectedSummary?.updatedAt,
    currentUserId,
    refreshInbox,
    refreshVersion,
  ]);

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

  const people = useMemo(() => {
    const grouped = new Map<string, ParticipantInboxGroup>();
    for (const conversation of conversations) {
      const participantId = conversation.otherParticipant.userId;
      const existing = grouped.get(participantId);
      if (existing) {
        existing.conversations.push(conversation);
        existing.unreadCount += conversation.unreadCount;
        existing.needsResponse ||=
          conversation.status === "CONTACT_PENDING" &&
          conversation.otherParticipant.role === "client";
      } else {
        grouped.set(participantId, {
          participant: conversation.otherParticipant,
          conversations: [conversation],
          latestConversation: conversation,
          unreadCount: conversation.unreadCount,
          needsResponse:
            conversation.status === "CONTACT_PENDING" &&
            conversation.otherParticipant.role === "client",
        });
      }
    }
    return [...grouped.values()]
      .map((group) => {
        group.conversations.sort(
          (first, second) => conversationActivityTime(second) - conversationActivityTime(first),
        );
        return {
          ...group,
          latestConversation: group.conversations[0] ?? group.latestConversation,
        };
      })
      .sort(
        (first, second) =>
          conversationActivityTime(second.latestConversation) -
          conversationActivityTime(first.latestConversation),
      );
  }, [conversations]);

  const visiblePeople = useMemo(() => {
    const needle = search.trim().toLocaleLowerCase();
    return people.filter((group) => {
      if (filter === "unread" && group.unreadCount === 0) return false;
      if (filter === "needs-response" && !group.needsResponse) return false;
      return (
        !needle ||
        `${group.participant.displayName} ${group.participant.role}`
          .toLocaleLowerCase()
          .includes(needle)
      );
    });
  }, [people, filter, search]);

  const selectedPerson = selectedSummary
    ? people.find((group) => group.participant.userId === selectedSummary.otherParticipant.userId)
    : undefined;
  useEffect(() => {
    setWorkContextOpen(false);
    setShowWithdrawForm(false);
    setWithdrawNote("");
  }, [selectedId]);

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
    setWorkContextOpen(false);
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
    selectedSummary?.status === "OPEN" &&
    !selectedSummary.hasWorkExecution &&
    !["AWAITING_PROVIDER", "AWAITING_CLIENT", "CONFIRMED"].includes(
      selectedSummary.workCommitmentStatus ?? "",
    );

  return (
    <div className="space-y-5">
      <header className="flex flex-col gap-3 border-b border-[var(--wp-border)] pb-5 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[var(--wp-accent)]">
            Tenfo · private communication
          </p>
          <h1 className="mt-1 text-3xl font-semibold tracking-tight text-[var(--wp-text-primary)]">
            Messages
          </h1>
          <p className="mt-1 max-w-2xl text-sm text-[var(--wp-text-secondary)]">
            Keep each task conversation, proposal, and decision together.
          </p>
        </div>
        <div className="flex items-center gap-2 text-xs text-[var(--wp-text-secondary)]">
          <ShieldCheck className="h-4 w-4 text-emerald-700" />
          Private, task-scoped conversations
        </div>
      </header>

      <div className="grid h-[calc(100dvh-15.5rem)] min-h-[36rem] grid-cols-1 overflow-hidden rounded-2xl border border-[var(--wp-border)] bg-white shadow-sm lg:grid-cols-[18rem_minmax(0,1fr)]">
        <aside
          className={cn(
            "min-h-0 flex-col border-r border-[var(--wp-border)] bg-white",
            selectedId ? "hidden lg:flex" : "flex",
          )}
          aria-label="Conversation inbox"
        >
          <div className="space-y-3 border-b border-[var(--wp-border)] p-4">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold">People</h2>
              <span className="rounded-full bg-[var(--wp-surface-subtle)] px-2 py-0.5 text-xs text-[var(--wp-text-secondary)]">
                {people.length}
              </span>
            </div>
            <label className="relative block">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--wp-text-secondary)]" />
              <input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search people"
                aria-label="Search people"
                className="h-10 w-full rounded-xl border border-[var(--wp-border)] bg-[var(--wp-canvas)] pl-9 pr-3 text-sm outline-none transition focus:border-[var(--wp-accent)] focus:ring-2 focus:ring-[var(--wp-accent)]/15"
              />
            </label>
            <div className="flex gap-1 overflow-x-auto" role="group" aria-label="Filter people">
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
            {visiblePeople.length === 0 && conversations.length > 0 ? (
              <p className="p-4 text-sm text-[var(--wp-text-secondary)]">
                No people match this search or filter.
              </p>
            ) : null}
            <ul className="space-y-1">
              {visiblePeople.map((group) => {
                const latestConversation = group.latestConversation;
                const preview = latestConversation.lastMessage
                  ? `${latestConversation.lastMessage.authorUserId === currentUserId ? "You: " : ""}${latestConversation.lastMessage.body}`
                  : conversationState(latestConversation).label;
                const active = selectedPerson?.participant.userId === group.participant.userId;
                return (
                  <li key={group.participant.userId}>
                    <button
                      type="button"
                      onClick={() => selectConversation(latestConversation.id)}
                      aria-current={active ? "page" : undefined}
                      className={cn(
                        "flex min-h-[5.25rem] w-full items-center gap-3 rounded-xl border px-3 py-3 text-left transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--wp-accent)] focus-visible:ring-offset-2",
                        active
                          ? "border-[var(--wp-accent)]/40 bg-[var(--wp-accent-subtle)]"
                          : "border-transparent hover:border-[var(--wp-border)] hover:bg-[var(--wp-canvas)]",
                      )}
                    >
                      <ProviderAvatar
                        displayName={group.participant.displayName}
                        image={group.participant.image}
                        className="h-11 w-11 shrink-0"
                      />
                      <span className="min-w-0 flex-1">
                        <span className="flex items-center justify-between gap-2">
                          <span className="truncate text-sm font-semibold text-[var(--wp-text-primary)]">
                            {group.participant.displayName}
                          </span>
                          <span className="shrink-0 text-[10px] text-[var(--wp-text-secondary)]">
                            {messageTime(
                              latestConversation.lastMessage?.createdAt ??
                                latestConversation.updatedAt,
                            )}
                          </span>
                        </span>
                        <span className="mt-0.5 block truncate text-xs capitalize text-[var(--wp-text-secondary)]">
                          {group.participant.role}
                        </span>
                        <span className="mt-1 block truncate text-xs text-[var(--wp-text-secondary)]">
                          {preview}
                        </span>
                      </span>
                      {group.unreadCount > 0 ? (
                        <span
                          aria-label={`${group.unreadCount} unread messages`}
                          className="inline-flex h-5 min-w-5 shrink-0 items-center justify-center rounded-full bg-[var(--wp-accent)] px-1.5 text-[10px] font-bold text-white"
                        >
                          {group.unreadCount > 99 ? "99+" : group.unreadCount}
                        </span>
                      ) : null}
                    </button>
                  </li>
                );
              })}
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
                {selectedPerson && selectedPerson.conversations.length > 1 ? (
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <button
                        type="button"
                        aria-label={`Switch conversation with ${selectedSummary.otherParticipant.displayName}; current work: ${selectedSummary.taskTitle}`}
                        className="inline-flex min-h-7 max-w-full items-center gap-1 rounded-md text-left text-xs text-[var(--wp-text-secondary)] hover:text-[var(--wp-text-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--wp-accent)]"
                      >
                        <span className="truncate">{selectedSummary.taskTitle}</span>
                        <ChevronDown className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                      </button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="start" className="w-80 max-w-[calc(100vw-2rem)]">
                      <DropdownMenuLabel>
                        Other conversations with {selectedSummary.otherParticipant.displayName}
                      </DropdownMenuLabel>
                      {selectedPerson.conversations.map((conversation) => (
                        <DropdownMenuItem
                          key={conversation.id}
                          onSelect={() => selectConversation(conversation.id)}
                          className="flex-col items-start gap-1"
                        >
                          <span className="flex w-full items-center justify-between gap-2">
                            <span className="truncate font-medium">{conversation.taskTitle}</span>
                            {conversation.id === selectedId ? (
                              <span className="shrink-0 text-[10px] text-[var(--wp-accent)]">
                                Current
                              </span>
                            ) : null}
                          </span>
                          <span className="w-full truncate text-xs text-[var(--wp-text-secondary)]">
                            {conversationState(conversation).label} ·{" "}
                            {messageTime(
                              conversation.lastMessage?.createdAt ?? conversation.updatedAt,
                            )}
                          </span>
                        </DropdownMenuItem>
                      ))}
                    </DropdownMenuContent>
                  </DropdownMenu>
                ) : (
                  <p className="truncate text-xs text-[var(--wp-text-secondary)]">
                    {selectedSummary.taskTitle}
                  </p>
                )}
              </div>
              <span
                className={cn(
                  "hidden max-w-52 rounded-full px-2.5 py-1 text-[10px] font-medium sm:inline-flex",
                  conversationState(selectedSummary).tone,
                )}
              >
                {conversationState(selectedSummary).label}
              </span>
              {selectedConversation ? (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setWorkContextOpen(true)}
                  className="shrink-0 gap-1.5 px-2.5"
                >
                  <BriefcaseBusiness className="h-4 w-4" aria-hidden="true" />
                  <span className="hidden sm:inline">Work context</span>
                  <span className="sr-only sm:hidden">Open work context</span>
                </Button>
              ) : null}
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
                  <h3 className="mt-4 text-base font-semibold">Choose a person</h3>
                  <p className="mt-1 text-sm leading-6 text-[var(--wp-text-secondary)]">
                    Select someone to open your most recent chat. Each work conversation stays
                    separate, and you can switch between them from the conversation header.
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

        <Sheet open={workContextOpen} onOpenChange={setWorkContextOpen}>
          <SheetContent
            side="right"
            className="w-[min(36rem,100vw)] overflow-y-auto border-[var(--wp-border)] bg-white p-5 sm:max-w-xl"
          >
            {selectedSummary && selectedConversation ? (
              <div className="space-y-5">
                <div>
                  <SheetTitle className="pr-8">Work context</SheetTitle>
                  <SheetDescription className="mt-1">
                    Terms and actions for {selectedSummary.otherParticipant.displayName}.
                  </SheetDescription>
                  <h3 className="mt-4 text-base font-semibold leading-snug">
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
                <section className="space-y-3 rounded-2xl border border-[var(--wp-border)] bg-[var(--wp-canvas)] p-4">
                  <p className="text-[10px] font-semibold uppercase tracking-[0.13em] text-[var(--wp-text-secondary)]">
                    Current terms
                  </p>
                  <p className="text-sm leading-6 text-[var(--wp-text-primary)]">
                    {selectedConversation.currentContractSnapshot.summary ||
                      selectedConversation.currentContractSnapshot.title}
                  </p>
                  <dl className="grid grid-cols-2 gap-2 border-t border-[var(--wp-border)] pt-3 text-xs">
                    <div className="rounded-xl bg-white p-3">
                      <dt className="text-[var(--wp-text-secondary)]">
                        {selectedConversation.currentContractSnapshot.agreedPrice
                          ? "Agreed price"
                          : "Budget limit"}
                      </dt>
                      <dd className="mt-1 font-semibold text-[var(--wp-text-primary)]">
                        {formatMinorMoney(
                          selectedConversation.currentContractSnapshot.agreedPrice ??
                            selectedConversation.currentContractSnapshot.budget,
                        )}
                      </dd>
                    </div>
                    <div className="rounded-xl bg-white p-3">
                      <dt className="text-[var(--wp-text-secondary)]">Scope</dt>
                      <dd className="mt-1 font-semibold text-[var(--wp-text-primary)]">
                        {selectedConversation.currentContractSnapshot.requirements.length}{" "}
                        requirement
                        {selectedConversation.currentContractSnapshot.requirements.length === 1
                          ? ""
                          : "s"}
                      </dd>
                    </div>
                    <div className="rounded-xl bg-white p-3">
                      <dt className="text-[var(--wp-text-secondary)]">Target date</dt>
                      <dd className="mt-1 flex items-center gap-1 font-semibold text-[var(--wp-text-primary)]">
                        <Clock3 className="h-3.5 w-3.5" />
                        {selectedConversation.currentContractSnapshot.deadline
                          ? new Date(
                              selectedConversation.currentContractSnapshot.deadline,
                            ).toLocaleDateString()
                          : "Not set"}
                      </dd>
                    </div>
                    <div className="rounded-xl bg-white p-3">
                      <dt className="text-[var(--wp-text-secondary)]">Scope version</dt>
                      <dd className="mt-1 font-semibold text-[var(--wp-text-primary)]">
                        {selectedConversation.currentContractVersion}
                      </dd>
                    </div>
                  </dl>
                </section>

                {selectedSummary.status === "OPEN" && !selectedSummary.hasWorkExecution ? (
                  <WorkCommitmentPanel
                    conversation={selectedConversation}
                    currentUserId={currentUserId}
                    onChanged={() => {
                      setRefreshVersion((version) => version + 1);
                      void refreshInbox();
                    }}
                  />
                ) : null}

                <Link
                  href={
                    currentUserId === selectedConversation.buyerUserId
                      ? `/tasks/${selectedConversation.taskId}`
                      : "/provider"
                  }
                  className="inline-flex w-full items-center justify-center gap-2 rounded-xl border border-[var(--wp-border)] px-3 py-2.5 text-xs font-semibold text-[var(--wp-text-primary)] transition hover:bg-[var(--wp-surface-subtle)]"
                >
                  {currentUserId === selectedConversation.buyerUserId
                    ? "View full task"
                    : "Open Work Studio"}
                  <ArrowUpRight className="h-3.5 w-3.5" />
                </Link>

                {selectedSummary.status === "OPEN" &&
                selectedSummary.hasWorkExecution &&
                currentUserId ? (
                  <div className="border-t border-[var(--wp-border)] pt-5">
                    <p className="mb-3 text-[10px] font-semibold uppercase tracking-[0.13em] text-[var(--wp-text-secondary)]">
                      Work utilities
                    </p>
                    <ConversationThread
                      key={`work-controls-${selectedConversation.id}`}
                      conversation={selectedConversation}
                      currentUserId={currentUserId}
                      hideMessages
                      onAgreementChanged={() => {
                        setRefreshVersion((version) => version + 1);
                        void refreshInbox();
                      }}
                    />
                  </div>
                ) : null}
              </div>
            ) : null}
          </SheetContent>
        </Sheet>
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
