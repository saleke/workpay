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
  Sliders,
  Sparkles,
  User,
  UserCheck,
  UserPlus,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

export type DemoPersonaKey = "buyer" | "provider" | "admin_reviewer";

interface PersonaConfig {
  key: DemoPersonaKey;
  name: string;
  roleTitle: string;
  badge: string;
  badgeColor: string;
  description: string;
  homeUrl: string;
  icon: typeof User;
}

interface AuthUser {
  id: string;
  name: string | null;
  email: string;
  role: "buyer" | "provider" | "admin_reviewer";
}

const PERSONAS: PersonaConfig[] = [
  {
    key: "buyer",
    name: "Alice",
    roleTitle: "Task Owner / Lead",
    badge: "TASK OWNER",
    badgeColor: "bg-blue-500/15 text-blue-600 dark:text-blue-400 border-blue-500/30",
    description: "Posts tasks, tunes Definition of Done, approves work agreements, and authorizes escrow.",
    homeUrl: "/tasks",
    icon: User,
  },
  {
    key: "provider",
    name: "Bob",
    roleTitle: "Apex Data (Specialist)",
    badge: "SPECIALIST",
    badgeColor: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-emerald-500/30",
    description: "Receives matched work, fulfills Definition of Done, and receives PayPal settlements.",
    homeUrl: "/provider",
    icon: Briefcase,
  },
  {
    key: "admin_reviewer",
    name: "Carol",
    roleTitle: "Dispute Arbitrator",
    badge: "ARBITRATOR",
    badgeColor: "bg-purple-500/15 text-purple-600 dark:text-purple-400 border-purple-500/30",
    description: "Inspects failed or disputed verifications, reviews evidence diffs, and rules on escrow.",
    homeUrl: "/review",
    icon: Scale,
  },
];

export function PersonaSwitcher() {
  const router = useRouter();
  const [activePersona, setActivePersona] = useState<DemoPersonaKey>("buyer");
  const [authUser, setAuthUser] = useState<AuthUser | null>(null);
  const [mounted, setMounted] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [guideOpen, setGuideOpen] = useState(false);

  useEffect(() => {
    setMounted(true);

    // 1. Check for real logged in account
    const storedAuth = window.localStorage.getItem("workpay_auth_user");
    if (storedAuth) {
      try {
        const u = JSON.parse(storedAuth) as AuthUser;
        if (u && u.id) {
          setAuthUser(u);
          setActivePersona(u.role);
          document.cookie = `workpay_persona=${u.role}; path=/; max-age=31536000`;
          return;
        }
      } catch {
        // Fall through
      }
    }

    // 2. Demo Persona check
    const stored = window.localStorage.getItem("workpay_persona") as DemoPersonaKey | null;
    if (stored && PERSONAS.some((p) => p.key === stored)) {
      setActivePersona(stored);
      document.cookie = `workpay_persona=${stored}; path=/; max-age=31536000`;
    } else {
      document.cookie = `workpay_persona=buyer; path=/; max-age=31536000`;
    }
  }, []);

  const switchPersona = (persona: PersonaConfig, navigate = false) => {
    // If switching persona, clear custom auth user so demo persona takes effect
    window.localStorage.removeItem("workpay_auth_user");
    setAuthUser(null);

    setActivePersona(persona.key);
    window.localStorage.setItem("workpay_persona", persona.key);
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
      // Ignore
    }
    window.localStorage.removeItem("workpay_auth_user");
    setAuthUser(null);
    setActivePersona("buyer");
    window.localStorage.setItem("workpay_persona", "buyer");
    document.cookie = `workpay_persona=buyer; path=/; max-age=31536000`;
    router.push("/tasks");
    router.refresh();
  };

  const handleResetDemo = async () => {
    if (resetting) return;
    setResetting(true);
    try {
      const res = await fetch("/api/v1/demo/reset", { method: "POST" });
      if (res.ok) {
        window.localStorage.removeItem("workpay_auth_user");
        setAuthUser(null);
        setActivePersona("buyer");
        window.localStorage.setItem("workpay_persona", "buyer");
        document.cookie = `workpay_persona=buyer; path=/; max-age=31536000`;
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
    return (
      <div className="flex items-center gap-2 rounded-lg border border-border/70 bg-card px-2.5 py-1 text-xs text-muted-foreground shadow-xs">
        <UserCheck className="h-3.5 w-3.5 text-primary" />
        <span>Demo: <strong className="text-foreground">Buyer (Alice)</strong></span>
      </div>
    );
  }

  const current: PersonaConfig = PERSONAS.find((p) => p.key === activePersona) ?? PERSONAS[0]!;
  const CurrentIcon = current.icon;

  return (
    <>
      <div className="flex items-center gap-1.5">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="outline"
              size="sm"
              className="h-8 gap-2 border-border/80 bg-card/80 px-2.5 text-xs font-medium shadow-xs hover:border-primary/50 transition-all"
            >
              <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
                <CurrentIcon className="h-3 w-3" />
              </span>
              <span className="hidden sm:inline text-muted-foreground">
                {authUser ? "Account:" : "Perspective:"}
              </span>
              <strong className="text-foreground font-semibold">
                {authUser ? authUser.name || authUser.email.split("@")[0] : current.name}
              </strong>
              <span className={`rounded-md border px-1.5 py-0.2 text-[10px] font-bold ${current.badgeColor}`}>
                {authUser ? "ACTIVE" : current.badge}
              </span>
              <ChevronDown className="h-3 w-3 text-muted-foreground opacity-60" />
            </Button>
          </DropdownMenuTrigger>

          <DropdownMenuContent align="end" className="w-72 p-2">
            {authUser ? (
              <>
                <DropdownMenuLabel className="flex flex-col px-2 py-1 text-xs text-muted-foreground font-normal">
                  <span className="font-semibold text-foreground text-sm">{authUser.name}</span>
                  <span className="text-[11px] text-muted-foreground font-mono">{authUser.email}</span>
                  <span className="mt-1 inline-flex w-fit items-center rounded border border-primary/30 bg-primary/10 px-1.5 py-0.2 text-[9px] font-bold text-primary uppercase">
                    Role: {authUser.role}
                  </span>
                </DropdownMenuLabel>
                <DropdownMenuSeparator className="my-1.5" />
                <DropdownMenuItem
                  onClick={handleSignOut}
                  className="flex items-center gap-2 text-rose-600 dark:text-rose-400 cursor-pointer"
                >
                  <LogOut className="h-3.5 w-3.5" />
                  <span className="text-xs font-medium">Sign Out</span>
                </DropdownMenuItem>
                <DropdownMenuSeparator className="my-1.5" />
              </>
            ) : null}

            <DropdownMenuLabel className="flex items-center justify-between px-2 py-1 text-xs text-muted-foreground font-medium">
              <span>Sandbox Perspectives</span>
              <span className="text-[10px] text-muted-foreground font-mono font-normal">Switch Actor</span>
            </DropdownMenuLabel>
            <DropdownMenuSeparator className="my-1" />

            <DropdownMenuGroup className="space-y-1">
              {PERSONAS.map((p) => {
                const Icon = p.icon;
                const isSelected = !authUser && p.key === activePersona;

                return (
                  <DropdownMenuItem
                    key={p.key}
                    onClick={() => switchPersona(p, true)}
                    className={`flex flex-col items-start gap-1 p-2 rounded-lg cursor-pointer transition-colors ${
                      isSelected
                        ? "bg-accent/80 border border-primary/20"
                        : "hover:bg-muted/60"
                    }`}
                  >
                    <div className="flex items-center justify-between w-full">
                      <div className="flex items-center gap-2">
                        <div className="flex h-6 w-6 items-center justify-center rounded-md bg-primary/10 text-primary">
                          <Icon className="h-3.5 w-3.5" />
                        </div>
                        <span className="font-semibold text-xs text-foreground">
                          {p.name} ({p.roleTitle})
                        </span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <span className={`rounded px-1.5 py-0.2 text-[9px] font-bold border ${p.badgeColor}`}>
                          {p.badge}
                        </span>
                        {isSelected && <Check className="h-3.5 w-3.5 text-primary" />}
                      </div>
                    </div>
                    <p className="text-[11px] text-muted-foreground leading-snug pl-8">
                      {p.description}
                    </p>
                  </DropdownMenuItem>
                );
              })}
            </DropdownMenuGroup>

            <DropdownMenuSeparator className="my-1.5" />

            {!authUser && (
              <>
                <div className="grid grid-cols-2 gap-1.5 pb-1">
                  <Button
                    asChild
                    variant="outline"
                    size="sm"
                    className="h-7 text-[11px] gap-1 font-medium"
                  >
                    <Link href="/login">
                      <LogIn className="h-3 w-3" />
                      Sign In
                    </Link>
                  </Button>
                  <Button
                    asChild
                    variant="default"
                    size="sm"
                    className="h-7 text-[11px] gap-1 font-medium"
                  >
                    <Link href="/register">
                      <UserPlus className="h-3 w-3" />
                      Register
                    </Link>
                  </Button>
                </div>
                <DropdownMenuSeparator className="my-1" />
              </>
            )}

            <div className="flex items-center justify-between gap-1 pt-1 border-t border-border/40">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setGuideOpen(true)}
                className="h-7 text-[11px] gap-1 px-2 font-normal text-muted-foreground hover:text-foreground"
              >
                <Info className="h-3 w-3 text-blue-500" />
                Guide
              </Button>

              <Button
                asChild
                variant="ghost"
                size="sm"
                className="h-7 text-[11px] gap-1 px-2 font-normal text-muted-foreground hover:text-foreground"
              >
                <Link href="/settings">
                  <Sliders className="h-3 w-3 text-primary" />
                  Settings
                </Link>
              </Button>

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
            </div>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {/* Demo Evaluation Walkthrough Modal */}
      <Dialog open={guideOpen} onOpenChange={setGuideOpen}>
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-base font-bold">
              <Sparkles className="h-4 w-4 text-primary" />
              WorkPay Protocol Walkthrough: Automated Escrow Lifecycle
            </DialogTitle>
            <DialogDescription className="text-xs">
              Interactive walkthrough of programmable escrow execution from agreement to verified PayPal release.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3 pt-2 text-xs">
            <div className="rounded-xl border border-blue-200/70 bg-blue-50/40 p-3 dark:border-blue-900/50 dark:bg-blue-950/20">
              <h4 className="font-semibold text-blue-900 dark:text-blue-200 flex items-center gap-1.5 mb-1">
                <span className="flex h-4 w-4 items-center justify-center rounded-full bg-blue-600 text-white text-[10px]">1</span>
                Task Owner Step: Agreement &amp; Escrow Lock
              </h4>
              <p className="text-muted-foreground leading-relaxed">
                Click <strong>"New Escrow Task"</strong> or select an existing task. Review the Definition of Done, add or customize criteria as needed, and click <strong>"Approve Agreement &amp; Match Specialist"</strong>. The agent reserves funds via PayPal Authorization hold into escrow.
              </p>
            </div>

            <div className="rounded-xl border border-emerald-200/70 bg-emerald-50/40 p-3 dark:border-emerald-900/50 dark:bg-emerald-950/20">
              <h4 className="font-semibold text-emerald-900 dark:text-emerald-200 flex items-center gap-1.5 mb-1">
                <span className="flex h-4 w-4 items-center justify-center rounded-full bg-emerald-600 text-white text-[10px]">2</span>
                Specialist Step: Milestone Delivery
              </h4>
              <p className="text-muted-foreground leading-relaxed">
                Switch perspective to <strong>Bob (Specialist)</strong> and visit the <strong>Work Studio</strong>. Review the transparent Definition of Done, accept the assignment, report progress check-ins, and submit your deliverable file.
              </p>
            </div>

            <div className="rounded-xl border border-purple-200/70 bg-purple-50/40 p-3 dark:border-purple-900/50 dark:bg-purple-950/20">
              <h4 className="font-semibold text-purple-900 dark:text-purple-200 flex items-center gap-1.5 mb-1">
                <span className="flex h-4 w-4 items-center justify-center rounded-full bg-purple-600 text-white text-[10px]">3</span>
                Verification Proofs &amp; PayPal Settlement
              </h4>
              <p className="text-muted-foreground leading-relaxed">
                WorkPay automatically inspects the deliverable against the agreed Definition of Done. If flawed, it rejects it and keeps funds safe in escrow. When clean, it triggers instant <strong>PayPal Capture</strong>, releasing payment and completing the task.
              </p>
            </div>

            <div className="flex items-center justify-between pt-2 border-t text-muted-foreground text-[11px]">
              <span>Need a fresh slate? Click "Reset Data" in the Perspective dropdown.</span>
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
