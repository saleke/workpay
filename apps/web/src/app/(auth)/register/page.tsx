"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Briefcase, Lock, Mail, ShieldCheck, User } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export default function RegisterPage() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<"buyer" | "provider">("buyer");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (password.length < 8) {
      setError("Password must be at least 8 characters long.");
      return;
    }

    setLoading(true);

    try {
      const res = await fetch("/api/v1/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, email, password, role }),
      });

      const json = await res.json();
      if (!res.ok) {
        setError(json.error?.message || "Registration failed. Please try again.");
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

  return (
    <Card className="border-border/80 shadow-lg bg-card">
      <CardHeader className="space-y-1 pb-4">
        <CardTitle className="text-xl font-bold tracking-tight text-foreground">
          Create an Account
        </CardTitle>
        <CardDescription className="text-xs">
          Register to buy or provide work with escrow protection and verified milestone settlement.
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-4">
        {error && (
          <div className="rounded-lg border border-rose-500/40 bg-rose-500/10 p-2.5 text-xs text-rose-600 dark:text-rose-400">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-3">
          {/* Role Selection Tabs */}
          <div className="space-y-1.5">
            <Label className="text-xs">Select Your Role</Label>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setRole("buyer")}
                className={`flex flex-col items-start p-2.5 rounded-lg border text-left transition-all ${
                  role === "buyer"
                    ? "border-primary bg-primary/10 ring-1 ring-primary"
                    : "border-border/80 bg-muted/20 hover:bg-muted/50"
                }`}
              >
                <div className="flex items-center gap-1.5 font-semibold text-xs text-foreground mb-0.5">
                  <User className="h-3.5 w-3.5 text-primary" />
                  <span>Task Owner</span>
                </div>
                <span className="text-[10px] text-muted-foreground leading-tight">
                  I commission work and want escrow safety and verified delivery.
                </span>
              </button>

              <button
                type="button"
                onClick={() => setRole("provider")}
                className={`flex flex-col items-start p-2.5 rounded-lg border text-left transition-all ${
                  role === "provider"
                    ? "border-primary bg-primary/10 ring-1 ring-primary"
                    : "border-border/80 bg-muted/20 hover:bg-muted/50"
                }`}
              >
                <div className="flex items-center gap-1.5 font-semibold text-xs text-foreground mb-0.5">
                  <Briefcase className="h-3.5 w-3.5 text-emerald-500" />
                  <span>Specialist / Expert</span>
                </div>
                <span className="text-[10px] text-muted-foreground leading-tight">
                  I accept matched assignments and receive instant PayPal payouts.
                </span>
              </button>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="name" className="text-xs">Full Name</Label>
            <Input
              id="name"
              placeholder="Alice Johnson"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              className="text-xs"
            />
          </div>

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
            <Label htmlFor="password" className="text-xs">Password</Label>
            <div className="relative">
              <Lock className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                id="password"
                type="password"
                placeholder="At least 8 characters"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                minLength={8}
                className="pl-9 text-xs"
              />
            </div>
          </div>

          <Button type="submit" className="w-full text-xs font-semibold mt-2" disabled={loading}>
            {loading ? "Creating account..." : "Create Account"}
          </Button>
        </form>
      </CardContent>

      <CardFooter className="flex justify-center border-t border-border/60 py-3 text-xs text-muted-foreground">
        <span>Already have an account? </span>
        <Link href="/login" className="ml-1 font-semibold text-primary hover:underline">
          Sign In
        </Link>
      </CardFooter>
    </Card>
  );
}
