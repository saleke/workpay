"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Plus } from "lucide-react";
import { TopProgressBar } from "@/components/nav/top-progress-bar";
import { EnvironmentToggle } from "@/components/nav/environment-toggle";
import { PersonaSwitcher } from "@/components/demo/persona-switcher";
import { UserNav } from "@/components/nav/user-nav";
import { NotificationsBell } from "@/components/notifications/notifications-bell";
import { useSystemMode } from "@/lib/mode";

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

  return (
    <div className="min-h-screen bg-[var(--canvas)] text-[var(--charcoal)] flex flex-col">
      <TopProgressBar />

      <header className="sticky top-0 z-30 bg-white/90 backdrop-blur-md border-b border-[var(--border-subtle)] px-4 sm:px-6">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 py-3">
          {/* Brand Wordmark */}
          <div className="flex items-center gap-6">
            <Link
              href="/"
              className="flex items-center gap-1.5 font-sans text-lg font-bold tracking-tight text-[var(--charcoal)] hover:opacity-90"
            >
              <span>WorkPay</span>
              <span className="h-1.5 w-1.5 rounded-full bg-[var(--amber)]" />
            </Link>

            {/* Navigation links */}
            <nav className="hidden md:flex items-center gap-1 text-sm font-medium text-[var(--text-muted)]">
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
                    className={`px-3 py-1.5 rounded-md transition-colors ${
                      isActive
                        ? "text-[var(--charcoal)] bg-[var(--surface-subtle)] font-semibold"
                        : "hover:text-[var(--charcoal)] hover:bg-[var(--surface-subtle)]"
                    }`}
                  >
                    {item.label}
                  </Link>
                );
              })}
            </nav>
          </div>

          {/* Right Controls */}
          <div className="flex items-center gap-2 sm:gap-3">
            <EnvironmentToggle />
            {isDemo ? <PersonaSwitcher /> : <UserNav />}
            <NotificationsBell />
            <Link
              href="/tasks/new"
              className="flex items-center gap-1.5 bg-[var(--charcoal)] text-white hover:bg-black px-3.5 py-1.5 rounded-lg text-xs sm:text-sm font-medium transition-all shadow-xs"
            >
              <Plus className="h-3.5 w-3.5" />
              <span>New task</span>
            </Link>
          </div>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="flex-1 w-full max-w-6xl mx-auto px-4 sm:px-6 py-6 sm:py-8">
        {children}
      </main>
    </div>
  );
}
