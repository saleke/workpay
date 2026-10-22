"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowRight, Briefcase, Lock, Mail, Scale, Sparkles, User } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useSystemMode } from "@/lib/mode";

export default function LoginPage() {
  const router = useRouter();
  const { isDemo } = useSystemMode();
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
        body: JSON.stringify({ email, password }),
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
        window.localStorage.setItem("workpay_persona", user.role);
        document.cookie = `workpay_persona=${user.role}; path=/; max-age=31536000`;
        router.push(user.role === "provider" ? "/provider" : "/tasks");
        router.refresh();
      }
    } catch {
      setError("Network error. Please try again.");
      setLoading(false);
    }
  };

  const handleDemoLogin = (role: "buyer" | "provider" | "admin_reviewer", homeUrl: string) => {
    window.localStorage.removeItem("workpay_auth_user");
    window.localStorage.setItem("workpay_persona", role);
    document.cookie = `workpay_persona=${role}; path=/; max-age=31536000`;
    router.push(homeUrl);
    router.refresh();
  };

  return (
    <Card className="border-border/80 shadow-lg bg-card">
      <CardHeader className="space-y-1 pb-4">
        <CardTitle className="text-xl font-bold tracking-tight text-foreground">
          Sign In to WorkPay
        </CardTitle>
        <CardDescription className="text-xs">
          Enter your email and password to access your escrow tasks and deliverables.
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-4">
        {error && (
          <div className="rounded-lg border border-rose-500/40 bg-rose-500/10 p-2.5 text-xs text-rose-600 dark:text-rose-400">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="email" className="text-xs">Email Address</Label>
            <div className="relative">
              <Mail className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                id="email"
                type="email"
                placeholder="alice@example.com"
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

        {isDemo && (
          <>
            <div className="relative">
              <div className="absolute inset-0 flex items-center">
                <span className="w-full border-t border-border/70" />
              </div>
              <div className="relative flex justify-center text-[10px] uppercase">
                <span className="bg-card px-2 text-muted-foreground font-semibold">
                  Or Evaluate as Demo Persona
                </span>
              </div>
            </div>

            {/* Demo Fast Login Pills */}
            <div className="grid grid-cols-3 gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => handleDemoLogin("buyer", "/tasks")}
                className="flex flex-col h-auto py-2 text-[11px] gap-1 hover:border-blue-500/50 hover:bg-blue-500/5"
              >
                <User className="h-3.5 w-3.5 text-blue-500" />
                <span className="font-semibold text-foreground">Alice</span>
                <span className="text-[9px] text-muted-foreground">Task Owner</span>
              </Button>

              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => handleDemoLogin("provider", "/provider")}
                className="flex flex-col h-auto py-2 text-[11px] gap-1 hover:border-emerald-500/50 hover:bg-emerald-500/5"
              >
                <Briefcase className="h-3.5 w-3.5 text-emerald-500" />
                <span className="font-semibold text-foreground">Bob</span>
                <span className="text-[9px] text-muted-foreground">Specialist</span>
              </Button>

              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => handleDemoLogin("admin_reviewer", "/review")}
                className="flex flex-col h-auto py-2 text-[11px] gap-1 hover:border-purple-500/50 hover:bg-purple-500/5"
              >
                <Scale className="h-3.5 w-3.5 text-purple-500" />
                <span className="font-semibold text-foreground">Carol</span>
                <span className="text-[9px] text-muted-foreground">Arbitrator</span>
              </Button>
            </div>
          </>
        )}
      </CardContent>

      <CardFooter className="flex justify-center border-t border-border/60 py-3 text-xs text-muted-foreground">
        <span>Don't have an account? </span>
        <Link href="/register" className="ml-1 font-semibold text-primary hover:underline">
          Create an account
        </Link>
      </CardFooter>
    </Card>
  );
}
