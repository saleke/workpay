"use client";

import { useEffect, useState, useTransition } from "react";
import Link from "next/link";
import {
  AlertTriangle,
  Bell,
  BellOff,
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
import { useApi } from "@/lib/use-api";
import { listNotifications, markNotificationRead } from "@/lib/api/endpoints";
import { formatDateTime } from "@/lib/format";
import type { NotificationDto } from "@/lib/api/types";
import { cn } from "@/lib/utils";

function getNotificationIcon(type: string) {
  if (type.includes("PAYMENT") || type.includes("MONEY") || type.includes("ESCROW")) {
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
  if (type.includes("CASE") || type.includes("DISPUTE") || type.includes("REVISION")) {
    return <Scale className="h-4 w-4 text-amber-500" />;
  }
  return <Bell className="h-4 w-4 text-primary" />;
}

export function NotificationsBell() {
  const { data, reload } = useApi(() => listNotifications(), [], "notifications");
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<NotificationDto[]>([]);
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

  const unreadCount = items.filter((n) => !n.readAt).length;

  const handleMarkAllRead = async (e: React.MouseEvent) => {
    e.stopPropagation();
    startTransition(async () => {
      setItems((prev) =>
        prev.map((item) => ({
          ...item,
          readAt: item.readAt ?? new Date().toISOString(),
        })),
      );
      await markNotificationRead({ markAllRead: true });
      reload();
    });
  };

  const handleItemClick = async (item: NotificationDto) => {
    if (!item.readAt) {
      setItems((prev) =>
        prev.map((n) => (n.id === item.id ? { ...n, readAt: new Date().toISOString() } : n)),
      );
      await markNotificationRead({ id: item.id });
    }
    setOpen(false);
  };

  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <DropdownMenuTrigger asChild>
        <Button
          variant="outline"
          size="icon"
          className="relative h-9 w-9 rounded-xl border-border/80 transition-all hover:bg-muted focus-visible:ring-1"
        >
          <Bell className="h-4 w-4 text-foreground" />
          {unreadCount > 0 ? (
            <span className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-bold text-primary-foreground shadow-xs animate-in zoom-in-75">
              {unreadCount > 9 ? "9+" : unreadCount}
            </span>
          ) : null}
          <span className="sr-only">Notifications ({unreadCount} unread)</span>
        </Button>
      </DropdownMenuTrigger>

      <DropdownMenuContent
        align="end"
        sideOffset={8}
        className="w-88 sm:w-96 rounded-2xl border-border/80 p-0 shadow-lg backdrop-blur-md"
      >
        <div className="flex items-center justify-between px-4 py-3 border-b border-border/60 bg-muted/30">
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold text-foreground">Notifications</span>
            {unreadCount > 0 ? (
              <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-semibold text-primary">
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
              className="h-7 px-2 text-xs text-muted-foreground hover:text-foreground gap-1 font-medium"
            >
              <CheckCheck className="h-3.5 w-3.5" />
              <span>Mark all read</span>
            </Button>
          ) : null}
        </div>

        <div className="max-h-[380px] overflow-y-auto divide-y divide-border/40">
          {items.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-10 px-4 text-center">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-muted text-muted-foreground mb-2">
                <BellOff className="h-5 w-5" />
              </div>
              <p className="text-sm font-medium text-foreground">All caught up</p>
              <p className="text-xs text-muted-foreground mt-0.5">
                New escrow events and verification updates will appear here.
              </p>
            </div>
          ) : (
            items.slice(0, 15).map((n) => {
              const isUnread = !n.readAt;
              const targetHref = n.href || (n.taskId ? `/tasks/${n.taskId}` : null);

              const content = (
                <div
                  className={cn(
                    "flex items-start gap-3 p-3.5 transition-colors cursor-pointer text-left w-full",
                    isUnread
                      ? "bg-primary/[0.04] hover:bg-primary/[0.08]"
                      : "hover:bg-muted/50 opacity-80 hover:opacity-100",
                  )}
                  onClick={() => handleItemClick(n)}
                >
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-background border border-border/70 shadow-2xs mt-0.5">
                    {getNotificationIcon(n.type)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-1 mb-0.5">
                      <span
                        className={cn(
                          "text-xs leading-snug truncate",
                          isUnread ? "font-semibold text-foreground" : "font-medium text-muted-foreground",
                        )}
                      >
                        {n.title}
                      </span>
                      {isUnread ? (
                        <span className="h-2 w-2 rounded-full bg-primary shrink-0" />
                      ) : null}
                    </div>
                    {n.body ? (
                      <p className="text-xs text-muted-foreground line-clamp-2 leading-relaxed">
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
                    onClick={() => handleItemClick(n)}
                  >
                    {content}
                  </Link>
                );
              }

              return <div key={n.id}>{content}</div>;
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
          <span className="text-[11px] text-muted-foreground">PayPal Agentic Gateway</span>
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
