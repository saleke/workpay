"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AtSign, Check, CheckCircle2, Github, KeyRound, Lock, Mail, ShieldCheck, Sparkles, User } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export default function RegisterPage() {
  const router = useRouter();
  const [step, setStep] = useState<"form" | "verify">("form");
  const [name, setName] = useState("");
  const [username, setUsername] = useState("");
  const [usernameTouched, setUsernameTouched] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Email verification state on signup
  const [registeredUser, setRegisteredUser] = useState<any>(null);
  const [otpInput, setOtpInput] = useState("");
  const [issuedOtp, setIssuedOtp] = useState<string | null>(null);
  const [verificationUrl, setVerificationUrl] = useState<string | null>(null);
  const [verifyingOtp, setVerifyingOtp] = useState(false);

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
        setRegisteredUser(user);
        setIssuedOtp(json.data?.otpCode || null);
        setVerificationUrl(json.data?.verificationUrl || null);
        setStep("verify");
      }
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const handleCompleteAuth = (user: any) => {
    window.localStorage.setItem("workpay_auth_user", JSON.stringify(user));
    window.localStorage.setItem("workpay_persona", "buyer");
    window.localStorage.removeItem("workpay_signed_out");
    document.cookie = "workpay_persona=buyer; path=/; max-age=31536000";
    window.dispatchEvent(new Event("workpay_auth_change"));
    router.push("/tasks");
    router.refresh();
  };

  const handleVerifyOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!otpInput.trim()) {
      setError("Please enter the 6-digit confirmation code.");
      return;
    }

    setVerifyingOtp(true);

    try {
      const res = await fetch("/api/v1/auth/verify-email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: otpInput.trim() }),
      });

      const json = await res.json();
      if (!res.ok) {
        setError(json.error?.message || "Invalid or expired verification code.");
        setVerifyingOtp(false);
        return;
      }

      const verifiedUser = {
        ...registeredUser,
        emailVerified: new Date().toISOString(),
      };
      handleCompleteAuth(verifiedUser);
    } catch {
      setError("Network error while verifying code.");
      setVerifyingOtp(false);
    }
  };

  return (
    <Card className="border-border/80 shadow-lg bg-card">
      <CardHeader className="space-y-1 pb-4">
        <CardTitle className="text-xl font-bold tracking-tight text-foreground">
          {step === "form" ? "Create Your Account" : "Verify Your Email Address"}
        </CardTitle>
        <CardDescription className="text-xs">
          {step === "form"
            ? "Join the economic runtime for verifiable agentic delegation."
            : `We dispatched a 6-digit verification code to ${email}. Enter the code to activate your account.`}
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-4">
        {error && (
          <div className="rounded-lg border border-rose-500/40 bg-rose-500/10 p-2.5 text-xs text-rose-600 dark:text-rose-400">
            {error}
          </div>
        )}

        {step === "form" ? (
          <>
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
                Sign up with GitHub
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
                Sign up with Google
              </Button>
            </div>

            <div className="relative">
              <div className="absolute inset-0 flex items-center">
                <span className="w-full border-t border-border/70" />
              </div>
              <div className="relative flex justify-center text-[10px] uppercase font-semibold">
                <span className="bg-card px-2 text-muted-foreground">Or register with email</span>
              </div>
            </div>

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
                  <Label htmlFor="username" className="text-xs">Username Handle</Label>
                  <span className="text-[10px] text-muted-foreground">Permanent platform handle</span>
                </div>
                <div className="relative">
                  <AtSign className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                  <Input
                    id="username"
                    placeholder="elena_r"
                    value={username}
                    onChange={(e) => handleUsernameChange(e.target.value)}
                    required
                    className="pl-9 text-xs font-mono lowercase"
                  />
                </div>
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
                    className="pl-9 text-xs"
                  />
                </div>
              </div>

              <Button type="submit" className="w-full text-xs font-semibold" disabled={loading}>
                {loading ? "Creating Account..." : "Create Account & Verify Email"}
              </Button>
            </form>
          </>
        ) : (
          <form onSubmit={handleVerifyOtp} className="space-y-4">
            <div className="p-3 rounded-xl border border-[var(--wp-border)] bg-[var(--wp-surface-subtle)]/40 space-y-1">
              <div className="font-semibold text-xs text-foreground flex items-center justify-between">
                <span>Account Created: @{username}</span>
                <span className="text-[11px] text-muted-foreground">{email}</span>
              </div>
              <p className="text-[11px] text-muted-foreground">
                Enter the 6-digit confirmation code below to verify your email address.
              </p>
            </div>

            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <Label htmlFor="otpInput" className="text-xs font-semibold">6-Digit Code</Label>
                {issuedOtp && (
                  <span className="text-[10px] font-mono font-bold text-emerald-600 bg-emerald-500/10 px-1.5 py-0.5 rounded border border-emerald-500/20">
                    Code: {issuedOtp}
                  </span>
                )}
              </div>
              <div className="relative">
                <KeyRound className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  id="otpInput"
                  placeholder="123456"
                  value={otpInput}
                  onChange={(e) => setOtpInput(e.target.value.replace(/\D/g, "").slice(0, 6))}
                  maxLength={6}
                  required
                  className="pl-9 font-mono tracking-widest text-xs"
                  autoFocus
                />
              </div>
            </div>

            <Button type="submit" className="w-full text-xs font-semibold" disabled={verifyingOtp || otpInput.length < 6}>
              {verifyingOtp ? "Verifying..." : "Verify Email & Enter WorkPay"}
            </Button>

            {verificationUrl && (
              <div className="pt-1 text-center">
                <a
                  href={verificationUrl}
                  className="text-[11px] text-blue-600 dark:text-blue-400 hover:underline"
                >
                  Or click here to verify automatically via direct link
                </a>
              </div>
            )}

            <div className="text-center pt-2">
              <button
                type="button"
                onClick={() => handleCompleteAuth(registeredUser)}
                className="text-[11px] text-muted-foreground hover:text-foreground underline"
              >
                Skip verification for now and proceed
              </button>
            </div>
          </form>
        )}
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
