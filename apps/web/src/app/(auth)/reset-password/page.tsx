"use client";

import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { ArrowLeft, CheckCircle2, KeyRound, Lock, Mail } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

function ResetPasswordContent() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const tokenParam = searchParams.get("token") || "";
  const emailParam = searchParams.get("email") || "";

  const [email, setEmail] = useState(emailParam);
  const [tokenOrCode, setTokenOrCode] = useState(tokenParam);
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  useEffect(() => {
    if (emailParam) setEmail(emailParam);
    if (tokenParam) setTokenOrCode(tokenParam);
  }, [emailParam, tokenParam]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (newPassword.length < 8) {
      setError("New password must be at least 8 characters long.");
      return;
    }

    if (newPassword !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }

    setLoading(true);

    try {
      const res = await fetch("/api/v1/auth/reset-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: email.trim().toLowerCase(),
          tokenOrCode: tokenOrCode.trim(),
          newPassword,
        }),
      });

      const json = await res.json();
      if (!res.ok) {
        setError(json.error?.message || "Password reset failed. Please check your reset token or code.");
        setLoading(false);
        return;
      }

      setSuccess("Your password has been successfully reset! Redirecting to sign in...");
      setTimeout(() => {
        router.push("/login?reset=success");
      }, 1500);
    } catch {
      setError("Network error. Please try again.");
      setLoading(false);
    }
  };

  return (
    <Card className="border-border/80 shadow-lg bg-card">
      <CardHeader className="space-y-1 pb-4">
        <div className="flex items-center gap-2 mb-1">
          <Link
            href="/login"
            className="text-xs text-muted-foreground hover:text-foreground inline-flex items-center gap-1"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            Back to Sign In
          </Link>
        </div>
        <CardTitle className="text-xl font-bold tracking-tight text-foreground">
          Choose a New Password
        </CardTitle>
        <CardDescription className="text-xs">
          Enter your recovery token or 6-digit code to securely update your WorkPay credentials.
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-4">
        {error && (
          <div className="rounded-lg border border-rose-500/40 bg-rose-500/10 p-2.5 text-xs text-rose-600 dark:text-rose-400">
            {error}
          </div>
        )}

        {success && (
          <div className="rounded-lg border border-emerald-500/40 bg-emerald-500/10 p-2.5 text-xs text-emerald-600 dark:text-emerald-400 flex items-center gap-1.5">
            <CheckCircle2 className="h-4 w-4 shrink-0" />
            <span>{success}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-3.5">
          <div className="space-y-1.5">
            <Label htmlFor="email" className="text-xs">Account Email</Label>
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
            <Label htmlFor="tokenOrCode" className="text-xs">Reset Token or 6-Digit Code</Label>
            <div className="relative">
              <KeyRound className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                id="tokenOrCode"
                placeholder="Paste token or enter 6-digit code"
                value={tokenOrCode}
                onChange={(e) => setTokenOrCode(e.target.value)}
                required
                className="pl-9 font-mono text-xs"
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="newPassword" className="text-xs">New Password</Label>
            <div className="relative">
              <Lock className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                id="newPassword"
                type="password"
                placeholder="At least 8 characters"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                required
                className="pl-9 text-xs"
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="confirmPassword" className="text-xs">Confirm New Password</Label>
            <div className="relative">
              <Lock className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                id="confirmPassword"
                type="password"
                placeholder="Repeat new password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                required
                className="pl-9 text-xs"
              />
            </div>
          </div>

          <Button type="submit" className="w-full text-xs font-semibold" disabled={loading}>
            {loading ? "Updating Password..." : "Reset Password & Sign In"}
          </Button>
        </form>
      </CardContent>

      <CardFooter className="flex justify-center border-t border-border/60 py-3 text-xs text-muted-foreground">
        <span>Need a new code? </span>
        <Link href="/forgot-password" className="ml-1 font-semibold text-primary hover:underline">
          Request reset code
        </Link>
      </CardFooter>
    </Card>
  );
}

export default function ResetPasswordPage() {
  return (
    <Suspense fallback={<div className="p-8 text-center text-xs text-muted-foreground">Loading recovery portal...</div>}>
      <ResetPasswordContent />
    </Suspense>
  );
}
