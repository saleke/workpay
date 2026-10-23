"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { TopProgressBar } from "@/components/nav/top-progress-bar";
import { EnvironmentToggle } from "@/components/nav/environment-toggle";
import { PersonaSwitcher } from "@/components/demo/persona-switcher";
import { UserNav } from "@/components/nav/user-nav";
import { useSystemMode } from "@/lib/mode";

interface NavLinkItem {
  href: string;
  label: string;
}

const navItems: NavLinkItem[] = [
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
    <div className="min-h-screen bg-[var(--room)] text-[var(--room-text)]">
      <TopProgressBar />

      <header className="border-b border-[var(--room-rule)] px-4 sm:px-6">
        <div className="mx-auto flex max-w-(--sheet-max) items-baseline gap-4 sm:gap-6 py-4">
          <Link
            href="/"
            className="font-serif text-[1.125rem] font-normal tracking-tight text-[var(--room-text-strong)] hover:opacity-90 mr-auto"
          >
            WorkPay
          </Link>

          <nav className="flex items-baseline gap-3 sm:gap-5 text-[var(--text-small)]">
            {navItems.map((item) => {
              const isActive =
                item.href === "/tasks"
                  ? pathname === "/tasks" || (pathname.startsWith("/tasks/") && pathname !== "/tasks/new")
                  : pathname.startsWith(item.href);

              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`transition-colors ${
                    isActive
                      ? "text-[var(--room-text-strong)] font-medium"
                      : "text-[var(--room-muted)] hover:text-[var(--room-text)]"
                  }`}
                >
                  {item.label}
                </Link>
              );
            })}
          </nav>

          <div className="flex items-center gap-2 sm:gap-3 ml-2">
            <EnvironmentToggle />
            {isDemo ? <PersonaSwitcher /> : <UserNav />}
            <Link
              href="/tasks/new"
              className="new-btn"
            >
              New task
            </Link>
          </div>
        </div>
      </header>

      <main className="page-container">{children}</main>
    </div>
  );
}

