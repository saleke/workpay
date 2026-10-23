"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Briefcase,
  Check,
  ChevronDown,
  Info,
  LogIn,
  LogOut,
  RefreshCw,
  Scale,
  Settings,
  ShieldCheck,
  Sparkles,
  User,
  UserPlus,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useSystemMode } from "@/lib/mode";

export interface AuthUser {
  id: string;
  name: string | null;
  email: string;
  role: "buyer" | "provider" | "admin_reviewer";
}

interface PersonaConfig {
  key: "buyer" | "provider" | "admin_reviewer";
  name: string;
  roleTitle: string;
  badge: string;
  email: string;
  homeUrl: string;
  initials: string;
  icon: typeof User;
  description: string;
}

const PERSONAS: PersonaConfig[] = [
  {
    key: "buyer",
    name: "Alice",
    roleTitle: "Task Owner",
    badge: "Buyer",
    email: "alice@workpay.local",
    homeUrl: "/tasks",
    initials: "A",
    icon: User,
    description: "Commission structured work, define acceptance criteria, and hold funds.",
  },
  {
    key: "provider",
    name: "Bob",
    roleTitle: "Specialist",
    badge: "Specialist",
    email: "bob@workpay.local",
    homeUrl: "/provider",
    initials: "B",
    icon: Briefcase,
    description: "Accept assignments, deliver work against Definition of Done, and receive payouts.",
  },
  {
    key: "admin_reviewer",
    name: "Carol",
    roleTitle: "Arbitrator",
    badge: "Arbitrator",
    email: "carol@workpay.local",
    homeUrl: "/review",
    initials: "C",
    icon: Scale,
    description: "Review disputed verifications, inspect diffs, and issue authoritative rulings.",
  },
];

export function UserNav() {
  const router = useRouter();
  const { isDemo } = useSystemMode();
  const [user, setUser] = useState<AuthUser | null>(null);
  const [mounted, setMounted] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [guideOpen, setGuideOpen] = useState(false);

  useEffect(() => {
    setMounted(true);

    // 1. Check for stored authenticated user
    const storedAuth = window.localStorage.getItem("workpay_auth_user");
    if (storedAuth) {
      try {
        const parsed = JSON.parse(storedAuth) as AuthUser;
        if (parsed?.id) {
          setUser(parsed);
          return;
        }
      } catch {
        // Ignore parse error
      }
    }

    // 2. Check for explicit signed-out flag
    const explicitlySignedOut = window.localStorage.getItem("workpay_signed_out") === "true";
    if (explicitlySignedOut && !isDemo) {
      setUser(null);
      return;
    }

    // 3. Check for active persona or fallback to Alice
    const storedPersona = window.localStorage.getItem("workpay_persona") as "buyer" | "provider" | "admin_reviewer" | null;
    const personaConfig = PERSONAS.find((p) => p.key === storedPersona) ?? PERSONAS[0]!;

    const defaultUser: AuthUser = {
      id: personaConfig.key === "provider" ? "usr_provider_bob" : personaConfig.key === "admin_reviewer" ? "usr_admin_carol" : "usr_buyer_alice",
      name: personaConfig.name,
      email: personaConfig.email,
      role: personaConfig.key,
    };

    setUser(defaultUser);
    window.localStorage.setItem("workpay_auth_user", JSON.stringify(defaultUser));
    window.localStorage.setItem("workpay_persona", personaConfig.key);
    document.cookie = `workpay_persona=${personaConfig.key}; path=/; max-age=31536000`;
  }, [isDemo]);

  const switchPersona = (persona: PersonaConfig, navigate = false) => {
    const nextUser: AuthUser = {
      id: persona.key === "provider" ? "usr_provider_bob" : persona.key === "admin_reviewer" ? "usr_admin_carol" : "usr_buyer_alice",
      name: persona.name,
      email: persona.email,
      role: persona.key,
    };

    setUser(nextUser);
    window.localStorage.setItem("workpay_auth_user", JSON.stringify(nextUser));
    window.localStorage.setItem("workpay_persona", persona.key);
    window.localStorage.removeItem("workpay_signed_out");
    document.cookie = `workpay_persona=${persona.key}; path=/; max-age=31536000`;

    if (navigate) {
      router.push(persona.homeUrl);
    } else {
      router.refresh();
    }
  };

  const handleSignOut = async () => {
    try {
      await fetch("/api/v1/auth/logout", { method: "POST" });
    } catch {
      // Ignore network errors on logout
    }

    window.localStorage.removeItem("workpay_auth_user");
    window.localStorage.removeItem("workpay_persona");
    window.localStorage.setItem("workpay_signed_out", "true");
    document.cookie = "workpay_persona=; path=/; max-age=0";
    setUser(null);
    router.push("/login");
    router.refresh();
  };

  const handleResetDemo = async () => {
    if (resetting) return;
    setResetting(true);
    try {
      const res = await fetch("/api/v1/demo/reset", { method: "POST" });
      if (res.ok) {
        const alice = PERSONAS[0]!;
        const nextUser: AuthUser = {
          id: "usr_buyer_alice",
          name: alice.name,
          email: alice.email,
          role: "buyer",
        };
        setUser(nextUser);
        window.localStorage.setItem("workpay_auth_user", JSON.stringify(nextUser));
        window.localStorage.setItem("workpay_persona", "buyer");
        window.localStorage.removeItem("workpay_signed_out");
        document.cookie = "workpay_persona=buyer; path=/; max-age=31536000";
        router.push("/tasks");
        router.refresh();
      }
    } catch (e) {
      console.error("Failed to reset demo database:", e);
    } finally {
      setResetting(false);
    }
  };

  if (!mounted) {
    return <div className="h-8 w-24 animate-pulse rounded-lg bg-[var(--wp-surface-subtle)]" />;
  }

  if (!user) {
    return (
      <div className="flex items-center gap-1.5">
        <Link
          href="/login"
          className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium text-[var(--wp-text-secondary)] hover:text-[var(--wp-text-primary)] hover:bg-[var(--wp-surface-subtle)] transition-all duration-150"
        >
          <LogIn className="h-3.5 w-3.5" />
          <span>Sign In</span>
        </Link>
        <Link
          href="/register"
          className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium bg-[var(--wp-text-primary)] text-white hover:bg-black transition-all duration-150 shadow-xs"
        >
          <UserPlus className="h-3.5 w-3.5" />
          <span>Register</span>
        </Link>
      </div>
    );
  }

  const roleTitle =
    user.role === "provider"
      ? "Specialist"
      : user.role === "admin_reviewer"
        ? "Arbitrator"
        : "Task Owner";

  const initials = user.name
    ? user.name
        .split(" ")
        .map((p) => p[0])
        .slice(0, 2)
        .join("")
        .toUpperCase()
    : user.email.slice(0, 2).toUpperCase();

  const displayName = user.name || user.email.split("@")[0];

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            aria-label="User account and perspective navigation"
            className="flex items-center gap-2 text-xs font-medium text-[var(--wp-text-secondary)] hover:text-[var(--wp-text-primary)] transition-all duration-150 px-2.5 py-1.5 rounded-lg border border-[var(--wp-border)] bg-white/90 hover:bg-[var(--wp-surface-subtle)] hover:border-[var(--wp-border-strong)] shadow-xs active:scale-[0.98] cursor-pointer"
          >
            <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[var(--wp-surface-subtle)] text-[10px] font-bold text-[var(--wp-text-primary)] border border-[var(--wp-border)]">
              {initials}
            </span>
            <span className="text-[var(--wp-text-primary)] font-medium max-w-[120px] truncate">
              {displayName}
            </span>
            <span className="text-[11px] text-[var(--wp-text-secondary)] opacity-80 font-normal hidden sm:inline">
              ({roleTitle})
            </span>
            <ChevronDown className="h-3 w-3 text-[var(--wp-text-secondary)] opacity-60" />
          </button>
        </DropdownMenuTrigger>

        <DropdownMenuContent align="end" className="w-80 p-2">
          {/* Account Details Header */}
          <DropdownMenuLabel className="flex flex-col px-2.5 py-1.5 text-xs text-muted-foreground font-normal">
            <div className="flex items-center justify-between">
              <span className="font-semibold text-[var(--wp-text-primary)] text-sm">{displayName}</span>
              <span className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-[var(--wp-surface-subtle)] text-[var(--wp-text-secondary)] border border-[var(--wp-border)]">
                {roleTitle}
              </span>
            </div>
            <span className="text-[11px] text-[var(--wp-text-secondary)] font-mono truncate mt-0.5">{user.email}</span>
          </DropdownMenuLabel>
          <DropdownMenuSeparator className="my-1.5 bg-[var(--wp-border)]" />

          {/* Sandbox Test Perspectives (Only shown in Sandbox Mode) */}
          {isDemo ? (
            <>
              <DropdownMenuLabel className="flex items-center justify-between px-2.5 py-1 text-xs text-muted-foreground font-medium">
                <span className="text-[11px] uppercase tracking-wider font-semibold">Sandbox Test Perspectives</span>
                <span className="text-[10px] text-muted-foreground font-mono font-normal">1-Click Switch</span>
              </DropdownMenuLabel>
              <DropdownMenuSeparator className="my-1 bg-[var(--wp-border)]" />

              <DropdownMenuGroup className="space-y-1">
                {PERSONAS.map((p) => {
                  const Icon = p.icon;
                  const isSelected = p.key === user.role;

                  return (
                    <DropdownMenuItem
                      key={p.key}
                      onClick={() => switchPersona(p, true)}
                      className={`flex flex-col items-start gap-1 p-2.5 rounded-lg cursor-pointer transition-all ${
                        isSelected
                          ? "bg-[var(--wp-surface-subtle)] border border-[var(--wp-border-strong)]"
                          : "hover:bg-[var(--wp-surface-subtle)]"
                      }`}
                    >
                      <div className="flex items-center justify-between w-full">
                        <div className="flex items-center gap-2">
                          <div className="flex h-6 w-6 items-center justify-center rounded-md bg-[var(--wp-surface-subtle)] text-[var(--wp-text-primary)] border border-[var(--wp-border)]">
                            <Icon className="h-3.5 w-3.5" />
                          </div>
                          <span className="font-semibold text-xs text-[var(--wp-text-primary)]">
                            {p.name} ({p.roleTitle})
                          </span>
                        </div>
                        <div className="flex items-center gap-1.5">
                          <span className="rounded-md px-1.5 py-0.5 text-[10px] font-medium bg-[var(--wp-surface-subtle)] text-[var(--wp-text-secondary)] border border-[var(--wp-border)]">
                            {p.badge}
                          </span>
                          {isSelected && <Check className="h-3.5 w-3.5 text-[var(--wp-accent)]" />}
                        </div>
                      </div>
                      <p className="text-[11px] text-[var(--wp-text-secondary)] leading-snug pl-8">
                        {p.description}
                      </p>
                    </DropdownMenuItem>
                  );
                })}
              </DropdownMenuGroup>
              <DropdownMenuSeparator className="my-1.5 bg-[var(--wp-border)]" />
            </>
          ) : (
            <>
              <div className="px-2.5 py-2 rounded-lg bg-[var(--wp-surface-subtle)] border border-[var(--wp-border)] mb-2">
                <div className="flex items-center gap-2">
                  <ShieldCheck className="h-4 w-4 text-[var(--wp-success)]" />
                  <span className="text-xs font-semibold text-[var(--wp-text-primary)]">Live Production Mode</span>
                </div>
                <p className="text-[11px] text-[var(--wp-text-secondary)] mt-1 leading-snug">
                  Non-custodial cryptographic holds and live PayPal settlement.
                </p>
              </div>
              <DropdownMenuSeparator className="my-1.5 bg-[var(--wp-border)]" />
            </>
          )}

          {/* Quick Actions */}
          <div className="flex items-center justify-between gap-1 pt-1">
            {isDemo && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setGuideOpen(true)}
                className="h-7 text-[11px] gap-1 px-2 font-normal text-muted-foreground hover:text-foreground"
              >
                <Info className="h-3 w-3 text-blue-500" />
                Guide
              </Button>
            )}

            <Button
              asChild
              variant="ghost"
              size="sm"
              className="h-7 text-[11px] gap-1 px-2 font-normal text-muted-foreground hover:text-foreground"
            >
              <Link href="/settings">
                <Settings className="h-3 w-3 text-primary" />
                Settings
              </Link>
            </Button>

            {isDemo && (
              <Button
                variant="ghost"
                size="sm"
                disabled={resetting}
                onClick={handleResetDemo}
                className="h-7 text-[11px] gap-1 px-2 font-normal text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/40"
              >
                <RefreshCw className={`h-3 w-3 ${resetting ? "animate-spin" : ""}`} />
                {resetting ? "Reset..." : "Reset"}
              </Button>
            )}

            <Button
              variant="ghost"
              size="sm"
              onClick={handleSignOut}
              className="h-7 text-[11px] gap-1 px-2 font-normal text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/40"
            >
              <LogOut className="h-3 w-3" />
              Sign Out
            </Button>
          </div>
        </DropdownMenuContent>
      </DropdownMenu>

      {/* Protocol Walkthrough Modal */}
      <Dialog open={guideOpen} onOpenChange={setGuideOpen}>
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-base font-bold">
              <Sparkles className="h-4 w-4 text-primary" />
              WorkPay Execution Architecture
            </DialogTitle>
            <DialogDescription className="text-xs">
              Autonomous execution and non-custodial PayPal settlement lifecycle.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3 pt-2 text-xs">
            <div className="rounded-xl border border-blue-200/70 bg-blue-50/40 p-3 dark:border-blue-900/50 dark:bg-blue-950/20">
              <h4 className="font-semibold text-blue-900 dark:text-blue-200 flex items-center gap-1.5 mb-1">
                <span className="flex h-4 w-4 items-center justify-center rounded-full bg-blue-600 text-white text-[10px]">1</span>
                Task Commitment &amp; PayPal Authorization Hold
              </h4>
              <p className="text-muted-foreground leading-relaxed">
                Task Owner defines verifiable acceptance criteria. Upon approval, funds are secured via PayPal authorization hold. WorkPay never takes custody of funds.
              </p>
            </div>

            <div className="rounded-xl border border-emerald-200/70 bg-emerald-50/40 p-3 dark:border-emerald-900/50 dark:bg-emerald-950/20">
              <h4 className="font-semibold text-emerald-900 dark:text-emerald-200 flex items-center gap-1.5 mb-1">
                <span className="flex h-4 w-4 items-center justify-center rounded-full bg-emerald-600 text-white text-[10px]">2</span>
                Execution &amp; Deliverable Submission
              </h4>
              <p className="text-muted-foreground leading-relaxed">
                Specialist executes the scoped task and uploads deliverable artifacts to the Task Room.
              </p>
            </div>

            <div className="rounded-xl border border-purple-200/70 bg-purple-50/40 p-3 dark:border-purple-900/50 dark:bg-purple-950/20">
              <h4 className="font-semibold text-purple-900 dark:text-purple-200 flex items-center gap-1.5 mb-1">
                <span className="flex h-4 w-4 items-center justify-center rounded-full bg-purple-600 text-white text-[10px]">3</span>
                Automated Verification &amp; PayPal Settlement Capture
              </h4>
              <p className="text-muted-foreground leading-relaxed">
                The verification engine executes objective checks against the Definition of Done. When verification passes, the deterministic policy dispatches PayPal capture directly to the specialist.
              </p>
            </div>

            <div className="flex items-center justify-between pt-2 border-t text-muted-foreground text-[11px]">
              <span>Need a clean testing state? Use the Reset option in the perspective menu.</span>
              <Button size="sm" onClick={() => setGuideOpen(false)}>
                Got it
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
