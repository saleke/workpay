"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Activity,
  Briefcase,
  ClipboardList,
  CreditCard,
  Lock,
  Menu,
  Scale,
  ShieldCheck,
  Sliders,
  UserCheck,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { NotificationsBell } from "@/components/notifications/notifications-bell";
import { PersonaSwitcher } from "@/components/demo/persona-switcher";
import { UserNav } from "@/components/nav/user-nav";
import { useSystemMode } from "@/lib/mode";
import { cn } from "@/lib/utils";

const navItems = [
  { href: "/tasks", label: "My Tasks", icon: ClipboardList },
  { href: "/payments", label: "Payments", icon: CreditCard },
  { href: "/activity", label: "Activity", icon: Activity },
  { href: "/provider", label: "Work Studio", icon: Briefcase },
  { href: "/review", label: "Arbitration", icon: Scale },
  { href: "/settings", label: "Settings", icon: Sliders },
];

function SidebarNav() {
  const pathname = usePathname();

  return (
    <nav className="grid gap-1.5 text-sm font-medium">
      {navItems.map((item) => {
        const Icon = item.icon;
        const isActive =
          pathname === item.href || (item.href !== "/tasks" && pathname.startsWith(item.href));

        return (
          <Link
            key={item.href}
            href={item.href}
            className={cn(
              "flex items-center gap-3 rounded-lg px-3 py-2.5 transition-all text-sm font-medium",
              isActive
                ? "bg-primary text-primary-foreground shadow-sm"
                : "text-muted-foreground hover:bg-secondary hover:text-foreground",
            )}
          >
            <Icon className={cn("h-4 w-4", isActive ? "text-primary-foreground" : "text-muted-foreground")} />
            <span>{item.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const { isDemo } = useSystemMode();

  return (
    <div className="grid min-h-screen w-full md:grid-cols-[240px_1fr] lg:grid-cols-[280px_1fr] bg-background">
      {/* Sidebar for Desktop */}
      <aside className="hidden border-r border-border/80 bg-card/60 backdrop-blur-md md:flex md:flex-col justify-between">
        <div className="flex flex-col gap-4">
          {/* Logo & Brand Header */}
          <div className="flex h-16 items-center border-b border-border/70 px-5">
            <Link href="/tasks" className="flex items-center gap-3 font-semibold group">
              <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-blue-600 to-indigo-700 text-white shadow-sm transition-transform group-hover:scale-105">
                <ShieldCheck className="h-5 w-5" />
              </div>
              <div className="flex flex-col">
                <div className="flex items-center gap-1.5">
                  <span className="text-base font-bold tracking-tight text-foreground">WorkPay</span>
                  <span className="rounded bg-blue-100 px-1.5 py-0.2 text-[10px] font-bold text-blue-700 dark:bg-blue-950 dark:text-blue-300">
                    ESCROW
                  </span>
                </div>
                <span className="text-[11px] text-muted-foreground">Autonomous Agent Commerce</span>
              </div>
            </Link>
          </div>

          {/* Navigation Links */}
          <div className="px-3 py-2">
            <SidebarNav />
          </div>
        </div>

        {/* Sidebar Footer Escrow Trust Badge */}
        <div className="p-4 border-t border-border/60">
          <div className="rounded-xl border border-blue-200/60 bg-gradient-to-br from-blue-50/80 to-indigo-50/50 p-3.5 shadow-sm dark:border-blue-900/50 dark:from-blue-950/40 dark:to-indigo-950/30">
            <div className="flex items-center gap-2 text-xs font-semibold text-blue-900 dark:text-blue-200 mb-1">
              <Lock className="h-3.5 w-3.5 text-blue-600 dark:text-blue-400" />
              <span>PayPal Escrow Engine</span>
            </div>
            <p className="text-[11px] text-blue-800/80 dark:text-blue-300/80 leading-relaxed">
              Funds are pre-authorized on contract approval and captured only after cryptographic proof passes.
            </p>
          </div>
        </div>
      </aside>

      {/* Main Content Area */}
      <div className="flex flex-col">
        {/* Top Header Bar */}
        <header className="sticky top-0 z-20 flex h-16 items-center gap-4 border-b border-border/70 bg-background/80 backdrop-blur-md px-4 lg:px-6">
          {/* Mobile Sheet Trigger */}
          <Sheet>
            <SheetTrigger asChild>
              <Button variant="outline" size="icon" className="shrink-0 md:hidden">
                <Menu className="h-5 w-5" />
                <span className="sr-only">Toggle navigation menu</span>
              </Button>
            </SheetTrigger>
            <SheetContent side="left" className="flex flex-col justify-between p-4">
              <div className="flex flex-col gap-4">
                <div className="flex items-center gap-3 border-b pb-4">
                  <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-blue-600 to-indigo-700 text-white">
                    <ShieldCheck className="h-5 w-5" />
                  </div>
                  <div>
                    <span className="text-base font-bold text-foreground">WorkPay</span>
                    <span className="block text-xs text-muted-foreground">PayPal Agentic Escrow</span>
                  </div>
                </div>
                <SidebarNav />
              </div>
            </SheetContent>
          </Sheet>

          {/* Header Title / Breadcrumbs slot */}
          <div className="flex items-center gap-2">
            <div className="hidden sm:flex items-center gap-2 rounded-full border border-emerald-200 bg-emerald-50/80 px-3 py-1 text-xs font-medium text-emerald-800 dark:border-emerald-900/60 dark:bg-emerald-950/50 dark:text-emerald-300">
              <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
              <span>Gateway: PayPal Authorizations Active</span>
            </div>
          </div>

          <div className="ml-auto flex items-center gap-3">
            {/* Dynamic Header: Persona Switcher in Demo Mode, User Profile in Production Mode */}
            {isDemo ? <PersonaSwitcher /> : <UserNav />}

            {/* Notifications Bell */}
            <NotificationsBell />
          </div>
        </header>

        {/* Page Content */}
        <main className="flex-1 p-4 lg:p-6 max-w-7xl w-full mx-auto">{children}</main>
      </div>
    </div>
  );
}
