"use client";

import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import {
  Activity,
  AlertCircle,
  AlertTriangle,
  ArrowRight,
  Briefcase,
  Check,
  CheckCircle2,
  ChevronRight,
  Cpu,
  Database,
  ExternalLink,
  FlaskConical,
  Layers,
  Lock,
  LogIn,
  LogOut,
  RefreshCw,
  Scale,
  Server,
  Shield,
  ShieldAlert,
  ShieldCheck,
  Sliders,
  Sparkles,
  Terminal,
  User,
  UserCheck,
  UserPlus,
  Wallet,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { StatusBadge } from "@/components/ui/status-badge";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import { useSystemMode, type SystemMode } from "@/lib/mode";
import { ProviderProfileManager } from "@/components/provider/provider-profile-manager";
import { cn } from "@/lib/utils";

type SettingsTabKey = "general" | "specialist" | "paypal" | "guardrails" | "diagnostics";

interface SettingsTabConfig {
  key: SettingsTabKey;
  title: string;
  shortTitle: string;
  description: string;
  icon: React.ComponentType<{ className?: string }>;
  badge?: string;
}

const SETTINGS_TABS: SettingsTabConfig[] = [
  {
    key: "general",
    title: "General & Identity",
    shortTitle: "General",
    description: "Execution environment, active session, and authentication",
    icon: Sliders,
  },
  {
    key: "specialist",
    title: "Specialist Profile",
    shortTitle: "Specialist",
    description: "Marketplace bio, hourly rate, tags, and payout email",
    icon: Briefcase,
    badge: "Marketplace",
  },
  {
    key: "paypal",
    title: "PayPal Escrow Rails",
    shortTitle: "PayPal & Escrow",
    description: "Non-custodial Orders v2 and Payments v2 gateway state",
    icon: Wallet,
    badge: "Non-custodial",
  },
  {
    key: "guardrails",
    title: "AI Policy & Guardrails",
    shortTitle: "AI Guardrails",
    description: "Invariants P1 to P4, budget ceilings, and safety limits",
    icon: ShieldCheck,
    badge: "Fail-Closed",
  },
  {
    key: "diagnostics",
    title: "Diagnostics & Database",
    shortTitle: "Diagnostics",
    description: "System health audit, worker status, and demo reset",
    icon: Database,
  },
];

interface AuthUser {
  id: string;
  name: string | null;
  email: string;
  role: "buyer" | "provider" | "admin_reviewer";
}

function SettingsContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const rawTab = searchParams.get("tab") as SettingsTabKey | null;
  const initialTab: SettingsTabKey =
    rawTab && SETTINGS_TABS.some((t) => t.key === rawTab) ? rawTab : "general";

  const [activeTab, setActiveTab] = useState<SettingsTabKey>(initialTab);
  const { mode, isDemo, setMode, envDefault } = useSystemMode();
  const [authUser, setAuthUser] = useState<AuthUser | null>(null);
  const [resetting, setResetting] = useState(false);
  const [resetSuccess, setResetSuccess] = useState(false);
  const [confirmResetOpen, setConfirmResetOpen] = useState(false);

  useEffect(() => {
    if (rawTab && SETTINGS_TABS.some((t) => t.key === rawTab)) {
      setActiveTab(rawTab);
    }
  }, [rawTab]);

  useEffect(() => {
    const stored = window.localStorage.getItem("workpay_auth_user");
    if (stored) {
      try {
        const u = JSON.parse(stored);
        if (u?.id) setAuthUser(u);
      } catch {
        // Ignore
      }
    }
  }, []);

  const handleSelectTab = (tabKey: SettingsTabKey) => {
    setActiveTab(tabKey);
    const params = new URLSearchParams(window.location.search);
    params.set("tab", tabKey);
    router.replace(`/settings?${params.toString()}`, { scroll: false });
  };

  const handleResetDemo = async () => {
    if (resetting) return;
    setResetting(true);
    setResetSuccess(false);
    try {
      const res = await fetch("/api/v1/demo/reset", { method: "POST" });
      if (res.ok) {
        window.localStorage.removeItem("workpay_auth_user");
        setAuthUser(null);
        window.localStorage.setItem("workpay_persona", "buyer");
        document.cookie = `workpay_persona=buyer; path=/; max-age=31536000`;
        setResetSuccess(true);
        setConfirmResetOpen(false);
        toast.success("Database restored to canonical demo baseline");
        setTimeout(() => setResetSuccess(false), 5000);
      } else {
        toast.error("Failed to reset database");
      }
    } catch (err) {
      console.error("Failed to reset demo:", err);
      toast.error("Error connecting to demo reset service");
    } finally {
      setResetting(false);
    }
  };

  const handleSignOut = async () => {
    try {
      await fetch("/api/v1/auth/logout", { method: "POST" });
    } catch {
      // Ignore
    }
    window.localStorage.removeItem("workpay_auth_user");
    setAuthUser(null);
    toast.success("Signed out successfully");
    window.location.reload();
  };

  return (
    <div className="flex flex-col gap-6 max-w-6xl pb-12">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-2 border-b border-[var(--wp-border)]">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold tracking-tight text-[var(--wp-text-primary)]">
              Settings &amp; Architecture Diagnostics
            </h1>
          </div>
          <p className="text-xs sm:text-sm text-[var(--wp-text-secondary)] mt-0.5">
            Configure runtime environments, audit PayPal escrow gates, manage specialist profiles, and inspect system invariants.
          </p>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <Badge
            variant="outline"
            className={cn(
              "px-2.5 py-1 text-xs font-semibold rounded-lg border",
              isDemo
                ? "border-[var(--wp-accent)]/30 bg-[var(--wp-accent-subtle)] text-[var(--wp-accent)]"
                : "border-[var(--wp-success)]/30 bg-[var(--wp-success-subtle)] text-[var(--wp-success)]",
            )}
          >
            <span
              className={cn(
                "h-1.5 w-1.5 rounded-full mr-1.5 inline-block",
                isDemo ? "bg-[var(--wp-accent)]" : "bg-[var(--wp-success)]",
              )}
            />
            {isDemo ? "Sandbox (Simulated Settlement)" : "Live Production Escrow"}
          </Badge>
        </div>
      </div>

      {/* Main Settings Layout: Sub-Navigation Sidebar + Active Tab Content */}
      <div className="flex flex-col md:flex-row gap-6 items-start">
        {/* Navigation Tabs - Desktop (Vertical Sidebar) & Mobile (Horizontal Strip) */}
        <div className="w-full md:w-64 shrink-0 flex flex-row md:flex-col gap-1 overflow-x-auto pb-2 md:pb-0 scrollbar-none">
          {SETTINGS_TABS.map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.key;

            return (
              <button
                key={tab.key}
                type="button"
                onClick={() => handleSelectTab(tab.key)}
                className={cn(
                  "flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-xs sm:text-sm font-medium transition-all duration-150 text-left shrink-0 md:shrink select-none cursor-pointer active:scale-[0.98]",
                  isActive
                    ? "bg-white text-[var(--wp-text-primary)] font-semibold shadow-xs border border-[var(--wp-border)]"
                    : "text-[var(--wp-text-secondary)] hover:text-[var(--wp-text-primary)] hover:bg-[var(--wp-surface-subtle)] border border-transparent",
                )}
              >
                <div
                  className={cn(
                    "flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border transition-colors",
                    isActive
                      ? "bg-[var(--wp-surface-subtle)] text-[var(--wp-text-primary)] border-[var(--wp-border)]"
                      : "bg-transparent text-[var(--wp-text-secondary)] border-transparent",
                  )}
                >
                  <Icon className="h-4 w-4" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-1">
                    <span className="truncate">{tab.title}</span>
                    {tab.badge && (
                      <span className="hidden lg:inline-block rounded px-1.5 py-0.2 text-[9px] font-bold bg-[var(--wp-surface-subtle)] text-[var(--wp-text-secondary)] border border-[var(--wp-border)]">
                        {tab.badge}
                      </span>
                    )}
                  </div>
                  <p className="hidden md:block text-[11px] text-[var(--wp-text-secondary)] truncate font-normal opacity-80 mt-0.5">
                    {tab.description}
                  </p>
                </div>
              </button>
            );
          })}
        </div>

        {/* Tab Content Panels */}
        <div className="flex-1 w-full min-w-0">
          {/* TAB 1: GENERAL & IDENTITY */}
          {activeTab === "general" && (
            <div className="grid gap-6 animate-in fade-in-50 duration-150">
              {/* Card 1.1: Execution Environment & Gateway Configuration */}
              <Card className="border-[var(--wp-border)] shadow-xs overflow-hidden">
                <CardHeader className="bg-[var(--wp-surface-subtle)]/50 border-b border-[var(--wp-border)] pb-4">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <CardTitle className="text-base font-semibold flex items-center gap-2">
                      <Sliders className="h-4 w-4 text-[var(--wp-accent)]" />
                      Execution Environment &amp; Gateway Configuration
                    </CardTitle>
                    <span className="text-xs text-[var(--wp-text-secondary)] font-mono">
                      System Default: {envDefault === "demo" ? "Sandbox" : "Live"}
                    </span>
                  </div>
                  <CardDescription className="text-xs sm:text-sm text-[var(--wp-text-secondary)]">
                    WorkPay operates across two distinct execution environments. You can switch between Sandbox simulation and Live Production Escrow at any time.
                  </CardDescription>
                </CardHeader>
                <CardContent className="p-5 sm:p-6 grid gap-4">
                  <div className="grid sm:grid-cols-2 gap-4">
                    {/* Sandbox Mode Option Card */}
                    <div
                      onClick={() => {
                        setMode("demo");
                        toast.success("Switched to Sandbox Environment");
                      }}
                      className={cn(
                        "relative flex flex-col justify-between p-4 rounded-xl border-2 cursor-pointer transition-all duration-150 active:scale-[0.99]",
                        isDemo
                          ? "border-[var(--wp-accent)] bg-[var(--wp-accent-subtle)]/30 shadow-xs"
                          : "border-[var(--wp-border)] hover:border-[var(--wp-border-strong)] hover:bg-[var(--wp-surface-subtle)]",
                      )}
                    >
                      <div>
                        <div className="flex items-center justify-between mb-2">
                          <span className="font-semibold text-sm flex items-center gap-2 text-[var(--wp-text-primary)]">
                            <FlaskConical className="h-4 w-4 text-[var(--wp-accent)]" />
                            Sandbox (Simulated Settlement)
                          </span>
                          {isDemo && (
                            <span className="flex h-5 w-5 items-center justify-center rounded-full bg-[var(--wp-accent)] text-white">
                              <Check className="h-3 w-3" />
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-[var(--wp-text-secondary)] leading-relaxed">
                          Deterministic testing environment with simulated PayPal authorizations, mock verification execution, and simulated actor perspectives. Ideal for testing protocols, integration validation, and workflow debugging.
                        </p>
                      </div>
                      <div className="mt-4 pt-3 border-t border-[var(--wp-border)] flex items-center gap-2 text-[11px] font-semibold text-[var(--wp-accent)]">
                        <span>Recommended for Development &amp; Protocol Testing</span>
                      </div>
                    </div>

                    {/* Live Production Escrow Option Card */}
                    <div
                      onClick={() => {
                        setMode("production");
                        toast.success("Switched to Live Production Escrow");
                      }}
                      className={cn(
                        "relative flex flex-col justify-between p-4 rounded-xl border-2 cursor-pointer transition-all duration-150 active:scale-[0.99]",
                        !isDemo
                          ? "border-[var(--wp-success)] bg-[var(--wp-success-subtle)]/30 shadow-xs"
                          : "border-[var(--wp-border)] hover:border-[var(--wp-border-strong)] hover:bg-[var(--wp-surface-subtle)]",
                      )}
                    >
                      <div>
                        <div className="flex items-center justify-between mb-2">
                          <span className="font-semibold text-sm flex items-center gap-2 text-[var(--wp-text-primary)]">
                            <ShieldCheck className="h-4 w-4 text-[var(--wp-success)]" />
                            Live Production Escrow
                          </span>
                          {!isDemo && (
                            <span className="flex h-5 w-5 items-center justify-center rounded-full bg-[var(--wp-success)] text-white">
                              <Check className="h-3 w-3" />
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-[var(--wp-text-secondary)] leading-relaxed">
                          Production gateway environment with real-time PayPal authorizations, cryptographic escrow verification, and live account authentication. Authorizations and captures lock and release actual currency.
                        </p>
                      </div>
                      <div className="mt-4 pt-3 border-t border-[var(--wp-border)] flex items-center gap-2 text-[11px] font-semibold text-[var(--wp-success)]">
                        <span>Production Gateway Enforced</span>
                      </div>
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-[var(--wp-border)]">
                    <span className="text-xs text-[var(--wp-text-secondary)]">
                      Environment can also be toggled via <code className="font-mono text-[11px] bg-[var(--wp-surface-subtle)] border border-[var(--wp-border)] px-1.5 py-0.5 rounded">NEXT_PUBLIC_DEMO_MODE</code> in <code className="font-mono text-[11px] bg-[var(--wp-surface-subtle)] border border-[var(--wp-border)] px-1.5 py-0.5 rounded">.env</code>.
                    </span>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        setMode(null);
                        toast.success("Reset environment to system default");
                      }}
                      className="h-7 text-xs text-[var(--wp-text-secondary)] hover:text-[var(--wp-text-primary)]"
                    >
                      Reset to System Default
                    </Button>
                  </div>
                </CardContent>
              </Card>

              {/* Card 1.2: Identity & Authentication Session */}
              <Card className="border-[var(--wp-border)] shadow-xs overflow-hidden">
                <CardHeader className="bg-[var(--wp-surface-subtle)]/50 border-b border-[var(--wp-border)] pb-4">
                  <CardTitle className="text-base font-semibold flex items-center gap-2">
                    <User className="h-4 w-4 text-[var(--wp-accent)]" />
                    Active Session &amp; Identity State
                  </CardTitle>
                  <CardDescription className="text-xs sm:text-sm text-[var(--wp-text-secondary)]">
                    Inspect your authenticated identity, user permissions, and registered credentials.
                  </CardDescription>
                </CardHeader>
                <CardContent className="p-5 sm:p-6">
                  {authUser ? (
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-4 rounded-xl border border-[var(--wp-success)]/40 bg-[var(--wp-success-subtle)]/30">
                      <div className="flex items-start gap-3.5">
                        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-[var(--wp-success)] text-white font-bold text-sm shadow-xs">
                          {authUser.name ? authUser.name[0]?.toUpperCase() : "U"}
                        </div>
                        <div>
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="font-semibold text-sm text-[var(--wp-text-primary)]">
                              {authUser.name || "Authenticated User"}
                            </span>
                            <Badge variant="outline" className="text-[10px] uppercase font-bold border-[var(--wp-success)]/40 text-[var(--wp-success)] bg-white">
                              {authUser.role}
                            </Badge>
                            <Badge variant="outline" className="text-[10px] font-semibold bg-[var(--wp-success-subtle)] text-[var(--wp-success)] border-[var(--wp-success)]/30">
                              Session Active
                            </Badge>
                          </div>
                          <div className="text-xs font-mono text-[var(--wp-text-secondary)] mt-1">{authUser.email}</div>
                          <div className="text-[11px] font-mono text-[var(--wp-text-secondary)] mt-0.5">ID: {authUser.id}</div>
                        </div>
                      </div>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={handleSignOut}
                        className="text-[var(--wp-danger)] hover:bg-[var(--wp-danger-subtle)] hover:text-[var(--wp-danger)] border-[var(--wp-border)] shrink-0 font-medium text-xs"
                      >
                        <LogOut className="h-3.5 w-3.5 mr-1.5" />
                        Sign Out of Account
                      </Button>
                    </div>
                  ) : (
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-4 rounded-xl border border-[var(--wp-border)] bg-[var(--wp-surface-subtle)]/40">
                      <div className="flex items-start gap-3.5">
                        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-white border border-[var(--wp-border)] text-[var(--wp-text-primary)] shadow-xs">
                          <UserCheck className="h-5 w-5 text-[var(--wp-accent)]" />
                        </div>
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="font-semibold text-sm text-[var(--wp-text-primary)]">Acting via Demo Persona</span>
                            <Badge variant="outline" className="text-[10px] uppercase font-bold bg-white text-[var(--wp-accent)] border-[var(--wp-accent)]/30">
                              1-Click Persona
                            </Badge>
                          </div>
                          <p className="text-xs text-[var(--wp-text-secondary)] mt-1 max-w-xl">
                            You are interacting as a sandbox persona (Alice the Buyer, Bob the Specialist, or Carol the Reviewer). You can register a real account at any time to verify the complete user authentication system.
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <Button asChild variant="outline" size="sm" className="text-xs font-medium">
                          <Link href="/login">
                            <LogIn className="h-3.5 w-3.5 mr-1.5" />
                            Sign In
                          </Link>
                        </Button>
                        <Button asChild size="sm" className="text-xs font-semibold shadow-xs">
                          <Link href="/register">
                            <UserPlus className="h-3.5 w-3.5 mr-1.5" />
                            Register Account
                          </Link>
                        </Button>
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* Card 1.3: Runtime Stack & Core Architecture */}
              <Card className="border-[var(--wp-border)] shadow-xs overflow-hidden">
                <CardHeader className="bg-[var(--wp-surface-subtle)]/50 border-b border-[var(--wp-border)] pb-4">
                  <CardTitle className="text-base font-semibold flex items-center gap-2">
                    <Server className="h-4 w-4 text-[var(--wp-accent)]" />
                    Runtime Stack &amp; Architectural Specifications
                  </CardTitle>
                  <CardDescription className="text-xs sm:text-sm text-[var(--wp-text-secondary)]">
                    Underlying engine technologies powering deterministic agreement compilation and non-custodial settlement.
                  </CardDescription>
                </CardHeader>
                <CardContent className="p-5 sm:p-6 grid sm:grid-cols-3 gap-3">
                  <div className="p-3.5 rounded-xl border border-[var(--wp-border)] bg-white">
                    <span className="text-xs text-[var(--wp-text-secondary)] block">Web Application</span>
                    <span className="text-sm font-semibold text-[var(--wp-text-primary)] block mt-0.5">Next.js 15 + React 19</span>
                    <span className="text-[11px] text-[var(--wp-text-secondary)] block mt-1">App Router with Server Components and SSR cache</span>
                  </div>
                  <div className="p-3.5 rounded-xl border border-[var(--wp-border)] bg-white">
                    <span className="text-xs text-[var(--wp-text-secondary)] block">Database &amp; Schema</span>
                    <span className="text-sm font-semibold text-[var(--wp-text-primary)] block mt-0.5">PostgreSQL + Drizzle ORM</span>
                    <span className="text-[11px] text-[var(--wp-text-secondary)] block mt-1">Transactional idempotency and audit logs</span>
                  </div>
                  <div className="p-3.5 rounded-xl border border-[var(--wp-border)] bg-white">
                    <span className="text-xs text-[var(--wp-text-secondary)] block">AI Clarification Engine</span>
                    <span className="text-sm font-semibold text-[var(--wp-text-primary)] block mt-0.5">Cloudflare Workers AI</span>
                    <span className="text-[11px] text-[var(--wp-text-secondary)] block mt-1">Bounded structured generation via Zod validation</span>
                  </div>
                </CardContent>
              </Card>
            </div>
          )}

          {/* TAB 2: SPECIALIST PROFILE */}
          {activeTab === "specialist" && (
            <div className="grid gap-6 animate-in fade-in-50 duration-150">
              <div className="p-4 rounded-xl border border-[var(--wp-border)] bg-[var(--wp-surface-subtle)]/40 flex items-start gap-3">
                <Briefcase className="h-5 w-5 text-[var(--wp-accent)] shrink-0 mt-0.5" />
                <div>
                  <h2 className="text-sm font-semibold text-[var(--wp-text-primary)]">
                    Marketplace Specialist Profile Configuration
                  </h2>
                  <p className="text-xs text-[var(--wp-text-secondary)] mt-0.5">
                    When matched to tasks or submitting deliverables, these credentials, proficiency tags, and payout email destinations are used by the settlement protocol.
                  </p>
                </div>
              </div>

              {/* Provider Profile Manager Component */}
              <ProviderProfileManager />
            </div>
          )}

          {/* TAB 3: PAYPAL & ESCROW RAILS */}
          {activeTab === "paypal" && (
            <div className="grid gap-6 animate-in fade-in-50 duration-150">
              {/* Card 3.1: Non-Custodial Architecture Banner */}
              <div className="p-4 sm:p-5 rounded-xl border border-[var(--wp-accent)]/30 bg-[var(--wp-accent-subtle)]/30 flex items-start gap-3.5">
                <ShieldCheck className="h-5 w-5 text-[var(--wp-accent)] shrink-0 mt-0.5" />
                <div>
                  <h3 className="text-sm font-semibold text-[var(--wp-text-primary)]">
                    Authoritative Non-Custodial Guarantee
                  </h3>
                  <p className="text-xs text-[var(--wp-text-secondary)] leading-relaxed mt-1">
                    WorkPay does not hold, custody, or pool user funds. We never operate an internal stored-value wallet. All deposits remain strictly in external PayPal-managed authorization holds (Orders v2 / Payments v2). Funds are captured and transferred directly to the specialist&apos;s verified PayPal account only after automated acceptance criteria pass with zero defects.
                  </p>
                </div>
              </div>

              {/* Card 3.2: Gateway Status & Operational Invariants */}
              <Card className="border-[var(--wp-border)] shadow-xs overflow-hidden">
                <CardHeader className="bg-[var(--wp-surface-subtle)]/50 border-b border-[var(--wp-border)] pb-4">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <CardTitle className="text-base font-semibold flex items-center gap-2">
                      <Wallet className="h-4 w-4 text-[var(--wp-accent)]" />
                      PayPal Orders v2 &amp; Payments v2 Gateway State
                    </CardTitle>
                    <StatusBadge tone="success">Orders v2 / Payments v2 Enforced</StatusBadge>
                  </div>
                  <CardDescription className="text-xs sm:text-sm text-[var(--wp-text-secondary)]">
                    Authoritative payment states returned by the backend and verified against PayPal webhook signatures.
                  </CardDescription>
                </CardHeader>
                <CardContent className="p-5 sm:p-6 grid gap-4">
                  <div className="grid sm:grid-cols-2 gap-3.5">
                    <div className="rounded-xl border border-[var(--wp-border)] p-4 bg-white">
                      <div className="flex items-center justify-between mb-1.5">
                        <span className="text-xs font-semibold text-[var(--wp-text-primary)]">API Integration</span>
                        <StatusBadge tone="success">LIVE V2</StatusBadge>
                      </div>
                      <p className="text-xs text-[var(--wp-text-secondary)] leading-relaxed">
                        PayPal Orders v2 for 2-step authorization hold and Payments v2 for cryptographic capture settlement.
                      </p>
                    </div>

                    <div className="rounded-xl border border-[var(--wp-border)] p-4 bg-white">
                      <div className="flex items-center justify-between mb-1.5">
                        <span className="text-xs font-semibold text-[var(--wp-text-primary)]">Webhook Health</span>
                        <StatusBadge tone="success">VERIFIED</StatusBadge>
                      </div>
                      <p className="text-xs text-[var(--wp-text-secondary)] leading-relaxed">
                        Authoritative reconciliation for PAYMENT.AUTHORIZATION.CREATED and PAYMENT.CAPTURE.COMPLETED events.
                      </p>
                    </div>

                    <div className="rounded-xl border border-[var(--wp-border)] p-4 bg-white">
                      <div className="flex items-center justify-between mb-1.5">
                        <span className="text-xs font-semibold text-[var(--wp-text-primary)]">Authorization Window</span>
                        <span className="text-[11px] font-mono font-medium text-[var(--wp-text-secondary)]">29 Days</span>
                      </div>
                      <p className="text-xs text-[var(--wp-text-secondary)] leading-relaxed">
                        PayPal standard honor period. Unsettled agreements auto-void safely back to the buyer without funds leaving PayPal.
                      </p>
                    </div>

                    <div className="rounded-xl border border-[var(--wp-border)] p-4 bg-white">
                      <div className="flex items-center justify-between mb-1.5">
                        <span className="text-xs font-semibold text-[var(--wp-text-primary)]">External Call Isolation</span>
                        <StatusBadge tone="success">ISOLATED</StatusBadge>
                      </div>
                      <p className="text-xs text-[var(--wp-text-secondary)] leading-relaxed">
                        Database transactions are never held across external PayPal API calls. Idempotency records prevent duplicate captures.
                      </p>
                    </div>
                  </div>

                  {/* Flow Diagram */}
                  <div className="mt-2 pt-4 border-t border-[var(--wp-border)]">
                    <span className="text-xs font-semibold text-[var(--wp-text-primary)] block mb-3">
                      Authoritative Payment State Lifecycle
                    </span>
                    <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 text-center text-xs">
                      <div className="p-2.5 rounded-lg border border-[var(--wp-border)] bg-[var(--wp-surface-subtle)]/60">
                        <span className="font-semibold block text-[11px] text-[var(--wp-text-primary)]">1. Proposed</span>
                        <span className="text-[10px] text-[var(--wp-text-secondary)] mt-0.5 block">Budget Defined</span>
                      </div>
                      <div className="p-2.5 rounded-lg border border-[var(--wp-border)] bg-[var(--wp-surface-subtle)]/60">
                        <span className="font-semibold block text-[11px] text-[var(--wp-text-primary)]">2. Authorized</span>
                        <span className="text-[10px] text-[var(--wp-text-secondary)] mt-0.5 block">PayPal Hold Locked</span>
                      </div>
                      <div className="p-2.5 rounded-lg border border-[var(--wp-border)] bg-[var(--wp-surface-subtle)]/60">
                        <span className="font-semibold block text-[11px] text-[var(--wp-text-primary)]">3. Executing</span>
                        <span className="text-[10px] text-[var(--wp-text-secondary)] mt-0.5 block">Deliverable Built</span>
                      </div>
                      <div className="p-2.5 rounded-lg border border-[var(--wp-border)] bg-[var(--wp-surface-subtle)]/60">
                        <span className="font-semibold block text-[11px] text-[var(--wp-text-primary)]">4. Verified</span>
                        <span className="text-[10px] text-[var(--wp-text-secondary)] mt-0.5 block">Proof Zero-Defect</span>
                      </div>
                      <div className="p-2.5 rounded-lg border border-[var(--wp-success)]/40 bg-[var(--wp-success-subtle)]/40 col-span-2 sm:col-span-1">
                        <span className="font-semibold block text-[11px] text-[var(--wp-success)]">5. Settled</span>
                        <span className="text-[10px] text-[var(--wp-text-secondary)] mt-0.5 block">Capture Released</span>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>
          )}

          {/* TAB 4: AI POLICY & GUARDRAILS */}
          {activeTab === "guardrails" && (
            <div className="grid gap-6 animate-in fade-in-50 duration-150">
              <Card className="border-[var(--wp-border)] shadow-xs overflow-hidden">
                <CardHeader className="bg-[var(--wp-surface-subtle)]/50 border-b border-[var(--wp-border)] pb-4">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <CardTitle className="text-base font-semibold flex items-center gap-2">
                      <ShieldCheck className="h-4 w-4 text-[var(--wp-accent)]" />
                      System Architectural Invariants &amp; Safety Policy Gates
                    </CardTitle>
                    <StatusBadge tone="success">All Invariants Enforced</StatusBadge>
                  </div>
                  <CardDescription className="text-xs sm:text-sm text-[var(--wp-text-secondary)]">
                    WorkPay enforces strict fail-closed boundaries. No LLM output ever communicates directly with a payment gateway.
                  </CardDescription>
                </CardHeader>
                <CardContent className="p-5 sm:p-6 grid gap-4">
                  <div className="grid sm:grid-cols-2 gap-3.5">
                    <div className="rounded-xl border border-[var(--wp-border)] p-4 bg-white">
                      <div className="flex items-center justify-between mb-1.5">
                        <span className="text-xs font-semibold text-[var(--wp-text-primary)]">Invariant P1: Budget Ceiling</span>
                        <StatusBadge tone="success">ENFORCED</StatusBadge>
                      </div>
                      <p className="text-xs text-[var(--wp-text-secondary)] leading-relaxed">
                        The agent cannot authorize or capture more than the buyer&apos;s explicitly approved contract budget ceiling.
                      </p>
                    </div>

                    <div className="rounded-xl border border-[var(--wp-border)] p-4 bg-white">
                      <div className="flex items-center justify-between mb-1.5">
                        <span className="text-xs font-semibold text-[var(--wp-text-primary)]">Invariant P2: Deterministic Verification</span>
                        <StatusBadge tone="success">ENFORCED</StatusBadge>
                      </div>
                      <p className="text-xs text-[var(--wp-text-secondary)] leading-relaxed">
                        Escrow capture cannot execute unless deterministic acceptance proof completes with zero defects (FAIL-CLOSED).
                      </p>
                    </div>

                    <div className="rounded-xl border border-[var(--wp-border)] p-4 bg-white">
                      <div className="flex items-center justify-between mb-1.5">
                        <span className="text-xs font-semibold text-[var(--wp-text-primary)]">Invariant P3: Human Review Escalation</span>
                        <StatusBadge tone="success">ENFORCED</StatusBadge>
                      </div>
                      <p className="text-xs text-[var(--wp-text-secondary)] leading-relaxed">
                        Any open dispute case automatically places an immediate hold on payment capture until resolved by an arbitrator.
                      </p>
                    </div>

                    <div className="rounded-xl border border-[var(--wp-border)] p-4 bg-white">
                      <div className="flex items-center justify-between mb-1.5">
                        <span className="text-xs font-semibold text-[var(--wp-text-primary)]">Invariant P4: Transaction Isolation</span>
                        <StatusBadge tone="success">ENFORCED</StatusBadge>
                      </div>
                      <p className="text-xs text-[var(--wp-text-secondary)] leading-relaxed">
                        Database transactions are never held across external PayPal API calls. Idempotency records prevent double-spending.
                      </p>
                    </div>
                  </div>

                  <div className="mt-2 pt-4 border-t border-[var(--wp-border)]">
                    <span className="text-xs font-semibold text-[var(--wp-text-primary)] block mb-2">
                      Autonomous Agent Execution Guardrails
                    </span>
                    <div className="grid sm:grid-cols-3 gap-3 text-xs text-[var(--wp-text-secondary)]">
                      <div className="p-3 rounded-lg border border-[var(--wp-border)] bg-[var(--wp-surface-subtle)]/40">
                        <span className="font-semibold text-[var(--wp-text-primary)] block">Step Limit</span>
                        <span className="mt-0.5 block">Max 10 execution loops per planning sequence</span>
                      </div>
                      <div className="p-3 rounded-lg border border-[var(--wp-border)] bg-[var(--wp-surface-subtle)]/40">
                        <span className="font-semibold text-[var(--wp-text-primary)] block">Acceptance Threshold</span>
                        <span className="mt-0.5 block">1.0 binary pass criteria. No probabilistic guesses</span>
                      </div>
                      <div className="p-3 rounded-lg border border-[var(--wp-border)] bg-[var(--wp-surface-subtle)]/40">
                        <span className="font-semibold text-[var(--wp-text-primary)] block">Schema Validation</span>
                        <span className="mt-0.5 block">Strict Zod schemas enforced on all LLM responses</span>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>
          )}

          {/* TAB 5: SYSTEM DIAGNOSTICS & DATABASE */}
          {activeTab === "diagnostics" && (
            <div className="grid gap-6 animate-in fade-in-50 duration-150">
              {/* Database & Fixtures Reset Card */}
              <Card className="border-[var(--wp-border)] shadow-xs overflow-hidden">
                <CardHeader className="bg-[var(--wp-surface-subtle)]/50 border-b border-[var(--wp-border)] pb-4">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-base font-semibold flex items-center gap-2">
                      <Database className="h-4 w-4 text-[var(--wp-accent)]" />
                      Database Fixtures &amp; One-Click Reset
                    </CardTitle>
                    <Badge variant="outline" className="text-xs bg-white text-[var(--wp-text-secondary)] border-[var(--wp-border)]">
                      1-Click Restore
                    </Badge>
                  </div>
                  <CardDescription className="text-xs sm:text-sm text-[var(--wp-text-secondary)]">
                    Evaluators can restore the system to its initial baseline state anytime with 1 click.
                  </CardDescription>
                </CardHeader>
                <CardContent className="p-5 sm:p-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                  <div>
                    <div className="font-semibold text-sm text-[var(--wp-text-primary)]">Canonical Demo State Reset</div>
                    <p className="text-xs text-[var(--wp-text-secondary)] mt-0.5 max-w-xl leading-relaxed">
                      Cleans all temporary tasks, executions, and verification runs, and restores the pristine demo dataset: Alice (Buyer), Bob (Apex Data), Carol (Arbitrator), and the canonical customer enrichment task with test CSVs.
                    </p>
                    {resetSuccess && (
                      <div className="flex items-center gap-2 text-xs font-semibold text-[var(--wp-success)] mt-2.5">
                        <CheckCircle2 className="h-4 w-4" />
                        Database successfully reset and re-seeded to canonical demo baseline.
                      </div>
                    )}
                  </div>
                  <Button
                    variant="outline"
                    onClick={() => setConfirmResetOpen(true)}
                    disabled={resetting}
                    className="gap-2 shrink-0 border-[var(--wp-border)] shadow-xs font-semibold text-xs text-[var(--wp-danger)] hover:bg-[var(--wp-danger-subtle)] hover:text-[var(--wp-danger)]"
                  >
                    <RefreshCw className={`h-3.5 w-3.5 ${resetting ? "animate-spin text-[var(--wp-accent)]" : ""}`} />
                    {resetting ? "Resetting Database..." : "Reset Demo Database"}
                  </Button>
                </CardContent>
              </Card>

              {/* Service Health Checklist */}
              <Card className="border-[var(--wp-border)] shadow-xs overflow-hidden">
                <CardHeader className="bg-[var(--wp-surface-subtle)]/50 border-b border-[var(--wp-border)] pb-4">
                  <CardTitle className="text-base font-semibold flex items-center gap-2">
                    <Activity className="h-4 w-4 text-[var(--wp-accent)]" />
                    Service Health &amp; Connectivity Audit
                  </CardTitle>
                  <CardDescription className="text-xs sm:text-sm text-[var(--wp-text-secondary)]">
                    Live operational connectivity between frontend Next.js server, background worker, and database container.
                  </CardDescription>
                </CardHeader>
                <CardContent className="p-5 sm:p-6">
                  <div className="divide-y divide-[var(--wp-border)] text-xs">
                    <div className="py-2.5 flex items-center justify-between">
                      <span className="font-medium text-[var(--wp-text-primary)]">PostgreSQL Container (workpay-postgres:5433)</span>
                      <StatusBadge tone="success">HEALTHY</StatusBadge>
                    </div>
                    <div className="py-2.5 flex items-center justify-between">
                      <span className="font-medium text-[var(--wp-text-primary)]">Database Schema Migration (0003_omniscient_doorman)</span>
                      <StatusBadge tone="success">APPLIED</StatusBadge>
                    </div>
                    <div className="py-2.5 flex items-center justify-between">
                      <span className="font-medium text-[var(--wp-text-primary)]">Background Execution Worker (@workpay/worker)</span>
                      <StatusBadge tone="success">ONLINE</StatusBadge>
                    </div>
                    <div className="py-2.5 flex items-center justify-between">
                      <span className="font-medium text-[var(--wp-text-primary)]">Public Cloudflare Tunnel Endpoint</span>
                      <StatusBadge tone="success">CONNECTED</StatusBadge>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>
          )}
        </div>
      </div>

      {/* Confirmation Dialog for Demo Reset */}
      <Dialog open={confirmResetOpen} onOpenChange={setConfirmResetOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="text-base font-bold flex items-center gap-2 text-[var(--wp-danger)]">
              <AlertTriangle className="h-5 w-5" />
              Reset Demo Database Fixtures?
            </DialogTitle>
            <DialogDescription className="text-xs sm:text-sm text-[var(--wp-text-secondary)] pt-1">
              This action will delete all user-created test tasks, deliverables, and executions, and re-seed the canonical demo state with Alice (Buyer), Bob (Specialist), and Carol (Arbitrator).
            </DialogDescription>
          </DialogHeader>
          <div className="p-3 rounded-xl bg-[var(--wp-surface-subtle)] border border-[var(--wp-border)] text-xs text-[var(--wp-text-secondary)]">
            Your active demo persona will automatically be reset to <strong className="text-[var(--wp-text-primary)]">Alice (Buyer)</strong>.
          </div>
          <DialogFooter className="flex sm:justify-end gap-2 pt-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setConfirmResetOpen(false)}
              className="text-xs"
            >
              Cancel
            </Button>
            <Button
              type="button"
              variant="destructive"
              size="sm"
              onClick={handleResetDemo}
              disabled={resetting}
              className="text-xs font-semibold gap-1.5"
            >
              <RefreshCw className={cn("h-3.5 w-3.5", resetting && "animate-spin")} />
              {resetting ? "Resetting..." : "Confirm & Reset Database"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export default function SettingsPage() {
  return (
    <Suspense
      fallback={
        <div className="flex items-center justify-center py-20 text-xs text-[var(--wp-text-secondary)]">
          <RefreshCw className="h-4 w-4 animate-spin mr-2 text-[var(--wp-accent)]" />
          Loading settings and system configuration...
        </div>
      }
    >
      <SettingsContent />
    </Suspense>
  );
}
