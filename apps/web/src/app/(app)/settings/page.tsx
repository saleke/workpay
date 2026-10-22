"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  Activity,
  AlertCircle,
  Briefcase,
  Check,
  CheckCircle2,
  ChevronRight,
  Cpu,
  Database,
  ExternalLink,
  Lock,
  LogIn,
  LogOut,
  RefreshCw,
  Scale,
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
import { Separator } from "@/components/ui/separator";
import { StatusBadge } from "@/components/ui/status-badge";
import { useSystemMode, type SystemMode } from "@/lib/mode";
import { ProviderProfileManager } from "@/components/provider/provider-profile-manager";

interface AuthUser {
  id: string;
  name: string | null;
  email: string;
  role: "buyer" | "provider" | "admin_reviewer";
}

export default function SettingsPage() {
  const { mode, isDemo, setMode, envDefault } = useSystemMode();
  const [authUser, setAuthUser] = useState<AuthUser | null>(null);
  const [resetting, setResetting] = useState(false);
  const [resetSuccess, setResetSuccess] = useState(false);

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
        setTimeout(() => setResetSuccess(false), 4000);
      }
    } catch (err) {
      console.error("Failed to reset demo:", err);
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
    window.location.reload();
  };

  return (
    <div className="flex flex-col gap-6 max-w-5xl">
      {/* Page Header */}
      <div>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-xl font-bold tracking-tight md:text-2xl text-foreground">
              System Settings &amp; Architecture Diagnostics
            </h1>
            <p className="text-sm text-muted-foreground mt-0.5">
              Control runtime mode, audit PayPal escrow policy gates, inspect auth identity, and verify system invariants.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Badge
              variant="outline"
              className={
                isDemo
                  ? "border-blue-500/30 bg-blue-50 text-blue-700 dark:bg-blue-950/60 dark:text-blue-300 font-semibold"
                  : "border-emerald-500/30 bg-emerald-50 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300 font-semibold"
              }
            >
              Mode: {isDemo ? "Hackathon Showcase (Default)" : "Production SaaS"}
            </Badge>
          </div>
        </div>
      </div>

      <div className="grid gap-6">
        {/* Card 1: System Mode & Evaluation Switcher */}
        <Card className="border-border/80 shadow-xs">
          <CardHeader className="bg-muted/15 border-b border-border/60 pb-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <CardTitle className="text-base font-semibold flex items-center gap-2">
                <Sliders className="h-4 w-4 text-primary" />
                Operating Mode Configuration
              </CardTitle>
              <span className="text-xs text-muted-foreground font-mono">
                Environment Default: {envDefault}
              </span>
            </div>
            <CardDescription className="text-xs sm:text-sm">
              WorkPay runs in frictionless <strong>Demo Mode by default</strong> so hackathon judges can immediately test the platform without signup friction or credit card entry. You can toggle between modes in real-time.
            </CardDescription>
          </CardHeader>
          <CardContent className="p-6 grid gap-4">
            <div className="grid sm:grid-cols-2 gap-4">
              {/* Demo Mode Option Card */}
              <div
                onClick={() => setMode("demo")}
                className={`relative flex flex-col justify-between p-4 rounded-xl border-2 cursor-pointer transition-all ${
                  isDemo
                    ? "border-primary bg-primary/5 shadow-xs"
                    : "border-border/70 hover:border-border hover:bg-muted/20"
                }`}
              >
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <span className="font-semibold text-sm flex items-center gap-2">
                      <Sparkles className="h-4 w-4 text-primary" />
                      Hackathon Demo Showcase
                    </span>
                    {isDemo && (
                      <span className="flex h-5 w-5 items-center justify-center rounded-full bg-primary text-white">
                        <Check className="h-3 w-3" />
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground leading-relaxed">
                    Zero-friction evaluator mode. Includes the persona switcher (Alice, Bob, Carol), built-in walkthrough guide, instant database reset, and simulated PayPal authorization holds.
                  </p>
                </div>
                <div className="mt-4 pt-3 border-t border-border/50 flex items-center gap-2 text-[11px] font-semibold text-primary">
                  <span>Recommended for Hackathon Evaluators</span>
                </div>
              </div>

              {/* Production SaaS Mode Option Card */}
              <div
                onClick={() => setMode("production")}
                className={`relative flex flex-col justify-between p-4 rounded-xl border-2 cursor-pointer transition-all ${
                  !isDemo
                    ? "border-primary bg-primary/5 shadow-xs"
                    : "border-border/70 hover:border-border hover:bg-muted/20"
                }`}
              >
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <span className="font-semibold text-sm flex items-center gap-2">
                      <ShieldCheck className="h-4 w-4 text-emerald-600" />
                      Production SaaS Mode
                    </span>
                    {!isDemo && (
                      <span className="flex h-5 w-5 items-center justify-center rounded-full bg-primary text-white">
                        <Check className="h-3 w-3" />
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground leading-relaxed">
                    Pure enterprise SaaS experience. Hides all persona switchers and demo banners. Enforces strict email/password registration, NIST scrypt hashing, and live PayPal credentials.
                  </p>
                </div>
                <div className="mt-4 pt-3 border-t border-border/50 flex items-center gap-2 text-[11px] font-semibold text-muted-foreground">
                  <span>Option B through C: Enterprise Ready</span>
                </div>
              </div>
            </div>

            <div className="flex items-center justify-between pt-2">
              <span className="text-xs text-muted-foreground">
                Runtime mode can also be controlled via <code className="font-mono text-[11px] bg-muted px-1.5 py-0.5 rounded">NEXT_PUBLIC_DEMO_MODE=false</code> in <code className="font-mono text-[11px] bg-muted px-1.5 py-0.5 rounded">.env</code>.
              </span>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setMode(null)}
                className="h-7 text-xs text-muted-foreground hover:text-foreground"
              >
                Reset to Env Default
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Card 2: Identity & Authentication Session */}
        <Card className="border-border/80 shadow-xs">
          <CardHeader className="bg-muted/15 border-b border-border/60 pb-4">
            <CardTitle className="text-base font-semibold flex items-center gap-2">
              <User className="h-4 w-4 text-primary" />
              Active Session &amp; Identity State
            </CardTitle>
            <CardDescription className="text-xs sm:text-sm">
              Displays whether you are currently acting through a Demo Persona or authenticated via a registered user account.
            </CardDescription>
          </CardHeader>
          <CardContent className="p-6">
            {authUser ? (
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-4 rounded-xl border border-emerald-200 bg-emerald-50/50 dark:border-emerald-900/60 dark:bg-emerald-950/20">
                <div className="flex items-start gap-3">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-emerald-600 text-white font-bold text-sm">
                    {authUser.name ? authUser.name[0]?.toUpperCase() : "U"}
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-sm text-foreground">{authUser.name || "User"}</span>
                      <Badge variant="outline" className="text-[10px] uppercase font-bold border-emerald-300 text-emerald-800 dark:text-emerald-300">
                        {authUser.role}
                      </Badge>
                      <Badge variant="outline" className="text-[10px] font-semibold bg-emerald-100/60 text-emerald-700 dark:bg-emerald-900/60 dark:text-emerald-300">
                        Authenticated Session Active
                      </Badge>
                    </div>
                    <div className="text-xs font-mono text-muted-foreground mt-0.5">{authUser.email}</div>
                    <div className="text-[11px] font-mono text-muted-foreground mt-1">User ID: {authUser.id}</div>
                  </div>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleSignOut}
                  className="text-rose-600 hover:text-rose-700 hover:bg-rose-50 dark:text-rose-400 shrink-0 font-medium text-xs"
                >
                  <LogOut className="h-3.5 w-3.5 mr-1.5" />
                  Sign Out of Account
                </Button>
              </div>
            ) : (
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-4 rounded-xl border border-border/80 bg-muted/20">
                <div className="flex items-start gap-3">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
                    <UserCheck className="h-5 w-5" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-sm text-foreground">Acting via Demo Persona</span>
                      <Badge variant="outline" className="text-[10px] uppercase font-bold bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950 dark:text-blue-300">
                        1-Click Persona
                      </Badge>
                    </div>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      You are interacting as the selected persona. You can register a real account at any time to test the complete user authentication system (Option B).
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

        {/* Card 3: Specialist Profile & Direct PayPal Settlement */}
        <ProviderProfileManager />

        {/* Card 4: PayPal Escrow & Gateway Invariants */}
        <Card className="border-border/80 shadow-xs">
          <CardHeader className="bg-muted/15 border-b border-border/60 pb-4">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base font-semibold flex items-center gap-2">
                <Wallet className="h-4 w-4 text-primary" />
                PayPal Escrow Ledger &amp; Safety Policy Gates
              </CardTitle>
              <StatusBadge tone="success">Orders v2 / Payments v2 Enforced</StatusBadge>
            </div>
            <CardDescription className="text-xs sm:text-sm">
              WorkPay guarantees bounded financial risk through architectural invariants. No LLM output ever communicates directly with a payment gateway.
            </CardDescription>
          </CardHeader>
          <CardContent className="p-6 grid gap-4">
            <div className="grid sm:grid-cols-2 gap-3">
              <div className="rounded-xl border border-border/60 p-3.5 bg-card">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs font-semibold text-foreground">Invariant P1: Budget Ceiling</span>
                  <StatusBadge tone="success">ENFORCED</StatusBadge>
                </div>
                <p className="text-xs text-muted-foreground">
                  The agent cannot authorize or capture more than the buyer&apos;s explicitly approved contract budget ceiling.
                </p>
              </div>

              <div className="rounded-xl border border-border/60 p-3.5 bg-card">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs font-semibold text-foreground">Invariant P2: Deterministic Verification</span>
                  <StatusBadge tone="success">ENFORCED</StatusBadge>
                </div>
                <p className="text-xs text-muted-foreground">
                  Escrow capture cannot execute unless deterministic acceptance proof completes with zero defects (FAIL-CLOSED).
                </p>
              </div>

              <div className="rounded-xl border border-border/60 p-3.5 bg-card">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs font-semibold text-foreground">Invariant P3: Human Review Escalation</span>
                  <StatusBadge tone="success">ENFORCED</StatusBadge>
                </div>
                <p className="text-xs text-muted-foreground">
                  Any open dispute case automatically places an immediate hold on payment capture until resolved by an arbitrator.
                </p>
              </div>

              <div className="rounded-xl border border-border/60 p-3.5 bg-card">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs font-semibold text-foreground">Invariant P4: Transaction Safety</span>
                  <StatusBadge tone="success">ENFORCED</StatusBadge>
                </div>
                <p className="text-xs text-muted-foreground">
                  Database transactions are never held across external PayPal API calls. Idempotency records prevent double-spending.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Card 4: Database & Fixture Management */}
        <Card className="border-border/80 shadow-xs">
          <CardHeader className="bg-muted/15 border-b border-border/60 pb-4">
            <CardTitle className="text-base font-semibold flex items-center gap-2">
              <Database className="h-4 w-4 text-primary" />
              Database Fixtures &amp; One-Click Reset
            </CardTitle>
            <CardDescription className="text-xs sm:text-sm">
              Evaluators can restore the system to its initial baseline state anytime with 1 click.
            </CardDescription>
          </CardHeader>
          <CardContent className="p-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <div className="font-semibold text-sm text-foreground">Canonical Demo State Reset</div>
              <p className="text-xs text-muted-foreground mt-0.5 max-w-xl">
                Cleans all temporary tasks, executions, and verification runs, and restores the pristine demo dataset: Alice (Buyer), Bob (Apex Data), Carol (Arbitrator), and the canonical customer enrichment task with test CSVs.
              </p>
              {resetSuccess && (
                <div className="flex items-center gap-2 text-xs font-semibold text-emerald-600 mt-2">
                  <CheckCircle2 className="h-4 w-4" />
                  Database successfully reset and re-seeded to canonical demo baseline!
                </div>
              )}
            </div>
            <Button
              variant="outline"
              onClick={handleResetDemo}
              disabled={resetting}
              className="gap-2 shrink-0 border-border/80 shadow-xs font-semibold text-xs"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${resetting ? "animate-spin text-primary" : ""}`} />
              {resetting ? "Resetting Database..." : "Reset Demo Database"}
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
