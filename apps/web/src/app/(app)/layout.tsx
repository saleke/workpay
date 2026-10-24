"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Menu, X } from "lucide-react";
import { TopProgressBar } from "@/components/nav/top-progress-bar";
import { EnvironmentToggle } from "@/components/nav/environment-toggle";
import { UserNav } from "@/components/nav/user-nav";
import { NotificationsBell } from "@/components/notifications/notifications-bell";
import { WorkPayLogoMark } from "@/components/brand/logo";
import { useSystemMode } from "@/lib/mode";
import { cn } from "@/lib/utils";

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
  { href: "/review", label: "Review" },
  { href: "/settings", label: "Settings" },
];

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { isDemo } = useSystemMode();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

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
                    {item.label}
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
                  <span>{item.label}</span>
                  {isActive && (
                    <span className="h-1.5 w-1.5 rounded-full bg-[var(--wp-accent)]" />
                  )}
                </Link>
              );
            })}
          </div>
        )}
      </header>

      {/* Main Content Area */}
      <main className="flex-1 w-full max-w-6xl mx-auto px-4 sm:px-6 py-6 sm:py-8">
        {children}
      </main>
    </div>
  );
}
