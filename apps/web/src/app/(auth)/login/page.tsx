"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  BriefcaseBusiness,
  Github,
  Loader2,
  Lock,
  Mail,
  SearchCheck,
  UserRoundSearch,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { setTabSession, tabSessionFetch } from "@/lib/tab-session";

function GoogleMark() {
  return (
    <svg className="h-4 w-4 shrink-0" viewBox="0 0 24 24" aria-hidden="true">
      <path
        fill="#4285F4"
        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
      />
      <path
        fill="#34A853"
        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
      />
      <path
        fill="#FBBC05"
        d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
      />
      <path
        fill="#EA4335"
        d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
      />
    </svg>
  );
}

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [evaluationEnabled, setEvaluationEnabled] = useState(false);
  const [evaluationLoading, setEvaluationLoading] = useState<string | null>(null);
  const [oauthLoading, setOauthLoading] = useState<"github" | "google" | null>(null);
  const [oauthCapabilities, setOauthCapabilities] = useState({ github: false, google: false });

  useEffect(() => {
    void fetch("/api/v1/evaluation/session", { cache: "no-store" })
      .then((response) => response.json())
      .then((payload) => setEvaluationEnabled(payload.enabled === true))
      .catch(() => setEvaluationEnabled(false));
    void fetch("/api/v1/system/capabilities", { cache: "no-store" })
      .then((response) => response.json())
      .then((capabilities) =>
        setOauthCapabilities({
          github: capabilities.githubOAuth === true,
          google: capabilities.googleOAuth === true,
        }),
      )
      .catch(() => setOauthCapabilities({ github: false, google: false }));
  }, []);

  const enterEvaluation = async (perspective: "requester" | "professional" | "reviewer") => {
    setError(null);
    setEvaluationLoading(perspective);
    try {
      const response = await tabSessionFetch("/api/v1/evaluation/session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ perspective }),
      });
      const payload = await response.json();
      if (!response.ok) {
        setError(payload.error?.message || "Evaluator access could not be started.");
        return;
      }
      const user = payload.data?.user;
      const sessionToken = payload.data?.sessionToken;
      if (!user || !sessionToken) throw new Error("Evaluator session returned no session.");
      setTabSession(sessionToken, user);
      window.location.assign(payload.data.redirect || "/tasks");
    } catch {
      setError("Evaluator access could not be started. Please try again.");
    } finally {
      setEvaluationLoading(null);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const res = await tabSessionFetch("/api/v1/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim().toLowerCase(), password }),
      });

      const json = await res.json();
      if (!res.ok) {
        setError(json.error?.message || "Invalid credentials. Please try again.");
        setLoading(false);
        return;
      }

      const user = json.data?.user;
      const sessionToken = json.data?.sessionToken;
      if (user && sessionToken) {
        setTabSession(sessionToken, user);

        const searchParams =
          typeof window !== "undefined" ? new URLSearchParams(window.location.search) : null;
        const from = searchParams?.get("from");
        const defaultHome = json.data?.redirect || "/";
        const targetUrl = from && from.startsWith("/") && from !== "/login" ? from : defaultHome;
        window.location.assign(targetUrl);
      } else {
        setError("Sign-in returned no browser session. Please try again.");
        setLoading(false);
      }
    } catch {
      setError("Network error. Please try again.");
      setLoading(false);
    }
  };

  const startOAuth = async (provider: "github" | "google") => {
    setError(null);
    setOauthLoading(provider);
    try {
      const from = new URLSearchParams(window.location.search).get("from");
      const returnTo = from?.startsWith("/") && !from.startsWith("//") ? from : "/tasks";
      const endpoint =
        provider === "github" ? "/api/v1/user/github/connect" : "/api/v1/auth/google/connect";
      const response = await tabSessionFetch(
        `${endpoint}?format=json&returnTo=${encodeURIComponent(returnTo)}`,
        { headers: { Accept: "application/json" } },
      );
      const payload = await response.json();
      if (!response.ok || payload.configured === false || !payload.authorizeUrl) {
        throw new Error(payload.error?.message || payload.message || "OAuth is not available.");
      }
      window.location.assign(payload.authorizeUrl);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "OAuth sign-in could not be started.");
      setOauthLoading(null);
    }
  };

  return (
    <Card className="w-full min-w-0 overflow-hidden border-border/80 bg-card shadow-lg">
      <CardHeader className="space-y-1 pb-4">
        <CardTitle className="text-xl font-bold tracking-tight text-foreground">
          Sign In to Tenfo
        </CardTitle>
        <CardDescription className="text-xs">
          Enter your email and password to access your account.
        </CardDescription>
      </CardHeader>

      <CardContent className="min-w-0 space-y-4 overflow-hidden">
        {error ? (
          <div className="break-words rounded-lg border border-rose-500/40 bg-rose-500/10 p-2.5 text-xs text-rose-600 dark:text-rose-400">
            {error}
          </div>
        ) : null}

        {oauthCapabilities.github || oauthCapabilities.google ? (
          <div className="grid min-w-0 gap-2 sm:grid-cols-2">
            {oauthCapabilities.github ? (
              <Button
                type="button"
                variant="outline"
                className="min-w-0 gap-2 text-xs font-semibold hover:bg-muted"
                disabled={oauthLoading !== null}
                onClick={() => void startOAuth("github")}
              >
                {oauthLoading === "github" ? (
                  <Loader2 className="h-4 w-4 shrink-0 animate-spin" />
                ) : (
                  <Github className="h-4 w-4 shrink-0" />
                )}
                <span className="truncate">Continue with GitHub</span>
              </Button>
            ) : null}
            {oauthCapabilities.google ? (
              <Button
                type="button"
                variant="outline"
                className="min-w-0 gap-2 text-xs font-semibold hover:bg-muted"
                disabled={oauthLoading !== null}
                onClick={() => void startOAuth("google")}
              >
                {oauthLoading === "google" ? (
                  <Loader2 className="h-4 w-4 shrink-0 animate-spin" />
                ) : (
                  <GoogleMark />
                )}
                <span className="truncate">Continue with Google</span>
              </Button>
            ) : null}
          </div>
        ) : null}

        {oauthCapabilities.github || oauthCapabilities.google ? (
          <div className="flex items-center gap-3">
            <div className="h-px flex-1 bg-border/70" />
            <span className="shrink-0 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
              or use email
            </span>
            <div className="h-px flex-1 bg-border/70" />
          </div>
        ) : null}

        <form onSubmit={handleSubmit} className="min-w-0 space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="email" className="text-xs">
              Email Address
            </Label>
            <div className="relative">
              <Mail className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                id="email"
                type="email"
                placeholder="name@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                className="pl-9 text-xs"
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <Label htmlFor="password" className="text-xs">
                Password
              </Label>
              <Link
                href="/forgot-password"
                className="text-[11px] font-medium text-primary hover:underline"
              >
                Forgot password?
              </Link>
            </div>
            <div className="relative">
              <Lock className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                id="password"
                type="password"
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                className="pl-9 text-xs"
              />
            </div>
          </div>

          <Button type="submit" className="w-full text-xs font-semibold" disabled={loading}>
            {loading ? "Signing in..." : "Sign In"}
          </Button>
        </form>

        {evaluationEnabled ? (
          <>
            <div className="flex items-center gap-3">
              <div className="h-px flex-1 bg-border/70" />
              <span className="shrink-0 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                explore the evaluator demo
              </span>
              <div className="h-px flex-1 bg-border/70" />
            </div>
            <section className="min-w-0 overflow-hidden rounded-2xl border border-[var(--wp-border-strong)] bg-[var(--wp-surface-subtle)]/60 p-3">
              <div className="mb-3 flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-xs font-semibold text-foreground">
                    Choose a starting workspace
                  </p>
                  <p className="mt-0.5 text-[10px] text-muted-foreground">
                    One member identity can use every workspace.
                  </p>
                </div>
                <span className="shrink-0 rounded-full bg-violet-100 px-2 py-1 text-[9px] font-bold uppercase tracking-wide text-violet-800">
                  Simulated
                </span>
              </div>
              <div className="grid min-w-0 gap-2 min-[420px]:grid-cols-3">
                {[
                  {
                    perspective: "requester" as const,
                    name: "Maya",
                    label: "Request work",
                    icon: UserRoundSearch,
                  },
                  {
                    perspective: "professional" as const,
                    name: "Jordan",
                    label: "Offer work",
                    icon: BriefcaseBusiness,
                  },
                  {
                    perspective: "reviewer" as const,
                    name: "Nadia",
                    label: "Review work",
                    icon: SearchCheck,
                  },
                ].map(({ perspective, name, label, icon: Icon }) => (
                  <button
                    key={perspective}
                    type="button"
                    disabled={evaluationLoading !== null}
                    onClick={() => void enterEvaluation(perspective)}
                    className="flex min-w-0 items-center gap-3 rounded-xl border border-[var(--wp-border)] bg-white p-3 text-left transition hover:border-violet-300 hover:bg-violet-50 disabled:opacity-60 min-[420px]:flex-col min-[420px]:items-start"
                  >
                    <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-violet-100 text-violet-800">
                      {evaluationLoading === perspective ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Icon className="h-4 w-4" />
                      )}
                    </span>
                    <span className="min-w-0">
                      <span className="block truncate text-xs font-semibold text-slate-950">
                        {name}
                      </span>
                      <span className="block truncate text-[10px] text-slate-600">{label}</span>
                    </span>
                  </button>
                ))}
              </div>
            </section>
          </>
        ) : null}
      </CardContent>

      <CardFooter className="flex flex-wrap justify-center border-t border-border/60 py-3 text-xs text-muted-foreground">
        <span>{evaluationEnabled ? "Want your own account? " : "Don't have an account? "}</span>
        <Link href="/register" className="ml-1 font-semibold text-primary hover:underline">
          {evaluationEnabled ? "Create Account" : "Sign Up"}
        </Link>
      </CardFooter>
    </Card>
  );
}
