"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, CheckCircle2, KeyRound, Lock, Mail } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export default function ForgotPasswordPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [step, setStep] = useState<"request" | "reset">("request");
  const [code, setCode] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [issuedCode, setIssuedCode] = useState<string | null>(null);
  const [resetUrl, setResetUrl] = useState<string | null>(null);

  const handleRequestCode = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const res = await fetch("/api/v1/auth/forgot-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });

      const json = await res.json();
      if (!res.ok) {
        setError(json.error?.message || "Failed to process request. Please try again.");
        setLoading(false);
        return;
      }

      setIssuedCode(json.otpCode || null);
      setResetUrl(json.resetUrl || null);
      setStep("reset");
      setSuccess("A 6-digit reset code and confirmation link have been issued.");
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (newPassword.length < 8) {
      setError("Password must be at least 8 characters long.");
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
          email,
          tokenOrCode: code.trim(),
          newPassword,
        }),
      });

      const json = await res.json();
      if (!res.ok) {
        setError(json.error?.message || "Failed to reset password. Please check your code.");
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
          {step === "request" ? "Reset Your Password" : "Set New Password"}
        </CardTitle>
        <CardDescription className="text-xs">
          {step === "request"
            ? "Enter your account email to receive a 6-digit confirmation code and recovery link."
            : `Enter the 6-digit code dispatched to ${email} and choose a new password.`}
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

        {step === "request" ? (
          <form onSubmit={handleRequestCode} className="space-y-3.5">
            <div className="space-y-1.5">
              <Label htmlFor="email" className="text-xs">Registered Email Address</Label>
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

            <Button type="submit" className="w-full text-xs font-semibold" disabled={loading}>
              {loading ? "Issuing Reset Code..." : "Send Reset Code & Link"}
            </Button>
          </form>
        ) : (
          <form onSubmit={handleResetPassword} className="space-y-3.5">
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <Label htmlFor="code" className="text-xs">6-Digit Confirmation Code</Label>
                {issuedCode && (
                  <span className="text-[10px] font-mono font-semibold text-emerald-600 bg-emerald-500/10 px-1.5 py-0.5 rounded border border-emerald-500/20">
                    Code: {issuedCode}
                  </span>
                )}
              </div>
              <div className="relative">
                <KeyRound className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  id="code"
                  placeholder="123456"
                  value={code}
                  onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                  maxLength={6}
                  required
                  className="pl-9 font-mono tracking-widest text-xs"
                  autoFocus
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
              {loading ? "Updating Password..." : "Update Password"}
            </Button>

            {resetUrl && (
              <div className="pt-2 text-center">
                <a
                  href={resetUrl}
                  className="text-[11px] text-blue-600 dark:text-blue-400 hover:underline"
                >
                  Or click here to open the one-click reset link
                </a>
              </div>
            )}
          </form>
        )}
      </CardContent>

      <CardFooter className="flex justify-center border-t border-border/60 py-3 text-xs text-muted-foreground">
        <span>Remember your password? </span>
        <Link href="/login" className="ml-1 font-semibold text-primary hover:underline">
          Sign In
        </Link>
      </CardFooter>
    </Card>
  );
}
