"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AtSign, Check, Lock, Mail, ShieldCheck, Sparkles, User } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export default function RegisterPage() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [username, setUsername] = useState("");
  const [usernameTouched, setUsernameTouched] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleNameChange = (val: string) => {
    setName(val);
    if (!usernameTouched) {
      const suggested = val
        .toLowerCase()
        .replace(/[^a-z0-9_-]/g, "_")
        .replace(/_+/g, "_")
        .slice(0, 24);
      setUsername(suggested);
    }
  };

  const handleUsernameChange = (val: string) => {
    setUsernameTouched(true);
    const cleaned = val.toLowerCase().replace(/[^a-z0-9_-]/g, "");
    setUsername(cleaned);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (username.length < 3) {
      setError("Username handle must be at least 3 characters.");
      return;
    }

    if (password.length < 8) {
      setError("Password must be at least 8 characters long.");
      return;
    }

    setLoading(true);

    try {
      const res = await fetch("/api/v1/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, username, email, password }),
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
        window.localStorage.setItem("workpay_persona", "buyer");
        window.localStorage.removeItem("workpay_signed_out");
        document.cookie = "workpay_persona=buyer; path=/; max-age=31536000";
        window.dispatchEvent(new Event("workpay_auth_change"));
        router.push("/tasks");
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
          Create Your Account
        </CardTitle>
        <CardDescription className="text-xs">
          Join the economic runtime for verifiable agentic delegation.
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-4">
        {error && (
          <div className="rounded-lg border border-rose-500/40 bg-rose-500/10 p-2.5 text-xs text-rose-600 dark:text-rose-400">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-3.5">
          <div className="space-y-1.5">
            <Label htmlFor="name" className="text-xs">Full Name</Label>
            <div className="relative">
              <User className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                id="name"
                placeholder="Elena Rostova"
                value={name}
                onChange={(e) => handleNameChange(e.target.value)}
                required
                className="pl-9 text-xs"
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <Label htmlFor="username" className="text-xs">Platform Handle</Label>
              <span className="text-[10px] text-muted-foreground">Permanent identifier</span>
            </div>
            <div className="relative">
              <AtSign className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                id="username"
                placeholder="elena_r"
                value={username}
                onChange={(e) => handleUsernameChange(e.target.value)}
                required
                minLength={3}
                maxLength={30}
                className="pl-9 text-xs font-mono"
              />
            </div>
            <p className="text-[10px] text-muted-foreground">
              Unique handle across audit logs and signed contract receipts. Cannot be changed later.
            </p>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="email" className="text-xs">Email Address</Label>
            <div className="relative">
              <Mail className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                id="email"
                type="email"
                placeholder="elena@company.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                className="pl-9 text-xs"
              />
            </div>
            <p className="text-[10px] text-muted-foreground">
              Institutional or personal domain. Disposable email addresses are blocked.
            </p>
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

          <Button type="submit" className="w-full text-xs font-semibold" disabled={loading}>
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
