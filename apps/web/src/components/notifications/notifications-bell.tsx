"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import Link from "next/link";
import {
  AlertTriangle,
  Bell,
  BellOff,
  BriefcaseBusiness,
  CheckCheck,
  Coins,
  ExternalLink,
  FileCheck,
  Lock,
  Scale,
  ShieldCheck,
  UserCheck,
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { clearApiCache, useApi } from "@/lib/use-api";
import { listNotifications, markNotificationRead } from "@/lib/api/endpoints";
import { formatDateTime } from "@/lib/format";
import type { NotificationDto } from "@/lib/api/types";
import { cn } from "@/lib/utils";

function getNotificationIcon(type: string) {
  if (type.includes("CONVERSATION") || type.includes("MESSAGE")) {
    return <BriefcaseBusiness className="h-4 w-4 text-[var(--wp-accent)]" />;
  }
  if (type.includes("PAYMENT") || type.includes("MONEY") || type.includes("CAPTURE")) {
    return <Coins className="h-4 w-4 text-emerald-500" />;
  }
  if (type.includes("VERIF") || type.includes("SUBMITTED")) {
    return <ShieldCheck className="h-4 w-4 text-blue-500" />;
  }
  if (type.includes("CONTRACT") || type.includes("AGREEMENT")) {
    return <FileCheck className="h-4 w-4 text-cyan-600 dark:text-cyan-400" />;
  }
  if (type.includes("PROVIDER") || type.includes("SPECIALIST") || type.includes("OFFER")) {
    return <UserCheck className="h-4 w-4 text-purple-500" />;
  }
  if (
    type.includes("CASE") ||
    type.includes("DISPUTE") ||
    type.includes("REVISION") ||
    type.includes("ARBITRATION")
  ) {
    return <Scale className="h-4 w-4 text-amber-500" />;
  }
  return <Bell className="h-4 w-4 text-primary" />;
}

export function NotificationsBell({ align = "end" }: { align?: "start" | "center" | "end" }) {
  const { data, reload } = useApi(() => listNotifications(), [], "notifications");
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<NotificationDto[]>([]);
  const [filterTab, setFilterTab] = useState<
    "ALL" | "UNREAD" | "TASKS" | "MESSAGES" | "PAYMENTS" | "REVIEWS"
  >("ALL");
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    if (Array.isArray(data)) {
      setItems(data);
    }
  }, [data]);

  useEffect(() => {
    if (!open) return;
    reload();
  }, [open, reload]);

  useEffect(() => {
    const timer = window.setInterval(() => reload(), 15_000);
    return () => window.clearInterval(timer);
  }, [reload]);

  const unreadCount = items.filter((n) => !n.readAt).length;

  const filteredItems = useMemo(() => {
    return items.filter((item) => {
      if (filterTab === "UNREAD") return !item.readAt;
      if (filterTab === "TASKS")
        return item.type.includes("TASK") || item.type.includes("CONTRACT");
      if (filterTab === "MESSAGES")
        return item.type.includes("CONVERSATION") || item.type.includes("MESSAGE");
      if (filterTab === "PAYMENTS")
        return (
          item.type.includes("PAYMENT") ||
          item.type.includes("MONEY") ||
          item.type.includes("CAPTURE")
        );
      if (filterTab === "REVIEWS")
        return (
          item.type.includes("VERIF") ||
          item.type.includes("SUBMITTED") ||
          item.type.includes("CASE") ||
          item.type.includes("REVIEW") ||
          item.type.includes("REVISION")
        );
      return true;
    });
  }, [items, filterTab]);

  const handleMarkAllRead = async (e: React.MouseEvent) => {
    e.stopPropagation();
    startTransition(() => {
      setItems((prev) =>
        prev.map((item) => ({
          ...item,
          readAt: item.readAt ?? new Date().toISOString(),
        })),
      );
    });

    try {
      await markNotificationRead({ markAllRead: true });
      clearApiCache("notifications");
      reload();
    } catch (error) {
      console.error("Could not mark all notifications as read.", error);
    }
  };

  const handleItemClick = async (item: NotificationDto) => {
    if (!item.readAt) {
      setItems((prev) =>
        prev.map((n) => (n.id === item.id ? { ...n, readAt: new Date().toISOString() } : n)),
      );
      try {
        await markNotificationRead({ id: item.id });
        clearApiCache("notifications");
        reload();
      } catch (error) {
        console.error(`Could not mark notification ${item.id} as read.`, error);
      }
    }
    setOpen(false);
  };

  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <DropdownMenuTrigger asChild>
        <Button
          variant="outline"
          size="icon"
          className="relative h-10 w-10 rounded-xl border border-[var(--wp-border)] bg-white hover:bg-[var(--wp-surface-subtle)] hover:border-[var(--wp-border-strong)] transition-all duration-150 shadow-xs active:scale-[0.98] focus-visible:ring-2 focus-visible:ring-[var(--wp-accent)] cursor-pointer shrink-0"
        >
          <Bell className="h-4 w-4 text-[var(--wp-text-primary)]" />
          {unreadCount > 0 ? (
            <span className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-[var(--wp-accent)] px-1 text-[10px] font-bold text-white shadow-xs animate-in zoom-in-75">
              {unreadCount > 9 ? "9+" : unreadCount}
            </span>
          ) : null}
          <span className="sr-only">Notifications ({unreadCount} unread)</span>
        </Button>
      </DropdownMenuTrigger>

      <DropdownMenuContent
        align={align}
        sideOffset={8}
        collisionPadding={8}
        className="w-[min(24rem,calc(100vw-1rem))] max-w-[calc(100vw-1rem)] overflow-hidden rounded-2xl border border-[var(--wp-border-strong)] bg-white/98 p-0 shadow-xl ring-1 ring-black/5 backdrop-blur-md"
      >
        <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--wp-border)] bg-[var(--wp-surface-subtle)]/70">
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold text-[var(--wp-text-primary)]">
              Notifications
            </span>
            {unreadCount > 0 ? (
              <span className="rounded-full bg-[var(--wp-accent-subtle)] px-2 py-0.5 text-[11px] font-semibold text-[var(--wp-accent)]">
                {unreadCount} new
              </span>
            ) : null}
          </div>
          {unreadCount > 0 ? (
            <Button
              variant="ghost"
              size="sm"
              onClick={handleMarkAllRead}
              disabled={isPending}
              className="h-7 px-2 text-xs text-[var(--wp-text-secondary)] hover:text-[var(--wp-text-primary)] gap-1 font-medium cursor-pointer"
            >
              <CheckCheck className="h-3.5 w-3.5" />
              <span>Mark all read</span>
            </Button>
          ) : null}
        </div>

        {/* Category Filter Tabs */}
        <div className="flex items-center gap-1 overflow-x-auto px-3 py-1.5 border-b border-[var(--wp-border)] bg-[var(--wp-surface-subtle)]/40 text-xs">
          <button
            type="button"
            onClick={() => setFilterTab("ALL")}
            className={cn(
              "px-2 py-0.5 rounded-md font-medium transition-all text-[11px] cursor-pointer",
              filterTab === "ALL"
                ? "bg-white text-[var(--wp-text-primary)] font-semibold shadow-2xs border border-[var(--wp-border)]"
                : "text-[var(--wp-text-secondary)] hover:text-[var(--wp-text-primary)]",
            )}
          >
            All ({items.length})
          </button>
          <button
            type="button"
            onClick={() => setFilterTab("UNREAD")}
            className={cn(
              "px-2 py-0.5 rounded-md font-medium transition-all text-[11px] cursor-pointer",
              filterTab === "UNREAD"
                ? "bg-white text-[var(--wp-text-primary)] font-semibold shadow-2xs border border-[var(--wp-border)]"
                : "text-[var(--wp-text-secondary)] hover:text-[var(--wp-text-primary)]",
            )}
          >
            Unread ({unreadCount})
          </button>
          <button
            type="button"
            onClick={() => setFilterTab("TASKS")}
            className={cn(
              "px-2 py-0.5 rounded-md font-medium transition-all text-[11px] cursor-pointer",
              filterTab === "TASKS"
                ? "bg-white text-[var(--wp-text-primary)] font-semibold shadow-2xs border border-[var(--wp-border)]"
                : "text-[var(--wp-text-secondary)] hover:text-[var(--wp-text-primary)]",
            )}
          >
            Tasks
          </button>
          <button
            type="button"
            onClick={() => setFilterTab("MESSAGES")}
            className={cn(
              "px-2 py-0.5 rounded-md font-medium transition-all text-[11px] cursor-pointer",
              filterTab === "MESSAGES"
                ? "bg-white text-[var(--wp-text-primary)] font-semibold shadow-2xs border border-[var(--wp-border)]"
                : "text-[var(--wp-text-secondary)] hover:text-[var(--wp-text-primary)]",
            )}
          >
            Messages
          </button>
          <button
            type="button"
            onClick={() => setFilterTab("PAYMENTS")}
            className={cn(
              "px-2 py-0.5 rounded-md font-medium transition-all text-[11px] cursor-pointer",
              filterTab === "PAYMENTS"
                ? "bg-white text-[var(--wp-text-primary)] font-semibold shadow-2xs border border-[var(--wp-border)]"
                : "text-[var(--wp-text-secondary)] hover:text-[var(--wp-text-primary)]",
            )}
          >
            Payments
          </button>
          <button
            type="button"
            onClick={() => setFilterTab("REVIEWS")}
            className={cn(
              "px-2 py-0.5 rounded-md font-medium transition-all text-[11px] cursor-pointer",
              filterTab === "REVIEWS"
                ? "bg-white text-[var(--wp-text-primary)] font-semibold shadow-2xs border border-[var(--wp-border)]"
                : "text-[var(--wp-text-secondary)] hover:text-[var(--wp-text-primary)]",
            )}
          >
            Reviews
          </button>
        </div>

        <div className="max-h-[360px] overflow-y-auto divide-y divide-border/40">
          {filteredItems.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-10 px-4 text-center">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-muted text-muted-foreground mb-2">
                <BellOff className="h-5 w-5" />
              </div>
              <p className="text-sm font-medium text-foreground">
                {filterTab === "UNREAD"
                  ? "No unread notifications"
                  : filterTab === "TASKS"
                    ? "No task updates"
                    : filterTab === "MESSAGES"
                      ? "No new messages"
                      : filterTab === "PAYMENTS"
                        ? "No payment notifications"
                        : filterTab === "REVIEWS"
                          ? "No review updates"
                          : "All caught up"}
              </p>
              <p className="text-xs text-muted-foreground mt-0.5">
                New work requests, messages, payment updates, and verification results will appear
                here.
              </p>
            </div>
          ) : (
            filteredItems.slice(0, 20).map((n) => {
              const isUnread = !n.readAt;
              const targetHref = n.href || (n.taskId ? `/tasks/${n.taskId}` : null);

              const content = (
                <div
                  className={cn(
                    "flex items-start gap-3 p-3.5 transition-colors text-left w-full",
                    isUnread
                      ? "bg-primary/[0.04] hover:bg-primary/[0.08]"
                      : "hover:bg-muted/50 opacity-80 hover:opacity-100",
                  )}
                >
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-background border border-border/70 shadow-2xs mt-0.5">
                    {getNotificationIcon(n.type)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-1 mb-0.5">
                      <span
                        className={cn(
                          "text-xs leading-snug truncate",
                          isUnread
                            ? "font-semibold text-foreground"
                            : "font-medium text-muted-foreground",
                        )}
                      >
                        {n.title}
                      </span>
                      {isUnread ? (
                        <span className="h-2 w-2 rounded-full bg-primary shrink-0" />
                      ) : null}
                    </div>
                    {n.body ? (
                      <p className="line-clamp-2 break-words text-xs leading-relaxed text-muted-foreground [overflow-wrap:anywhere]">
                        {n.body}
                      </p>
                    ) : null}
                    <span className="text-[10px] text-muted-foreground/80 mt-1 block">
                      {formatDateTime(n.createdAt)}
                    </span>
                  </div>
                </div>
              );

              if (targetHref) {
                return (
                  <Link
                    key={n.id}
                    href={targetHref}
                    className="block focus:outline-hidden"
                    onClick={() => void handleItemClick(n)}
                  >
                    {content}
                  </Link>
                );
              }

              return (
                <button
                  key={n.id}
                  type="button"
                  className="block w-full text-left"
                  onClick={() => void handleItemClick(n)}
                >
                  {content}
                </button>
              );
            })
          )}
        </div>

        <div className="border-t border-border/60 bg-muted/20 px-4 py-2.5 flex items-center justify-between text-xs">
          <Link
            href="/activity"
            onClick={() => setOpen(false)}
            className="text-xs font-medium text-primary hover:underline flex items-center gap-1"
          >
            <span>View activity log</span>
            <ExternalLink className="h-3 w-3" />
          </Link>
          <span className="text-[11px] text-muted-foreground">Real-time updates</span>
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
