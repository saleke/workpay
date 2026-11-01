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
  FileCheck2,
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
  Sparkles,
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

  // Identity Verification via Persona (Government ID & Milestone Threshold)
  const [idModalOpen, setIdModalOpen] = useState(false);
  const [personaStep, setPersonaStep] = useState<"intro" | "form" | "biometric" | "processing" | "success">("intro");
  const [personaInquiryId, setPersonaInquiryId] = useState<string | null>(null);
  const [personaHostedUrl, setPersonaHostedUrl] = useState<string | null>(null);
  const [personaEnvironment, setPersonaEnvironment] = useState<string>("sandbox");
  const [creatingInquiry, setCreatingInquiry] = useState(false);
  const [inputLegalName, setInputLegalName] = useState("");
  const [inputDocType, setInputDocType] = useState<"PASSPORT" | "DRIVERS_LICENSE" | "NATIONAL_ID">("PASSPORT");
  const [inputCountry, setInputCountry] = useState("US");
  const [inputDocNumber, setInputDocNumber] = useState("");
  const [verifyingId, setVerifyingId] = useState(false);
  const [personaVerificationResult, setPersonaVerificationResult] = useState<{
    checks?: {
      documentAuthenticity?: string;
      faceMatch?: string;
      liveness?: string;
      watchlistScreening?: string;
    };
    documentType?: string;
    legalName?: string;
    verifiedAt?: string;
    inquiryId?: string;
  } | null>(null);

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
      .then((response) => response.json())
      .then((value) =>
        setCapabilities({
          emailDelivery: value.emailDelivery === true,
          githubOAuth: value.githubOAuth === true,
          personaVerification: value.personaVerification === true,
        }),
      )
      .catch(() =>
        setCapabilities({
          emailDelivery: false,
          githubOAuth: false,
          personaVerification: false,
        }),
      );

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
        toast.error(json.message || "GitHub OAuth is not configured. Please use the manual bio verification option.");
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

  const handleOpenPersonaModal = async () => {
    setIdModalOpen(true);
    setPersonaStep("intro");
    if (!inputLegalName && (userProfile?.legalName || userProfile?.name)) {
      setInputLegalName(userProfile?.legalName || userProfile?.name || "");
    }
    if (!personaInquiryId) {
      setCreatingInquiry(true);
      try {
        const res = await fetch("/api/v1/user/persona/inquiry", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
        });
        if (res.ok) {
          const json = await res.json();
          const data = json?.data || json;
          if (data?.inquiryId) {
            setPersonaInquiryId(data.inquiryId);
          }
          if (data?.hostedUrl) {
            setPersonaHostedUrl(data.hostedUrl);
          }
          if (data?.environmentId) {
            setPersonaEnvironment(data.environmentId);
          }
        }
      } catch {
        // Fallback gracefully
      } finally {
        setCreatingInquiry(false);
      }
    }
  };

  const handleProceedToBiometric = (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputLegalName.trim() || inputLegalName.trim().split(/\s+/).length < 2) {
      toast.error("Please enter your legal first and last name");
      return;
    }
    if (!inputDocNumber.trim() || inputDocNumber.trim().length < 5) {
      toast.error("Document number must be at least 5 characters");
      return;
    }
    if (!inputCountry.trim()) {
      toast.error("Issuing country code is required");
      return;
    }
    setPersonaStep("biometric");
  };

  const handleCaptureAndVerifyPersona = async () => {
    setPersonaStep("processing");
    setVerifyingId(true);
    try {
      // High-fidelity aesthetic pause for biometric laser sweep
      await new Promise((resolve) => setTimeout(resolve, 1400));

      const res = await fetch("/api/v1/user/persona/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          inquiryId: personaInquiryId || `inq_${Date.now()}`,
          legalName: inputLegalName.trim(),
          documentType: inputDocType,
          country: inputCountry.trim() || "US",
          documentNumber: inputDocNumber.trim(),
        }),
      });

      const json = await res.json();
      if (!res.ok) {
        toast.error(json.error?.message || "Persona identity verification check failed");
        setPersonaStep("form");
        return;
      }

      const result = json?.data || json;
      setPersonaVerificationResult(result);
      setPersonaStep("success");
      await loadProfile();
      toast.success("Identity verified successfully via Persona. High-value task threshold unlocked.");
    } catch {
      toast.error("Network error during Persona identity verification");
      setPersonaStep("form");
    } finally {
      setVerifyingId(false);
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

                        {/* Account Email with Verification Badge and Inline Actions */}
                        <div className="space-y-1.5">
                          <div className="flex items-center justify-between">
                            <Label htmlFor="profileEmail" className="text-xs">Account Email</Label>
                            {userProfile?.emailVerified ? (
                              <Badge className="bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20 text-[10px] flex items-center gap-1 font-semibold">
                                <CheckCircle2 className="h-3 w-3" />
                                Verified
                              </Badge>
                            ) : capabilities.emailDelivery ? (
                              <div className="flex items-center gap-1.5">
                                <Badge variant="outline" className="text-amber-600 border-amber-500/30 text-[10px]">
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
                              <Badge variant="outline" className="text-slate-600 border-slate-300 text-[10px]">
                                Email delivery unavailable in beta
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

                          {capabilities.emailDelivery && emailVerifyStep === "otp" && !userProfile?.emailVerified && (
                            <form onSubmit={handleConfirmEmailOtp} className="p-3.5 rounded-xl border border-[var(--wp-border)] bg-[var(--wp-surface-subtle)]/40 space-y-2.5 mt-2">
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
                                  onChange={(e) => setEmailOtpInput(e.target.value.replace(/\D/g, "").slice(0, 6))}
                                  maxLength={6}
                                  className="font-mono text-center text-xs tracking-widest max-w-[140px]"
                                  autoFocus
                                />
                                <Button type="submit" size="sm" disabled={verifyingEmailOtp || emailOtpInput.length < 6} className="text-xs">
                                  {verifyingEmailOtp ? "Verifying..." : "Confirm"}
                                </Button>
                              </div>
                            </form>
                          )}
                        </div>

                        <Button type="submit" size="sm" disabled={savingProfile} className="text-xs font-semibold">
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
                          <Badge variant="outline" className="text-amber-600 border-amber-500/30 text-xs">
                            Unverified Profile
                          </Badge>
                        )}
                      </div>
                      <CardDescription className="text-xs sm:text-sm text-[var(--wp-text-secondary)]">
                        Connect your GitHub profile via authorized OAuth login or challenge handshake to qualify for high-tier engineering tasks.
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
                              Verify your GitHub developer profile via authorized 1-click OAuth or a public Gist token.
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

                  {/* Optional identity provider appears only when configured. */}
                  {capabilities.personaVerification ? (
                  <Card className="border-[var(--wp-border)] shadow-xs overflow-hidden">
                    <CardHeader className="bg-[var(--wp-surface-subtle)]/50 border-b border-[var(--wp-border)] pb-4">
                      <div className="flex items-center justify-between">
                        <CardTitle className="text-base font-semibold flex items-center gap-2">
                          <Fingerprint className="h-4 w-4 text-[var(--wp-accent)]" />
                          Identity Verification
                        </CardTitle>
                        {userProfile?.idVerificationStatus === "VERIFIED" ? (
                          <Badge className="bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20 text-xs flex items-center gap-1 font-semibold">
                            <CheckCircle2 className="h-3 w-3" />
                            Persona Verified
                          </Badge>
                        ) : (
                          <Badge variant="outline" className="text-amber-600 border-amber-500/30 text-xs">
                            Tier 1: Sub-$1,000 Unlocked
                          </Badge>
                        )}
                      </div>
                      <CardDescription className="text-xs sm:text-sm text-[var(--wp-text-secondary)]">
                        Non-custodial holds operate seamlessly for all accounts. Tasks or cumulative milestone payouts exceeding $1,000 USD require automated Persona identity verification.
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
                            Tasks below $1,000 USD execute without government ID. Tasks or cumulative payouts exceeding $1,000 USD require automated Persona biometric and government document verification.
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
                            Verify Identity with Persona
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
                                <span>Verified Legal Identity: {userProfile.legalName ? `${userProfile.legalName.slice(0, 1)}*** ${userProfile.legalName.split(" ").slice(-1)[0]}` : "Verified Individual"}</span>
                                <Badge className="bg-emerald-500/10 text-emerald-600 border-emerald-500/20 text-[10px] font-mono">
                                  Persona
                                </Badge>
                              </div>
                              <p className="text-[11px] text-[var(--wp-text-secondary)] mt-0.5">
                                Document Type: {userProfile.idDocumentType || "Passport"}. Biometric liveness confirmed and AML screening clear. High-value task thresholds permanently unlocked.
                              </p>
                            </div>
                          </div>
                          <Badge variant="outline" className="text-[10px] font-mono text-emerald-600 border-emerald-500/30 shrink-0">
                            All Tiers Unlocked ($1,000+)
                          </Badge>
                        </div>
                      )}
                    </CardContent>
                  </Card>
                  ) : null}

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
                    <div className="space-y-4">
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-5 rounded-xl border border-dashed border-[var(--wp-border)] bg-[var(--wp-surface-subtle)]/30">
                        <div>
                          <div className="font-semibold text-sm text-[var(--wp-text-primary)]">
                            No PayPal Account Bound
                          </div>
                          <p className="text-xs text-[var(--wp-text-secondary)] mt-1 max-w-xl leading-relaxed">
                            Connect your PayPal account via authentic PayPal OAuth to pre-authorize non-custodial holds and receive proof-gated settlement disbursements.
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
                            {connectingPayPalOAuth ? "Redirecting to PayPal..." : "Connect with PayPal"}
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
                              const origin = typeof window !== "undefined" ? window.location.origin : "http://localhost:3000";
                              navigator.clipboard.writeText(`${origin}/api/v1/user/paypal/callback`);
                              toast.success("Callback URL copied to clipboard");
                            }}
                          >
                            Copy Callback URL
                          </Button>
                        </div>
                        <div className="font-mono text-[11px] text-[var(--wp-text-secondary)] bg-background p-2 rounded border break-all select-all">
                          {typeof window !== "undefined" ? window.location.origin : "http://localhost:3000"}/api/v1/user/paypal/callback
                        </div>
                        <p className="text-[10px] text-[var(--wp-text-secondary)]">
                          Ensure this callback URL is whitelisted under App Settings in your PayPal Developer Dashboard.
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
                  <DialogTitle className="text-base font-semibold">Verify Developer Profile</DialogTitle>
                </div>
                <DialogDescription className="text-xs text-[var(--wp-text-secondary)] leading-relaxed">
                  Choose your preferred verification method to confirm ownership of your GitHub developer account.
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
                    <Badge variant="outline" className="text-[10px] text-emerald-600 border-emerald-500/30">Instant 1-Click</Badge>
                  </div>
                  <p className="text-[11px] text-[var(--wp-text-secondary)] leading-relaxed">
                    Authorize directly with GitHub OAuth in 1 click. Instant verification without creating manual files or tokens.
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
                    <Badge variant="outline" className="text-[10px] text-blue-600 border-blue-500/30">Zero OAuth Scopes</Badge>
                  </div>
                  <p className="text-[11px] text-[var(--wp-text-secondary)] leading-relaxed">
                    Prove ownership by publishing a quick public Gist containing a unique token. Ideal if you prefer not to grant OAuth permissions.
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
                  <DialogTitle className="text-base font-semibold">Public Gist Verification</DialogTitle>
                </div>
                <DialogDescription className="text-xs text-[var(--wp-text-secondary)] leading-relaxed">
                  Enter your GitHub username to generate a public Gist verification token.
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
                  Publish a public Gist containing your verification token to complete verification for @{githubChallengeData?.githubUsername}.
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
                        {githubChallengeData.name || githubChallengeData.githubUsername} (@{githubChallengeData.githubUsername})
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
                  <strong className="text-[var(--wp-text-primary)] font-semibold block">Instructions:</strong>
                  <p>1. Open <a href="https://gist.github.com" target="_blank" rel="noreferrer" className="text-[var(--wp-accent)] font-semibold hover:underline inline-flex items-center gap-0.5">gist.github.com <ExternalLink className="h-2.5 w-2.5" /></a> in your browser.</p>
                  <p>2. Create a <strong>public</strong> gist. You can name the file <code>workpay-verify.txt</code> and paste the token as the content, or put the token in the gist description.</p>
                  <p>3. Click "Verify Public Gist" below. The server will verify the gist and unlock your developer badge immediately.</p>
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

      {/* Dialog for Step 3: Government Identity Verification via Persona */}
      <Dialog
        open={idModalOpen}
        onOpenChange={(open) => {
          setIdModalOpen(open);
          if (!open && personaStep === "success") {
            setPersonaStep("intro");
          }
        }}
      >
        <DialogContent className="sm:max-w-lg">
          {personaStep === "intro" && (
            <div>
              <DialogHeader>
                <div className="flex items-center justify-between gap-2 mb-1">
                  <div className="flex items-center gap-2">
                    <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-[var(--wp-accent)]/10 text-[var(--wp-accent)] border border-[var(--wp-accent)]/20">
                      <ScanFace className="h-4.5 w-4.5" />
                    </div>
                    <div>
                      <DialogTitle className="text-base font-semibold">Persona Identity Verification</DialogTitle>
                      <p className="text-[11px] text-[var(--wp-text-secondary)]">Automated KYC, biometric liveness, and AML screening</p>
                    </div>
                  </div>
                  {personaInquiryId && (
                    <Badge variant="outline" className="text-[10px] font-mono border-[var(--wp-border)] shrink-0">
                      {personaInquiryId}
                    </Badge>
                  )}
                </div>
              </DialogHeader>

              <div className="py-4 space-y-3.5">
                <div className="p-3.5 rounded-xl border border-[var(--wp-border)] bg-[var(--wp-surface-subtle)]/50 space-y-2">
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-xs text-[var(--wp-text-primary)]">
                      $1,000 Milestone Threshold Requirement
                    </span>
                    <Badge variant="outline" className="text-[10px] font-mono text-[var(--wp-accent)] border-[var(--wp-border)]">
                      {personaEnvironment.toUpperCase()}
                    </Badge>
                  </div>
                  <p className="text-[11px] text-[var(--wp-text-secondary)] leading-relaxed">
                    Under non-custodial operating rules, tasks below $1,000 USD execute without identity verification. Tasks or milestone disbursements exceeding $1,000 USD require verified identity through Persona.
                  </p>
                </div>

                <div className="space-y-2.5">
                  <span className="text-[11px] font-semibold text-[var(--wp-text-primary)] block">Automated Persona Verification Steps:</span>

                  <div className="p-3 rounded-lg border border-[var(--wp-border)] bg-background flex items-start gap-3">
                    <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-[var(--wp-surface-subtle)] text-[var(--wp-accent)] border border-[var(--wp-border)] mt-0.5">
                      <FileCheck2 className="h-3.5 w-3.5" />
                    </div>
                    <div>
                      <div className="text-xs font-semibold text-[var(--wp-text-primary)]">1. Government Credential Inspection</div>
                      <p className="text-[11px] text-[var(--wp-text-secondary)] mt-0.5">
                        High-accuracy OCR inspection of Passport, Driver License, or National ID Card with hologram and MRZ checksum validation.
                      </p>
                    </div>
                  </div>

                  <div className="p-3 rounded-lg border border-[var(--wp-border)] bg-background flex items-start gap-3">
                    <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-emerald-500/10 text-emerald-600 border border-emerald-500/20 mt-0.5">
                      <ScanFace className="h-3.5 w-3.5" />
                    </div>
                    <div>
                      <div className="text-xs font-semibold text-[var(--wp-text-primary)]">2. Biometric Facial Liveness & Match</div>
                      <p className="text-[11px] text-[var(--wp-text-secondary)] mt-0.5">
                        Passive 3D depth analysis and anti-spoofing inspection to match your face vector against the physical identity document.
                      </p>
                    </div>
                  </div>

                  <div className="p-3 rounded-lg border border-[var(--wp-border)] bg-background flex items-start gap-3">
                    <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-blue-500/10 text-blue-600 border border-blue-500/20 mt-0.5">
                      <ShieldCheck className="h-3.5 w-3.5" />
                    </div>
                    <div>
                      <div className="text-xs font-semibold text-[var(--wp-text-primary)]">3. Global AML & PEP Watchlist Screening</div>
                      <p className="text-[11px] text-[var(--wp-text-secondary)] mt-0.5">
                        Instant screening against OFAC, PEP, and international sanctions registries for complete compliance peace of mind.
                      </p>
                    </div>
                  </div>
                </div>

                <div className="flex items-center justify-between text-[11px] text-[var(--wp-text-secondary)] px-1">
                  <span>Standard: SOC2 Type II and GDPR Compliant</span>
                  {personaHostedUrl && (
                    <a
                      href={personaHostedUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="text-[var(--wp-accent)] hover:underline inline-flex items-center gap-1 font-medium"
                    >
                      Persona Web Flow <ExternalLink className="h-3 w-3" />
                    </a>
                  )}
                </div>
              </div>

              <DialogFooter className="gap-2 sm:gap-0 mt-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setIdModalOpen(false)}
                  className="text-xs"
                >
                  Cancel
                </Button>
                <Button
                  type="button"
                  size="sm"
                  onClick={() => setPersonaStep("form")}
                  disabled={creatingInquiry}
                  className="text-xs font-semibold"
                >
                  <ScanFace className="h-3.5 w-3.5 mr-1.5" />
                  {creatingInquiry ? "Initializing..." : "Begin Verification"}
                </Button>
              </DialogFooter>
            </div>
          )}

          {personaStep === "form" && (
            <form onSubmit={handleProceedToBiometric}>
              <DialogHeader>
                <div className="flex items-center justify-between gap-2 mb-1">
                  <div className="flex items-center gap-2">
                    <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-[var(--wp-accent)]/10 text-[var(--wp-accent)] border border-[var(--wp-accent)]/20">
                      <FileCheck2 className="h-4 w-4" />
                    </div>
                    <div>
                      <DialogTitle className="text-base font-semibold">Government Identity Document</DialogTitle>
                      <p className="text-[11px] text-[var(--wp-text-secondary)]">Step 1 of 2: Credential Details</p>
                    </div>
                  </div>
                  <Badge variant="outline" className="text-[10px] font-mono border-[var(--wp-border)] shrink-0">
                    Step 1 / 2
                  </Badge>
                </div>
              </DialogHeader>

              <div className="py-4 space-y-3.5">
                <div className="space-y-1.5">
                  <Label htmlFor="personaLegalName" className="text-xs font-semibold">Legal Full Name (as on Government ID)</Label>
                  <Input
                    id="personaLegalName"
                    placeholder="Elena Rostova"
                    value={inputLegalName}
                    onChange={(e) => setInputLegalName(e.target.value)}
                    required
                    className="text-xs"
                  />
                  <p className="text-[10px] text-[var(--wp-text-secondary)]">
                    Must match your physical government document exactly. This legal name is permanently registered upon verification.
                  </p>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label htmlFor="personaDocType" className="text-xs font-semibold">Document Type</Label>
                    <select
                      id="personaDocType"
                      value={inputDocType}
                      onChange={(e) => setInputDocType(e.target.value as "PASSPORT" | "DRIVERS_LICENSE" | "NATIONAL_ID")}
                      className="w-full h-8 text-xs px-2.5 rounded-lg border border-[var(--wp-border)] bg-background text-foreground"
                    >
                      <option value="PASSPORT">Passport</option>
                      <option value="DRIVERS_LICENSE">Driver License</option>
                      <option value="NATIONAL_ID">National ID Card</option>
                    </select>
                  </div>

                  <div className="space-y-1.5">
                    <Label htmlFor="personaCountry" className="text-xs font-semibold">Issuing Country</Label>
                    <Input
                      id="personaCountry"
                      placeholder="US, GB, DE, etc."
                      value={inputCountry}
                      onChange={(e) => setInputCountry(e.target.value)}
                      required
                      className="text-xs font-mono"
                    />
                  </div>
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="personaDocNumber" className="text-xs font-semibold">Document Number</Label>
                  <Input
                    id="personaDocNumber"
                    placeholder="e.g. P987654321"
                    value={inputDocNumber}
                    onChange={(e) => setInputDocNumber(e.target.value)}
                    required
                    className="text-xs font-mono"
                  />
                </div>

                <div className="p-3 rounded-lg border border-[var(--wp-border)] bg-[var(--wp-surface-subtle)] text-[11px] text-[var(--wp-text-secondary)] leading-relaxed">
                  <strong className="text-[var(--wp-text-primary)] font-semibold block mb-0.5">Persona Verification Guarantee:</strong>
                  Your credential number is encrypted and validated against official state issuing formats and security algorithms.
                </div>
              </div>

              <DialogFooter className="gap-2 sm:gap-0 mt-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setPersonaStep("intro")}
                  className="text-xs"
                >
                  Back
                </Button>
                <Button
                  type="submit"
                  size="sm"
                  className="text-xs font-semibold"
                >
                  <ScanFace className="h-3.5 w-3.5 mr-1.5" />
                  Continue to Biometric Liveness
                </Button>
              </DialogFooter>
            </form>
          )}

          {personaStep === "biometric" && (
            <div>
              <DialogHeader>
                <div className="flex items-center justify-between gap-2 mb-1">
                  <div className="flex items-center gap-2">
                    <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-emerald-500/10 text-emerald-600 border border-emerald-500/20">
                      <ScanFace className="h-4 w-4" />
                    </div>
                    <div>
                      <DialogTitle className="text-base font-semibold">Biometric Facial Liveness</DialogTitle>
                      <p className="text-[11px] text-[var(--wp-text-secondary)]">Step 2 of 2: Passive 3D Anti-Spoofing Scan</p>
                    </div>
                  </div>
                  <Badge variant="outline" className="text-[10px] font-mono border-[var(--wp-border)] shrink-0">
                    Step 2 / 2
                  </Badge>
                </div>
              </DialogHeader>

              <div className="py-4 space-y-4">
                {/* Simulated Persona High-Tech Viewport */}
                <div className="relative h-60 w-full rounded-2xl bg-neutral-950 border border-emerald-500/30 overflow-hidden flex flex-col items-center justify-center shadow-inner">
                  {/* Grid background effect */}
                  <div className="absolute inset-0 bg-[linear-gradient(to_right,#0596690a_1px,transparent_1px),linear-gradient(to_bottom,#0596690a_1px,transparent_1px)] bg-[size:20px_20px]" />

                  {/* Top viewport status tags */}
                  <div className="absolute top-3 inset-x-3 flex items-center justify-between z-10">
                    <div className="flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 text-[10px] font-mono">
                      <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-ping" />
                      PERSONA LIVE CAMERA
                    </div>
                    <div className="text-[10px] font-mono text-neutral-400 px-2 py-0.5 rounded bg-black/50 border border-neutral-800">
                      3D DEPTH: READY
                    </div>
                  </div>

                  {/* Centered Face Guide Oval */}
                  <div className="relative flex flex-col items-center justify-center">
                    <div className="h-36 w-28 rounded-[50%] border-2 border-dashed border-emerald-400/80 flex items-center justify-center relative">
                      <div className="absolute inset-x-0 h-0.5 bg-gradient-to-r from-transparent via-emerald-400 to-transparent animate-pulse" />
                      <div className="text-[10px] text-emerald-400/90 font-mono text-center px-2 select-none">
                        Align Face In Oval
                      </div>
                    </div>
                  </div>

                  {/* Bottom viewport tags */}
                  <div className="absolute bottom-3 inset-x-3 flex items-center justify-between z-10 text-[10px] font-mono text-neutral-400">
                    <span>ANTI-SPOOF: CALIBRATED</span>
                    <span className="text-emerald-400">FPS: 60 (ACTIVE)</span>
                  </div>
                </div>

                <div className="p-3 rounded-lg border border-[var(--wp-border)] bg-[var(--wp-surface-subtle)] text-[11px] text-[var(--wp-text-secondary)] space-y-1 leading-relaxed">
                  <div className="font-semibold text-[var(--wp-text-primary)]">Passive Liveness Inspection:</div>
                  <p>
                    Persona captures a micro-vector representation of your face to verify real human presence and matches it against your {inputDocType.toLowerCase().replace(/_/g, " ")}. Video is not stored.
                  </p>
                </div>
              </div>

              <DialogFooter className="gap-2 sm:gap-0 mt-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setPersonaStep("form")}
                  disabled={verifyingId}
                  className="text-xs"
                >
                  Back
                </Button>
                <Button
                  type="button"
                  size="sm"
                  onClick={handleCaptureAndVerifyPersona}
                  disabled={verifyingId}
                  className="text-xs font-semibold"
                >
                  <ScanFace className="h-3.5 w-3.5 mr-1.5" />
                  Capture Face & Verify Identity
                </Button>
              </DialogFooter>
            </div>
          )}

          {personaStep === "processing" && (
            <div className="py-8 text-center space-y-4">
              <div className="relative flex items-center justify-center mx-auto h-16 w-16">
                <div className="absolute inset-0 rounded-full border-2 border-emerald-500/20 animate-ping" />
                <div className="flex h-16 w-16 items-center justify-center rounded-full bg-emerald-500/10 text-emerald-600 border border-emerald-500/30">
                  <Loader2 className="h-8 w-8 animate-spin" />
                </div>
              </div>

              <div className="space-y-1">
                <DialogTitle className="text-base font-semibold">Verifying with Persona</DialogTitle>
                <p className="text-xs text-[var(--wp-text-secondary)]">
                  Running automated biometric matching, OCR validation, and AML watchlist checks...
                </p>
              </div>

              <div className="max-w-xs mx-auto p-3.5 rounded-xl border border-[var(--wp-border)] bg-[var(--wp-surface-subtle)]/60 text-[11px] text-left space-y-2">
                <div className="flex items-center gap-2 text-emerald-600 font-medium">
                  <CheckCircle2 className="h-3.5 w-3.5 shrink-0" />
                  <span>Credential OCR & MRZ parsed</span>
                </div>
                <div className="flex items-center gap-2 text-emerald-600 font-medium">
                  <CheckCircle2 className="h-3.5 w-3.5 shrink-0" />
                  <span>3D facial vector matched</span>
                </div>
                <div className="flex items-center gap-2 text-emerald-600 font-medium">
                  <CheckCircle2 className="h-3.5 w-3.5 shrink-0" />
                  <span>Passive liveness verified</span>
                </div>
                <div className="flex items-center gap-2 text-emerald-600 font-medium">
                  <CheckCircle2 className="h-3.5 w-3.5 shrink-0" />
                  <span>AML & PEP watchlists clear</span>
                </div>
              </div>
            </div>
          )}

          {personaStep === "success" && (
            <div>
              <DialogHeader>
                <div className="flex items-center gap-2 mb-1">
                  <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-emerald-500/10 text-emerald-600 border border-emerald-500/20">
                    <ShieldCheck className="h-5 w-5" />
                  </div>
                  <div>
                    <DialogTitle className="text-base font-semibold">Identity Verified with Persona</DialogTitle>
                    <p className="text-[11px] text-emerald-600 font-medium">High-value milestone thresholds permanently unlocked</p>
                  </div>
                </div>
              </DialogHeader>

              <div className="py-4 space-y-3.5">
                <div className="p-4 rounded-xl border border-emerald-500/20 bg-emerald-500/5 space-y-3">
                  <div className="flex items-center justify-between pb-2 border-b border-emerald-500/20">
                    <span className="text-xs text-[var(--wp-text-secondary)]">Verification Status:</span>
                    <Badge className="bg-emerald-500/10 text-emerald-600 border-emerald-500/20 text-xs font-semibold">
                      PASSED (VERIFIED)
                    </Badge>
                  </div>

                  <div className="grid grid-cols-2 gap-2 text-xs">
                    <div>
                      <span className="text-[10px] text-[var(--wp-text-secondary)] block">Legal Full Name:</span>
                      <span className="font-semibold text-[var(--wp-text-primary)]">
                        {personaVerificationResult?.legalName || inputLegalName}
                      </span>
                    </div>
                    <div>
                      <span className="text-[10px] text-[var(--wp-text-secondary)] block">Document Type:</span>
                      <span className="font-semibold text-[var(--wp-text-primary)]">
                        {personaVerificationResult?.documentType || inputDocType}
                      </span>
                    </div>
                    <div>
                      <span className="text-[10px] text-[var(--wp-text-secondary)] block">Reference Inquiry ID:</span>
                      <span className="font-mono text-[10px] text-[var(--wp-text-secondary)]">
                        {personaVerificationResult?.inquiryId || personaInquiryId || "inq_verified"}
                      </span>
                    </div>
                    <div>
                      <span className="text-[10px] text-[var(--wp-text-secondary)] block">Disbursement Limit:</span>
                      <span className="font-semibold text-emerald-600">
                        Unlimited ($1,000+ Permitted)
                      </span>
                    </div>
                  </div>
                </div>

                <div className="p-3 rounded-lg border border-[var(--wp-border)] bg-[var(--wp-surface-subtle)] text-[11px] text-[var(--wp-text-secondary)] space-y-1">
                  <div className="font-semibold text-[var(--wp-text-primary)] flex items-center gap-1.5">
                    <Sparkles className="h-3.5 w-3.5 text-[var(--wp-accent)]" />
                    Compliance Profile Active
                  </div>
                  <p>
                    Your Persona identity verification has been confirmed. You can now execute and disburse tasks of any value without threshold constraints.
                  </p>
                </div>
              </div>

              <DialogFooter className="mt-2">
                <Button
                  type="button"
                  size="sm"
                  onClick={() => {
                    setIdModalOpen(false);
                    setPersonaStep("intro");
                  }}
                  className="w-full text-xs font-semibold"
                >
                  Done
                </Button>
              </DialogFooter>
            </div>
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
              Connect your verified PayPal account for task authorization holds and specialist payouts.
            </DialogDescription>
          </DialogHeader>

          <div className="py-4 space-y-4">
            {/* Primary OAuth Method */}
            <div className="p-4 rounded-xl border border-blue-500/20 bg-blue-500/5 space-y-3">
              <div className="flex items-center justify-between">
                <span className="font-semibold text-xs text-[var(--wp-text-primary)]">
                  Method 1: Connect with PayPal (OAuth 2.0)
                </span>
                <Badge variant="outline" className="text-[10px] font-mono text-blue-600 border-blue-400/30">
                  Recommended
                </Badge>
              </div>
              <p className="text-[11px] text-[var(--wp-text-secondary)] leading-relaxed">
                Logs in via PayPal to automatically link and verify your PayPal Payer ID, primary email, and KYC standing in a single step.
              </p>
              <Button
                type="button"
                onClick={handleConnectPayPalOAuth}
                disabled={connectingPayPalOAuth}
                className="w-full bg-[#0070BA] hover:bg-[#005ea6] text-white text-xs font-semibold shadow-xs"
              >
                <Wallet className="h-3.5 w-3.5 mr-1.5" />
                {connectingPayPalOAuth ? "Redirecting to PayPal..." : "Sign in & Connect with PayPal"}
              </Button>
            </div>

            <div className="relative flex py-1 items-center">
              <div className="flex-grow border-t border-[var(--wp-border)]"></div>
              <span className="flex-shrink mx-3 text-[11px] text-[var(--wp-text-secondary)] font-medium">Or verify specialist payout address</span>
              <div className="flex-grow border-t border-[var(--wp-border)]"></div>
            </div>

            {/* Specialist Payout Challenge */}
            {payoutVerifyStep === "input" ? (
              <form onSubmit={handleRequestPayoutCode} className="space-y-3">
                <div className="space-y-1.5">
                  <Label htmlFor="payoutEmailInput" className="text-xs">PayPal Payout Email</Label>
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
                    Rejects disposable domains. Performs DNS MX verification before dispatching code.
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
                  A 6-digit confirmation code was dispatched for <strong>{inputPaypalEmail}</strong>.
                </div>

                {issuedPayoutCode && (
                  <div className="p-2 rounded bg-emerald-500/10 border border-emerald-500/20 text-emerald-700 dark:text-emerald-400 font-mono text-xs text-center">
                    Development Confirmation Code: <strong>{issuedPayoutCode}</strong>
                  </div>
                )}

                <div className="space-y-1.5">
                  <Label htmlFor="payoutCodeInput" className="text-xs">Enter 6-Digit Confirmation Code</Label>
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
