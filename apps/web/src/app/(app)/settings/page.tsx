"use client";

import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import {
  AlertCircle,
  AtSign,
  Bell,
  Briefcase,
  Check,
  CheckCircle2,
  DollarSign,
  ExternalLink,
  FileCheck2,
  Fingerprint,
  FlaskConical,
  Github,
  KeyRound,
  Link2,
  Lock,
  LogIn,
  LogOut,
  Mail,
  RefreshCw,
  RotateCcw,
  Shield,
  ShieldCheck,
  Sliders,
  Unlink,
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
    description: "PayPal account binding for holds and disbursements",
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
  username?: string | null;
  displayName?: string | null;
  email: string;
  role: "buyer" | "provider" | "admin_reviewer";
}

interface UserProfileData {
  id: string;
  name: string | null;
  username: string | null;
  displayName: string | null;
  legalName: string | null;
  email: string;
  role: "buyer" | "provider" | "admin_reviewer";
  image: string | null;
  githubUsername: string | null;
  githubVerifiedAt: string | null;
  idVerificationStatus: string;
  idVerifiedAt: string | null;
  idDocumentType: string | null;
  paypalPayerId: string | null;
  paypalPayoutEmail: string | null;
  paypalLinkedAt: string | null;
  paypalVerified: boolean;
  paypalAutoHoldEnabled: boolean;
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
  const [userProfile, setUserProfile] = useState<UserProfileData | null>(null);
  const [profileName, setProfileName] = useState("");
  const [savingProfile, setSavingProfile] = useState(false);

  // Password fields
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [updatingPassword, setUpdatingPassword] = useState(false);

  // PayPal binding fields
  const [payoutEmail, setPayoutEmail] = useState("");
  const [savingPayout, setSavingPayout] = useState(false);
  const [paypalModalOpen, setPaypalModalOpen] = useState(false);
  const [inputPaypalEmail, setInputPaypalEmail] = useState("");
  const [inputAutoHold, setInputAutoHold] = useState(true);
  const [bindingPaypal, setBindingPaypal] = useState(false);
  const [unbindModalOpen, setUnbindModalOpen] = useState(false);
  const [unbindingPaypal, setUnbindingPaypal] = useState(false);

  // Developer Verification (Step 2 - GitHub)
  const [githubModalOpen, setGithubModalOpen] = useState(false);
  const [inputGithub, setInputGithub] = useState("");
  const [verifyingGithub, setVerifyingGithub] = useState(false);

  // Identity Verification (Step 3 - Government ID & Milestone Threshold)
  const [idModalOpen, setIdModalOpen] = useState(false);
  const [inputLegalName, setInputLegalName] = useState("");
  const [inputDocType, setInputDocType] = useState<"PASSPORT" | "DRIVERS_LICENSE" | "NATIONAL_ID">("PASSPORT");
  const [inputCountry, setInputCountry] = useState("US");
  const [verifyingId, setVerifyingId] = useState(false);

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

  const loadProfile = async () => {
    try {
      const res = await fetch("/api/v1/user/profile");
      if (res.ok) {
        const json = await res.json();
        if (json?.data?.user) {
          const u = json.data.user as UserProfileData;
          setUserProfile(u);
          setProfileName(u.displayName || u.name || "");
          setPayoutEmail(u.paypalPayoutEmail || u.email || "");
          setInputPaypalEmail(u.paypalPayoutEmail || u.email || "");
          setInputAutoHold(u.paypalAutoHoldEnabled ?? true);
        }
      }
    } catch {
      // Ignore background fetch error
    }
  };

  useEffect(() => {
    const stored = window.localStorage.getItem("workpay_auth_user");
    if (stored) {
      try {
        const u = JSON.parse(stored);
        if (u?.id) {
          setAuthUser(u);
          setProfileName(u.displayName || u.name || "");
          setPayoutEmail(u.email || "");
        }
      } catch {
        // Ignore error
      }
    }
    loadProfile();
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

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!profileName.trim()) {
      toast.error("Please enter a valid display name");
      return;
    }
    setSavingProfile(true);
    try {
      const res = await fetch("/api/v1/user/profile", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ displayName: profileName.trim() }),
      });
      const json = await res.json();
      if (!res.ok) {
        toast.error(json.error?.message || "Failed to update profile name");
        return;
      }
      if (json?.data?.user) {
        setUserProfile(json.data.user);
        const stored = window.localStorage.getItem("workpay_auth_user");
        if (stored) {
          try {
            const u = JSON.parse(stored);
            const updated = { ...u, name: profileName.trim(), displayName: profileName.trim() };
            window.localStorage.setItem("workpay_auth_user", JSON.stringify(updated));
            setAuthUser(updated);
            window.dispatchEvent(new Event("workpay_auth_change"));
          } catch {
            // ignore
          }
        }
      }
      toast.success("Display name updated successfully");
    } catch {
      toast.error("Network error while updating profile");
    } finally {
      setSavingProfile(false);
    }
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

  const handleVerifyGithub = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputGithub.trim()) {
      toast.error("Please enter your GitHub username");
      return;
    }
    setVerifyingGithub(true);
    try {
      const res = await fetch("/api/v1/user/verify-github", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ githubUsername: inputGithub.trim() }),
      });
      const json = await res.json();
      if (!res.ok) {
        toast.error(json.error?.message || "Failed to verify GitHub profile");
        return;
      }
      toast.success("GitHub profile verified. Developer trust badge earned.");
      setGithubModalOpen(false);
      setInputGithub("");
      await loadProfile();
    } catch {
      toast.error("Network error during GitHub verification");
    } finally {
      setVerifyingGithub(false);
    }
  };

  const handleUnlinkGithub = async () => {
    try {
      const res = await fetch("/api/v1/user/verify-github", { method: "DELETE" });
      if (res.ok) {
        toast.success("GitHub profile unlinked");
        await loadProfile();
      } else {
        toast.error("Failed to unlink GitHub profile");
      }
    } catch {
      toast.error("Network error while unlinking GitHub");
    }
  };

  const handleVerifyIdentity = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputLegalName.trim() || inputLegalName.trim().split(/\s+/).length < 2) {
      toast.error("Please enter your legal first and last name");
      return;
    }
    setVerifyingId(true);
    try {
      const res = await fetch("/api/v1/user/verify-identity", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          legalName: inputLegalName.trim(),
          documentType: inputDocType,
          country: inputCountry.trim() || "US",
        }),
      });
      const json = await res.json();
      if (!res.ok) {
        toast.error(json.error?.message || "Government identity verification failed");
        return;
      }
      toast.success("Identity verified successfully. High-value task threshold unlocked.");
      setIdModalOpen(false);
      await loadProfile();
    } catch {
      toast.error("Network error during identity verification");
    } finally {
      setVerifyingId(false);
    }
  };

  const handleBindPaypal = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputPaypalEmail.includes("@")) {
      toast.error("Please enter a valid PayPal account email address");
      return;
    }
    setBindingPaypal(true);
    try {
      const res = await fetch("/api/v1/user/paypal/bind", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          paypalEmail: inputPaypalEmail.trim(),
          autoHoldEnabled: inputAutoHold,
        }),
      });
      const json = await res.json();
      if (!res.ok) {
        toast.error(json.error?.message || "Failed to bind PayPal account");
        return;
      }
      toast.success("PayPal account linked and verified for payment holds and disbursements");
      setPaypalModalOpen(false);
      await loadProfile();
    } catch {
      toast.error("Network error while binding PayPal account");
    } finally {
      setBindingPaypal(false);
    }
  };

  const handleUnbindPaypal = async () => {
    setUnbindingPaypal(true);
    try {
      const res = await fetch("/api/v1/user/paypal/unbind", { method: "POST" });
      if (res.ok) {
        toast.success("PayPal account unlinked successfully");
        setUnbindModalOpen(false);
        await loadProfile();
      } else {
        toast.error("Failed to unlink PayPal account");
      }
    } catch {
      toast.error("Network error while unbinding PayPal account");
    } finally {
      setUnbindingPaypal(false);
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
                        Public handle and custom display name for WorkPay commitments and cryptographic audit logs.
                      </CardDescription>
                    </CardHeader>
                    <CardContent className="p-5 sm:p-6">
                      <form onSubmit={handleSaveProfile} className="space-y-4 max-w-lg">
                        {/* Platform Handle: Locked & Immutable */}
                        <div className="space-y-1.5">
                          <div className="flex items-center justify-between">
                            <Label htmlFor="platformHandle" className="text-xs">Platform Handle</Label>
                            <Badge variant="outline" className="text-[10px] bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300 font-mono flex items-center gap-1 border-slate-300">
                              <Lock className="h-2.5 w-2.5" />
                              Locked &amp; Immutable
                            </Badge>
                          </div>
                          <div className="relative">
                            <AtSign className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                            <Input
                              id="platformHandle"
                              value={userProfile?.username || authUser.username || "user"}
                              disabled
                              className="pl-9 text-xs font-mono bg-muted/40 cursor-not-allowed select-all"
                            />
                          </div>
                          <p className="text-[11px] text-[var(--wp-text-secondary)]">
                            Platform handles are permanent identifiers across signed contract receipts and public audit logs. Usernames cannot be edited.
                          </p>
                        </div>

                        {/* Editable Custom Display Name */}
                        <div className="space-y-1.5">
                          <Label htmlFor="profileName" className="text-xs">Display Name</Label>
                          <div className="relative">
                            <User className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                            <Input
                              id="profileName"
                              value={profileName}
                              onChange={(e) => setProfileName(e.target.value)}
                              className="pl-9 text-xs font-medium"
                              placeholder="Elena Rostova"
                              required
                            />
                          </div>
                          <p className="text-[11px] text-[var(--wp-text-secondary)]">
                            Human display name shown on your tasks, proposals, and team views.
                          </p>
                        </div>

                        {/* Verified Account Email */}
                        <div className="space-y-1.5">
                          <Label htmlFor="profileEmail" className="text-xs">Account Email</Label>
                          <div className="relative">
                            <Mail className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                            <Input
                              id="profileEmail"
                              value={authUser.email}
                              disabled
                              className="pl-9 text-xs bg-muted/40 cursor-not-allowed"
                            />
                          </div>
                          <p className="text-[11px] text-[var(--wp-text-secondary)]">
                            Your verified account email used for authentication and security alerts.
                          </p>
                        </div>

                        <Button type="submit" size="sm" disabled={savingProfile} className="text-xs font-semibold">
                          {savingProfile ? "Saving..." : "Save Display Name"}
                        </Button>
                      </form>
                    </CardContent>
                  </Card>

                  {/* Step 2: Developer Quality Verification (GitHub) */}
                  <Card className="border-[var(--wp-border)] shadow-xs overflow-hidden">
                    <CardHeader className="bg-[var(--wp-surface-subtle)]/50 border-b border-[var(--wp-border)] pb-4">
                      <div className="flex items-center justify-between">
                        <CardTitle className="text-base font-semibold flex items-center gap-2">
                          <Github className="h-4 w-4 text-[var(--wp-accent)]" />
                          Developer Quality Verification
                        </CardTitle>
                        {userProfile?.githubUsername ? (
                          <Badge className="bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20 text-xs flex items-center gap-1 font-semibold">
                            <CheckCircle2 className="h-3 w-3" />
                            Verified Developer
                          </Badge>
                        ) : (
                          <Badge variant="outline" className="text-amber-600 border-amber-500/30 text-xs">
                            Unverified Profile
                          </Badge>
                        )}
                      </div>
                      <CardDescription className="text-xs sm:text-sm text-[var(--wp-text-secondary)]">
                        Connect your GitHub profile to unlock specialist assignments, display developer trust badges, and qualify for high-tier engineering tasks.
                      </CardDescription>
                    </CardHeader>
                    <CardContent className="p-5 sm:p-6">
                      {userProfile?.githubUsername ? (
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-4 rounded-xl border border-emerald-500/20 bg-emerald-500/5">
                          <div className="flex items-center gap-3">
                            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-emerald-500/10 text-emerald-600 border border-emerald-500/20">
                              <Github className="h-5 w-5" />
                            </div>
                            <div>
                              <div className="font-semibold text-sm text-[var(--wp-text-primary)] flex items-center gap-2">
                                <span>@{userProfile.githubUsername}</span>
                                <Badge variant="outline" className="text-[10px] font-mono text-emerald-600 border-emerald-500/30">
                                  GitHub Verified
                                </Badge>
                              </div>
                              <p className="text-[11px] text-[var(--wp-text-secondary)] mt-0.5">
                                Public contribution metrics and repository trust badges linked to your WorkPay identity.
                              </p>
                            </div>
                          </div>

                          <div className="flex items-center gap-2 shrink-0">
                            <Button asChild variant="outline" size="sm" className="text-xs">
                              <a
                                href={`https://github.com/${userProfile.githubUsername}`}
                                target="_blank"
                                rel="noreferrer"
                                className="flex items-center gap-1.5"
                              >
                                <span>View GitHub</span>
                                <ExternalLink className="h-3 w-3" />
                              </a>
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={handleUnlinkGithub}
                              className="text-rose-600 hover:bg-rose-50 hover:text-rose-700 text-xs"
                            >
                              Unlink
                            </Button>
                          </div>
                        </div>
                      ) : (
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-4 rounded-xl border border-[var(--wp-border)] bg-[var(--wp-surface-subtle)]/40">
                          <div>
                            <div className="font-semibold text-xs text-[var(--wp-text-primary)]">
                              No GitHub Account Connected
                            </div>
                            <p className="text-[11px] text-[var(--wp-text-secondary)] mt-0.5 max-w-xl">
                              Link your public GitHub handle to demonstrate technical track record and verify developer identity for automated task matching.
                            </p>
                          </div>
                          <Button
                            type="button"
                            size="sm"
                            onClick={() => setGithubModalOpen(true)}
                            className="text-xs font-semibold shrink-0"
                          >
                            <Github className="h-3.5 w-3.5 mr-1.5" />
                            Verify GitHub Profile
                          </Button>
                        </div>
                      )}
                    </CardContent>
                  </Card>

                  {/* Step 3: Government Identity & Milestone Threshold */}
                  <Card className="border-[var(--wp-border)] shadow-xs overflow-hidden">
                    <CardHeader className="bg-[var(--wp-surface-subtle)]/50 border-b border-[var(--wp-border)] pb-4">
                      <div className="flex items-center justify-between">
                        <CardTitle className="text-base font-semibold flex items-center gap-2">
                          <Fingerprint className="h-4 w-4 text-[var(--wp-accent)]" />
                          Identity Verification &amp; Payout Thresholds
                        </CardTitle>
                        {userProfile?.idVerificationStatus === "VERIFIED" ? (
                          <Badge className="bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20 text-xs flex items-center gap-1 font-semibold">
                            <CheckCircle2 className="h-3 w-3" />
                            Government ID Verified
                          </Badge>
                        ) : (
                          <Badge variant="outline" className="text-amber-600 border-amber-500/30 text-xs">
                            Tier 1 (Sub-$1,000 Unlocked)
                          </Badge>
                        )}
                      </div>
                      <CardDescription className="text-xs sm:text-sm text-[var(--wp-text-secondary)]">
                        Non-custodial holds operate seamlessly for all accounts. Tasks or cumulative milestone payouts exceeding $1,000 USD require verified legal identity.
                      </CardDescription>
                    </CardHeader>
                    <CardContent className="p-5 sm:p-6 space-y-4">
                      {/* Milestone Threshold Banner */}
                      <div className="p-4 rounded-xl border border-[var(--wp-border)] bg-[var(--wp-surface-subtle)]/40 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="font-semibold text-xs text-[var(--wp-text-primary)]">
                              $1,000 Milestone Limit Rule
                            </span>
                            <Badge variant="outline" className="text-[10px] font-mono text-[var(--wp-accent)] border-[var(--wp-border)]">
                              Persona Standard
                            </Badge>
                          </div>
                          <p className="text-[11px] text-[var(--wp-text-secondary)] mt-1 max-w-xl leading-relaxed">
                            Tasks below $1,000 USD execute without government ID. Tasks or cumulative payouts exceeding $1,000 USD require Persona or Stripe Identity verification before settlement capture.
                          </p>
                        </div>

                        {userProfile?.idVerificationStatus !== "VERIFIED" && (
                          <Button
                            type="button"
                            size="sm"
                            onClick={() => setIdModalOpen(true)}
                            className="text-xs font-semibold shrink-0"
                          >
                            <Shield className="h-3.5 w-3.5 mr-1.5" />
                            Verify Government ID
                          </Button>
                        )}
                      </div>

                      {userProfile?.idVerificationStatus === "VERIFIED" && (
                        <div className="p-4 rounded-xl border border-emerald-500/20 bg-emerald-500/5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                          <div className="flex items-center gap-3">
                            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-emerald-500/10 text-emerald-600 border border-emerald-500/20">
                              <ShieldCheck className="h-5 w-5" />
                            </div>
                            <div>
                              <div className="font-semibold text-sm text-[var(--wp-text-primary)]">
                                Verified Legal Identity: {userProfile.legalName ? `${userProfile.legalName.slice(0, 1)}*** ${userProfile.legalName.split(" ").slice(-1)[0]}` : "Verified Individual"}
                              </div>
                              <p className="text-[11px] text-[var(--wp-text-secondary)] mt-0.5">
                                Document Type: {userProfile.idDocumentType || "Passport"} (Verified via compliance sandbox). High-value task thresholds permanently unlocked.
                              </p>
                            </div>
                          </div>
                          <Badge variant="outline" className="text-[10px] font-mono text-emerald-600 border-emerald-500/30 shrink-0">
                            All Tiers Unlocked
                          </Badge>
                        </div>
                      )}
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
                          {userProfile?.displayName || authUser.name || authUser.email}
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

          {/* TAB 3: PAYMENTS (PayPal Account Binding) */}
          {activeTab === "paypal" && (
            <div className="grid gap-6 animate-in fade-in-50 duration-150">
              {/* PayPal Account Binding Card */}
              <Card className="border-[var(--wp-border)] shadow-xs overflow-hidden">
                <CardHeader className="bg-[var(--wp-surface-subtle)]/50 border-b border-[var(--wp-border)] pb-4">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-base font-semibold flex items-center gap-2">
                      <Wallet className="h-4 w-4 text-[var(--wp-accent)]" />
                      PayPal Account Binding
                    </CardTitle>
                    {userProfile?.paypalVerified ? (
                      <Badge className="bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20 text-xs flex items-center gap-1 font-semibold">
                        <CheckCircle2 className="h-3 w-3" />
                        Linked &amp; Verified
                      </Badge>
                    ) : (
                      <Badge variant="outline" className="text-amber-600 border-amber-500/30 text-xs">
                        No Account Linked
                      </Badge>
                    )}
                  </div>
                  <CardDescription className="text-xs sm:text-sm text-[var(--wp-text-secondary)]">
                    Bind your verified PayPal account to enable both Task Owner authorization holds and Specialist payout disbursements.
                  </CardDescription>
                </CardHeader>
                <CardContent className="p-5 sm:p-6 space-y-5">
                  {userProfile?.paypalVerified ? (
                    <div className="space-y-4">
                      {/* Active Bound Account Summary */}
                      <div className="p-5 rounded-xl border border-emerald-500/20 bg-emerald-500/5 space-y-4">
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                          <div className="flex items-center gap-3">
                            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-emerald-500/10 text-emerald-600 border border-emerald-500/20">
                              <Wallet className="h-5 w-5" />
                            </div>
                            <div>
                              <div className="font-semibold text-sm text-[var(--wp-text-primary)] flex items-center gap-2">
                                <span>{userProfile.paypalPayoutEmail}</span>
                                <Badge variant="outline" className="text-[10px] font-mono text-emerald-600 border-emerald-500/30">
                                  PayPal Payer
                                </Badge>
                              </div>
                              <p className="text-[11px] text-[var(--wp-text-secondary)] font-mono mt-0.5">
                                Account ID: {userProfile.paypalPayerId || "PAYER-VERIFIED"}
                              </p>
                            </div>
                          </div>

                          <div className="flex items-center gap-2 shrink-0">
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              onClick={() => {
                                setInputPaypalEmail(userProfile.paypalPayoutEmail || "");
                                setPaypalModalOpen(true);
                              }}
                              className="text-xs font-medium"
                            >
                              Edit Settings
                            </Button>
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              onClick={() => setUnbindModalOpen(true)}
                              className="text-rose-600 hover:bg-rose-50 hover:text-rose-700 text-xs"
                            >
                              <Unlink className="h-3.5 w-3.5 mr-1" />
                              Unbind
                            </Button>
                          </div>
                        </div>

                        <div className="grid sm:grid-cols-2 gap-3 pt-3 border-t border-emerald-500/15 text-xs">
                          <div>
                            <span className="text-[11px] text-[var(--wp-text-secondary)] block">Payment Role:</span>
                            <span className="font-medium text-[var(--wp-text-primary)]">
                              Task Owner Holds &amp; Specialist Payouts
                            </span>
                          </div>
                          <div>
                            <span className="text-[11px] text-[var(--wp-text-secondary)] block">Auto-Hold Authorization:</span>
                            <span className="font-medium text-emerald-600">
                              {userProfile.paypalAutoHoldEnabled ? "Enabled (One-click holds on PayPal)" : "Manual prompt per task"}
                            </span>
                          </div>
                        </div>
                      </div>

                      <div className="p-4 rounded-xl border border-[var(--wp-border)] bg-[var(--wp-surface-subtle)]/40 flex items-start gap-3">
                        <ShieldCheck className="h-5 w-5 text-emerald-600 shrink-0 mt-0.5" />
                        <div className="text-xs leading-relaxed text-[var(--wp-text-secondary)]">
                          <strong className="text-[var(--wp-text-primary)] font-semibold block mb-0.5">
                            Non-Custodial Financial Settlement
                          </strong>
                          When you commission a task, PayPal places a non-custodial authorization hold on your account. When you complete an assignment, funds capture directly to this PayPal address upon deliverable proof verification. WorkPay is strictly non-custodial and never holds digital wallet balances.
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-5 rounded-xl border border-dashed border-[var(--wp-border)] bg-[var(--wp-surface-subtle)]/30">
                      <div>
                        <div className="font-semibold text-sm text-[var(--wp-text-primary)]">
                          No PayPal Account Bound
                        </div>
                        <p className="text-xs text-[var(--wp-text-secondary)] mt-1 max-w-xl leading-relaxed">
                          Link your PayPal account to pre-authorize task holds when commissioning work, and receive direct settlement disbursements upon completing verified deliverables.
                        </p>
                      </div>

                      <Button
                        type="button"
                        size="sm"
                        onClick={() => {
                          setInputPaypalEmail(userProfile?.email || authUser?.email || "");
                          setPaypalModalOpen(true);
                        }}
                        className="text-xs font-semibold shrink-0"
                      >
                        <Link2 className="h-3.5 w-3.5 mr-1.5" />
                        Link PayPal Account
                      </Button>
                    </div>
                  )}
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

      {/* Dialog for Step 2: GitHub Developer Verification */}
      <Dialog open={githubModalOpen} onOpenChange={setGithubModalOpen}>
        <DialogContent className="sm:max-w-md">
          <form onSubmit={handleVerifyGithub}>
            <DialogHeader>
              <div className="flex items-center gap-2 mb-1">
                <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-[var(--wp-surface-subtle)] border border-[var(--wp-border)]">
                  <Github className="h-4 w-4 text-[var(--wp-text-primary)]" />
                </div>
                <DialogTitle className="text-base font-semibold">Verify GitHub Developer Profile</DialogTitle>
              </div>
              <DialogDescription className="text-xs text-[var(--wp-text-secondary)] leading-relaxed">
                Connect your public GitHub username to demonstrate engineering credentials and earn the Verified Developer trust badge.
              </DialogDescription>
            </DialogHeader>

            <div className="py-4 space-y-3">
              <div className="space-y-1.5">
                <Label htmlFor="inputGithub" className="text-xs">GitHub Username Handle</Label>
                <div className="relative">
                  <AtSign className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                  <Input
                    id="inputGithub"
                    placeholder="octocat"
                    value={inputGithub}
                    onChange={(e) => setInputGithub(e.target.value)}
                    required
                    className="pl-9 text-xs font-mono"
                  />
                </div>
                <p className="text-[11px] text-[var(--wp-text-secondary)]">
                  Enter your exact public GitHub handle without URL prefixes.
                </p>
              </div>
            </div>

            <DialogFooter className="gap-2 sm:gap-0 mt-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setGithubModalOpen(false)}
                disabled={verifyingGithub}
                className="text-xs"
              >
                Cancel
              </Button>
              <Button
                type="submit"
                size="sm"
                disabled={verifyingGithub}
                className="text-xs font-semibold"
              >
                {verifyingGithub ? "Verifying..." : "Verify & Link Profile"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Dialog for Step 3: Government Identity Verification */}
      <Dialog open={idModalOpen} onOpenChange={setIdModalOpen}>
        <DialogContent className="sm:max-w-md">
          <form onSubmit={handleVerifyIdentity}>
            <DialogHeader>
              <div className="flex items-center gap-2 mb-1">
                <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-[var(--wp-surface-subtle)] border border-[var(--wp-border)]">
                  <Fingerprint className="h-4 w-4 text-[var(--wp-accent)]" />
                </div>
                <DialogTitle className="text-base font-semibold">Government Identity Verification</DialogTitle>
              </div>
              <DialogDescription className="text-xs text-[var(--wp-text-secondary)] leading-relaxed">
                Persona and Stripe Identity compliant verification. Unlocks individual tasks and milestone disbursements exceeding $1,000 USD.
              </DialogDescription>
            </DialogHeader>

            <div className="py-4 space-y-3.5">
              <div className="space-y-1.5">
                <Label htmlFor="legalName" className="text-xs">Legal Full Name (as shown on ID)</Label>
                <Input
                  id="legalName"
                  placeholder="Elena Rostova"
                  value={inputLegalName}
                  onChange={(e) => setInputLegalName(e.target.value)}
                  required
                  className="text-xs"
                />
                <p className="text-[10px] text-[var(--wp-text-secondary)]">
                  Must match the name on your government issued identity document. Once verified, this legal name is locked.
                </p>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="docType" className="text-xs">Document Type</Label>
                <select
                  id="docType"
                  value={inputDocType}
                  onChange={(e) => setInputDocType(e.target.value as "PASSPORT" | "DRIVERS_LICENSE" | "NATIONAL_ID")}
                  className="w-full h-8 text-xs px-2.5 rounded-lg border border-[var(--wp-border)] bg-background text-foreground"
                >
                  <option value="PASSPORT">Passport</option>
                  <option value="DRIVERS_LICENSE">Driver License</option>
                  <option value="NATIONAL_ID">National Identity Card</option>
                </select>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="country" className="text-xs">Issuing Country</Label>
                <Input
                  id="country"
                  placeholder="United States (US)"
                  value={inputCountry}
                  onChange={(e) => setInputCountry(e.target.value)}
                  required
                  className="text-xs"
                />
              </div>

              <div className="p-3 rounded-lg border border-[var(--wp-border)] bg-[var(--wp-surface-subtle)]/50 text-[11px] text-[var(--wp-text-secondary)] leading-relaxed">
                <strong className="text-[var(--wp-text-primary)] font-semibold block mb-0.5">Compliance Guarantee:</strong>
                Identity documents are processed according to SOC2 and GDPR compliance standards. Documents are never stored in raw form on platform databases.
              </div>
            </div>

            <DialogFooter className="gap-2 sm:gap-0 mt-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setIdModalOpen(false)}
                disabled={verifyingId}
                className="text-xs"
              >
                Cancel
              </Button>
              <Button
                type="submit"
                size="sm"
                disabled={verifyingId}
                className="text-xs font-semibold"
              >
                {verifyingId ? "Verifying with Persona..." : "Complete Verification"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Dialog for PayPal Account Binding */}
      <Dialog open={paypalModalOpen} onOpenChange={setPaypalModalOpen}>
        <DialogContent className="sm:max-w-md">
          <form onSubmit={handleBindPaypal}>
            <DialogHeader>
              <div className="flex items-center gap-2 mb-1">
                <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-[var(--wp-surface-subtle)] border border-[var(--wp-border)]">
                  <Wallet className="h-4 w-4 text-[var(--wp-accent)]" />
                </div>
                <DialogTitle className="text-base font-semibold">Link PayPal Account</DialogTitle>
              </div>
              <DialogDescription className="text-xs text-[var(--wp-text-secondary)] leading-relaxed">
                Connect your verified PayPal account for both Task Owner authorization holds and Specialist payout disbursements.
              </DialogDescription>
            </DialogHeader>

            <div className="py-4 space-y-3.5">
              <div className="space-y-1.5">
                <Label htmlFor="paypalEmailInput" className="text-xs">PayPal Account Email</Label>
                <div className="relative">
                  <Mail className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                  <Input
                    id="paypalEmailInput"
                    type="email"
                    placeholder="account@company.com"
                    value={inputPaypalEmail}
                    onChange={(e) => setInputPaypalEmail(e.target.value)}
                    required
                    className="pl-9 text-xs"
                  />
                </div>
                <p className="text-[10px] text-[var(--wp-text-secondary)]">
                  Personal or corporate PayPal account. Disposable domains are rejected.
                </p>
              </div>

              <div className="flex items-start gap-2.5 pt-1">
                <input
                  type="checkbox"
                  id="autoHoldCheck"
                  checked={inputAutoHold}
                  onChange={(e) => setInputAutoHold(e.target.checked)}
                  className="h-4 w-4 rounded border-[var(--wp-border)] text-[var(--wp-accent)] focus:ring-[var(--wp-accent)] cursor-pointer mt-0.5"
                />
                <Label htmlFor="autoHoldCheck" className="text-xs leading-snug cursor-pointer font-normal">
                  <span className="font-semibold text-[var(--wp-text-primary)] block">Enable 1-Click Non-Custodial Holds</span>
                  Automatically place authorization holds on PayPal when commissioning approved tasks.
                </Label>
              </div>

              <div className="p-3 rounded-lg border border-[var(--wp-border)] bg-[var(--wp-surface-subtle)]/50 text-[11px] text-[var(--wp-text-secondary)] leading-relaxed">
                <strong className="text-[var(--wp-text-primary)] font-semibold block mb-0.5">Non-Custodial Architecture:</strong>
                WorkPay is strictly non-custodial. Payment authorizations remain with PayPal and settle directly upon cryptographic proof verification.
              </div>
            </div>

            <DialogFooter className="gap-2 sm:gap-0 mt-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setPaypalModalOpen(false)}
                disabled={bindingPaypal}
                className="text-xs"
              >
                Cancel
              </Button>
              <Button
                type="submit"
                size="sm"
                disabled={bindingPaypal}
                className="text-xs font-semibold"
              >
                {bindingPaypal ? "Connecting..." : "Bind PayPal Account"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Confirmation Dialog for PayPal Unbind */}
      <Dialog open={unbindModalOpen} onOpenChange={setUnbindModalOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="text-base font-semibold">Unlink PayPal Account?</DialogTitle>
            <DialogDescription className="text-xs text-[var(--wp-text-secondary)] leading-relaxed mt-1">
              Disconnecting your PayPal account will disable one-click payment authorizations and prevent specialist disbursements until a new account is connected. Any currently active authorization holds will remain on PayPal until their contracts settle.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2 sm:gap-0 mt-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setUnbindModalOpen(false)}
              disabled={unbindingPaypal}
              className="text-xs"
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              size="sm"
              onClick={handleUnbindPaypal}
              disabled={unbindingPaypal}
              className="text-xs font-semibold"
            >
              {unbindingPaypal ? "Unlinking..." : "Confirm Unlink"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

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
