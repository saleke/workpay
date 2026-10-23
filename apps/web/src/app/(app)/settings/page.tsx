"use client";

import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import {
  Bell,
  Briefcase,
  Check,
  CheckCircle2,
  DollarSign,
  ExternalLink,
  FlaskConical,
  KeyRound,
  Lock,
  LogIn,
  LogOut,
  Mail,
  RefreshCw,
  RotateCcw,
  ShieldCheck,
  Sliders,
  User,
  Wallet,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import { useSystemMode } from "@/lib/mode";
import { ProviderProfileManager } from "@/components/provider/provider-profile-manager";
import { cn } from "@/lib/utils";

type SettingsTabKey =
  | "account"
  | "work-preferences"
  | "paypal"
  | "notifications"
  | "environment";

interface SettingsTabConfig {
  key: SettingsTabKey;
  title: string;
  shortTitle: string;
  description: string;
  icon: React.ComponentType<{ className?: string }>;
}

const SETTINGS_TABS: SettingsTabConfig[] = [
  {
    key: "account",
    title: "Account",
    shortTitle: "Account",
    description: "Profile information, credentials, and active session",
    icon: User,
  },
  {
    key: "work-preferences",
    title: "Work Preferences",
    shortTitle: "Work Preferences",
    description: "Skills, availability schedule, capacity, and commercial rules",
    icon: Briefcase,
  },
  {
    key: "paypal",
    title: "Payments",
    shortTitle: "Payments",
    description: "PayPal payout destination and payment flow",
    icon: Wallet,
  },
  {
    key: "notifications",
    title: "Notifications",
    shortTitle: "Notifications",
    description: "Task, verification, revision, and payout alerts",
    icon: Bell,
  },
  {
    key: "environment",
    title: "Environment",
    shortTitle: "Environment",
    description: "Sandbox simulation and runtime configuration",
    icon: Sliders,
  },
];

interface AuthUser {
  id: string;
  name: string | null;
  email: string;
  role: "buyer" | "provider" | "admin_reviewer";
}

function SettingsContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const rawTab = searchParams.get("tab") as SettingsTabKey | null;
  const initialTab: SettingsTabKey =
    rawTab && SETTINGS_TABS.some((t) => t.key === rawTab) ? rawTab : "account";

  const [activeTab, setActiveTab] = useState<SettingsTabKey>(initialTab);
  const { isDemo, setMode, envDefault } = useSystemMode();
  const [authUser, setAuthUser] = useState<AuthUser | null>(null);
  const [profileName, setProfileName] = useState("");
  const [savingProfile, setSavingProfile] = useState(false);

  // Password fields
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [updatingPassword, setUpdatingPassword] = useState(false);

  // PayPal payout email
  const [payoutEmail, setPayoutEmail] = useState("");
  const [savingPayout, setSavingPayout] = useState(false);

  // Demo reset modal
  const [resetting, setResetting] = useState(false);
  const [confirmResetOpen, setConfirmResetOpen] = useState(false);

  // Notification toggles
  const [notifyTaskOffers, setNotifyTaskOffers] = useState(true);
  const [notifyVerificationResults, setNotifyVerificationResults] = useState(true);
  const [notifyRevisions, setNotifyRevisions] = useState(true);
  const [notifyPayments, setNotifyPayments] = useState(true);
  const [notifyDisputes, setNotifyDisputes] = useState(true);

  useEffect(() => {
    if (rawTab && SETTINGS_TABS.some((t) => t.key === rawTab)) {
      setActiveTab(rawTab);
    }
  }, [rawTab]);

  useEffect(() => {
    const stored = window.localStorage.getItem("workpay_auth_user");
    if (stored) {
      try {
        const u = JSON.parse(stored);
        if (u?.id) {
          setAuthUser(u);
          setProfileName(u.name || "");
          setPayoutEmail(u.email || "");
        }
      } catch {
        // Ignore error
      }
    }
  }, []);

  // Fetch provider profile to sync current payout email if available
  useEffect(() => {
    let cancelled = false;
    async function loadProvider() {
      try {
        const res = await fetch("/api/v1/provider/profile");
        if (res.ok) {
          const json = await res.json();
          if (!cancelled && json?.provider?.payoutEmail) {
            setPayoutEmail(json.provider.payoutEmail);
          }
        }
      } catch {
        // Ignore background fetch error
      }
    }
    loadProvider();
    return () => {
      cancelled = true;
    };
  }, []);

  const handleSelectTab = (tabKey: SettingsTabKey) => {
    setActiveTab(tabKey);
    const params = new URLSearchParams(window.location.search);
    params.set("tab", tabKey);
    router.replace(`/settings?${params.toString()}`, { scroll: false });
  };

  const handleSaveProfile = (e: React.FormEvent) => {
    e.preventDefault();
    if (!authUser) return;
    setSavingProfile(true);
    setTimeout(() => {
      const updated = { ...authUser, name: profileName };
      window.localStorage.setItem("workpay_auth_user", JSON.stringify(updated));
      setAuthUser(updated);
      setSavingProfile(false);
      toast.success("Profile name updated successfully");
    }, 400);
  };

  const handleUpdatePassword = (e: React.FormEvent) => {
    e.preventDefault();
    if (newPassword.length < 8) {
      toast.error("New password must be at least 8 characters");
      return;
    }
    if (newPassword !== confirmPassword) {
      toast.error("New passwords do not match");
      return;
    }
    setUpdatingPassword(true);
    setTimeout(() => {
      setUpdatingPassword(false);
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      toast.success("Password updated successfully");
    }, 600);
  };

  const handleSavePayoutEmail = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!payoutEmail.includes("@")) {
      toast.error("Please enter a valid email address");
      return;
    }
    setSavingPayout(true);
    try {
      const res = await fetch("/api/v1/provider/profile", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ payoutEmail }),
      });
      if (res.ok) {
        toast.success("PayPal payout email saved");
      } else {
        toast.error("Failed to update payout configuration");
      }
    } catch {
      toast.error("Network error while saving payout email");
    } finally {
      setSavingPayout(false);
    }
  };

  const handleResetDemo = async () => {
    if (resetting) return;
    setResetting(true);
    try {
      const res = await fetch("/api/v1/demo/reset", { method: "POST" });
      if (res.ok) {
        window.localStorage.removeItem("workpay_auth_user");
        setAuthUser(null);
        window.localStorage.setItem("workpay_persona", "buyer");
        document.cookie = "workpay_persona=buyer; path=/; max-age=31536000";
        setConfirmResetOpen(false);
        toast.success("Sandbox restored to clean baseline");
        router.refresh();
      } else {
        toast.error("Failed to reset sandbox database");
      }
    } catch {
      toast.error("Error connecting to demo reset service");
    } finally {
      setResetting(false);
    }
  };

  const handleSignOut = async () => {
    try {
      await fetch("/api/v1/auth/logout", { method: "POST" });
    } catch {
      // Ignore error
    }
    window.localStorage.removeItem("workpay_auth_user");
    setAuthUser(null);
    toast.success("Signed out successfully");
    window.location.reload();
  };

  return (
    <div className="flex flex-col gap-6 max-w-6xl pb-16 font-sans">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-3 border-b border-[var(--wp-border)]">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-[var(--wp-text-primary)]">
            Settings
          </h1>
          <p className="text-xs sm:text-sm text-[var(--wp-text-secondary)] mt-0.5">
            Manage your account, worker preferences, payment settings, and environment.
          </p>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <Badge
            variant="outline"
            className={cn(
              "px-2.5 py-1 text-xs font-semibold rounded-lg border",
              isDemo
                ? "border-[var(--wp-accent)]/30 bg-[var(--wp-accent-subtle)] text-[var(--wp-accent)]"
                : "border-[var(--wp-success)]/30 bg-[var(--wp-success-subtle)] text-[var(--wp-success)]",
            )}
          >
            <span
              className={cn(
                "h-1.5 w-1.5 rounded-full mr-1.5 inline-block",
                isDemo ? "bg-[var(--wp-accent)]" : "bg-[var(--wp-success)]",
              )}
            />
            {isDemo ? "Sandbox Mode" : "Live Mode"}
          </Badge>
        </div>
      </div>

      {/* Settings Navigation and Main Content */}
      <div className="flex flex-col md:flex-row gap-6 items-start">
        {/* Navigation Sidebar */}
        <div className="w-full md:w-64 shrink-0 flex flex-row md:flex-col gap-1 overflow-x-auto pb-2 md:pb-0 scrollbar-none">
          {SETTINGS_TABS.map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.key;

            return (
              <button
                key={tab.key}
                type="button"
                onClick={() => handleSelectTab(tab.key)}
                className={cn(
                  "flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-xs sm:text-sm font-medium transition-all duration-150 text-left shrink-0 md:shrink select-none cursor-pointer active:scale-[0.98]",
                  isActive
                    ? "bg-white text-[var(--wp-text-primary)] font-semibold shadow-xs border border-[var(--wp-border)]"
                    : "text-[var(--wp-text-secondary)] hover:text-[var(--wp-text-primary)] hover:bg-[var(--wp-surface-subtle)] border border-transparent",
                )}
              >
                <div
                  className={cn(
                    "flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border transition-colors",
                    isActive
                      ? "bg-[var(--wp-surface-subtle)] text-[var(--wp-text-primary)] border-[var(--wp-border)]"
                      : "bg-transparent text-[var(--wp-text-secondary)] border-transparent",
                  )}
                >
                  <Icon className="h-4 w-4" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="truncate">{tab.title}</div>
                  <p className="hidden md:block text-[11px] text-[var(--wp-text-secondary)] truncate font-normal opacity-80 mt-0.5">
                    {tab.description}
                  </p>
                </div>
              </button>
            );
          })}
        </div>

        {/* Tab Content Panel */}
        <div className="flex-1 w-full min-w-0">
          {/* TAB 1: ACCOUNT */}
          {activeTab === "account" && (
            <div className="grid gap-6 animate-in fade-in-50 duration-150">
              {authUser ? (
                <>
                  {/* Profile Details */}
                  <Card className="border-[var(--wp-border)] shadow-xs overflow-hidden">
                    <CardHeader className="bg-[var(--wp-surface-subtle)]/50 border-b border-[var(--wp-border)] pb-4">
                      <CardTitle className="text-base font-semibold flex items-center gap-2">
                        <User className="h-4 w-4 text-[var(--wp-accent)]" />
                        Profile Information
                      </CardTitle>
                      <CardDescription className="text-xs sm:text-sm text-[var(--wp-text-secondary)]">
                        Your public name and contact email for WorkPay commitments.
                      </CardDescription>
                    </CardHeader>
                    <CardContent className="p-5 sm:p-6">
                      <form onSubmit={handleSaveProfile} className="space-y-4 max-w-lg">
                        <div className="space-y-1.5">
                          <Label htmlFor="profileName" className="text-xs">Display Name</Label>
                          <Input
                            id="profileName"
                            value={profileName}
                            onChange={(e) => setProfileName(e.target.value)}
                            className="text-xs"
                            required
                          />
                        </div>

                        <div className="space-y-1.5">
                          <Label htmlFor="profileEmail" className="text-xs">Email Address</Label>
                          <Input
                            id="profileEmail"
                            value={authUser.email}
                            disabled
                            className="text-xs bg-muted/40 cursor-not-allowed"
                          />
                          <p className="text-[11px] text-[var(--wp-text-secondary)]">
                            Your account email is used for login authentication and security alerts.
                          </p>
                        </div>

                        <Button type="submit" size="sm" disabled={savingProfile} className="text-xs font-semibold">
                          {savingProfile ? "Saving..." : "Save Profile"}
                        </Button>
                      </form>
                    </CardContent>
                  </Card>

                  {/* Password Management */}
                  <Card className="border-[var(--wp-border)] shadow-xs overflow-hidden">
                    <CardHeader className="bg-[var(--wp-surface-subtle)]/50 border-b border-[var(--wp-border)] pb-4">
                      <CardTitle className="text-base font-semibold flex items-center gap-2">
                        <KeyRound className="h-4 w-4 text-[var(--wp-accent)]" />
                        Change Password
                      </CardTitle>
                      <CardDescription className="text-xs sm:text-sm text-[var(--wp-text-secondary)]">
                        Update your password to keep your account secure.
                      </CardDescription>
                    </CardHeader>
                    <CardContent className="p-5 sm:p-6">
                      <form onSubmit={handleUpdatePassword} className="space-y-4 max-w-lg">
                        <div className="space-y-1.5">
                          <Label htmlFor="currentPassword" className="text-xs">Current Password</Label>
                          <Input
                            id="currentPassword"
                            type="password"
                            value={currentPassword}
                            onChange={(e) => setCurrentPassword(e.target.value)}
                            className="text-xs"
                            required
                          />
                        </div>

                        <div className="space-y-1.5">
                          <Label htmlFor="newPassword" className="text-xs">New Password</Label>
                          <Input
                            id="newPassword"
                            type="password"
                            placeholder="At least 8 characters"
                            value={newPassword}
                            onChange={(e) => setNewPassword(e.target.value)}
                            minLength={8}
                            className="text-xs"
                            required
                          />
                        </div>

                        <div className="space-y-1.5">
                          <Label htmlFor="confirmPassword" className="text-xs">Confirm New Password</Label>
                          <Input
                            id="confirmPassword"
                            type="password"
                            value={confirmPassword}
                            onChange={(e) => setConfirmPassword(e.target.value)}
                            minLength={8}
                            className="text-xs"
                            required
                          />
                        </div>

                        <Button type="submit" size="sm" disabled={updatingPassword} className="text-xs font-semibold">
                          {updatingPassword ? "Updating..." : "Update Password"}
                        </Button>
                      </form>
                    </CardContent>
                  </Card>

                  {/* Active Session & Sign Out */}
                  <Card className="border-[var(--wp-border)] shadow-xs overflow-hidden">
                    <CardHeader className="bg-[var(--wp-surface-subtle)]/50 border-b border-[var(--wp-border)] pb-4">
                      <CardTitle className="text-base font-semibold flex items-center gap-2">
                        <Lock className="h-4 w-4 text-[var(--wp-accent)]" />
                        Active Session
                      </CardTitle>
                      <CardDescription className="text-xs sm:text-sm text-[var(--wp-text-secondary)]">
                        You are currently signed in with your personal credentials.
                      </CardDescription>
                    </CardHeader>
                    <CardContent className="p-5 sm:p-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                      <div>
                        <div className="font-semibold text-sm text-[var(--wp-text-primary)]">
                          {authUser.name || authUser.email}
                        </div>
                        <div className="text-xs font-mono text-[var(--wp-text-secondary)] mt-0.5">
                          {authUser.email}
                        </div>
                      </div>

                      <Button
                        variant="outline"
                        size="sm"
                        onClick={handleSignOut}
                        className="text-[var(--wp-danger)] hover:bg-[var(--wp-danger-subtle)] hover:text-[var(--wp-danger)] border-[var(--wp-border)] shrink-0 font-medium text-xs"
                      >
                        <LogOut className="h-3.5 w-3.5 mr-1.5" />
                        Sign Out
                      </Button>
                    </CardContent>
                  </Card>
                </>
              ) : (
                /* Unauthenticated view */
                <Card className="border-[var(--wp-border)] shadow-xs overflow-hidden">
                  <CardHeader className="bg-[var(--wp-surface-subtle)]/50 border-b border-[var(--wp-border)] pb-4">
                    <CardTitle className="text-base font-semibold flex items-center gap-2">
                      <User className="h-4 w-4 text-[var(--wp-accent)]" />
                      Account Session
                    </CardTitle>
                    <CardDescription className="text-xs sm:text-sm text-[var(--wp-text-secondary)]">
                      {isDemo
                        ? "You are currently exploring WorkPay in Sandbox simulation mode."
                        : "You are not signed in."}
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="p-5 sm:p-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                    <div>
                      <div className="font-semibold text-sm text-[var(--wp-text-primary)]">
                        {isDemo ? "Sandbox Simulation Active" : "Sign In to Access Settings"}
                      </div>
                      <p className="text-xs text-[var(--wp-text-secondary)] mt-1 max-w-xl leading-relaxed">
                        {isDemo
                          ? "In Sandbox mode, you can explore the workflow using the persona switcher in the header, or register an account to test real credentials."
                          : "Please sign in or create an account to manage your profile and personal preferences."}
                      </p>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      <Button asChild variant="outline" size="sm" className="text-xs font-medium">
                        <Link href="/login">
                          <LogIn className="h-3.5 w-3.5 mr-1.5" />
                          Sign In
                        </Link>
                      </Button>
                      <Button asChild size="sm" className="text-xs font-semibold shadow-xs">
                        <Link href="/register">
                          Register Account
                        </Link>
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              )}
            </div>
          )}

          {/* TAB 2: WORK PREFERENCES */}
          {activeTab === "work-preferences" && (
            <div className="grid gap-6 animate-in fade-in-50 duration-150">
              <ProviderProfileManager />
            </div>
          )}

          {/* TAB 3: PAYMENTS */}
          {activeTab === "paypal" && (
            <div className="grid gap-6 animate-in fade-in-50 duration-150">
              {/* Payout Configuration Card */}
              <Card className="border-[var(--wp-border)] shadow-xs overflow-hidden">
                <CardHeader className="bg-[var(--wp-surface-subtle)]/50 border-b border-[var(--wp-border)] pb-4">
                  <CardTitle className="text-base font-semibold flex items-center gap-2">
                    <Wallet className="h-4 w-4 text-[var(--wp-accent)]" />
                    PayPal Payout Destination
                  </CardTitle>
                  <CardDescription className="text-xs sm:text-sm text-[var(--wp-text-secondary)]">
                    Specify the PayPal account email address to receive disbursements when completed work passes verification.
                  </CardDescription>
                </CardHeader>
                <CardContent className="p-5 sm:p-6">
                  <form onSubmit={handleSavePayoutEmail} className="space-y-4 max-w-lg">
                    <div className="space-y-1.5">
                      <Label htmlFor="payoutEmail" className="text-xs">PayPal Account Email</Label>
                      <div className="relative">
                        <Mail className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                        <Input
                          id="payoutEmail"
                          type="email"
                          placeholder="recipient@example.com"
                          value={payoutEmail}
                          onChange={(e) => setPayoutEmail(e.target.value)}
                          className="pl-9 text-xs"
                          required
                        />
                      </div>
                      <p className="text-[11px] text-[var(--wp-text-secondary)]">
                        Eligible payouts are dispatched directly to this address upon verified deliverable proof.
                      </p>
                    </div>

                    <Button type="submit" size="sm" disabled={savingPayout} className="text-xs font-semibold">
                      {savingPayout ? "Saving..." : "Save Payout Email"}
                    </Button>
                  </form>
                </CardContent>
              </Card>

              {/* How Payments Work */}
              <Card className="border-[var(--wp-border)] shadow-xs overflow-hidden">
                <CardHeader className="bg-[var(--wp-surface-subtle)]/50 border-b border-[var(--wp-border)] pb-4">
                  <CardTitle className="text-base font-semibold flex items-center gap-2">
                    <ShieldCheck className="h-4 w-4 text-[var(--wp-accent)]" />
                    How Payments Work
                  </CardTitle>
                  <CardDescription className="text-xs sm:text-sm text-[var(--wp-text-secondary)]">
                    WorkPay is non-custodial. Funds are never pooled, held in a digital wallet, or commingled.
                  </CardDescription>
                </CardHeader>
                <CardContent className="p-5 sm:p-6 grid sm:grid-cols-3 gap-4 text-xs">
                  <div className="p-4 rounded-xl border border-[var(--wp-border)] bg-white">
                    <div className="font-semibold text-xs text-[var(--wp-text-primary)] mb-1">
                      1. Authorization Hold
                    </div>
                    <p className="text-[11px] text-[var(--wp-text-secondary)] leading-relaxed">
                      When a task is authorized, PayPal places a temporary authorization hold on the client payment instrument for the contract amount.
                    </p>
                  </div>

                  <div className="p-4 rounded-xl border border-[var(--wp-border)] bg-white">
                    <div className="font-semibold text-xs text-[var(--wp-text-primary)] mb-1">
                      2. Deterministic Verification
                    </div>
                    <p className="text-[11px] text-[var(--wp-text-secondary)] leading-relaxed">
                      Deliverables are tested against objective acceptance criteria. Payment cannot execute until verification passes.
                    </p>
                  </div>

                  <div className="p-4 rounded-xl border border-[var(--wp-border)] bg-white">
                    <div className="font-semibold text-xs text-[var(--wp-text-primary)] mb-1">
                      3. Direct Payout Capture
                    </div>
                    <p className="text-[11px] text-[var(--wp-text-secondary)] leading-relaxed">
                      Upon verified completion, payment capture dispatches directly to the specialist recipient PayPal address.
                    </p>
                  </div>
                </CardContent>
              </Card>

              {/* Payment Records Link */}
              <div className="flex items-center justify-between p-4 rounded-xl border border-[var(--wp-border)] bg-white">
                <div>
                  <div className="text-xs font-semibold text-[var(--wp-text-primary)]">Payment Activity &amp; Records</div>
                  <div className="text-[11px] text-[var(--wp-text-secondary)] mt-0.5">
                    View transaction records, authorization holds, and captured payouts.
                  </div>
                </div>
                <Button asChild variant="outline" size="sm" className="text-xs">
                  <Link href="/payments">
                    <span>View Ledger</span>
                    <ExternalLink className="h-3 w-3 ml-1.5" />
                  </Link>
                </Button>
              </div>
            </div>
          )}

          {/* TAB 4: NOTIFICATIONS */}
          {activeTab === "notifications" && (
            <div className="grid gap-6 animate-in fade-in-50 duration-150">
              <Card className="border-[var(--wp-border)] shadow-xs overflow-hidden">
                <CardHeader className="bg-[var(--wp-surface-subtle)]/50 border-b border-[var(--wp-border)] pb-4">
                  <CardTitle className="text-base font-semibold flex items-center gap-2">
                    <Bell className="h-4 w-4 text-[var(--wp-accent)]" />
                    Notification Preferences
                  </CardTitle>
                  <CardDescription className="text-xs sm:text-sm text-[var(--wp-text-secondary)]">
                    Choose which consequential task milestones and payment events trigger notifications.
                  </CardDescription>
                </CardHeader>
                <CardContent className="p-5 sm:p-6 divide-y divide-[var(--wp-border)]">
                  <div className="py-3 flex items-start justify-between gap-4">
                    <div>
                      <span className="text-xs font-semibold text-[var(--wp-text-primary)] block">
                        Task Opportunities &amp; Offers
                      </span>
                      <span className="text-[11px] text-[var(--wp-text-secondary)] block mt-0.5">
                        Receive alerts when new task specifications match your capability tags.
                      </span>
                    </div>
                    <input
                      type="checkbox"
                      checked={notifyTaskOffers}
                      onChange={(e) => {
                        setNotifyTaskOffers(e.target.checked);
                        toast.success("Notification preference updated");
                      }}
                      className="h-4 w-4 rounded border-[var(--wp-border)] text-[var(--wp-accent)] focus:ring-[var(--wp-accent)] cursor-pointer mt-1"
                    />
                  </div>

                  <div className="py-3 flex items-start justify-between gap-4">
                    <div>
                      <span className="text-xs font-semibold text-[var(--wp-text-primary)] block">
                        Verification Results
                      </span>
                      <span className="text-[11px] text-[var(--wp-text-secondary)] block mt-0.5">
                        Notifications when deliverable tests complete with passing or failing outcomes.
                      </span>
                    </div>
                    <input
                      type="checkbox"
                      checked={notifyVerificationResults}
                      onChange={(e) => {
                        setNotifyVerificationResults(e.target.checked);
                        toast.success("Notification preference updated");
                      }}
                      className="h-4 w-4 rounded border-[var(--wp-border)] text-[var(--wp-accent)] focus:ring-[var(--wp-accent)] cursor-pointer mt-1"
                    />
                  </div>

                  <div className="py-3 flex items-start justify-between gap-4">
                    <div>
                      <span className="text-xs font-semibold text-[var(--wp-text-primary)] block">
                        Revision Requests
                      </span>
                      <span className="text-[11px] text-[var(--wp-text-secondary)] block mt-0.5">
                        Alerts when a deliverable requires revision before approval.
                      </span>
                    </div>
                    <input
                      type="checkbox"
                      checked={notifyRevisions}
                      onChange={(e) => {
                        setNotifyRevisions(e.target.checked);
                        toast.success("Notification preference updated");
                      }}
                      className="h-4 w-4 rounded border-[var(--wp-border)] text-[var(--wp-accent)] focus:ring-[var(--wp-accent)] cursor-pointer mt-1"
                    />
                  </div>

                  <div className="py-3 flex items-start justify-between gap-4">
                    <div>
                      <span className="text-xs font-semibold text-[var(--wp-text-primary)] block">
                        Payment Authorizations &amp; Captures
                      </span>
                      <span className="text-[11px] text-[var(--wp-text-secondary)] block mt-0.5">
                        Updates when PayPal authorization holds lock or settlement captures disburse.
                      </span>
                    </div>
                    <input
                      type="checkbox"
                      checked={notifyPayments}
                      onChange={(e) => {
                        setNotifyPayments(e.target.checked);
                        toast.success("Notification preference updated");
                      }}
                      className="h-4 w-4 rounded border-[var(--wp-border)] text-[var(--wp-accent)] focus:ring-[var(--wp-accent)] cursor-pointer mt-1"
                    />
                  </div>

                  <div className="py-3 flex items-start justify-between gap-4">
                    <div>
                      <span className="text-xs font-semibold text-[var(--wp-text-primary)] block">
                        Dispute Updates
                      </span>
                      <span className="text-[11px] text-[var(--wp-text-secondary)] block mt-0.5">
                        Alerts if a task enters dispute review or an arbitrator releases payment.
                      </span>
                    </div>
                    <input
                      type="checkbox"
                      checked={notifyDisputes}
                      onChange={(e) => {
                        setNotifyDisputes(e.target.checked);
                        toast.success("Notification preference updated");
                      }}
                      className="h-4 w-4 rounded border-[var(--wp-border)] text-[var(--wp-accent)] focus:ring-[var(--wp-accent)] cursor-pointer mt-1"
                    />
                  </div>
                </CardContent>
              </Card>
            </div>
          )}

          {/* TAB 5: ENVIRONMENT */}
          {activeTab === "environment" && (
            <div className="grid gap-6 animate-in fade-in-50 duration-150">
              {/* Execution Mode Card */}
              <Card className="border-[var(--wp-border)] shadow-xs overflow-hidden">
                <CardHeader className="bg-[var(--wp-surface-subtle)]/50 border-b border-[var(--wp-border)] pb-4">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-base font-semibold flex items-center gap-2">
                      <Sliders className="h-4 w-4 text-[var(--wp-accent)]" />
                      Runtime Execution Mode
                    </CardTitle>
                    <span className="text-xs text-[var(--wp-text-secondary)] font-mono">
                      Default: {envDefault === "demo" ? "Sandbox" : "Live"}
                    </span>
                  </div>
                  <CardDescription className="text-xs sm:text-sm text-[var(--wp-text-secondary)]">
                    Choose between Sandbox simulation mode for testing and Live mode for real payment authorizations.
                  </CardDescription>
                </CardHeader>
                <CardContent className="p-5 sm:p-6 grid sm:grid-cols-2 gap-4">
                  <div
                    onClick={() => {
                      setMode("demo");
                      toast.success("Switched to Sandbox Mode");
                    }}
                    className={cn(
                      "p-4 rounded-xl border-2 cursor-pointer transition-all",
                      isDemo
                        ? "border-[var(--wp-accent)] bg-[var(--wp-accent-subtle)]/30 font-semibold"
                        : "border-[var(--wp-border)] bg-white hover:bg-[var(--wp-surface-subtle)]",
                    )}
                  >
                    <div className="flex items-center justify-between text-xs mb-1">
                      <span className="flex items-center gap-2 text-[var(--wp-text-primary)] font-semibold">
                        <FlaskConical className="h-4 w-4 text-[var(--wp-accent)]" />
                        Sandbox Simulation
                      </span>
                      {isDemo && <Check className="h-3.5 w-3.5 text-[var(--wp-accent)]" />}
                    </div>
                    <p className="text-[11px] text-[var(--wp-text-secondary)] font-normal leading-relaxed">
                      Simulated PayPal authorizations and test verifications. Ideal for testing workflows.
                    </p>
                  </div>

                  <div
                    onClick={() => {
                      setMode("production");
                      toast.success("Switched to Live Mode");
                    }}
                    className={cn(
                      "p-4 rounded-xl border-2 cursor-pointer transition-all",
                      !isDemo
                        ? "border-[var(--wp-success)] bg-[var(--wp-success-subtle)]/30 font-semibold"
                        : "border-[var(--wp-border)] bg-white hover:bg-[var(--wp-surface-subtle)]",
                    )}
                  >
                    <div className="flex items-center justify-between text-xs mb-1">
                      <span className="flex items-center gap-2 text-[var(--wp-text-primary)] font-semibold">
                        <ShieldCheck className="h-4 w-4 text-[var(--wp-success)]" />
                        Live Production
                      </span>
                      {!isDemo && <Check className="h-3.5 w-3.5 text-[var(--wp-success)]" />}
                    </div>
                    <p className="text-[11px] text-[var(--wp-text-secondary)] font-normal leading-relaxed">
                      Live PayPal payment authorizations and real task execution.
                    </p>
                  </div>
                </CardContent>
              </Card>

              {/* Sandbox Reset (Only in Sandbox mode) */}
              {isDemo && (
                <Card className="border-[var(--wp-border)] shadow-xs overflow-hidden">
                  <CardHeader className="bg-[var(--wp-surface-subtle)]/50 border-b border-[var(--wp-border)] pb-4">
                    <CardTitle className="text-base font-semibold flex items-center gap-2">
                      <RotateCcw className="h-4 w-4 text-[var(--wp-accent)]" />
                      Reset Sandbox Data
                    </CardTitle>
                    <CardDescription className="text-xs sm:text-sm text-[var(--wp-text-secondary)]">
                      Restore test data to a pristine state for evaluation.
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="p-5 sm:p-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                    <div>
                      <div className="font-semibold text-sm text-[var(--wp-text-primary)]">Restore Baseline Fixtures</div>
                      <p className="text-xs text-[var(--wp-text-secondary)] mt-0.5 max-w-xl leading-relaxed">
                        Clears all test tasks and restores the canonical demonstration workflow.
                      </p>
                    </div>
                    <Button
                      variant="outline"
                      onClick={() => setConfirmResetOpen(true)}
                      disabled={resetting}
                      className="text-xs font-medium shrink-0 border-[var(--wp-border)]"
                    >
                      {resetting ? (
                        <RefreshCw className="h-3.5 w-3.5 animate-spin mr-1.5" />
                      ) : (
                        <RotateCcw className="h-3.5 w-3.5 mr-1.5" />
                      )}
                      <span>Reset Sandbox Data</span>
                    </Button>
                  </CardContent>
                </Card>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Confirmation Dialog for Demo Reset */}
      <Dialog open={confirmResetOpen} onOpenChange={setConfirmResetOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="text-base font-semibold">Reset Sandbox Data?</DialogTitle>
            <DialogDescription className="text-xs text-[var(--wp-text-secondary)] leading-relaxed mt-1">
              This will restore the database to the clean demonstration baseline. Any custom test tasks created during this session will be reset.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2 sm:gap-0 mt-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setConfirmResetOpen(false)}
              disabled={resetting}
              className="text-xs"
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              size="sm"
              onClick={handleResetDemo}
              disabled={resetting}
              className="text-xs font-semibold"
            >
              {resetting ? "Resetting..." : "Confirm Reset"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export default function SettingsPage() {
  return (
    <Suspense fallback={<div className="h-64 w-full animate-pulse rounded-xl bg-[var(--wp-surface-subtle)]" />}>
      <SettingsContent />
    </Suspense>
  );
}
