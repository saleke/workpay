"use client";

import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import {
  AlertCircle,
  AtSign,
  Bell,
  Briefcase,
  Camera,
  Check,
  CheckCircle2,
  DollarSign,
  ExternalLink,
  FileCode2,
  Fingerprint,
  FlaskConical,
  Github,
  KeyRound,
  Link2,
  Loader2,
  Lock,
  LogIn,
  LogOut,
  Mail,
  RefreshCw,
  RotateCcw,
  ScanFace,
  Shield,
  ShieldCheck,
  Sliders,
  Unlink,
  User,
  Wallet,
  Zap,
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

type SettingsTabKey = "account" | "work-preferences" | "paypal" | "notifications" | "environment";

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
    description: "Policy simulation records; no accounts are connected",
    icon: Wallet,
  },
  {
    key: "notifications",
    title: "Notifications",
    shortTitle: "Notifications",
    description: "Task, evidence, revision, and review alerts",
    icon: Bell,
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
  emailVerified: string | null;
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

  // Email verification (Step 1)
  const [sendingVerifyEmail, setSendingVerifyEmail] = useState(false);
  const [verifyingEmailOtp, setVerifyingEmailOtp] = useState(false);
  const [emailOtpInput, setEmailOtpInput] = useState("");
  const [emailVerifyStep, setEmailVerifyStep] = useState<"initial" | "otp">("initial");
  const [emailVerificationResult, setEmailVerificationResult] = useState<{
    verificationUrl?: string;
    otpCode?: string;
    message?: string;
  } | null>(null);

  // PayPal binding & Payout Challenge
  const [payoutEmail, setPayoutEmail] = useState("");
  const [savingPayout, setSavingPayout] = useState(false);
  const [paypalModalOpen, setPaypalModalOpen] = useState(false);
  const [inputPaypalEmail, setInputPaypalEmail] = useState("");
  const [inputAutoHold, setInputAutoHold] = useState(true);
  const [bindingPaypal, setBindingPaypal] = useState(false);
  const [unbindModalOpen, setUnbindModalOpen] = useState(false);
  const [unbindingPaypal, setUnbindingPaypal] = useState(false);
  const [connectingPayPalOAuth, setConnectingPayPalOAuth] = useState(false);
  const [payoutVerifyStep, setPayoutVerifyStep] = useState<"input" | "code">("input");
  const [payoutVerifyCode, setPayoutVerifyCode] = useState("");
  const [sendingPayoutCode, setSendingPayoutCode] = useState(false);
  const [confirmingPayoutCode, setConfirmingPayoutCode] = useState(false);
  const [issuedPayoutCode, setIssuedPayoutCode] = useState<string | null>(null);

  // Developer Verification (Step 2 - GitHub Challenge)
  const [githubModalOpen, setGithubModalOpen] = useState(false);
  const [inputGithub, setInputGithub] = useState("");
  const [githubStep, setGithubStep] = useState<"select" | "gist_input" | "gist_confirm">("select");
  const [githubChallengeData, setGithubChallengeData] = useState<{
    challenge: string;
    githubUsername: string;
    name?: string;
    avatarUrl?: string;
    publicRepos?: number;
    followers?: number;
    instructions?: string;
  } | null>(null);
  const [requestingChallenge, setRequestingChallenge] = useState(false);
  const [verifyingGithub, setVerifyingGithub] = useState(false);
  const [connectingGithubOAuth, setConnectingGithubOAuth] = useState(false);

  // Persona's approved inquiry is the only supported source of identity status.
  const [idModalOpen, setIdModalOpen] = useState(false);
  const [personaStep, setPersonaStep] = useState<
    "intro" | "pending" | "checking" | "not-approved" | "success"
  >("intro");
  const [personaInquiryId, setPersonaInquiryId] = useState<string | null>(null);
  const [personaHostedUrl, setPersonaHostedUrl] = useState<string | null>(null);
  const [creatingInquiry, setCreatingInquiry] = useState(false);
  const [personaStatusError, setPersonaStatusError] = useState<string | null>(null);

  // Demo reset modal
  const [resetting, setResetting] = useState(false);
  const [confirmResetOpen, setConfirmResetOpen] = useState(false);

  // Notification toggles
  const [notifyTaskOffers, setNotifyTaskOffers] = useState(true);
  const [notifyVerificationResults, setNotifyVerificationResults] = useState(true);
  const [notifyRevisions, setNotifyRevisions] = useState(true);
  const [notifyPayments, setNotifyPayments] = useState(true);
  const [notifyDisputes, setNotifyDisputes] = useState(true);
  const [capabilities, setCapabilities] = useState({
    emailDelivery: false,
    githubOAuth: false,
    personaVerification: false,
  });
  const [personaAvailability, setPersonaAvailability] = useState<
    "checking" | "available" | "coming-soon" | "unavailable"
  >("checking");

  useEffect(() => {
    if (rawTab && SETTINGS_TABS.some((t) => t.key === rawTab)) {
      setActiveTab(rawTab);
    }
  }, [rawTab]);

  const loadProfile = async () => {
    try {
      const res = await fetch("/api/v1/user/profile", { cache: "no-store" });
      if (res.ok) {
        const json = await res.json();
        const u = (json?.data?.user || json?.user) as UserProfileData;
        if (u) {
          setUserProfile(u);
          setProfileName(u.displayName || u.name || "");
          setPayoutEmail(u.paypalPayoutEmail || u.email || "");
          setInputPaypalEmail(u.paypalPayoutEmail || u.email || "");
          setInputAutoHold(u.paypalAutoHoldEnabled ?? true);

          const stored = window.localStorage.getItem("workpay_auth_user");
          if (stored) {
            try {
              const currentStored = JSON.parse(stored);
              window.localStorage.setItem(
                "workpay_auth_user",
                JSON.stringify({ ...currentStored, ...u }),
              );
            } catch {
              // Ignore parse error
            }
          }
        }
      }
    } catch {
      // Ignore background fetch error
    }
  };

  useEffect(() => {
    void fetch("/api/v1/system/capabilities", { cache: "no-store" })
      .then((response) => {
        if (!response.ok) throw new Error("Could not check integration availability.");
        return response.json();
      })
      .then((value) => {
        const personaVerification = value.personaVerification === true;
        setCapabilities({
          emailDelivery: value.emailDelivery === true,
          githubOAuth: value.githubOAuth === true,
          personaVerification,
        });
        setPersonaAvailability(personaVerification ? "available" : "coming-soon");
      })
      .catch(() => {
        setCapabilities({
          emailDelivery: false,
          githubOAuth: false,
          personaVerification: false,
        });
        setPersonaAvailability("unavailable");
      });

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

    const params = new URLSearchParams(window.location.search);
    const success = params.get("success");
    const error = params.get("error");
    const reason = params.get("reason");

    if (success === "paypal_bound") {
      toast.success("PayPal account linked and verified via authentic PayPal OAuth!");
      params.delete("success");
      router.replace(`/settings?${params.toString()}`, { scroll: false });
      loadProfile();
    } else if (success === "email_verified") {
      toast.success("Email address verified successfully!");
      params.delete("success");
      router.replace(`/settings?${params.toString()}`, { scroll: false });
      loadProfile();
    } else if (success === "github_linked") {
      toast.success("GitHub developer profile verified via authorized GitHub OAuth!");
      params.delete("success");
      router.replace(`/settings?${params.toString()}`, { scroll: false });
      loadProfile();
    } else if (error) {
      toast.error(reason ? decodeURIComponent(reason) : `Operation failed: ${error}`);
      params.delete("error");
      params.delete("reason");
      router.replace(`/settings?${params.toString()}`, { scroll: false });
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

  const handleSendEmailVerification = async () => {
    setSendingVerifyEmail(true);
    try {
      const res = await fetch("/api/v1/auth/verify-email/send", { method: "POST" });
      const json = await res.json();
      if (!res.ok) {
        toast.error(json.error?.message || "Failed to issue verification link");
        return;
      }
      setEmailVerificationResult(json);
      setEmailVerifyStep("otp");
      toast.success(json.message || "Email verification code and link generated");
    } catch {
      toast.error("Network error while generating verification link");
    } finally {
      setSendingVerifyEmail(false);
    }
  };

  const handleConfirmEmailOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!emailOtpInput.trim()) {
      toast.error("Please enter the 6-digit verification code");
      return;
    }
    setVerifyingEmailOtp(true);
    try {
      const res = await fetch("/api/v1/auth/verify-email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: emailOtpInput.trim() }),
      });
      const json = await res.json();
      if (!res.ok) {
        toast.error(json.error?.message || "Invalid or expired verification code");
        return;
      }
      toast.success("Email address verified successfully!");
      setEmailOtpInput("");
      setEmailVerifyStep("initial");
      setEmailVerificationResult(null);
      await loadProfile();
    } catch {
      toast.error("Network error while verifying code");
    } finally {
      setVerifyingEmailOtp(false);
    }
  };

  const handleConnectGithubOAuth = async () => {
    setConnectingGithubOAuth(true);
    try {
      const res = await fetch("/api/v1/user/github/connect", {
        headers: { Accept: "application/json" },
      });
      const json = await res.json();
      if (json.configured === false) {
        toast.error(
          json.message ||
            "GitHub OAuth is not configured. Please use the manual bio verification option.",
        );
        setGithubModalOpen(true);
        return;
      }
      if (json.authorizeUrl) {
        window.location.href = json.authorizeUrl;
        return;
      }
      window.location.href = "/api/v1/user/github/connect";
    } catch {
      window.location.href = "/api/v1/user/github/connect";
    } finally {
      setConnectingGithubOAuth(false);
    }
  };

  const handleConnectPayPalOAuth = () => {
    setConnectingPayPalOAuth(true);
    window.location.href = "/api/v1/user/paypal/connect";
  };

  const handleRequestPayoutCode = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputPaypalEmail.includes("@")) {
      toast.error("Please enter a valid PayPal account email address");
      return;
    }
    setSendingPayoutCode(true);
    try {
      const res = await fetch("/api/v1/user/paypal/bind-payout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ payoutEmail: inputPaypalEmail.trim() }),
      });
      const json = await res.json();
      if (!res.ok) {
        toast.error(json.error?.message || "Failed to dispatch verification code");
        return;
      }
      setPayoutVerifyStep("code");
      setIssuedPayoutCode(json.code || null);
      toast.success("Confirmation code dispatched to payout address");
    } catch {
      toast.error("Network error while requesting confirmation code");
    } finally {
      setSendingPayoutCode(false);
    }
  };

  const handleConfirmPayoutCode = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!payoutVerifyCode.trim()) {
      toast.error("Please enter the 6-digit confirmation code");
      return;
    }
    setConfirmingPayoutCode(true);
    try {
      const res = await fetch("/api/v1/user/paypal/confirm-payout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          payoutEmail: inputPaypalEmail.trim(),
          code: payoutVerifyCode.trim(),
        }),
      });
      const json = await res.json();
      if (!res.ok) {
        toast.error(json.error?.message || "Invalid or expired confirmation code");
        return;
      }
      toast.success("PayPal payout destination confirmed and bound successfully");
      setPaypalModalOpen(false);
      setPayoutVerifyStep("input");
      setPayoutVerifyCode("");
      await loadProfile();
    } catch {
      toast.error("Network error while confirming payout address");
    } finally {
      setConfirmingPayoutCode(false);
    }
  };

  const handleRequestGithubChallenge = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputGithub.trim()) {
      toast.error("Please enter your GitHub handle");
      return;
    }
    setRequestingChallenge(true);
    try {
      const res = await fetch("/api/v1/user/verify-github", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "challenge",
          githubUsername: inputGithub.trim(),
        }),
      });
      const json = await res.json();
      if (!res.ok) {
        toast.error(json.error?.message || "Failed to find GitHub account");
        return;
      }
      setGithubChallengeData(json);
      setGithubStep("gist_confirm");
      toast.success("Verification token generated. Create a public Gist with this code.");
    } catch {
      toast.error("Network error while communicating with GitHub API");
    } finally {
      setRequestingChallenge(false);
    }
  };

  const handleConfirmGithubChallenge = async () => {
    if (!githubChallengeData) return;
    setVerifyingGithub(true);
    try {
      const res = await fetch("/api/v1/user/verify-github", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "confirm",
          githubUsername: githubChallengeData.githubUsername,
        }),
      });
      const json = await res.json();
      if (!res.ok) {
        toast.error(json.error?.message || "Verification code not found in public gists");
        return;
      }
      toast.success(json.message || "GitHub developer profile verified successfully!");
      setGithubModalOpen(false);
      setGithubStep("select");
      setGithubChallengeData(null);
      setInputGithub("");
      await loadProfile();
    } catch {
      toast.error("Network error while validating public Gist");
    } finally {
      setVerifyingGithub(false);
    }
  };

  const handleUnlinkGithub = async () => {
    try {
      const res = await fetch("/api/v1/user/verify-github", { method: "DELETE" });
      if (res.ok) {
        toast.success("GitHub profile disconnected");
        await loadProfile();
      } else {
        toast.error("Failed to disconnect GitHub profile");
      }
    } catch {
      toast.error("Network error while unlinking GitHub");
    }
  };

  const handleOpenPersonaModal = () => {
    setIdModalOpen(true);
    setPersonaStep(personaInquiryId ? "pending" : "intro");
    setPersonaStatusError(null);
  };

  const handleStartPersonaVerification = async () => {
    setCreatingInquiry(true);
    setPersonaStatusError(null);
    try {
      const res = await fetch("/api/v1/user/persona/inquiry", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });
      const json = await res.json();
      if (!res.ok) {
        throw new Error(json.error?.message || "Could not start Persona verification.");
      }

      const inquiry = json?.data;
      if (typeof inquiry?.inquiryId !== "string" || typeof inquiry?.hostedUrl !== "string") {
        throw new Error("Persona did not return a usable verification link.");
      }

      setPersonaInquiryId(inquiry.inquiryId);
      setPersonaHostedUrl(inquiry.hostedUrl);
      setPersonaStep("pending");
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Could not start Persona verification.";
      setPersonaStatusError(message);
      toast.error(message);
    } finally {
      setCreatingInquiry(false);
    }
  };

  const handleCheckPersonaStatus = async () => {
    if (!personaInquiryId) return;
    setPersonaStep("checking");
    setPersonaStatusError(null);
    try {
      const res = await fetch("/api/v1/user/persona/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ inquiryId: personaInquiryId }),
      });
      const json = await res.json();
      if (!res.ok) {
        throw new Error(json.error?.message || "Could not check Persona verification status.");
      }

      const result = json?.data;
      if (result?.status === "APPROVED") {
        setPersonaStep("success");
        await loadProfile();
        toast.success("Persona reported an approved identity inquiry.");
      } else if (result?.status === "NOT_APPROVED") {
        setPersonaStep("not-approved");
      } else if (result?.status === "PENDING") {
        setPersonaStep("pending");
      } else {
        throw new Error("Persona returned an unrecognized verification status.");
      }
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Could not check Persona verification status.";
      setPersonaStatusError(message);
      setPersonaStep("pending");
      toast.error(message);
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
    <div className="flex w-full min-w-0 max-w-6xl flex-col gap-6 pb-16 font-sans">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-3 border-b border-[var(--wp-border)]">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-[var(--wp-text-primary)]">
            Settings
          </h1>
          <p className="text-xs sm:text-sm text-[var(--wp-text-secondary)] mt-0.5">
            Manage your account, work preferences, payment simulation, and notifications.
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
            {isDemo ? "Demo data" : "Production services"}
          </Badge>
        </div>
      </div>

      {/* Settings areas are selected here so the page keeps one clear content column. */}
      <div className="grid w-full min-w-0 grid-cols-2 gap-2 sm:grid-cols-4">
        {SETTINGS_TABS.map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.key;

          return (
            <button
              key={tab.key}
              type="button"
              onClick={() => handleSelectTab(tab.key)}
              aria-pressed={isActive}
              className={cn(
                "flex min-h-[4.25rem] min-w-0 items-center gap-2.5 rounded-xl border px-3 py-3 text-left text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--wp-accent)] focus-visible:ring-offset-2 sm:min-h-[5rem] sm:items-start sm:gap-3 sm:px-3.5 sm:text-sm",
                isActive
                  ? "border-[var(--wp-accent)]/40 bg-[var(--wp-accent-subtle)]/60 text-[var(--wp-text-primary)] font-semibold"
                  : "border-[var(--wp-border)] bg-white text-[var(--wp-text-secondary)] hover:bg-[var(--wp-surface-subtle)] hover:text-[var(--wp-text-primary)]",
              )}
            >
              <div
                className={cn(
                  "flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border transition-colors",
                  isActive
                    ? "bg-[var(--wp-surface-subtle)] text-[var(--wp-text-primary)] border-[var(--wp-border)]"
                    : "bg-transparent text-[var(--wp-text-secondary)] border-transparent",
                )}
              >
                <Icon className="h-4 w-4" aria-hidden="true" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="break-words leading-4 sm:leading-5">{tab.title}</div>
                <p className="mt-1 hidden break-words text-[11px] font-normal leading-4 text-[var(--wp-text-secondary)] opacity-80 lg:block">
                  {tab.description}
                </p>
              </div>
            </button>
          );
        })}
      </div>

      {/* Selected settings area */}
      <div className="w-full min-w-0">
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
                      Public handle and custom display name for WorkPay commitments and
                      cryptographic audit logs.
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="p-5 sm:p-6">
                    <form onSubmit={handleSaveProfile} className="space-y-4 max-w-lg">
                      {/* Platform Handle: Locked & Immutable */}
                      <div className="space-y-1.5">
                        <div className="flex items-center justify-between">
                          <Label htmlFor="platformHandle" className="text-xs">
                            Platform Handle
                          </Label>
                          <Badge
                            variant="outline"
                            className="text-[10px] bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300 font-mono flex items-center gap-1 border-slate-300"
                          >
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
                          Platform handles are permanent identifiers across signed contract receipts
                          and public audit logs. Usernames cannot be edited.
                        </p>
                      </div>

                      {/* Editable Custom Display Name */}
                      <div className="space-y-1.5">
                        <Label htmlFor="profileName" className="text-xs">
                          Display Name
                        </Label>
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

                      {/* Account Email with Verification Badge and Inline Actions */}
                      <div className="space-y-1.5">
                        <div className="flex items-center justify-between">
                          <Label htmlFor="profileEmail" className="text-xs">
                            Account Email
                          </Label>
                          {userProfile?.emailVerified ? (
                            <Badge className="bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20 text-[10px] flex items-center gap-1 font-semibold">
                              <CheckCircle2 className="h-3 w-3" />
                              Verified
                            </Badge>
                          ) : capabilities.emailDelivery ? (
                            <div className="flex items-center gap-1.5">
                              <Badge
                                variant="outline"
                                className="text-amber-600 border-amber-500/30 text-[10px]"
                              >
                                Unverified
                              </Badge>
                              <button
                                type="button"
                                onClick={handleSendEmailVerification}
                                disabled={sendingVerifyEmail}
                                className="text-[10px] text-primary hover:underline font-semibold"
                              >
                                {sendingVerifyEmail ? "Sending..." : "Verify"}
                              </button>
                            </div>
                          ) : (
                            <Badge
                              variant="outline"
                              className="text-slate-600 border-slate-300 text-[10px]"
                            >
                              Email delivery unavailable
                            </Badge>
                          )}
                        </div>
                        <div className="relative">
                          <Mail className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                          <Input
                            id="profileEmail"
                            value={authUser.email}
                            disabled
                            className="pl-9 text-xs bg-muted/40 cursor-not-allowed select-all"
                          />
                        </div>
                        <p className="text-[11px] text-[var(--wp-text-secondary)]">
                          Your verified account email used for authentication and security alerts.
                        </p>

                        {capabilities.emailDelivery &&
                          emailVerifyStep === "otp" &&
                          !userProfile?.emailVerified && (
                            <form
                              onSubmit={handleConfirmEmailOtp}
                              className="p-3.5 rounded-xl border border-[var(--wp-border)] bg-[var(--wp-surface-subtle)]/40 space-y-2.5 mt-2"
                            >
                              <div className="flex items-center justify-between text-xs font-semibold">
                                <span>Enter 6-Digit Email Code</span>
                                {emailVerificationResult?.otpCode && (
                                  <span className="font-mono text-[10px] text-emerald-600 bg-emerald-500/10 px-1.5 py-0.5 rounded border border-emerald-500/20">
                                    Code: {emailVerificationResult.otpCode}
                                  </span>
                                )}
                              </div>
                              <div className="flex gap-2">
                                <Input
                                  placeholder="123456"
                                  value={emailOtpInput}
                                  onChange={(e) =>
                                    setEmailOtpInput(e.target.value.replace(/\D/g, "").slice(0, 6))
                                  }
                                  maxLength={6}
                                  className="font-mono text-center text-xs tracking-widest max-w-[140px]"
                                  autoFocus
                                />
                                <Button
                                  type="submit"
                                  size="sm"
                                  disabled={verifyingEmailOtp || emailOtpInput.length < 6}
                                  className="text-xs"
                                >
                                  {verifyingEmailOtp ? "Verifying..." : "Confirm"}
                                </Button>
                              </div>
                            </form>
                          )}
                      </div>

                      <Button
                        type="submit"
                        size="sm"
                        disabled={savingProfile}
                        className="text-xs font-semibold"
                      >
                        {savingProfile ? "Saving..." : "Save Display Name"}
                      </Button>
                    </form>
                  </CardContent>
                </Card>

                {/* Optional GitHub integration appears only when configured. */}
                {capabilities.githubOAuth ? (
                  <Card className="border-[var(--wp-border)] shadow-xs overflow-hidden">
                    <CardHeader className="bg-[var(--wp-surface-subtle)]/50 border-b border-[var(--wp-border)] pb-4">
                      <div className="flex items-center justify-between">
                        <CardTitle className="text-base font-semibold flex items-center gap-2">
                          <Github className="h-4 w-4 text-[var(--wp-accent)]" />
                          Developer Profile (GitHub)
                        </CardTitle>
                        {userProfile?.githubUsername ? (
                          <Badge className="bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20 text-xs flex items-center gap-1 font-semibold">
                            <CheckCircle2 className="h-3 w-3" />
                            Verified Developer
                          </Badge>
                        ) : (
                          <Badge
                            variant="outline"
                            className="text-amber-600 border-amber-500/30 text-xs"
                          >
                            Unverified Profile
                          </Badge>
                        )}
                      </div>
                      <CardDescription className="text-xs sm:text-sm text-[var(--wp-text-secondary)]">
                        Connect your GitHub profile via authorized OAuth login or challenge
                        handshake to qualify for high-tier engineering tasks.
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
                                <Badge
                                  variant="outline"
                                  className="text-[10px] font-mono text-emerald-600 border-emerald-500/30"
                                >
                                  GitHub Verified
                                </Badge>
                              </div>
                              <p className="text-[11px] text-[var(--wp-text-secondary)] mt-0.5">
                                Public contribution metrics and repository trust badges linked to
                                your WorkPay identity.
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
                              Verify your GitHub developer profile via authorized 1-click OAuth or a
                              public Gist token.
                            </p>
                          </div>
                          <div className="flex items-center gap-2 shrink-0">
                            <Button
                              type="button"
                              size="sm"
                              onClick={() => {
                                setGithubStep("select");
                                setGithubModalOpen(true);
                              }}
                              className="text-xs font-semibold"
                            >
                              <Github className="h-3.5 w-3.5 mr-1.5" />
                              Verify Developer Profile
                            </Button>
                          </div>
                        </div>
                      )}
                    </CardContent>
                  </Card>
                ) : null}

                <Card className="border-[var(--wp-border)] shadow-xs overflow-hidden">
                  <CardHeader className="bg-[var(--wp-surface-subtle)]/50 border-b border-[var(--wp-border)] pb-4">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <CardTitle className="text-base font-semibold flex items-center gap-2">
                        <Fingerprint className="h-4 w-4 text-[var(--wp-accent)]" />
                        Identity Verification
                      </CardTitle>
                      {capabilities.personaVerification ? (
                        userProfile?.idVerificationStatus === "VERIFIED" ? (
                          <Badge className="bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20 text-xs flex items-center gap-1 font-semibold">
                            <CheckCircle2 className="h-3 w-3" />
                            Persona approved
                          </Badge>
                        ) : (
                          <Badge
                            variant="outline"
                            className="text-[var(--wp-text-secondary)] text-xs"
                          >
                            Not verified
                          </Badge>
                        )
                      ) : (
                        <Badge
                          variant="outline"
                          className={
                            personaAvailability === "coming-soon"
                              ? "border-[var(--wp-accent)]/30 bg-[var(--wp-accent)]/10 text-[var(--wp-accent)] text-xs"
                              : "text-[var(--wp-text-secondary)] text-xs"
                          }
                        >
                          {personaAvailability === "coming-soon"
                            ? "Coming soon"
                            : personaAvailability === "checking"
                              ? "Checking availability"
                              : "Status unavailable"}
                        </Badge>
                      )}
                    </div>
                    <CardDescription className="text-xs sm:text-sm text-[var(--wp-text-secondary)]">
                      {capabilities.personaVerification ? (
                        <>
                          Optional identity verification through Persona. Approval is not a WorkPay
                          certification of qualifications, trustworthiness, or work quality.
                        </>
                      ) : personaAvailability === "coming-soon" ? (
                        <>
                          We’re preparing optional identity verification with Persona. It isn’t
                          available yet, so there’s nothing to submit or configure in your account.
                        </>
                      ) : personaAvailability === "checking" ? (
                        <>
                          Checking whether optional identity verification with Persona is enabled.
                          No identity information is submitted during this check.
                        </>
                      ) : (
                        <>
                          We couldn’t confirm whether Persona verification is available. Refresh
                          this page to check again; no identity information has been submitted.
                        </>
                      )}
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="p-5 sm:p-6 space-y-4">
                    {capabilities.personaVerification ? (
                      <>
                        <div className="p-4 rounded-xl border border-[var(--wp-border)] bg-[var(--wp-surface-subtle)]/40 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                          <div>
                            <div className="flex items-center gap-2">
                              <span className="font-semibold text-xs text-[var(--wp-text-primary)]">
                                What this records
                              </span>
                            </div>
                            <p className="text-[11px] text-[var(--wp-text-secondary)] mt-1 max-w-xl leading-relaxed">
                              Persona conducts the checks configured for its hosted flow. WorkPay
                              records only whether Persona reports an approved inquiry and when;
                              this does not authorize or enable payments.
                            </p>
                          </div>

                          {userProfile?.idVerificationStatus !== "VERIFIED" && (
                            <Button
                              type="button"
                              size="sm"
                              onClick={handleOpenPersonaModal}
                              className="text-xs font-semibold shrink-0"
                            >
                              <ScanFace className="h-3.5 w-3.5 mr-1.5" />
                              Start identity check
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
                                <div className="font-semibold text-sm text-[var(--wp-text-primary)] flex items-center gap-2">
                                  <span>Persona reported an approved inquiry</span>
                                  <Badge className="bg-emerald-500/10 text-emerald-600 border-emerald-500/20 text-[10px] font-mono">
                                    {userProfile.idVerifiedAt
                                      ? new Date(userProfile.idVerifiedAt).toLocaleDateString()
                                      : "Confirmed"}
                                  </Badge>
                                </div>
                                <p className="text-[11px] text-[var(--wp-text-secondary)] mt-0.5">
                                  WorkPay stores the approval status and time only. It does not
                                  certify identity attributes or enable money movement.
                                </p>
                              </div>
                            </div>
                          </div>
                        )}
                      </>
                    ) : (
                      <div className="flex items-start gap-3 rounded-xl border border-[var(--wp-border)] bg-[var(--wp-surface-subtle)]/40 p-4 sm:p-5">
                        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-[var(--wp-accent)]/20 bg-[var(--wp-accent)]/10 text-[var(--wp-accent)]">
                          <ScanFace className="h-4 w-4" aria-hidden="true" />
                        </div>
                        <div className="min-w-0">
                          <p className="text-sm font-semibold text-[var(--wp-text-primary)]">
                            {personaAvailability === "coming-soon"
                              ? "Persona-hosted identity checks are planned"
                              : personaAvailability === "checking"
                                ? "Checking Persona availability"
                                : "Persona availability couldn’t be confirmed"}
                          </p>
                          <p className="mt-1 text-xs leading-relaxed text-[var(--wp-text-secondary)]">
                            {personaAvailability === "coming-soon" ? (
                              <>
                                When available, you’ll be able to choose whether to complete
                                Persona’s hosted check. WorkPay will show only whether Persona
                                reports approval; it won’t certify your qualifications,
                                trustworthiness, or work quality, and identity verification won’t
                                enable payments.
                              </>
                            ) : personaAvailability === "checking" ? (
                              <>This check does not send identity information to Persona.</>
                            ) : (
                              <>
                                Refresh this page to check again. No identity information has been
                                submitted.
                              </>
                            )}
                          </p>
                        </div>
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
                        <Label htmlFor="currentPassword" className="text-xs">
                          Current Password
                        </Label>
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
                        <Label htmlFor="newPassword" className="text-xs">
                          New Password
                        </Label>
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
                        <Label htmlFor="confirmPassword" className="text-xs">
                          Confirm New Password
                        </Label>
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

                      <Button
                        type="submit"
                        size="sm"
                        disabled={updatingPassword}
                        className="text-xs font-semibold"
                      >
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
                      <Link href="/register">Register Account</Link>
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

        {/* TAB 3: PAYMENT VALIDATION */}
        {activeTab === "paypal" && (
          <div className="grid gap-6 animate-in fade-in-50 duration-150">
            <Card className="border-[var(--wp-border)] shadow-xs overflow-hidden">
              <CardHeader className="bg-[var(--wp-surface-subtle)]/50 border-b border-[var(--wp-border)]">
                <CardTitle className="text-base font-semibold flex items-center gap-2">
                  <Wallet className="h-4 w-4 text-[var(--wp-accent)]" />
                  Payment integration is in validation
                </CardTitle>
                <CardDescription>
                  WorkPay currently tests agreement amounts, authorization states, evidence gates,
                  idempotency, and failure recovery without moving money.
                </CardDescription>
              </CardHeader>
              <CardContent className="p-5 sm:p-6 space-y-4 text-sm text-[var(--wp-text-secondary)]">
                <p>
                  PayPal account linking, authorization holds, captures, and professional payouts
                  are disabled. Existing profile details are not treated as permission to charge an
                  account or pay a professional.
                </p>
                <div className="rounded-xl border border-amber-300/70 bg-amber-50 p-4 text-amber-900">
                  <strong className="block text-sm">No funds move in this environment</strong>
                  <span className="mt-1 block text-xs leading-relaxed">
                    Live payments require a separately approved marketplace payment design with
                    explicit buyer approval and correctly onboarded professional recipients.
                  </span>
                </div>
                <Button asChild variant="outline" size="sm" className="text-xs">
                  <Link href="/payments">View policy simulation records</Link>
                </Button>
              </CardContent>
            </Card>
          </div>
        )}

        {/* Retained temporarily for migration reference; intentionally unreachable. */}
        {Boolean(0) && activeTab === "paypal" && (
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
                  Bind your verified PayPal account to enable both Task Owner authorization holds
                  and Specialist payout disbursements.
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
                              <Badge
                                variant="outline"
                                className="text-[10px] font-mono text-emerald-600 border-emerald-500/30"
                              >
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
                          <span className="text-[11px] text-[var(--wp-text-secondary)] block">
                            Payment Role:
                          </span>
                          <span className="font-medium text-[var(--wp-text-primary)]">
                            Task Owner Holds &amp; Specialist Payouts
                          </span>
                        </div>
                        <div>
                          <span className="text-[11px] text-[var(--wp-text-secondary)] block">
                            Auto-Hold Authorization:
                          </span>
                          <span className="font-medium text-emerald-600">
                            {userProfile.paypalAutoHoldEnabled
                              ? "Enabled (One-click holds on PayPal)"
                              : "Manual prompt per task"}
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
                        When you commission a task, PayPal places a non-custodial authorization hold
                        on your account. When you complete an assignment, funds capture directly to
                        this PayPal address upon deliverable proof verification. WorkPay is strictly
                        non-custodial and never holds digital wallet balances.
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-4">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-5 rounded-xl border border-dashed border-[var(--wp-border)] bg-[var(--wp-surface-subtle)]/30">
                      <div>
                        <div className="font-semibold text-sm text-[var(--wp-text-primary)]">
                          No PayPal Account Bound
                        </div>
                        <p className="text-xs text-[var(--wp-text-secondary)] mt-1 max-w-xl leading-relaxed">
                          Connect your PayPal account via authentic PayPal OAuth to pre-authorize
                          non-custodial holds and receive proof-gated settlement disbursements.
                        </p>
                      </div>

                      <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 shrink-0">
                        <Button
                          type="button"
                          size="sm"
                          onClick={handleConnectPayPalOAuth}
                          disabled={connectingPayPalOAuth}
                          className="bg-[#0070BA] hover:bg-[#005ea6] text-white text-xs font-semibold shadow-xs"
                        >
                          <Wallet className="h-3.5 w-3.5 mr-1.5" />
                          {connectingPayPalOAuth
                            ? "Redirecting to PayPal..."
                            : "Connect with PayPal"}
                        </Button>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => {
                            setInputPaypalEmail(userProfile?.email || authUser?.email || "");
                            setPayoutVerifyStep("input");
                            setPaypalModalOpen(true);
                          }}
                          className="text-xs font-medium"
                        >
                          <Mail className="h-3.5 w-3.5 mr-1.5" />
                          Verify Payout Email
                        </Button>
                      </div>
                    </div>

                    {/* Developer Callback Configuration */}
                    <div className="p-4 rounded-xl border border-[var(--wp-border)] bg-[var(--wp-surface-subtle)]/40 text-xs space-y-1.5">
                      <div className="flex items-center justify-between">
                        <span className="font-semibold text-[var(--wp-text-primary)] text-[11px]">
                          OAuth Return Callback URL:
                        </span>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="h-6 text-[10px] px-2"
                          onClick={() => {
                            const origin =
                              typeof window !== "undefined"
                                ? window.location.origin
                                : "http://localhost:3000";
                            navigator.clipboard.writeText(`${origin}/api/v1/user/paypal/callback`);
                            toast.success("Callback URL copied to clipboard");
                          }}
                        >
                          Copy Callback URL
                        </Button>
                      </div>
                      <div className="font-mono text-[11px] text-[var(--wp-text-secondary)] bg-background p-2 rounded border break-all select-all">
                        {typeof window !== "undefined"
                          ? window.location.origin
                          : "http://localhost:3000"}
                        /api/v1/user/paypal/callback
                      </div>
                      <p className="text-[10px] text-[var(--wp-text-secondary)]">
                        Ensure this callback URL is whitelisted under App Settings in your PayPal
                        Developer Dashboard.
                      </p>
                    </div>
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
                  WorkPay is non-custodial. Funds are never pooled, held in a digital wallet, or
                  commingled.
                </CardDescription>
              </CardHeader>
              <CardContent className="p-5 sm:p-6 grid sm:grid-cols-3 gap-4 text-xs">
                <div className="p-4 rounded-xl border border-[var(--wp-border)] bg-white">
                  <div className="font-semibold text-xs text-[var(--wp-text-primary)] mb-1">
                    1. Authorization Hold
                  </div>
                  <p className="text-[11px] text-[var(--wp-text-secondary)] leading-relaxed">
                    When a task is authorized, PayPal places a temporary authorization hold on the
                    client payment instrument for the contract amount.
                  </p>
                </div>

                <div className="p-4 rounded-xl border border-[var(--wp-border)] bg-white">
                  <div className="font-semibold text-xs text-[var(--wp-text-primary)] mb-1">
                    2. Deterministic Verification
                  </div>
                  <p className="text-[11px] text-[var(--wp-text-secondary)] leading-relaxed">
                    Deliverables are tested against objective acceptance criteria. Payment cannot
                    execute until verification passes.
                  </p>
                </div>

                <div className="p-4 rounded-xl border border-[var(--wp-border)] bg-white">
                  <div className="font-semibold text-xs text-[var(--wp-text-primary)] mb-1">
                    3. Direct Payout Capture
                  </div>
                  <p className="text-[11px] text-[var(--wp-text-secondary)] leading-relaxed">
                    Upon verified completion, payment capture dispatches directly to the specialist
                    recipient PayPal address.
                  </p>
                </div>
              </CardContent>
            </Card>

            {/* Payment Records Link */}
            <div className="flex items-center justify-between p-4 rounded-xl border border-[var(--wp-border)] bg-white">
              <div>
                <div className="text-xs font-semibold text-[var(--wp-text-primary)]">
                  Payment Activity &amp; Records
                </div>
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
                  Choose which consequential task milestones and payment events trigger
                  notifications.
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
                      Notifications when deliverable tests complete with passing or failing
                      outcomes.
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
                      Alerts when a task is disputed or a payment-related case changes.
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
                    Default: {envDefault === "demo" ? "Demo data" : "Production services"}
                  </span>
                </div>
                <CardDescription className="text-xs sm:text-sm text-[var(--wp-text-secondary)]">
                  Choose the data environment for your workspace. Payment operations remain
                  simulated in both modes.
                </CardDescription>
              </CardHeader>
              <CardContent className="p-5 sm:p-6 grid sm:grid-cols-2 gap-4">
                <div
                  onClick={() => {
                    setMode("demo");
                    toast.success("Switched to demo data");
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
                      Demo data
                    </span>
                    {isDemo && <Check className="h-3.5 w-3.5 text-[var(--wp-accent)]" />}
                  </div>
                  <p className="text-[11px] text-[var(--wp-text-secondary)] font-normal leading-relaxed">
                    Use seeded demonstration records to explore supported workflows. Payments remain
                    simulated.
                  </p>
                </div>

                <div
                  onClick={() => {
                    setMode("production");
                    toast.success("Switched to production services");
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
                      Production services
                    </span>
                    {!isDemo && <Check className="h-3.5 w-3.5 text-[var(--wp-success)]" />}
                  </div>
                  <p className="text-[11px] text-[var(--wp-text-secondary)] font-normal leading-relaxed">
                    Use production services and account data. Payment operations remain simulated.
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
                    <div className="font-semibold text-sm text-[var(--wp-text-primary)]">
                      Restore Baseline Fixtures
                    </div>
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

      {/* Dialog for Developer Profile Verification (GitHub) */}
      <Dialog
        open={githubModalOpen}
        onOpenChange={(open) => {
          setGithubModalOpen(open);
          if (!open) {
            setGithubStep("select");
            setGithubChallengeData(null);
            setInputGithub("");
          }
        }}
      >
        <DialogContent className="sm:max-w-lg">
          {githubStep === "select" && (
            <div>
              <DialogHeader>
                <div className="flex items-center gap-2 mb-1">
                  <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-[var(--wp-surface-subtle)] border border-[var(--wp-border)]">
                    <Github className="h-4 w-4 text-[var(--wp-text-primary)]" />
                  </div>
                  <DialogTitle className="text-base font-semibold">
                    Verify Developer Profile
                  </DialogTitle>
                </div>
                <DialogDescription className="text-xs text-[var(--wp-text-secondary)] leading-relaxed">
                  Choose your preferred verification method to confirm ownership of your GitHub
                  developer account.
                </DialogDescription>
              </DialogHeader>

              <div className="py-4 space-y-3">
                {/* Option 1: Authorized OAuth Handshake */}
                <div className="p-4 rounded-xl border border-[var(--wp-border)] bg-[var(--wp-surface-subtle)]/50 hover:border-emerald-500/40 transition-all space-y-2">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 font-semibold text-xs text-[var(--wp-text-primary)]">
                      <Zap className="h-3.5 w-3.5 text-amber-500" />
                      <span>Authorized GitHub Handshake (Recommended)</span>
                    </div>
                    <Badge
                      variant="outline"
                      className="text-[10px] text-emerald-600 border-emerald-500/30"
                    >
                      Instant 1-Click
                    </Badge>
                  </div>
                  <p className="text-[11px] text-[var(--wp-text-secondary)] leading-relaxed">
                    Authorize directly with GitHub OAuth in 1 click. Instant verification without
                    creating manual files or tokens.
                  </p>
                  <Button
                    type="button"
                    size="sm"
                    onClick={handleConnectGithubOAuth}
                    disabled={connectingGithubOAuth}
                    className="w-full text-xs font-semibold mt-1"
                  >
                    <Github className="h-3.5 w-3.5 mr-1.5" />
                    {connectingGithubOAuth ? "Connecting to GitHub..." : "Authorize with GitHub"}
                  </Button>
                </div>

                {/* Option 2: Public Gist Verification */}
                <div className="p-4 rounded-xl border border-[var(--wp-border)] bg-[var(--wp-surface-subtle)]/50 hover:border-blue-500/40 transition-all space-y-2">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 font-semibold text-xs text-[var(--wp-text-primary)]">
                      <FileCode2 className="h-3.5 w-3.5 text-blue-500" />
                      <span>Public Gist Verification</span>
                    </div>
                    <Badge
                      variant="outline"
                      className="text-[10px] text-blue-600 border-blue-500/30"
                    >
                      Zero OAuth Scopes
                    </Badge>
                  </div>
                  <p className="text-[11px] text-[var(--wp-text-secondary)] leading-relaxed">
                    Prove ownership by publishing a quick public Gist containing a unique token.
                    Ideal if you prefer not to grant OAuth permissions.
                  </p>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => setGithubStep("gist_input")}
                    className="w-full text-xs font-semibold mt-1"
                  >
                    <FileCode2 className="h-3.5 w-3.5 mr-1.5" />
                    Verify via Public Gist
                  </Button>
                </div>
              </div>

              <DialogFooter>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => setGithubModalOpen(false)}
                  className="text-xs"
                >
                  Close
                </Button>
              </DialogFooter>
            </div>
          )}

          {githubStep === "gist_input" && (
            <form onSubmit={handleRequestGithubChallenge}>
              <DialogHeader>
                <div className="flex items-center gap-2 mb-1">
                  <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-[var(--wp-surface-subtle)] border border-[var(--wp-border)]">
                    <FileCode2 className="h-4 w-4 text-blue-500" />
                  </div>
                  <DialogTitle className="text-base font-semibold">
                    Public Gist Verification
                  </DialogTitle>
                </div>
                <DialogDescription className="text-xs text-[var(--wp-text-secondary)] leading-relaxed">
                  Enter your GitHub username to generate a public Gist verification token.
                </DialogDescription>
              </DialogHeader>

              <div className="py-4 space-y-3">
                <div className="space-y-1.5">
                  <Label htmlFor="inputGithub" className="text-xs">
                    GitHub Username Handle
                  </Label>
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
                    Enter your public GitHub username handle (e.g. saleke or torvalds).
                  </p>
                </div>
              </div>

              <DialogFooter className="gap-2 sm:gap-0 mt-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setGithubStep("select")}
                  disabled={requestingChallenge}
                  className="text-xs"
                >
                  Back
                </Button>
                <Button
                  type="submit"
                  size="sm"
                  disabled={requestingChallenge}
                  className="text-xs font-semibold"
                >
                  {requestingChallenge ? "Locating GitHub Profile..." : "Generate Gist Token"}
                </Button>
              </DialogFooter>
            </form>
          )}

          {githubStep === "gist_confirm" && (
            <div>
              <DialogHeader>
                <div className="flex items-center gap-2 mb-1">
                  <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-[var(--wp-surface-subtle)] border border-[var(--wp-border)]">
                    <FileCode2 className="h-4 w-4 text-blue-500" />
                  </div>
                  <DialogTitle className="text-base font-semibold">Confirm Public Gist</DialogTitle>
                </div>
                <DialogDescription className="text-xs text-[var(--wp-text-secondary)] leading-relaxed">
                  Publish a public Gist containing your verification token to complete verification
                  for @{githubChallengeData?.githubUsername}.
                </DialogDescription>
              </DialogHeader>

              <div className="py-4 space-y-3.5">
                {githubChallengeData && (
                  <div className="flex items-center gap-3 p-3 rounded-xl border border-[var(--wp-border)] bg-[var(--wp-surface-subtle)]/40">
                    {githubChallengeData.avatarUrl && (
                      <img
                        src={githubChallengeData.avatarUrl}
                        alt={githubChallengeData.githubUsername}
                        className="h-10 w-10 rounded-full border border-[var(--wp-border)]"
                      />
                    )}
                    <div>
                      <div className="font-semibold text-xs text-[var(--wp-text-primary)]">
                        {githubChallengeData.name || githubChallengeData.githubUsername} (@
                        {githubChallengeData.githubUsername})
                      </div>
                      <div className="text-[11px] text-[var(--wp-text-secondary)] flex items-center gap-2 mt-0.5">
                        <span>{githubChallengeData.publicRepos ?? 0} public repos</span>
                        <span>&bull;</span>
                        <span>{githubChallengeData.followers ?? 0} followers</span>
                      </div>
                    </div>
                  </div>
                )}

                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <Label className="text-xs font-semibold">Your Verification Token</Label>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="h-6 text-[10px] px-2 text-emerald-600"
                      onClick={() => {
                        if (githubChallengeData?.challenge) {
                          navigator.clipboard.writeText(githubChallengeData.challenge);
                          toast.success("Verification token copied to clipboard");
                        }
                      }}
                    >
                      Copy Token
                    </Button>
                  </div>
                  <div className="font-mono text-center p-3 rounded-lg border border-emerald-500/30 bg-emerald-500/5 text-emerald-700 dark:text-emerald-400 font-bold select-all text-sm tracking-wide">
                    {githubChallengeData?.challenge}
                  </div>
                </div>

                <div className="p-3.5 rounded-lg border border-[var(--wp-border)] bg-[var(--wp-surface-subtle)] text-[11px] text-[var(--wp-text-secondary)] space-y-1.5 leading-relaxed">
                  <strong className="text-[var(--wp-text-primary)] font-semibold block">
                    Instructions:
                  </strong>
                  <p>
                    1. Open{" "}
                    <a
                      href="https://gist.github.com"
                      target="_blank"
                      rel="noreferrer"
                      className="text-[var(--wp-accent)] font-semibold hover:underline inline-flex items-center gap-0.5"
                    >
                      gist.github.com <ExternalLink className="h-2.5 w-2.5" />
                    </a>{" "}
                    in your browser.
                  </p>
                  <p>
                    2. Create a <strong>public</strong> gist. You can name the file{" "}
                    <code>workpay-verify.txt</code> and paste the token as the content, or put the
                    token in the gist description.
                  </p>
                  <p>
                    3. Click "Verify Public Gist" below. The server will verify the gist and unlock
                    your developer badge immediately.
                  </p>
                </div>
              </div>

              <DialogFooter className="gap-2 sm:gap-0 mt-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setGithubStep("gist_input")}
                  disabled={verifyingGithub}
                  className="text-xs"
                >
                  Back
                </Button>
                <Button
                  type="button"
                  size="sm"
                  onClick={handleConfirmGithubChallenge}
                  disabled={verifyingGithub}
                  className="text-xs font-semibold"
                >
                  {verifyingGithub ? "Verifying with GitHub..." : "Verify Public Gist"}
                </Button>
              </DialogFooter>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Optional Persona identity verification */}
      <Dialog open={idModalOpen} onOpenChange={setIdModalOpen}>
        <DialogContent className="sm:max-w-lg max-h-[85dvh] overflow-y-auto">
          {personaStep === "intro" && (
            <>
              <DialogHeader>
                <div className="flex items-center gap-2">
                  <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-[var(--wp-accent)]/10 text-[var(--wp-accent)] border border-[var(--wp-accent)]/20">
                    <ScanFace className="h-4 w-4" />
                  </div>
                  <DialogTitle className="text-base font-semibold">
                    Optional identity check
                  </DialogTitle>
                </div>
                <DialogDescription className="text-xs leading-relaxed">
                  Persona will collect and review identity information in its hosted flow. WorkPay
                  stores only whether Persona reports an approved inquiry and the approval time.
                  This is not a certification of qualifications, trustworthiness, or work quality,
                  and does not authorize or enable payments.
                </DialogDescription>
              </DialogHeader>

              <div aria-live="polite" className="py-3">
                <p className="rounded-lg border border-[var(--wp-border)] bg-[var(--wp-surface-subtle)] p-3 text-xs leading-relaxed text-[var(--wp-text-secondary)]">
                  You will leave WorkPay to complete Persona's secure verification flow. Review
                  Persona's privacy information before submitting identity documents. WorkPay does
                  not ask you to enter document numbers here.
                </p>
                {personaStatusError && (
                  <p role="alert" className="mt-3 text-xs text-destructive">
                    {personaStatusError}
                  </p>
                )}
              </div>

              <DialogFooter className="gap-2 sm:gap-0">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setIdModalOpen(false)}
                >
                  Cancel
                </Button>
                <Button
                  type="button"
                  size="sm"
                  onClick={handleStartPersonaVerification}
                  disabled={creatingInquiry}
                >
                  {creatingInquiry ? "Creating secure link..." : "Continue to Persona"}
                </Button>
              </DialogFooter>
            </>
          )}

          {(personaStep === "pending" || personaStep === "checking") && (
            <>
              <DialogHeader>
                <DialogTitle className="text-base font-semibold">
                  Verification in progress
                </DialogTitle>
                <DialogDescription className="text-xs leading-relaxed">
                  Complete the Persona flow, then return here and check the status. Finishing the
                  hosted flow is not the same as approval; WorkPay records verification only after
                  Persona reports an approved result.
                </DialogDescription>
              </DialogHeader>

              <div aria-live="polite" className="space-y-3 py-3">
                {personaHostedUrl && (
                  <a
                    href={personaHostedUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-md border border-[var(--wp-border)] px-4 text-sm font-medium text-[var(--wp-accent)] hover:bg-[var(--wp-surface-subtle)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--wp-accent)]"
                  >
                    Open Persona verification <ExternalLink className="h-4 w-4" />
                  </a>
                )}
                {personaInquiryId && (
                  <p className="text-[11px] text-[var(--wp-text-secondary)]">
                    Inquiry reference: <span className="font-mono">{personaInquiryId}</span>
                  </p>
                )}
                {personaStatusError && (
                  <p role="alert" className="text-xs text-destructive">
                    {personaStatusError}
                  </p>
                )}
              </div>

              <DialogFooter className="gap-2 sm:gap-0">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setIdModalOpen(false)}
                >
                  Close
                </Button>
                <Button
                  type="button"
                  size="sm"
                  onClick={handleCheckPersonaStatus}
                  disabled={personaStep === "checking"}
                >
                  {personaStep === "checking" ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Checking...
                    </>
                  ) : (
                    "Check status"
                  )}
                </Button>
              </DialogFooter>
            </>
          )}

          {personaStep === "not-approved" && (
            <>
              <DialogHeader>
                <DialogTitle className="text-base font-semibold">
                  Not approved by Persona
                </DialogTitle>
                <DialogDescription className="text-xs leading-relaxed">
                  Persona has not approved this inquiry, so WorkPay keeps your identity status
                  unverified. If your inquiry is still under review, check again later.
                </DialogDescription>
              </DialogHeader>

              <div className="py-3">
                {personaStatusError && (
                  <p role="alert" className="text-xs text-destructive">
                    {personaStatusError}
                  </p>
                )}
              </div>

              <DialogFooter className="gap-2 sm:gap-0">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setIdModalOpen(false)}
                >
                  Close
                </Button>
                <Button
                  type="button"
                  size="sm"
                  onClick={() => {
                    setPersonaInquiryId(null);
                    setPersonaHostedUrl(null);
                    setPersonaStep("intro");
                  }}
                >
                  Start another inquiry
                </Button>
              </DialogFooter>
            </>
          )}

          {personaStep === "success" && (
            <>
              <DialogHeader>
                <div className="flex items-center gap-2">
                  <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-emerald-500/10 text-emerald-600 border border-emerald-500/20">
                    <CheckCircle2 className="h-4 w-4" />
                  </div>
                  <DialogTitle className="text-base font-semibold">
                    Persona reported approval
                  </DialogTitle>
                </div>
                <DialogDescription className="text-xs leading-relaxed">
                  WorkPay recorded Persona's approved inquiry. This result is limited to the status
                  Persona reported; it does not certify trust, skills, or work quality and does not
                  authorize payments.
                </DialogDescription>
              </DialogHeader>
              <DialogFooter className="mt-3">
                <Button
                  type="button"
                  size="sm"
                  className="w-full"
                  onClick={() => setIdModalOpen(false)}
                >
                  Done
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* Dialog for PayPal Account Binding */}
      <Dialog open={paypalModalOpen} onOpenChange={setPaypalModalOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <div className="flex items-center gap-2 mb-1">
              <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-[var(--wp-surface-subtle)] border border-[var(--wp-border)]">
                <Wallet className="h-4 w-4 text-[var(--wp-accent)]" />
              </div>
              <DialogTitle className="text-base font-semibold">PayPal Account Binding</DialogTitle>
            </div>
            <DialogDescription className="text-xs text-[var(--wp-text-secondary)] leading-relaxed">
              Connect your verified PayPal account for task authorization holds and specialist
              payouts.
            </DialogDescription>
          </DialogHeader>

          <div className="py-4 space-y-4">
            {/* Primary OAuth Method */}
            <div className="p-4 rounded-xl border border-blue-500/20 bg-blue-500/5 space-y-3">
              <div className="flex items-center justify-between">
                <span className="font-semibold text-xs text-[var(--wp-text-primary)]">
                  Method 1: Connect with PayPal (OAuth 2.0)
                </span>
                <Badge
                  variant="outline"
                  className="text-[10px] font-mono text-blue-600 border-blue-400/30"
                >
                  Recommended
                </Badge>
              </div>
              <p className="text-[11px] text-[var(--wp-text-secondary)] leading-relaxed">
                Logs in via PayPal to automatically link and verify your PayPal Payer ID, primary
                email, and KYC standing in a single step.
              </p>
              <Button
                type="button"
                onClick={handleConnectPayPalOAuth}
                disabled={connectingPayPalOAuth}
                className="w-full bg-[#0070BA] hover:bg-[#005ea6] text-white text-xs font-semibold shadow-xs"
              >
                <Wallet className="h-3.5 w-3.5 mr-1.5" />
                {connectingPayPalOAuth
                  ? "Redirecting to PayPal..."
                  : "Sign in & Connect with PayPal"}
              </Button>
            </div>

            <div className="relative flex py-1 items-center">
              <div className="flex-grow border-t border-[var(--wp-border)]"></div>
              <span className="flex-shrink mx-3 text-[11px] text-[var(--wp-text-secondary)] font-medium">
                Or verify specialist payout address
              </span>
              <div className="flex-grow border-t border-[var(--wp-border)]"></div>
            </div>

            {/* Specialist Payout Challenge */}
            {payoutVerifyStep === "input" ? (
              <form onSubmit={handleRequestPayoutCode} className="space-y-3">
                <div className="space-y-1.5">
                  <Label htmlFor="payoutEmailInput" className="text-xs">
                    PayPal Payout Email
                  </Label>
                  <div className="relative">
                    <Mail className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                    <Input
                      id="payoutEmailInput"
                      type="email"
                      placeholder="specialist@company.com"
                      value={inputPaypalEmail}
                      onChange={(e) => setInputPaypalEmail(e.target.value)}
                      required
                      className="pl-9 text-xs"
                    />
                  </div>
                  <p className="text-[10px] text-[var(--wp-text-secondary)]">
                    Rejects disposable domains. Performs DNS MX verification before dispatching
                    code.
                  </p>
                </div>

                <div className="flex justify-end gap-2 pt-1">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => setPaypalModalOpen(false)}
                    className="text-xs"
                  >
                    Cancel
                  </Button>
                  <Button
                    type="submit"
                    size="sm"
                    disabled={sendingPayoutCode}
                    className="text-xs font-semibold"
                  >
                    {sendingPayoutCode ? "Verifying Domain..." : "Send Confirmation Code"}
                  </Button>
                </div>
              </form>
            ) : (
              <form onSubmit={handleConfirmPayoutCode} className="space-y-3">
                <div className="p-3 rounded-lg border border-[var(--wp-border)] bg-[var(--wp-surface-subtle)] text-[11px] text-[var(--wp-text-secondary)]">
                  A 6-digit confirmation code was dispatched for <strong>{inputPaypalEmail}</strong>
                  .
                </div>

                {issuedPayoutCode && (
                  <div className="p-2 rounded bg-emerald-500/10 border border-emerald-500/20 text-emerald-700 dark:text-emerald-400 font-mono text-xs text-center">
                    Development Confirmation Code: <strong>{issuedPayoutCode}</strong>
                  </div>
                )}

                <div className="space-y-1.5">
                  <Label htmlFor="payoutCodeInput" className="text-xs">
                    Enter 6-Digit Confirmation Code
                  </Label>
                  <Input
                    id="payoutCodeInput"
                    placeholder="123456"
                    value={payoutVerifyCode}
                    onChange={(e) => setPayoutVerifyCode(e.target.value)}
                    required
                    maxLength={6}
                    className="text-center font-mono text-sm tracking-widest"
                  />
                </div>

                <div className="flex justify-between items-center pt-1">
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => setPayoutVerifyStep("input")}
                    className="text-xs"
                  >
                    Change Email
                  </Button>
                  <div className="flex gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => setPaypalModalOpen(false)}
                      className="text-xs"
                    >
                      Cancel
                    </Button>
                    <Button
                      type="submit"
                      size="sm"
                      disabled={confirmingPayoutCode}
                      className="text-xs font-semibold"
                    >
                      {confirmingPayoutCode ? "Confirming..." : "Confirm & Bind Address"}
                    </Button>
                  </div>
                </div>
              </form>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Confirmation Dialog for PayPal Unbind */}
      <Dialog open={unbindModalOpen} onOpenChange={setUnbindModalOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="text-base font-semibold">Unlink PayPal Account?</DialogTitle>
            <DialogDescription className="text-xs text-[var(--wp-text-secondary)] leading-relaxed mt-1">
              Disconnecting your PayPal account will disable one-click payment authorizations and
              prevent specialist disbursements until a new account is connected. Any currently
              active authorization holds will remain on PayPal until their contracts settle.
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
              This will restore the database to the clean demonstration baseline. Any custom test
              tasks created during this session will be reset.
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
    <Suspense
      fallback={
        <div className="h-64 w-full animate-pulse rounded-xl bg-[var(--wp-surface-subtle)]" />
      }
    >
      <SettingsContent />
    </Suspense>
  );
}
