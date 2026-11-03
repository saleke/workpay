"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ArrowRight, BriefcaseBusiness, Menu, X } from "lucide-react";
import { TopProgressBar } from "@/components/nav/top-progress-bar";
import { EnvironmentToggle } from "@/components/nav/environment-toggle";
import { UserNav } from "@/components/nav/user-nav";
import { NotificationsBell } from "@/components/notifications/notifications-bell";
import { WorkPayLogoMark } from "@/components/brand/logo";
import { cn } from "@/lib/utils";
import { getProviderInboxSummary } from "@/lib/api/endpoints";

interface NavLinkItem {
  href: string;
  label: string;
}

const navItems: NavLinkItem[] = [
  { href: "/", label: "Home" },
  { href: "/tasks", label: "Tasks" },
  { href: "/payments", label: "Payments" },
  { href: "/activity", label: "Activity" },
  { href: "/provider", label: "Work Studio" },
  { href: "/reviewers", label: "Reviewers" },
  { href: "/reviewer/engagements", label: "My reviews" },
  { href: "/settings", label: "Settings" },
];

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [pendingContactCount, setPendingContactCount] = useState(0);

  useEffect(() => {
    let active = true;
    const refresh = async () => {
      const response = await getProviderInboxSummary();
      if (active && response.data) setPendingContactCount(response.data.pendingCount);
    };
    void refresh();
    window.addEventListener("workpay_provider_inbox_change", refresh);
    const timer = window.setInterval(() => void refresh(), 10_000);
    return () => {
      active = false;
      window.removeEventListener("workpay_provider_inbox_change", refresh);
      window.clearInterval(timer);
    };
  }, []);

  return (
    <div className="min-h-screen bg-[var(--wp-canvas)] text-[var(--wp-text-primary)] flex flex-col font-sans">
      <TopProgressBar />

      <header className="sticky top-0 z-30 bg-white/85 backdrop-blur-md border-b border-[var(--wp-border)] px-4 sm:px-6 transition-all duration-150">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-3 lg:gap-4 py-2.5">
          {/* Brand Wordmark & Nav */}
          <div className="flex items-center gap-3 lg:gap-6 min-w-0">
            <Link
              href="/"
              className="flex items-center gap-2.5 text-lg font-bold tracking-tight text-[var(--wp-text-primary)] hover:opacity-90 active:scale-[0.98] transition-all shrink-0"
            >
              <WorkPayLogoMark size={26} />
              <span>WorkPay</span>
              <span className="h-1.5 w-1.5 rounded-full bg-[var(--wp-accent)] shadow-[0_0_8px_rgba(183,121,45,0.5)]" />
            </Link>

            {/* Navigation links - Desktop */}
            <nav className="hidden md:flex items-center gap-0.5 lg:gap-1 text-sm font-medium shrink-0">
              {navItems.map((item) => {
                const isActive =
                  item.href === "/"
                    ? pathname === "/"
                    : item.href === "/tasks"
                      ? pathname === "/tasks" ||
                        pathname === "/intake" ||
                        (pathname.startsWith("/tasks/") && pathname !== "/tasks/new")
                      : pathname.startsWith(item.href);

                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={cn(
                      "h-8 px-2.5 lg:px-3 rounded-lg text-xs lg:text-sm font-medium transition-all duration-150 inline-flex items-center justify-center whitespace-nowrap shrink-0 active:scale-[0.98]",
                      isActive
                        ? "bg-white text-[var(--wp-text-primary)] font-semibold shadow-xs border border-[var(--wp-border)]"
                        : "text-[var(--wp-text-secondary)] hover:text-[var(--wp-text-primary)] hover:bg-[var(--wp-surface-subtle)] border border-transparent",
                    )}
                  >
                    <span>{item.label}</span>
                    {item.href === "/provider" && pendingContactCount > 0 ? (
                      <span className="ml-1.5 inline-flex min-w-4 items-center justify-center rounded-full bg-[var(--wp-accent)] px-1 text-[10px] font-bold leading-4 text-white">
                        {pendingContactCount > 9 ? "9+" : pendingContactCount}
                      </span>
                    ) : null}
                  </Link>
                );
              })}
            </nav>
          </div>

          {/* Right Controls */}
          <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
            <EnvironmentToggle />
            <NotificationsBell />
            <UserNav />

            {/* Mobile Hamburger Button */}
            <button
              type="button"
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              className="md:hidden flex h-8 w-8 items-center justify-center rounded-lg border border-[var(--wp-border)] bg-white/90 text-[var(--wp-text-secondary)] hover:text-[var(--wp-text-primary)] hover:bg-[var(--wp-surface-subtle)] active:scale-[0.98] transition-all shrink-0"
              aria-label="Toggle mobile menu"
            >
              {mobileMenuOpen ? <X className="h-4 w-4" /> : <Menu className="h-4 w-4" />}
            </button>
          </div>
        </div>

        {/* Mobile Navigation Drawer */}
        {mobileMenuOpen && (
          <div className="md:hidden border-t border-[var(--wp-border)] py-3 px-2 flex flex-col gap-1 animate-in slide-in-from-top-2 duration-150">
            {navItems.map((item) => {
              const isActive =
                item.href === "/"
                  ? pathname === "/"
                  : item.href === "/tasks"
                    ? pathname === "/tasks" ||
                      pathname === "/intake" ||
                      (pathname.startsWith("/tasks/") && pathname !== "/tasks/new")
                    : pathname.startsWith(item.href);

              return (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={() => setMobileMenuOpen(false)}
                  className={cn(
                    "px-3 py-2 rounded-lg text-sm font-medium transition-all flex items-center justify-between",
                    isActive
                      ? "bg-white text-[var(--wp-text-primary)] font-semibold shadow-xs border border-[var(--wp-border)]"
                      : "text-[var(--wp-text-secondary)] hover:text-[var(--wp-text-primary)] hover:bg-[var(--wp-surface-subtle)]",
                  )}
                >
                  <span className="flex items-center gap-2">
                    <span>{item.label}</span>
                    {item.href === "/provider" && pendingContactCount > 0 ? (
                      <span className="inline-flex min-w-5 items-center justify-center rounded-full bg-[var(--wp-accent)] px-1.5 text-[10px] font-bold leading-5 text-white">
                        {pendingContactCount > 9 ? "9+" : pendingContactCount}
                      </span>
                    ) : null}
                  </span>
                  {isActive && <span className="h-1.5 w-1.5 rounded-full bg-[var(--wp-accent)]" />}
                </Link>
              );
            })}
          </div>
        )}
      </header>

      {pendingContactCount > 0 && !pathname.startsWith("/provider") ? (
        <div className="border-b border-[var(--wp-accent)]/25 bg-[var(--wp-accent-subtle)] px-4 py-2.5 sm:px-6">
          <div className="mx-auto flex max-w-6xl flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-2.5 text-sm text-[var(--wp-text-primary)]">
              <BriefcaseBusiness className="h-4 w-4 shrink-0 text-[var(--wp-accent)]" />
              <span>
                <strong>
                  {pendingContactCount} pending buyer contact request
                  {pendingContactCount === 1 ? "" : "s"}
                </strong>{" "}
                waiting for your response.
              </span>
            </div>
            <Link
              href="/provider"
              className="inline-flex min-h-8 shrink-0 items-center justify-center gap-1.5 rounded-lg bg-[var(--wp-text-primary)] px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-black"
            >
              Review in Work Studio
              <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </div>
        </div>
      ) : null}

      {/* Main Content Area */}
      <main className="flex-1 w-full max-w-6xl mx-auto px-4 sm:px-6 py-6 sm:py-8">{children}</main>
    </div>
  );
}
