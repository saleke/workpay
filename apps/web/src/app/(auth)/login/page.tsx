"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Github, Lock, Mail } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const res = await fetch("/api/v1/auth/login", {
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
      if (user) {
        window.localStorage.setItem("workpay_auth_user", JSON.stringify(user));
        window.localStorage.removeItem("workpay_persona");
        window.localStorage.removeItem("workpay_signed_out");
        document.cookie = `workpay_persona=${user.role}; path=/; max-age=31536000`;
        document.cookie = "workpay_signed_out=; path=/; max-age=0";
        window.dispatchEvent(new Event("workpay_auth_change"));

        const searchParams = typeof window !== "undefined" ? new URLSearchParams(window.location.search) : null;
        const from = searchParams?.get("from");
        const defaultHome =
          user.role === "provider" ? "/provider" : user.role === "admin_reviewer" ? "/review" : "/tasks";
        const targetUrl = from && from.startsWith("/") && from !== "/login" ? from : defaultHome;
        router.push(targetUrl);
        router.refresh();
      }
    } catch {
      setError("Network error. Please try again.");
      setLoading(false);
    }
  };

  return (
    <Card className="border-border/80 shadow-lg bg-card">
      <CardHeader className="space-y-1 pb-4">
        <CardTitle className="text-xl font-bold tracking-tight text-foreground">
          Sign In to WorkPay
        </CardTitle>
        <CardDescription className="text-xs">
          Enter your email and password to access your account.
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-4">
        {error && (
          <div className="rounded-lg border border-rose-500/40 bg-rose-500/10 p-2.5 text-xs text-rose-600 dark:text-rose-400">
            {error}
          </div>
        )}

        <div className="space-y-2">
          <Button
            type="button"
            variant="outline"
            className="w-full text-xs font-semibold flex items-center justify-center gap-2 hover:bg-muted"
            onClick={() => {
              window.location.href = "/api/v1/user/github/connect";
            }}
          >
            <Github className="h-4 w-4 shrink-0" />
            Continue with GitHub
          </Button>

          <Button
            type="button"
            variant="outline"
            className="w-full text-xs font-semibold flex items-center justify-center gap-2 hover:bg-muted"
            onClick={() => {
              window.location.href = "/api/v1/auth/google/connect";
            }}
          >
            <svg className="h-4 w-4 shrink-0" viewBox="0 0 24 24">
              <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
              <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
              <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z" />
              <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z" />
            </svg>
            Continue with Google
          </Button>
        </div>

        <div className="flex items-center gap-3 my-1">
          <div className="h-px flex-1 bg-border/70" />
          <span className="text-[10px] uppercase font-semibold text-muted-foreground tracking-wider">
            Or sign in with email
          </span>
          <div className="h-px flex-1 bg-border/70" />
        </div>

        <form onSubmit={handleSubmit} className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="email" className="text-xs">Email Address</Label>
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
              <Label htmlFor="password" className="text-xs">Password</Label>
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
      </CardContent>

      <CardFooter className="flex justify-center border-t border-border/60 py-3 text-xs text-muted-foreground">
        <span>Don&apos;t have an account? </span>
        <Link href="/register" className="ml-1 font-semibold text-primary hover:underline">
          Sign Up
        </Link>
      </CardFooter>
    </Card>
  );
}
