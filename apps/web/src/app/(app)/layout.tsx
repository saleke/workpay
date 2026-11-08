"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Activity,
  BriefcaseBusiness,
  ClipboardList,
  Home,
  Menu,
  MessageSquareText,
  Plus,
  SearchCheck,
  Settings,
  WalletCards,
  type LucideIcon,
} from "lucide-react";
import { TopProgressBar } from "@/components/nav/top-progress-bar";
import { EnvironmentToggle } from "@/components/nav/environment-toggle";
import { UserNav } from "@/components/nav/user-nav";
import { NotificationsBell } from "@/components/notifications/notifications-bell";
import { TenfoLogo } from "@/components/brand/logo";
import { Sheet, SheetContent, SheetDescription, SheetTitle } from "@/components/ui/sheet";
import { cn } from "@/lib/utils";
import { getMessageInbox } from "@/lib/api/endpoints";

interface NavLinkItem {
  href: string;
  label: string;
  icon: LucideIcon;
  badge?: "messages" | "contact-requests";
}

interface NavGroup {
  label: string;
  items: NavLinkItem[];
}

const navGroups: NavGroup[] = [
  {
    label: "Workspace",
    items: [
      { href: "/", label: "Home", icon: Home },
      { href: "/tasks", label: "Tasks", icon: ClipboardList },
      { href: "/messages", label: "Messages", icon: MessageSquareText, badge: "messages" },
    ],
  },
  {
    label: "Work together",
    items: [
      {
        href: "/provider",
        label: "Work Studio",
        icon: BriefcaseBusiness,
        badge: "contact-requests",
      },
      { href: "/reviewers", label: "Reviewers", icon: SearchCheck },
      { href: "/reviewer/engagements", label: "My reviews", icon: ClipboardList },
    ],
  },
  {
    label: "Records",
    items: [
      { href: "/payments", label: "Payments", icon: WalletCards },
      { href: "/activity", label: "Activity", icon: Activity },
    ],
  },
];

function isActiveRoute(href: string, pathname: string): boolean {
  if (href === "/") return pathname === "/";
  if (href === "/tasks") {
    return (
      pathname === "/tasks" ||
      pathname === "/intake" ||
      pathname === "/tasks/new" ||
      pathname.startsWith("/tasks/") ||
      pathname.startsWith("/invite/")
    );
  }
  if (href === "/provider") return pathname === "/provider" || pathname.startsWith("/provider/");
  if (href === "/reviewers") return pathname === "/reviewers" || pathname.startsWith("/reviewers/");
  if (href === "/reviewer/engagements") {
    return pathname === "/reviewer/engagements" || pathname.startsWith("/reviewer/engagements/");
  }
  return pathname === href || pathname.startsWith(`${href}/`);
}

function currentPageLabel(pathname: string): string {
  const item = navGroups
    .flatMap((group) => group.items)
    .find((entry) => {
      if (entry.href === "/tasks") {
        return (
          pathname === "/intake" ||
          pathname === "/tasks/new" ||
          pathname.startsWith("/tasks/") ||
          pathname.startsWith("/invite/")
        );
      }
      return isActiveRoute(entry.href, pathname);
    });
  if (pathname === "/intake" || pathname === "/tasks/new") return "New task";
  if (pathname.startsWith("/invite/")) return "Work invitation";
  return item?.label ?? "Tenfo";
}

function NavigationLinks({
  pathname,
  compact,
  unreadMessageCount,
  pendingContactCount,
  onNavigate,
}: {
  pathname: string;
  compact: boolean;
  unreadMessageCount: number;
  pendingContactCount: number;
  onNavigate?: () => void;
}) {
  return (
    <nav aria-label="Primary navigation" className="space-y-5">
      {navGroups.map((group) => (
        <div key={group.label}>
          <p
            className={cn(
              "mb-2 px-3 text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--wp-text-muted)]",
              compact && "xl:block hidden",
            )}
          >
            {group.label}
          </p>
          <div className="space-y-1">
            {group.items.map((item) => {
              const active = isActiveRoute(item.href, pathname);
              const count =
                item.badge === "messages"
                  ? unreadMessageCount
                  : item.badge === "contact-requests"
                    ? pendingContactCount
                    : 0;
              const Icon = item.icon;

              return (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={onNavigate}
                  aria-label={item.label}
                  aria-current={active ? "page" : undefined}
                  title={compact ? item.label : undefined}
                  className={cn(
                    "relative flex min-h-10 items-center gap-3 rounded-xl px-3 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--wp-accent)] focus-visible:ring-offset-2",
                    compact && "justify-center px-2 xl:justify-start xl:px-3",
                    active
                      ? "bg-[var(--wp-accent-subtle)] text-[var(--wp-accent)]"
                      : "text-[var(--wp-text-secondary)] hover:bg-[var(--wp-surface-subtle)] hover:text-[var(--wp-text-primary)]",
                  )}
                >
                  <Icon className="h-[18px] w-[18px] shrink-0" aria-hidden="true" />
                  <span
                    className={cn("min-w-0 flex-1 truncate", compact && "sr-only xl:not-sr-only")}
                  >
                    {item.label}
                  </span>
                  {count > 0 ? (
                    <span
                      aria-label={`${count} ${item.badge === "messages" ? "unread messages" : "contact requests needing a response"}`}
                      className={cn(
                        "ml-auto inline-flex min-w-5 items-center justify-center rounded-full bg-[var(--wp-accent)] px-1.5 text-[10px] font-bold leading-5 text-white",
                        compact &&
                          "absolute right-0.5 top-0.5 min-w-4 px-1 leading-4 xl:static xl:ml-auto",
                      )}
                    >
                      {count > 9 ? "9+" : count}
                    </span>
                  ) : null}
                </Link>
              );
            })}
          </div>
        </div>
      ))}
    </nav>
  );
}

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [pendingContactCount, setPendingContactCount] = useState(0);
  const [unreadMessageCount, setUnreadMessageCount] = useState(0);

  useEffect(() => {
    let active = true;
    const refresh = async () => {
      const inbox = await getMessageInbox();
      if (!active || !inbox.data) return;
      setUnreadMessageCount(
        inbox.data.conversations.reduce(
          (total, conversation) => total + conversation.unreadCount,
          0,
        ),
      );
      setPendingContactCount(
        inbox.data.conversations.filter(
          (conversation) =>
            conversation.status === "CONTACT_PENDING" &&
            conversation.otherParticipant.role === "client",
        ).length,
      );
    };

    void refresh();
    window.addEventListener("workpay_provider_inbox_change", refresh);
    window.addEventListener("workpay_messages_inbox_change", refresh);
    const timer = window.setInterval(() => void refresh(), 15_000);
    return () => {
      active = false;
      window.removeEventListener("workpay_provider_inbox_change", refresh);
      window.removeEventListener("workpay_messages_inbox_change", refresh);
      window.clearInterval(timer);
    };
  }, []);

  return (
    <div className="min-h-screen bg-[var(--wp-canvas)] text-[var(--wp-text-primary)]">
      <TopProgressBar />
      <div className="flex min-h-screen">
        <aside className="sticky top-0 hidden h-dvh w-[72px] shrink-0 flex-col border-r border-[var(--wp-border)] bg-white px-2 py-4 md:flex xl:w-64 xl:px-4">
          <Link
            href="/"
            className="mb-7 flex min-h-10 items-center justify-center gap-2.5 rounded-lg px-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--wp-accent)] xl:justify-start"
            aria-label="Tenfo home"
          >
            <TenfoLogo size={30} wordmarkClassName="hidden xl:inline" />
          </Link>

          <Link
            href="/intake"
            className="mb-6 flex min-h-11 items-center justify-center gap-2 rounded-xl bg-[var(--wp-accent)] px-3 text-sm font-semibold text-white shadow-sm transition hover:bg-[var(--wp-accent)]/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--wp-accent)] focus-visible:ring-offset-2 xl:justify-start"
          >
            <Plus className="h-4 w-4 shrink-0" aria-hidden="true" />
            <span className="hidden xl:inline">New task</span>
            <span className="sr-only xl:hidden">New task</span>
          </Link>

          <div className="min-h-0 flex-1 overflow-y-auto">
            <NavigationLinks
              pathname={pathname}
              compact
              unreadMessageCount={unreadMessageCount}
              pendingContactCount={pendingContactCount}
            />
          </div>

          <Link
            href="/settings"
            aria-label="Settings"
            title="Settings"
            aria-current={isActiveRoute("/settings", pathname) ? "page" : undefined}
            className={cn(
              "mt-5 flex min-h-10 items-center justify-center gap-3 rounded-xl px-3 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--wp-accent)] focus-visible:ring-offset-2 xl:justify-start",
              isActiveRoute("/settings", pathname)
                ? "bg-[var(--wp-accent-subtle)] text-[var(--wp-accent)]"
                : "text-[var(--wp-text-secondary)] hover:bg-[var(--wp-surface-subtle)] hover:text-[var(--wp-text-primary)]",
            )}
          >
            <Settings className="h-[18px] w-[18px] shrink-0" aria-hidden="true" />
            <span className="hidden xl:inline">Settings</span>
          </Link>
          <div className="mt-4 hidden border-t border-[var(--wp-border)] pt-4 xl:block">
            <EnvironmentToggle />
          </div>
        </aside>

        <div className="flex min-w-0 flex-1 flex-col">
          <header className="sticky top-0 z-30 border-b border-[var(--wp-border)] bg-white/95 backdrop-blur">
            <div className="mx-auto flex min-h-16 w-full max-w-[1600px] items-center justify-between gap-3 px-4 sm:px-6 lg:px-8">
              <div className="flex min-w-0 items-center gap-3">
                <Sheet open={mobileMenuOpen} onOpenChange={setMobileMenuOpen}>
                  <button
                    type="button"
                    onClick={() => setMobileMenuOpen(true)}
                    aria-label="Open navigation menu"
                    className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-[var(--wp-border)] bg-white text-[var(--wp-text-primary)] transition hover:bg-[var(--wp-surface-subtle)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--wp-accent)] md:hidden"
                  >
                    <Menu className="h-5 w-5" aria-hidden="true" />
                  </button>
                  <SheetContent
                    side="left"
                    className="flex w-[19rem] max-w-[88vw] flex-col border-[var(--wp-border)] bg-white p-4"
                  >
                    <SheetTitle className="sr-only">Tenfo navigation</SheetTitle>
                    <SheetDescription className="sr-only">
                      Navigate Tenfo workspaces and account pages.
                    </SheetDescription>
                    <Link
                      href="/"
                      onClick={() => setMobileMenuOpen(false)}
                      className="mb-6 flex min-h-11 items-center gap-3 pr-10"
                    >
                      <TenfoLogo size={30} />
                    </Link>
                    <Link
                      href="/intake"
                      onClick={() => setMobileMenuOpen(false)}
                      className="mb-5 flex min-h-11 items-center justify-center gap-2 rounded-xl bg-[var(--wp-accent)] px-4 text-sm font-semibold text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--wp-accent)] focus-visible:ring-offset-2"
                    >
                      <Plus className="h-4 w-4" aria-hidden="true" />
                      New task
                    </Link>
                    <div className="min-h-0 flex-1 overflow-y-auto">
                      <NavigationLinks
                        pathname={pathname}
                        compact={false}
                        unreadMessageCount={unreadMessageCount}
                        pendingContactCount={pendingContactCount}
                        onNavigate={() => setMobileMenuOpen(false)}
                      />
                      <Link
                        href="/settings"
                        onClick={() => setMobileMenuOpen(false)}
                        aria-current={isActiveRoute("/settings", pathname) ? "page" : undefined}
                        className={cn(
                          "mt-5 flex min-h-11 items-center gap-3 rounded-xl px-3 text-sm font-medium",
                          isActiveRoute("/settings", pathname)
                            ? "bg-[var(--wp-accent-subtle)] text-[var(--wp-accent)]"
                            : "text-[var(--wp-text-secondary)] hover:bg-[var(--wp-surface-subtle)]",
                        )}
                      >
                        <Settings className="h-[18px] w-[18px]" aria-hidden="true" />
                        Settings
                      </Link>
                    </div>
                    <div className="border-t border-[var(--wp-border)] pt-4">
                      <EnvironmentToggle className="mb-4 w-fit" />
                      <UserNav />
                    </div>
                  </SheetContent>
                </Sheet>

                <Link
                  href="/"
                  className="flex shrink-0 items-center gap-2 md:hidden"
                  aria-label="Tenfo home"
                >
                  <TenfoLogo size={27} wordmarkClassName="text-base" />
                </Link>
                <div className="hidden min-w-0 md:block">
                  <p className="truncate text-xs text-[var(--wp-text-muted)]">Workspace</p>
                  <h1 className="truncate text-sm font-semibold text-[var(--wp-text-primary)]">
                    {currentPageLabel(pathname)}
                  </h1>
                </div>
              </div>

              <div className="flex shrink-0 items-center gap-2">
                <EnvironmentToggle compact className="sm:hidden" />
                <EnvironmentToggle className="hidden sm:flex" />
                <NotificationsBell />
                <div className="hidden sm:block">
                  <UserNav />
                </div>
              </div>
            </div>
          </header>

          {pendingContactCount > 0 &&
          !pathname.startsWith("/provider") &&
          !pathname.startsWith("/messages") ? (
            <div className="border-b border-[var(--wp-warning)]/20 bg-[var(--wp-warning-subtle)] px-4 py-3 sm:px-6 lg:px-8">
              <div className="mx-auto flex max-w-[1600px] flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex items-start gap-2.5 text-sm text-[var(--wp-text-primary)]">
                  <BriefcaseBusiness className="mt-0.5 h-4 w-4 shrink-0 text-[var(--wp-warning)]" />
                  <span>
                    <strong>
                      {pendingContactCount} contact request
                      {pendingContactCount === 1 ? "" : "s"}
                    </strong>{" "}
                    need{pendingContactCount === 1 ? "s" : ""} your response.
                  </span>
                </div>
                <Link
                  href="/messages?filter=needs-response"
                  className="inline-flex min-h-10 shrink-0 items-center justify-center gap-1.5 rounded-xl bg-[var(--wp-accent)] px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-[var(--wp-accent)]/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--wp-accent)] focus-visible:ring-offset-2"
                >
                  Review in Messages
                </Link>
              </div>
            </div>
          ) : null}

          <main className="mx-auto w-full max-w-[1600px] flex-1 px-4 py-5 sm:px-6 sm:py-7 lg:px-8">
            {children}
          </main>
        </div>
      </div>
    </div>
  );
}
