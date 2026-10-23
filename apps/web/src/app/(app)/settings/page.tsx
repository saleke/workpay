"use client";

import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import {
  Activity,
  AlertCircle,
  AlertTriangle,
  ArrowRight,
  Bell,
  Briefcase,
  Check,
  CheckCircle2,
  ChevronRight,
  Clock,
  Cpu,
  Database,
  ExternalLink,
  FileCheck,
  FlaskConical,
  KeyRound,
  Layers,
  Lock,
  LogIn,
  LogOut,
  Mail,
  RefreshCw,
  Scale,
  Server,
  Shield,
  ShieldAlert,
  ShieldCheck,
  Sliders,
  Sparkles,
  User,
  UserCheck,
  UserPlus,
  Wallet,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { StatusBadge } from "@/components/ui/status-badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import { useSystemMode } from "@/lib/mode";
import { ProviderProfileManager } from "@/components/provider/provider-profile-manager";
import { cn } from "@/lib/utils";

type SettingsTabKey =
  | "account"
  | "work-preferences"
  | "paypal"
  | "ai-authority"
  | "notifications"
  | "security";

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
    key: "account",
    title: "Account & Identity",
    shortTitle: "Account",
    description: "User profile, active session, and dual-role participation",
    icon: User,
  },
  {
    key: "work-preferences",
    title: "Work Preferences & Capabilities",
    shortTitle: "Work Preferences",
    description: "Skills, availability schedule, capacity, pricing, and rules",
    icon: Briefcase,
    badge: "Core",
  },
  {
    key: "paypal",
    title: "PayPal Connection & Rails",
    shortTitle: "PayPal & Payments",
    description: "Non-custodial authorization holds and capture eligibility",
    icon: Wallet,
    badge: "Non-Custodial",
  },
  {
    key: "ai-authority",
    title: "AI Authority & User Control",
    shortTitle: "AI Control",
    description: "Invariants P1 to P4, spending boundaries, and human sign-off",
    icon: ShieldCheck,
    badge: "Fail-Closed",
  },
  {
    key: "notifications",
    title: "Notifications & Alerts",
    shortTitle: "Notifications",
    description: "Alert preferences for verifications, revisions, and settlements",
    icon: Bell,
  },
  {
    key: "security",
    title: "Sandbox & System Health",
    shortTitle: "System & Sandbox",
    description: "Runtime environment, service health, and baseline reset",
    icon: Server,
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
    rawTab && SETTINGS_TABS.some((t) => t.key === rawTab) ? rawTab : "account";

  const [activeTab, setActiveTab] = useState<SettingsTabKey>(initialTab);
  const { isDemo, setMode, envDefault } = useSystemMode();
  const [authUser, setAuthUser] = useState<AuthUser | null>(null);
  const [resetting, setResetting] = useState(false);
  const [confirmResetOpen, setConfirmResetOpen] = useState(false);

  // Notification toggles
  const [notifyTaskOffers, setNotifyTaskOffers] = useState(true);
  const [notifyVerificationResults, setNotifyVerificationResults] = useState(true);
  const [notifyRevisions, setNotifyRevisions] = useState(true);
  const [notifyPayments, setNotifyPayments] = useState(true);
  const [notifyDisputes, setNotifyDisputes] = useState(true);

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
        // Ignore parse error
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
    try {
      const res = await fetch("/api/v1/demo/reset", { method: "POST" });
      if (res.ok) {
        window.localStorage.removeItem("workpay_auth_user");
        setAuthUser(null);
        window.localStorage.setItem("workpay_persona", "buyer");
        document.cookie = `workpay_persona=buyer; path=/; max-age=31536000`;
        setConfirmResetOpen(false);
        toast.success("Database restored to canonical demo baseline");
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
      // Ignore error
    }
    window.localStorage.removeItem("workpay_auth_user");
    setAuthUser(null);
    toast.success("Signed out successfully");
    window.location.reload();
  };

  return (
    <div className="flex flex-col gap-6 max-w-6xl pb-16 font-sans">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-3 border-b border-[var(--wp-border)]">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-[var(--wp-text-primary)]">
            System &amp; Workspace Settings
          </h1>
          <p className="text-xs sm:text-sm text-[var(--wp-text-secondary)] mt-0.5">
            Manage your account identity, worker preferences, non-custodial PayPal payment rails, and AI authority boundaries.
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
            {isDemo ? "Sandbox Environment" : "Live Production Escrow"}
          </Badge>
        </div>
      </div>

      {/* Settings Sub-Navigation & Main Workspace */}
      <div className="flex flex-col md:flex-row gap-6 items-start">
        {/* Navigation Sidebar */}
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

        {/* Tab Content Panel */}
        <div className="flex-1 w-full min-w-0">
          {/* TAB 1: ACCOUNT & IDENTITY */}
          {activeTab === "account" && (
            <div className="grid gap-6 animate-in fade-in-50 duration-150">
              {/* Dual-Role Identity Explanation Card */}
              <div className="p-4 sm:p-5 rounded-xl border border-[var(--wp-border)] bg-white shadow-xs flex items-start gap-3.5">
                <UserCheck className="h-5 w-5 text-[var(--wp-accent)] shrink-0 mt-0.5" />
                <div>
                  <h2 className="text-sm font-semibold text-[var(--wp-text-primary)]">
                    Unified Dual-Role Participation Model
                  </h2>
                  <p className="text-xs text-[var(--wp-text-secondary)] leading-relaxed mt-1">
                    WorkPay does not force you into a permanent buyer or worker identity. With a single account, you can commission work (define goals, review specifications, authorize payment holds) and perform work (declare capabilities, accept tasks, submit deliverables, receive verified settlements).
                  </p>
                </div>
              </div>

              {/* Active Session & Authentication State */}
              <Card className="border-[var(--wp-border)] shadow-xs overflow-hidden">
                <CardHeader className="bg-[var(--wp-surface-subtle)]/50 border-b border-[var(--wp-border)] pb-4">
                  <CardTitle className="text-base font-semibold flex items-center gap-2">
                    <User className="h-4 w-4 text-[var(--wp-accent)]" />
                    Active Authentication Session
                  </CardTitle>
                  <CardDescription className="text-xs sm:text-sm text-[var(--wp-text-secondary)]">
                    Inspect your authenticated account credentials or active sandbox demo persona.
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
                          <div className="text-[11px] font-mono text-[var(--wp-text-secondary)] mt-0.5">User ID: {authUser.id}</div>
                        </div>
                      </div>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={handleSignOut}
                        className="text-[var(--wp-danger)] hover:bg-[var(--wp-danger-subtle)] hover:text-[var(--wp-danger)] border-[var(--wp-border)] shrink-0 font-medium text-xs"
                      >
                        <LogOut className="h-3.5 w-3.5 mr-1.5" />
                        Sign Out
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
                            You are interacting as a sandbox persona (Alice the Task Owner, Bob the Specialist, or Carol the Reviewer). You can register a personal account at any time to test production identity and custom authentication.
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

              {/* Password & Security State */}
              <Card className="border-[var(--wp-border)] shadow-xs overflow-hidden">
                <CardHeader className="bg-[var(--wp-surface-subtle)]/50 border-b border-[var(--wp-border)] pb-4">
                  <CardTitle className="text-base font-semibold flex items-center gap-2">
                    <KeyRound className="h-4 w-4 text-[var(--wp-accent)]" />
                    Security &amp; Session Encryption
                  </CardTitle>
                  <CardDescription className="text-xs sm:text-sm text-[var(--wp-text-secondary)]">
                    Password hashing, session cookies, and cryptographic API tokens.
                  </CardDescription>
                </CardHeader>
                <CardContent className="p-5 sm:p-6 text-xs text-[var(--wp-text-secondary)] space-y-2">
                  <div className="flex items-center justify-between py-1.5 border-b border-[var(--wp-border)]">
                    <span>Password Hash Encryption</span>
                    <span className="font-mono text-[11px] text-[var(--wp-text-primary)] font-medium">bcrypt (12 rounds)</span>
                  </div>
                  <div className="flex items-center justify-between py-1.5 border-b border-[var(--wp-border)]">
                    <span>Session Cookie Security</span>
                    <span className="font-mono text-[11px] text-[var(--wp-text-primary)] font-medium">HttpOnly, SameSite=Lax</span>
                  </div>
                  <div className="flex items-center justify-between py-1.5">
                    <span>Authoritative State Store</span>
                    <span className="font-mono text-[11px] text-[var(--wp-text-primary)] font-medium">PostgreSQL (Users Table)</span>
                  </div>
                </CardContent>
              </Card>
            </div>
          )}

          {/* TAB 2: WORK PREFERENCES & CAPABILITIES */}
          {activeTab === "work-preferences" && (
            <div className="grid gap-6 animate-in fade-in-50 duration-150">
              <ProviderProfileManager />
            </div>
          )}

          {/* TAB 3: PAYPAL CONNECTION & PAYMENT RAILS */}
          {activeTab === "paypal" && (
            <div className="grid gap-6 animate-in fade-in-50 duration-150">
              {/* Audited Non-Custodial Architecture Banner */}
              <div className="p-4 sm:p-5 rounded-xl border border-[var(--wp-accent)]/30 bg-[var(--wp-accent-subtle)]/30 flex items-start gap-3.5">
                <ShieldCheck className="h-5 w-5 text-[var(--wp-accent)] shrink-0 mt-0.5" />
                <div>
                  <h3 className="text-sm font-semibold text-[var(--wp-text-primary)]">
                    Authoritative Non-Custodial Payment Architecture
                  </h3>
                  <p className="text-xs text-[var(--wp-text-secondary)] leading-relaxed mt-1">
                    WorkPay is strictly non-custodial. WorkPay never holds user funds, pools balances, or operates a digital wallet. Buyer payments are placed in an external authorization hold through PayPal Orders v2. Funds remain on the buyer&apos;s payment instrument until deliverable verification passes and settlement policy confirms eligibility.
                  </p>
                </div>
              </div>

              {/* Distinct Payment Stages Explanation */}
              <Card className="border-[var(--wp-border)] shadow-xs overflow-hidden">
                <CardHeader className="bg-[var(--wp-surface-subtle)]/50 border-b border-[var(--wp-border)] pb-4">
                  <CardTitle className="text-base font-semibold flex items-center gap-2">
                    <Scale className="h-4 w-4 text-[var(--wp-accent)]" />
                    Distinct Economic Stages: Proof vs Settlement
                  </CardTitle>
                  <CardDescription className="text-xs sm:text-sm text-[var(--wp-text-secondary)]">
                    In WorkPay, verification does not automatically equal settlement. The backend enforces distinct stages before any currency moves.
                  </CardDescription>
                </CardHeader>
                <CardContent className="p-5 sm:p-6 grid gap-4">
                  <div className="grid sm:grid-cols-2 gap-3.5 text-xs">
                    <div className="p-4 rounded-xl border border-[var(--wp-border)] bg-white">
                      <div className="flex items-center justify-between mb-1">
                        <span className="font-semibold text-[var(--wp-text-primary)]">1. Verification Outcome</span>
                        <StatusBadge tone="success">EVIDENCE TEST</StatusBadge>
                      </div>
                      <p className="text-[11px] text-[var(--wp-text-secondary)] leading-relaxed mt-1">
                        Submitted deliverables are evaluated against agreed acceptance criteria. Produces PASS, FAIL, or UNCERTAIN. A passing verification confirms quality, but does not move money on its own.
                      </p>
                    </div>

                    <div className="p-4 rounded-xl border border-[var(--wp-border)] bg-white">
                      <div className="flex items-center justify-between mb-1">
                        <span className="font-semibold text-[var(--wp-text-primary)]">2. Settlement Eligibility</span>
                        <StatusBadge tone="success">POLICY GATE</StatusBadge>
                      </div>
                      <p className="text-[11px] text-[var(--wp-text-secondary)] leading-relaxed mt-1">
                        Deterministic policy evaluation verifies that the contract budget ceiling is respected, the contract version is current, no blocking dispute case exists, and the payment is in AUTHORIZED status.
                      </p>
                    </div>

                    <div className="p-4 rounded-xl border border-[var(--wp-border)] bg-white">
                      <div className="flex items-center justify-between mb-1">
                        <span className="font-semibold text-[var(--wp-text-primary)]">3. Capture Initiation</span>
                        <StatusBadge tone="attention">EXTERNAL DISPATCH</StatusBadge>
                      </div>
                      <p className="text-[11px] text-[var(--wp-text-secondary)] leading-relaxed mt-1">
                        The backend dispatches an authenticated capture call to the PayPal Payments v2 API using a stable idempotency key to prevent accidental duplicate charges.
                      </p>
                    </div>

                    <div className="p-4 rounded-xl border border-[var(--wp-border)] bg-white">
                      <div className="flex items-center justify-between mb-1">
                        <span className="font-semibold text-[var(--wp-text-primary)]">4. Confirmed Payment</span>
                        <StatusBadge tone="success">AUTHORITATIVE</StatusBadge>
                      </div>
                      <p className="text-[11px] text-[var(--wp-text-secondary)] leading-relaxed mt-1">
                        PayPal webhook or API response confirms COMPLETED status. The task state transitions to completed only after authoritative confirmation.
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* PayPal API Parameters */}
              <Card className="border-[var(--wp-border)] shadow-xs overflow-hidden">
                <CardHeader className="bg-[var(--wp-surface-subtle)]/50 border-b border-[var(--wp-border)] pb-4">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-base font-semibold flex items-center gap-2">
                      <Wallet className="h-4 w-4 text-[var(--wp-accent)]" />
                      PayPal Gateway Connection &amp; Health
                    </CardTitle>
                    <StatusBadge tone="success">Orders v2 / Payments v2 Enforced</StatusBadge>
                  </div>
                  <CardDescription className="text-xs sm:text-sm text-[var(--wp-text-secondary)]">
                    Authoritative connection details for external payment operations.
                  </CardDescription>
                </CardHeader>
                <CardContent className="p-5 sm:p-6">
                  <div className="divide-y divide-[var(--wp-border)] text-xs">
                    <div className="py-2.5 flex items-center justify-between">
                      <span className="text-[var(--wp-text-secondary)]">Payment Rails Engine</span>
                      <span className="font-mono font-medium text-[var(--wp-text-primary)]">PayPal REST API v2 (Orders &amp; Payments)</span>
                    </div>
                    <div className="py-2.5 flex items-center justify-between">
                      <span className="text-[var(--wp-text-secondary)]">Authorization Honor Period</span>
                      <span className="font-mono font-medium text-[var(--wp-text-primary)]">29 Days (Auto-void safe)</span>
                    </div>
                    <div className="py-2.5 flex items-center justify-between">
                      <span className="text-[var(--wp-text-secondary)]">Webhook Signature Verification</span>
                      <span className="font-mono font-medium text-[var(--wp-text-primary)]">Enabled (Raw payload digest check)</span>
                    </div>
                    <div className="py-2.5 flex items-center justify-between">
                      <span className="text-[var(--wp-text-secondary)]">Supported Currency</span>
                      <span className="font-mono font-medium text-[var(--wp-text-primary)]">USD (United States Dollar)</span>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>
          )}

          {/* TAB 4: AI AUTHORITY & USER CONTROL */}
          {activeTab === "ai-authority" && (
            <div className="grid gap-6 animate-in fade-in-50 duration-150">
              <Card className="border-[var(--wp-border)] shadow-xs overflow-hidden">
                <CardHeader className="bg-[var(--wp-surface-subtle)]/50 border-b border-[var(--wp-border)] pb-4">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-base font-semibold flex items-center gap-2">
                      <ShieldCheck className="h-4 w-4 text-[var(--wp-accent)]" />
                      AI Authority Boundaries &amp; Architectural Invariants
                    </CardTitle>
                    <StatusBadge tone="success">Invariants Enforced</StatusBadge>
                  </div>
                  <CardDescription className="text-xs sm:text-sm text-[var(--wp-text-secondary)]">
                    WorkPay strictly bounds autonomous agents. No LLM output ever communicates directly with a payment gateway.
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
                      Autonomous Planning Limits
                    </span>
                    <div className="grid sm:grid-cols-3 gap-3 text-xs text-[var(--wp-text-secondary)]">
                      <div className="p-3 rounded-lg border border-[var(--wp-border)] bg-[var(--wp-surface-subtle)]/40">
                        <span className="font-semibold text-[var(--wp-text-primary)] block">Step Budget</span>
                        <span className="mt-0.5 block">Max 10 execution loops per planning sequence</span>
                      </div>
                      <div className="p-3 rounded-lg border border-[var(--wp-border)] bg-[var(--wp-surface-subtle)]/40">
                        <span className="font-semibold text-[var(--wp-text-primary)] block">Acceptance Threshold</span>
                        <span className="mt-0.5 block">1.0 binary pass criteria. Zero probabilistic guessing</span>
                      </div>
                      <div className="p-3 rounded-lg border border-[var(--wp-border)] bg-[var(--wp-surface-subtle)]/40">
                        <span className="font-semibold text-[var(--wp-text-primary)] block">Output Schemas</span>
                        <span className="mt-0.5 block">Strict Zod validation on all structured responses</span>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>
          )}

          {/* TAB 5: NOTIFICATIONS & ALERTS */}
          {activeTab === "notifications" && (
            <div className="grid gap-6 animate-in fade-in-50 duration-150">
              <Card className="border-[var(--wp-border)] shadow-xs overflow-hidden">
                <CardHeader className="bg-[var(--wp-surface-subtle)]/50 border-b border-[var(--wp-border)] pb-4">
                  <CardTitle className="text-base font-semibold flex items-center gap-2">
                    <Bell className="h-4 w-4 text-[var(--wp-accent)]" />
                    Event Notifications &amp; Alert Routing
                  </CardTitle>
                  <CardDescription className="text-xs sm:text-sm text-[var(--wp-text-secondary)]">
                    Choose which consequential task milestones and payment events trigger in-app bell notifications.
                  </CardDescription>
                </CardHeader>
                <CardContent className="p-5 sm:p-6 divide-y divide-[var(--wp-border)]">
                  <div className="py-3 flex items-start justify-between gap-4">
                    <div>
                      <span className="text-xs font-semibold text-[var(--wp-text-primary)] block">
                        Task Assignment Recommendations &amp; Offers
                      </span>
                      <span className="text-[11px] text-[var(--wp-text-secondary)] block mt-0.5">
                        Receive alerts when your capabilities match a newly proposed task specification.
                      </span>
                    </div>
                    <input
                      type="checkbox"
                      checked={notifyTaskOffers}
                      onChange={(e) => setNotifyTaskOffers(e.target.checked)}
                      className="h-4 w-4 rounded border-[var(--wp-border)] text-[var(--wp-accent)] focus:ring-[var(--wp-accent)] cursor-pointer mt-1"
                    />
                  </div>

                  <div className="py-3 flex items-start justify-between gap-4">
                    <div>
                      <span className="text-xs font-semibold text-[var(--wp-text-primary)] block">
                        Verification Outcomes (Pass / Fail)
                      </span>
                      <span className="text-[11px] text-[var(--wp-text-secondary)] block mt-0.5">
                        Immediate notification when deliverable evidence evaluation completes.
                      </span>
                    </div>
                    <input
                      type="checkbox"
                      checked={notifyVerificationResults}
                      onChange={(e) => setNotifyVerificationResults(e.target.checked)}
                      className="h-4 w-4 rounded border-[var(--wp-border)] text-[var(--wp-accent)] focus:ring-[var(--wp-accent)] cursor-pointer mt-1"
                    />
                  </div>

                  <div className="py-3 flex items-start justify-between gap-4">
                    <div>
                      <span className="text-xs font-semibold text-[var(--wp-text-primary)] block">
                        Revision Requests &amp; Unmet Criteria
                      </span>
                      <span className="text-[11px] text-[var(--wp-text-secondary)] block mt-0.5">
                        Detailed breakdown when a deliverable requires revision before approval.
                      </span>
                    </div>
                    <input
                      type="checkbox"
                      checked={notifyRevisions}
                      onChange={(e) => setNotifyRevisions(e.target.checked)}
                      className="h-4 w-4 rounded border-[var(--wp-border)] text-[var(--wp-accent)] focus:ring-[var(--wp-accent)] cursor-pointer mt-1"
                    />
                  </div>

                  <div className="py-3 flex items-start justify-between gap-4">
                    <div>
                      <span className="text-xs font-semibold text-[var(--wp-text-primary)] block">
                        Payment Authorizations &amp; Confirmed Captures
                      </span>
                      <span className="text-[11px] text-[var(--wp-text-secondary)] block mt-0.5">
                        Authoritative updates when PayPal holds lock or settlement captures disburse.
                      </span>
                    </div>
                    <input
                      type="checkbox"
                      checked={notifyPayments}
                      onChange={(e) => setNotifyPayments(e.target.checked)}
                      className="h-4 w-4 rounded border-[var(--wp-border)] text-[var(--wp-accent)] focus:ring-[var(--wp-accent)] cursor-pointer mt-1"
                    />
                  </div>

                  <div className="py-3 flex items-start justify-between gap-4">
                    <div>
                      <span className="text-xs font-semibold text-[var(--wp-text-primary)] block">
                        Dispute Escalation &amp; Arbitrator Holds
                      </span>
                      <span className="text-[11px] text-[var(--wp-text-secondary)] block mt-0.5">
                        Immediate alert if a task enters dispute review or an arbitrator releases payment.
                      </span>
                    </div>
                    <input
                      type="checkbox"
                      checked={notifyDisputes}
                      onChange={(e) => setNotifyDisputes(e.target.checked)}
                      className="h-4 w-4 rounded border-[var(--wp-border)] text-[var(--wp-accent)] focus:ring-[var(--wp-accent)] cursor-pointer mt-1"
                    />
                  </div>
                </CardContent>
              </Card>
            </div>
          )}

          {/* TAB 6: SANDBOX & SYSTEM HEALTH */}
          {activeTab === "security" && (
            <div className="grid gap-6 animate-in fade-in-50 duration-150">
              {/* Execution Mode Card */}
              <Card className="border-[var(--wp-border)] shadow-xs overflow-hidden">
                <CardHeader className="bg-[var(--wp-surface-subtle)]/50 border-b border-[var(--wp-border)] pb-4">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-base font-semibold flex items-center gap-2">
                      <Sliders className="h-4 w-4 text-[var(--wp-accent)]" />
                      Runtime Execution Mode
                    </CardTitle>
                    <span className="text-xs text-[var(--wp-text-secondary)] font-mono">
                      Default: {envDefault === "demo" ? "Sandbox" : "Live"}
                    </span>
                  </div>
                  <CardDescription className="text-xs sm:text-sm text-[var(--wp-text-secondary)]">
                    Toggle between Sandbox simulation mode and Live Production Escrow.
                  </CardDescription>
                </CardHeader>
                <CardContent className="p-5 sm:p-6 grid sm:grid-cols-2 gap-4">
                  <div
                    onClick={() => {
                      setMode("demo");
                      toast.success("Switched to Sandbox Environment");
                    }}
                    className={cn(
                      "p-4 rounded-xl border-2 cursor-pointer transition-all",
                      isDemo
                        ? "border-[var(--wp-accent)] bg-[var(--wp-accent-subtle)]/30 font-semibold"
                        : "border-[var(--wp-border)] bg-white hover:bg-[var(--wp-surface-subtle)]",
                    )}
                  >
                    <div className="flex items-center justify-between text-xs mb-1">
                      <span className="flex items-center gap-2 text-[var(--wp-text-primary)]">
                        <FlaskConical className="h-4 w-4 text-[var(--wp-accent)]" />
                        Sandbox Simulation
                      </span>
                      {isDemo && <Check className="h-3.5 w-3.5 text-[var(--wp-accent)]" />}
                    </div>
                    <p className="text-[11px] text-[var(--wp-text-secondary)] font-normal leading-relaxed">
                      Simulated PayPal authorizations and test verification runs. Ideal for test workflows.
                    </p>
                  </div>

                  <div
                    onClick={() => {
                      setMode("production");
                      toast.success("Switched to Live Production Escrow");
                    }}
                    className={cn(
                      "p-4 rounded-xl border-2 cursor-pointer transition-all",
                      !isDemo
                        ? "border-[var(--wp-success)] bg-[var(--wp-success-subtle)]/30 font-semibold"
                        : "border-[var(--wp-border)] bg-white hover:bg-[var(--wp-surface-subtle)]",
                    )}
                  >
                    <div className="flex items-center justify-between text-xs mb-1">
                      <span className="flex items-center gap-2 text-[var(--wp-text-primary)]">
                        <ShieldCheck className="h-4 w-4 text-[var(--wp-success)]" />
                        Live Production Escrow
                      </span>
                      {!isDemo && <Check className="h-3.5 w-3.5 text-[var(--wp-success)]" />}
                    </div>
                    <p className="text-[11px] text-[var(--wp-text-secondary)] font-normal leading-relaxed">
                      Live PayPal Order authorization holds and Payments v2 settlement captures.
                    </p>
                  </div>
                </CardContent>
              </Card>

              {/* Service Health Checklist */}
              <Card className="border-[var(--wp-border)] shadow-xs overflow-hidden">
                <CardHeader className="bg-[var(--wp-surface-subtle)]/50 border-b border-[var(--wp-border)] pb-4">
                  <CardTitle className="text-base font-semibold flex items-center gap-2">
                    <Activity className="h-4 w-4 text-[var(--wp-accent)]" />
                    Service Health &amp; Connectivity
                  </CardTitle>
                  <CardDescription className="text-xs sm:text-sm text-[var(--wp-text-secondary)]">
                    Live operational connectivity between frontend Next.js server, background worker, and database container.
                  </CardDescription>
                </CardHeader>
                <CardContent className="p-5 sm:p-6 divide-y divide-[var(--wp-border)] text-xs">
                  <div className="py-2.5 flex items-center justify-between">
                    <span className="font-medium text-[var(--wp-text-primary)]">PostgreSQL Container (workpay-postgres:5433)</span>
                    <StatusBadge tone="success">HEALTHY</StatusBadge>
                  </div>
                  <div className="py-2.5 flex items-center justify-between">
                    <span className="font-medium text-[var(--wp-text-primary)]">Database Schema Migration (0004_work_preferences)</span>
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
                </CardContent>
              </Card>

              {/* Canonical Demo State Reset */}
              <Card className="border-[var(--wp-border)] shadow-xs overflow-hidden">
                <CardHeader className="bg-[var(--wp-surface-subtle)]/50 border-b border-[var(--wp-border)] pb-4">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-base font-semibold flex items-center gap-2">
                      <Database className="h-4 w-4 text-[var(--wp-accent)]" />
                      Canonical Demo State Reset
                    </CardTitle>
                    <Badge variant="outline" className="text-xs bg-white text-[var(--wp-text-secondary)] border-[var(--wp-border)]">
                      Evaluator Tool
                    </Badge>
                  </div>
                  <CardDescription className="text-xs sm:text-sm text-[var(--wp-text-secondary)]">
                    Restores the database to its pristine baseline with Alice, Bob, and Carol.
                  </CardDescription>
                </CardHeader>
                <CardContent className="p-5 sm:p-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                  <div>
                    <div className="font-semibold text-sm text-[var(--wp-text-primary)]">Demo Fixtures Baseline</div>
                    <p className="text-xs text-[var(--wp-text-secondary)] mt-0.5 max-w-xl leading-relaxed">
                      Resets all user-created test tasks, executions, and verification evidence, and restores the canonical customer enrichment task with test CSVs.
                    </p>
                  </div>
                  <Button
                    variant="outline"
                    onClick={() => setConfirmResetOpen(true)}
                    disabled={resetting}
                    className="gap-2 shrink-0 border-[var(--wp-border)] shadow-xs font-semibold text-xs text-[var(--wp-danger)] hover:bg-[var(--wp-danger-subtle)] hover:text-[var(--wp-danger)]"
                  >
                    <RefreshCw className={cn("h-3.5 w-3.5", resetting && "animate-spin text-[var(--wp-accent)]")} />
                    {resetting ? "Resetting..." : "Reset Demo Database"}
                  </Button>
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
              This action will delete all test tasks, deliverables, and executions, and re-seed the canonical demo state with Alice (Task Owner), Bob (Specialist), and Carol (Reviewer).
            </DialogDescription>
          </DialogHeader>
          <div className="p-3 rounded-xl bg-[var(--wp-surface-subtle)] border border-[var(--wp-border)] text-xs text-[var(--wp-text-secondary)]">
            Your active demo persona will automatically be reset to <strong className="text-[var(--wp-text-primary)]">Alice</strong>.
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
