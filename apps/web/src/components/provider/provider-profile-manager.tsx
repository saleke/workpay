"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import {
  AlertTriangle,
  ArrowRight,
  Briefcase,
  Calendar,
  Check,
  CheckCircle2,
  Clock,
  Coins,
  Cpu,
  DollarSign,
  ExternalLink,
  FileCheck,
  Globe,
  HelpCircle,
  Languages,
  Lock,
  MessageSquare,
  Plus,
  RefreshCw,
  Scale,
  Shield,
  ShieldAlert,
  ShieldCheck,
  Sliders,
  Sparkles,
  Tag,
  User,
  UserCheck,
  Wallet,
  X,
} from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { ProviderAvatar } from "@/components/provider/provider-avatar";
import { toast } from "sonner";
import {
  getProviderProfile,
  updateProviderProfile,
  type ProviderProfileDto,
  type WorkPreferencesDto,
} from "@/lib/api/endpoints";
import { cn } from "@/lib/utils";

function normalizeServiceTag(value: string): string {
  return value
    .normalize("NFKC")
    .trim()
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^\p{L}\p{N}]+/gu, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 50);
}

function displayServiceTag(value: string): string {
  return value.replace(/[-_]+/g, " ").replace(/\b\p{L}/gu, (letter) => letter.toLocaleUpperCase());
}

const TIMEZONES = [
  "UTC",
  "America/New_York (ET)",
  "America/Chicago (CT)",
  "America/Denver (MT)",
  "America/Los_Angeles (PT)",
  "Europe/London (GMT)",
  "Europe/Paris (CET)",
  "Asia/Tokyo (JST)",
];

export function ProviderProfileManager() {
  const searchParams = useSearchParams();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [isDirty, setIsDirty] = useState(false);
  const [activeSection, setActiveSection] = useState<
    "capabilities" | "availability" | "pricing" | "reviews" | "commitments" | "execution" | "payout"
  >(searchParams.get("section") === "reviews" ? "reviews" : "capabilities");

  // Core profile fields
  const [displayName, setDisplayName] = useState("");
  const [profileImage, setProfileImage] = useState("");
  const [bio, setBio] = useState("");
  const [status, setStatus] = useState<"ACTIVE" | "INACTIVE">("ACTIVE");
  const [capabilities, setCapabilities] = useState<Array<{ tag: string; proficiency: number }>>([]);
  const [customSkill, setCustomSkill] = useState("");

  // Availability fields
  const [workAcceptanceStatus, setWorkAcceptanceStatus] = useState<
    "ACCEPTING" | "LIMITED" | "UNAVAILABLE"
  >("ACCEPTING");
  const [capacity, setCapacity] = useState<number>(2);
  const [activeAssignments, setActiveAssignments] = useState<number>(0);
  const [timezone, setTimezone] = useState("UTC");
  const [availabilitySchedule, setAvailabilitySchedule] = useState(
    "Monday to Friday, 9:00 AM - 5:00 PM UTC",
  );
  const [minNoticeHours, setMinNoticeHours] = useState<number>(4);
  const [plannedUnavailability, setPlannedUnavailability] = useState("");

  // Commercial / pricing fields
  const [pricingModel, setPricingModel] = useState<"FIXED" | "HOURLY" | "BOTH">("FIXED");
  const [targetRate, setTargetRate] = useState<number>(45);
  const [minCompensation, setMinCompensation] = useState<number>(25);
  const [minAssignmentSize, setMinAssignmentSize] = useState<number>(20);
  const [willingToNegotiate, setWillingToNegotiate] = useState(true);

  // Commitment & acceptance rules
  const [requireExplicitApproval, setRequireExplicitApproval] = useState(true);
  const [aiRecommendationAllowed, setAiRecommendationAllowed] = useState(true);
  const [acceptedCategories, setAcceptedCategories] = useState<string[]>([]);
  const [declinedCategories, setDeclinedCategories] = useState<string[]>([]);
  const [customDeclined, setCustomDeclined] = useState("");

  // Execution & quality preferences
  const [communicationPreference, setCommunicationPreference] = useState<
    "ASYNC" | "REALTIME" | "DIRECT"
  >("ASYNC");
  const [deliveryFormat, setDeliveryFormat] = useState("");
  const [updateFrequency, setUpdateFrequency] = useState<
    "CHECKPOINTS_ONLY" | "DAILY" | "ON_MILESTONES"
  >("CHECKPOINTS_ONLY");
  const [reviewSpecBeforeAccept, setReviewSpecBeforeAccept] = useState(true);
  const [notifyOnVerificationFail, setNotifyOnVerificationFail] = useState(true);
  const [notifyOnRevisionRequest, setNotifyOnRevisionRequest] = useState(true);
  const [toolsAndTechnologies, setToolsAndTechnologies] = useState<string[]>([]);
  const [customTool, setCustomTool] = useState("");
  const [languages, setLanguages] = useState<string[]>(["English"]);

  // Paid review service uses this same professional identity.
  const [reviewEnabled, setReviewEnabled] = useState(false);
  const [reviewListed, setReviewListed] = useState(false);
  const [reviewAvailability, setReviewAvailability] = useState<"AVAILABLE" | "BUSY" | "OFFLINE">(
    "AVAILABLE",
  );
  const [reviewNotice, setReviewNotice] = useState("");
  const [reviewSummary, setReviewSummary] = useState("");
  const [reviewContactUrl, setReviewContactUrl] = useState("");
  const [reviewFee, setReviewFee] = useState(75);
  const [reviewTurnaroundDays, setReviewTurnaroundDays] = useState(3);
  const [reviewFeeMode, setReviewFeeMode] = useState<"PAYPAL" | "DIRECT">("PAYPAL");
  const [reviewDisclosureConfirmed, setReviewDisclosureConfirmed] = useState(false);
  const [reviewConflictNotes, setReviewConflictNotes] = useState("");
  const [reviewConflictUsernames, setReviewConflictUsernames] = useState("");
  const [reviewDomains, setReviewDomains] = useState<
    Array<{
      domainTag: string;
      scope: string;
      selfAssessedLevel: number;
      yearsExperience: number | null;
      methods: string[];
    }>
  >([]);
  const [reviewEvidence, setReviewEvidence] = useState<
    Array<{
      kind: "PORTFOLIO" | "CREDENTIAL" | "EXPERIENCE" | "REFERENCE";
      title: string;
      description: string;
      url: string | null;
      issuer: string | null;
    }>
  >([]);

  const loadProfile = async () => {
    setLoading(true);
    try {
      const res = await getProviderProfile();
      if (!res.error && res.data?.provider) {
        const p = res.data.provider;
        setDisplayName(p.displayName || "Freelance Specialist");
        setProfileImage(p.image ?? "");
        setBio(p.bio ?? "");
        setStatus(p.status);
        setCapabilities(p.capabilities ?? []);
        if (p.availability) {
          setCapacity(p.availability.capacity);
          setActiveAssignments(p.availability.activeAssignments);
          if (!p.availability.available) {
            setWorkAcceptanceStatus("UNAVAILABLE");
          }
        }
        if (p.workPreferences) {
          const wp = p.workPreferences;
          setWorkAcceptanceStatus(wp.workAcceptanceStatus);
          setTimezone(wp.timezone || "UTC");
          setAvailabilitySchedule(
            wp.availabilitySchedule || "Monday to Friday, 9:00 AM - 5:00 PM UTC",
          );
          setMinNoticeHours(wp.minNoticeHours ?? 4);
          setPlannedUnavailability(wp.plannedUnavailability ?? "");
          setPricingModel(wp.pricingModel || "FIXED");
          setTargetRate(wp.targetRateMinor ? Math.round(wp.targetRateMinor / 100) : 45);
          setMinCompensation(
            wp.minCompensationMinor ? Math.round(wp.minCompensationMinor / 100) : 25,
          );
          setMinAssignmentSize(
            wp.minAssignmentSizeMinor ? Math.round(wp.minAssignmentSizeMinor / 100) : 20,
          );
          setWillingToNegotiate(wp.willingToNegotiate ?? true);
          setRequireExplicitApproval(wp.requireExplicitApproval ?? true);
          setAiRecommendationAllowed(wp.aiRecommendationAllowed ?? true);
          setAcceptedCategories(wp.acceptedCategories ?? []);
          setDeclinedCategories(wp.declinedCategories ?? []);
          setCommunicationPreference(wp.communicationPreference || "ASYNC");
          setDeliveryFormat(wp.deliveryFormat ?? "");
          setUpdateFrequency(wp.updateFrequency || "CHECKPOINTS_ONLY");
          setReviewSpecBeforeAccept(wp.reviewSpecBeforeAccept ?? true);
          setNotifyOnVerificationFail(wp.notifyOnVerificationFail ?? true);
          setNotifyOnRevisionRequest(wp.notifyOnRevisionRequest ?? true);
          setToolsAndTechnologies(wp.toolsAndTechnologies ?? []);
          setLanguages(wp.languages?.length ? wp.languages : ["English"]);
          if (wp.reviewService) {
            const review = wp.reviewService;
            setReviewEnabled(review.enabled);
            setReviewListed(review.listed);
            setReviewAvailability(review.availability);
            setReviewNotice(review.notice ?? "");
            setReviewSummary(review.summary);
            setReviewContactUrl(review.publicContactUrl ?? "");
            setReviewFee(review.feeMinor === null ? 75 : review.feeMinor / 100);
            setReviewTurnaroundDays(review.typicalTurnaroundDays ?? 3);
            setReviewFeeMode(review.feeMode);
            setReviewDisclosureConfirmed(review.conflictDisclosureConfirmed);
            setReviewConflictNotes(review.conflictNotes ?? "");
            setReviewConflictUsernames(review.conflictUsernames.join(", "));
            setReviewDomains(review.domains);
            setReviewEvidence(review.evidence);
          }
        }
      } else if (res.data) {
        setDisplayName(res.data.profile?.displayName ?? "");
        setProfileImage(res.data.profile?.image ?? "");
        setBio("");
        setStatus("ACTIVE");
        setCapabilities([]);
      } else {
        toast.error("Your professional profile could not be loaded.");
      }
    } catch (err) {
      console.error("Failed to load worker preferences:", err);
    } finally {
      setLoading(false);
      setIsDirty(false);
    }
  };

  useEffect(() => {
    void loadProfile();
  }, []);

  const markDirty = () => {
    if (!isDirty) setIsDirty(true);
  };

  const handleAddCustomSkill = () => {
    const tag = normalizeServiceTag(customSkill);
    if (!tag) return;
    if (capabilities.length >= 12) {
      toast.error("Add no more than 12 services.");
      return;
    }
    markDirty();
    if (!capabilities.some((capability) => capability.tag === tag)) {
      setCapabilities([...capabilities, { tag, proficiency: 4 }]);
    }
    setCustomSkill("");
  };

  const handleAddCustomTool = () => {
    const trimmed = customTool.trim();
    if (!trimmed) return;
    if (toolsAndTechnologies.length >= 20) {
      toast.error("Add no more than 20 tools.");
      return;
    }
    markDirty();
    if (!toolsAndTechnologies.some((tool) => tool.toLowerCase() === trimmed.toLowerCase())) {
      setToolsAndTechnologies([...toolsAndTechnologies, trimmed]);
    }
    setCustomTool("");
  };

  const handleAddDeclinedCategory = () => {
    const trimmed = customDeclined.trim().toLowerCase();
    if (!trimmed) return;
    markDirty();
    if (!declinedCategories.includes(trimmed)) {
      setDeclinedCategories([...declinedCategories, trimmed]);
    }
    setCustomDeclined("");
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (saving) return;

    if (!displayName.trim()) {
      toast.error("Display name is required");
      return;
    }
    if (status === "ACTIVE" && !bio.trim()) {
      toast.error("Add a professional summary before listing your profile.");
      return;
    }
    if (
      status === "ACTIVE" &&
      workAcceptanceStatus !== "UNAVAILABLE" &&
      aiRecommendationAllowed &&
      capabilities.length === 0
    ) {
      toast.error("Add at least one service before listing your project-work profile.");
      setActiveSection("capabilities");
      return;
    }
    if (reviewEnabled && reviewSummary.trim().length < 20) {
      toast.error("Describe your paid review service in at least 20 characters.");
      setActiveSection("reviews");
      return;
    }
    if (reviewEnabled && reviewDomains.length === 0) {
      toast.error("Add at least one domain you can review.");
      setActiveSection("reviews");
      return;
    }
    if (reviewListed && !reviewDisclosureConfirmed) {
      toast.error("Confirm the conflict-disclosure commitment before listing your review service.");
      setActiveSection("reviews");
      return;
    }

    setSaving(true);
    try {
      const payload = {
        displayName: displayName.trim(),
        bio: bio.trim() || null,
        hourlyRateMinor: Math.round(targetRate * 100),
        currency: "USD",
        payoutEmail: null,
        status,
        capabilities,
        availability: {
          available: workAcceptanceStatus !== "UNAVAILABLE",
          capacity,
        },
        workPreferences: {
          workAcceptanceStatus,
          timezone,
          availabilitySchedule: availabilitySchedule.trim() || null,
          minNoticeHours,
          plannedUnavailability: plannedUnavailability.trim() || null,
          pricingModel,
          targetRateMinor: Math.round(targetRate * 100),
          minCompensationMinor: Math.round(minCompensation * 100),
          minAssignmentSizeMinor: Math.round(minAssignmentSize * 100),
          willingToNegotiate,
          acceptedCategories,
          declinedCategories,
          requireExplicitApproval,
          aiRecommendationAllowed,
          communicationPreference,
          deliveryFormat: deliveryFormat.trim() || null,
          updateFrequency,
          notifyOnVerificationFail,
          notifyOnRevisionRequest,
          reviewSpecBeforeAccept,
          toolsAndTechnologies,
          languages,
          reviewService: {
            enabled: reviewEnabled,
            listed: reviewEnabled && reviewListed,
            availability: reviewAvailability,
            notice: reviewNotice.trim() || null,
            summary: reviewSummary.trim(),
            publicContactUrl: reviewContactUrl.trim() || null,
            feeMinor: reviewEnabled ? Math.round(reviewFee * 100) : null,
            typicalTurnaroundDays: reviewEnabled ? reviewTurnaroundDays : null,
            conflictDisclosureConfirmed: reviewDisclosureConfirmed,
            conflictNotes: reviewConflictNotes.trim() || null,
            conflictUsernames: [
              ...new Set(
                reviewConflictUsernames
                  .split(",")
                  .map((username) => username.trim().replace(/^@/, "").toLowerCase())
                  .filter(Boolean),
              ),
            ],
            domains: reviewDomains,
            evidence: reviewEvidence,
            feeMode: reviewFeeMode,
          },
        },
      };

      const res = await updateProviderProfile(payload);
      if (res.error) {
        toast.error(`Failed to save preferences: ${res.error.message}`);
      } else {
        toast.success("Work preferences and capabilities saved successfully");
        setIsDirty(false);
      }
    } catch (err) {
      console.error("Save failed:", err);
      toast.error("Failed to update work preferences");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16 text-xs text-[var(--wp-text-secondary)]">
        <RefreshCw className="h-4 w-4 animate-spin mr-2 text-[var(--wp-accent)]" />
        Loading work capabilities and availability settings...
      </div>
    );
  }

  return (
    <form onSubmit={handleSave} className="flex w-full min-w-0 flex-col gap-6">
      {/* Overview Banner: Dual-Role Model */}
      <div className="flex min-w-0 flex-col gap-4 rounded-xl border border-[var(--wp-border)] bg-white p-4 shadow-xs sm:flex-row sm:items-center sm:justify-between sm:p-5">
        <div className="flex items-start gap-3.5">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[var(--wp-surface-subtle)] text-[var(--wp-text-primary)] border border-[var(--wp-border)]">
            <Briefcase className="h-5 w-5 text-[var(--wp-accent)]" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex min-w-0 flex-wrap items-center gap-2">
              <span className="break-words text-sm font-semibold text-[var(--wp-text-primary)]">
                Professional service profile
              </span>
              <Badge
                variant="outline"
                className={cn(
                  "text-[10px] uppercase font-bold",
                  workAcceptanceStatus === "ACCEPTING"
                    ? "bg-[var(--wp-success-subtle)] text-[var(--wp-success)] border-[var(--wp-success)]/30"
                    : workAcceptanceStatus === "LIMITED"
                      ? "bg-[var(--wp-accent-subtle)] text-[var(--wp-accent)] border-[var(--wp-accent)]/30"
                      : "bg-[var(--wp-surface-subtle)] text-[var(--wp-text-secondary)] border-[var(--wp-border)]",
                )}
              >
                {workAcceptanceStatus === "ACCEPTING"
                  ? "Accepting Work"
                  : workAcceptanceStatus === "LIMITED"
                    ? "Limited Capacity"
                    : "Unavailable for Work"}
              </Badge>
            </div>
            <p className="mt-1 max-w-2xl break-words text-xs leading-relaxed text-[var(--wp-text-secondary)]">
              Offer project work, paid reviews, or both from one profile.
            </p>
          </div>
        </div>

        {/* Global Save Button */}
        <div className="flex max-w-full shrink-0 flex-wrap items-center justify-end gap-2 self-end sm:self-auto">
          {isDirty && (
            <span className="text-[11px] font-medium text-[var(--wp-accent)] flex items-center gap-1 mr-1">
              <span className="h-1.5 w-1.5 rounded-full bg-[var(--wp-accent)] animate-pulse" />
              Unsaved changes
            </span>
          )}
          <Button
            type="submit"
            size="sm"
            disabled={saving || !isDirty}
            className="text-xs font-semibold gap-1.5 shadow-xs"
          >
            {saving ? (
              <RefreshCw className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Check className="h-3.5 w-3.5" />
            )}
            <span>{saving ? "Saving..." : "Save Preferences"}</span>
          </Button>
        </div>
      </div>

      {/* Work preference area navigation */}
      <div
        className="grid min-w-0 grid-cols-2 gap-2 sm:grid-cols-4 xl:grid-cols-7"
        role="group"
        aria-label="Work preference areas"
      >
        {[
          { key: "capabilities", label: "Services & Tools" },
          { key: "availability", label: "Availability & Capacity" },
          { key: "pricing", label: "Pricing & Commercials" },
          { key: "reviews", label: "Paid Reviews" },
          { key: "commitments", label: "Acceptance Rules" },
          { key: "execution", label: "Execution & Quality" },
          { key: "payout", label: "Payment Validation" },
        ].map((sec) => (
          <button
            key={sec.key}
            type="button"
            onClick={() => setActiveSection(sec.key as typeof activeSection)}
            aria-pressed={activeSection === sec.key}
            className={cn(
              "flex min-h-11 min-w-0 items-center justify-center rounded-xl border px-2.5 py-2 text-center text-xs font-medium leading-4 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--wp-accent)] focus-visible:ring-offset-2 sm:px-3",
              activeSection === sec.key
                ? "border-[var(--wp-text-primary)] bg-[var(--wp-text-primary)] text-white font-semibold"
                : "border-[var(--wp-border)] bg-white text-[var(--wp-text-secondary)] hover:bg-[var(--wp-surface-subtle)] hover:text-[var(--wp-text-primary)]",
            )}
          >
            {sec.label}
          </button>
        ))}
      </div>

      {/* SECTION: CAPABILITIES & SKILLS */}
      {activeSection === "capabilities" && (
        <Card className="border-[var(--wp-border)] shadow-xs overflow-hidden">
          <CardHeader className="bg-[var(--wp-surface-subtle)]/50 border-b border-[var(--wp-border)] pb-4">
            <CardTitle className="text-base font-semibold flex items-center gap-2">
              <Tag className="h-4 w-4 text-[var(--wp-accent)]" />
              Services &amp; Experience
            </CardTitle>
            <CardDescription className="text-xs sm:text-sm text-[var(--wp-text-secondary)]">
              Explain what clients can hire you for, then add any tools that help them assess fit.
            </CardDescription>
          </CardHeader>
          <CardContent className="p-5 sm:p-6 grid gap-5">
            <div className="max-w-xl">
              <div>
                <label className="text-xs font-semibold text-[var(--wp-text-primary)] block mb-1">
                  Public Display Name
                </label>
                <Input
                  value={displayName}
                  onChange={(e) => {
                    setDisplayName(e.target.value);
                    markDirty();
                  }}
                  placeholder="e.g. Alex Morgan"
                  className="text-xs bg-white"
                />
              </div>
            </div>

            <div className="flex flex-col gap-4 rounded-xl border border-[var(--wp-border)] bg-white p-4 sm:flex-row sm:items-center">
              <ProviderAvatar
                displayName={displayName || "Your profile"}
                image={profileImage.trim() || null}
                className="h-16 w-16"
              />
              <div className="min-w-0 flex-1">
                <p className="text-xs font-semibold text-[var(--wp-text-primary)]">Profile photo</p>
                <p className="mt-1 text-[11px] leading-relaxed text-[var(--wp-text-secondary)]">
                  Your account photo is used across client and professional views.
                </p>
                <Link
                  href="/settings?tab=account"
                  className="mt-2 inline-flex text-xs font-semibold text-[var(--wp-accent)] hover:underline"
                >
                  Change photo in Account settings
                </Link>
              </div>
            </div>

            <div>
              <label className="text-xs font-semibold text-[var(--wp-text-primary)] block mb-1">
                What do you help clients accomplish?
              </label>
              <textarea
                value={bio}
                onChange={(e) => {
                  setBio(e.target.value);
                  markDirty();
                }}
                rows={3}
                maxLength={500}
                placeholder="Describe the problems you solve, the work you deliver, and the clients you work best with."
                className="w-full rounded-lg border border-[var(--wp-border)] bg-white p-3 text-xs text-[var(--wp-text-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--wp-accent)]"
              />
            </div>

            <label className="flex cursor-pointer items-start gap-3 rounded-2xl border border-[var(--wp-border)] bg-white p-4">
              <input
                type="checkbox"
                checked={aiRecommendationAllowed}
                onChange={(event) => {
                  setAiRecommendationAllowed(event.target.checked);
                  markDirty();
                }}
                className="mt-0.5 h-4 w-4 rounded border-[var(--wp-border)] accent-[var(--wp-accent)]"
              />
              <span>
                <span className="block text-xs font-semibold text-[var(--wp-text-primary)]">
                  Show this profile in client searches
                </span>
                <span className="mt-1 block text-[11px] leading-relaxed text-[var(--wp-text-secondary)]">
                  Turn this off to pause new discovery without affecting existing conversations or
                  work.
                </span>
              </span>
            </label>

            <div className="rounded-2xl border border-[var(--wp-border)] bg-[var(--wp-surface-subtle)]/45 p-4">
              <div>
                <span className="block text-sm font-semibold text-[var(--wp-text-primary)]">
                  Services you offer
                </span>
                <span className="mt-1 block text-[11px] leading-relaxed text-[var(--wp-text-secondary)]">
                  Use short phrases a client would search for, such as bookkeeping, video editing,
                  translation, or data cleaning.
                </span>
              </div>
              {capabilities.length > 0 ? (
                <div className="mt-3 flex flex-wrap gap-2">
                  {capabilities.map((capability) => (
                    <span
                      key={capability.tag}
                      className="inline-flex items-center gap-1.5 rounded-full border border-[var(--wp-accent)]/25 bg-white px-3 py-1.5 text-xs font-medium text-[var(--wp-text-primary)]"
                    >
                      {displayServiceTag(capability.tag)}
                      <button
                        type="button"
                        onClick={() => {
                          setCapabilities((current) =>
                            current.filter((item) => item.tag !== capability.tag),
                          );
                          markDirty();
                        }}
                        aria-label={`Remove ${displayServiceTag(capability.tag)}`}
                        className="rounded-full text-[var(--wp-text-secondary)] hover:text-rose-600"
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    </span>
                  ))}
                </div>
              ) : (
                <p className="mt-3 rounded-xl border border-dashed border-[var(--wp-border-strong)] bg-white px-3 py-3 text-xs text-[var(--wp-text-secondary)]">
                  Add at least one service to appear in project-work discovery.
                </p>
              )}
              <div className="mt-3 flex max-w-lg items-center gap-2">
                <label htmlFor="professional-service" className="sr-only">
                  Service to add
                </label>
                <Input
                  id="professional-service"
                  value={customSkill}
                  onChange={(e) => setCustomSkill(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      handleAddCustomSkill();
                    }
                  }}
                  placeholder="Add a service"
                  maxLength={80}
                  className="h-10 bg-white text-xs"
                />
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={handleAddCustomSkill}
                  className="h-10 text-xs"
                >
                  Add service
                </Button>
              </div>
            </div>

            <div className="rounded-2xl border border-[var(--wp-border)] bg-white p-4">
              <span className="block text-sm font-semibold text-[var(--wp-text-primary)]">
                Tools you work with
              </span>
              <span className="mt-1 block text-[11px] text-[var(--wp-text-secondary)]">
                Optional details clients can use to assess fit.
              </span>
              {toolsAndTechnologies.length > 0 ? (
                <div className="mt-3 flex flex-wrap gap-2">
                  {toolsAndTechnologies.map((tool) => (
                    <span
                      key={tool}
                      className="inline-flex items-center gap-1.5 rounded-full border border-[var(--wp-border)] bg-[var(--wp-surface-subtle)] px-3 py-1.5 text-xs font-medium"
                    >
                      {tool}
                      <button
                        type="button"
                        onClick={() => {
                          setToolsAndTechnologies((current) =>
                            current.filter((item) => item !== tool),
                          );
                          markDirty();
                        }}
                        aria-label={`Remove ${tool}`}
                        className="rounded-full text-[var(--wp-text-secondary)] hover:text-rose-600"
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    </span>
                  ))}
                </div>
              ) : null}
              <div className="mt-3 flex max-w-lg items-center gap-2">
                <label htmlFor="professional-tool" className="sr-only">
                  Tool or platform to add
                </label>
                <Input
                  id="professional-tool"
                  value={customTool}
                  onChange={(event) => setCustomTool(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") {
                      event.preventDefault();
                      handleAddCustomTool();
                    }
                  }}
                  placeholder="Add a tool or platform"
                  maxLength={80}
                  className="h-10 bg-white text-xs"
                />
                <Button
                  type="button"
                  variant="outline"
                  onClick={handleAddCustomTool}
                  className="h-10 text-xs"
                >
                  Add tool
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* SECTION B: AVAILABILITY & CAPACITY */}
      {activeSection === "availability" && (
        <Card className="border-[var(--wp-border)] shadow-xs overflow-hidden">
          <CardHeader className="bg-[var(--wp-surface-subtle)]/50 border-b border-[var(--wp-border)] pb-4">
            <CardTitle className="text-base font-semibold flex items-center gap-2">
              <Clock className="h-4 w-4 text-[var(--wp-accent)]" />
              Availability &amp; Workload Capacity
            </CardTitle>
            <CardDescription className="text-xs sm:text-sm text-[var(--wp-text-secondary)]">
              Control your capacity to accept new commitments. Marking yourself unavailable prevents
              new proposals without affecting work currently in progress.
            </CardDescription>
          </CardHeader>
          <CardContent className="p-5 sm:p-6 grid gap-5">
            {/* Work Acceptance Status */}
            <div>
              <label className="text-xs font-semibold text-[var(--wp-text-primary)] block mb-2">
                Work Acceptance Status
              </label>
              <div className="grid sm:grid-cols-3 gap-3">
                {[
                  {
                    key: "ACCEPTING" as const,
                    title: "Accepting Work",
                    desc: "Available for new contract opportunities up to full capacity.",
                    color:
                      "text-[var(--wp-success)] border-[var(--wp-success)]/40 bg-[var(--wp-success-subtle)]/30",
                  },
                  {
                    key: "LIMITED" as const,
                    title: "Limited Availability",
                    desc: "Accepting select urgent tasks only with longer turnaround.",
                    color:
                      "text-[var(--wp-accent)] border-[var(--wp-accent)]/40 bg-[var(--wp-accent-subtle)]/30",
                  },
                  {
                    key: "UNAVAILABLE" as const,
                    title: "Not Accepting Work",
                    desc: "Excluded from provider matching. Existing commitments continue safely.",
                    color:
                      "text-[var(--wp-text-secondary)] border-[var(--wp-border-strong)] bg-[var(--wp-surface-subtle)]",
                  },
                ].map((item) => {
                  const isSelected = workAcceptanceStatus === item.key;
                  return (
                    <div
                      key={item.key}
                      onClick={() => {
                        setWorkAcceptanceStatus(item.key);
                        markDirty();
                      }}
                      className={cn(
                        "p-3.5 rounded-xl border-2 cursor-pointer transition-all active:scale-[0.99] flex flex-col justify-between",
                        isSelected
                          ? item.color
                          : "border-[var(--wp-border)] bg-white hover:bg-[var(--wp-surface-subtle)]",
                      )}
                    >
                      <div>
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-xs font-semibold">{item.title}</span>
                          {isSelected && <Check className="h-3.5 w-3.5" />}
                        </div>
                        <p className="text-[11px] text-[var(--wp-text-secondary)] leading-relaxed">
                          {item.desc}
                        </p>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="grid sm:grid-cols-3 gap-4 pt-2 border-t border-[var(--wp-border)]">
              <div>
                <label className="text-xs font-semibold text-[var(--wp-text-primary)] block mb-1">
                  Concurrent Assignment Capacity
                </label>
                <div className="flex items-center gap-2">
                  <Input
                    type="number"
                    min={1}
                    max={10}
                    value={capacity}
                    onChange={(e) => {
                      setCapacity(Math.max(1, parseInt(e.target.value) || 1));
                      markDirty();
                    }}
                    className="h-9 text-xs bg-white"
                  />
                  <span className="text-xs text-[var(--wp-text-secondary)] shrink-0">
                    tasks ({activeAssignments} currently active)
                  </span>
                </div>
                <span className="text-[10px] text-[var(--wp-text-secondary)] mt-1 block">
                  Deterministic selection filters you out when active tasks reach this limit.
                </span>
              </div>

              <div>
                <label className="text-xs font-semibold text-[var(--wp-text-primary)] block mb-1">
                  Minimum Advance Notice
                </label>
                <div className="flex items-center gap-2">
                  <Input
                    type="number"
                    min={0}
                    max={72}
                    value={minNoticeHours}
                    onChange={(e) => {
                      setMinNoticeHours(parseInt(e.target.value) || 0);
                      markDirty();
                    }}
                    className="h-9 text-xs bg-white"
                  />
                  <span className="text-xs text-[var(--wp-text-secondary)] shrink-0">hours</span>
                </div>
              </div>

              <div>
                <label className="text-xs font-semibold text-[var(--wp-text-primary)] block mb-1">
                  Planned Unavailability Dates
                </label>
                <Input
                  value={plannedUnavailability}
                  onChange={(e) => {
                    setPlannedUnavailability(e.target.value);
                    markDirty();
                  }}
                  placeholder="e.g. Nov 15 - Nov 20"
                  className="h-9 text-xs bg-white"
                />
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label className="text-xs font-semibold text-[var(--wp-text-primary)] block mb-1">
                  Primary Time Zone
                </label>
                <select
                  value={timezone}
                  onChange={(event) => {
                    setTimezone(event.target.value);
                    markDirty();
                  }}
                  className="h-9 w-full rounded-lg border border-[var(--wp-border)] bg-white px-3 text-xs text-[var(--wp-text-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--wp-accent)]"
                >
                  {TIMEZONES.map((zone) => (
                    <option key={zone} value={zone}>
                      {zone}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-xs font-semibold text-[var(--wp-text-primary)] block mb-1">
                  Typical Working Schedule
                </label>
                <Input
                  value={availabilitySchedule}
                  onChange={(e) => {
                    setAvailabilitySchedule(e.target.value);
                    markDirty();
                  }}
                  placeholder="e.g. Monday to Friday, 9:00 AM - 5:00 PM"
                  className="h-9 text-xs bg-white"
                />
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* SECTION C: PRICING & COMMERCIAL PREFERENCES */}
      {activeSection === "pricing" && (
        <Card className="border-[var(--wp-border)] shadow-xs overflow-hidden">
          <CardHeader className="bg-[var(--wp-surface-subtle)]/50 border-b border-[var(--wp-border)] pb-4">
            <CardTitle className="text-base font-semibold flex items-center gap-2">
              <DollarSign className="h-4 w-4 text-[var(--wp-accent)]" />
              Pricing &amp; Commercial Terms
            </CardTitle>
            <CardDescription className="text-xs sm:text-sm text-[var(--wp-text-secondary)]">
              Express your pricing structure. Minimum compensation rules are enforced as hard
              constraints during automated matching.
            </CardDescription>
          </CardHeader>
          <CardContent className="p-5 sm:p-6 grid gap-5">
            <div>
              <label className="text-xs font-semibold text-[var(--wp-text-primary)] block mb-2">
                Supported Pricing Models
              </label>
              <div className="grid sm:grid-cols-3 gap-3">
                {[
                  {
                    key: "FIXED" as const,
                    title: "Fixed-Price Only",
                    desc: "Per-deliverable bounded contracts.",
                  },
                  {
                    key: "HOURLY" as const,
                    title: "Hourly Rate",
                    desc: "Estimated hour milestones.",
                  },
                  {
                    key: "BOTH" as const,
                    title: "Both Models",
                    desc: "Accept fixed-price deliverables or hourly execution.",
                  },
                ].map((m) => {
                  const isSelected = pricingModel === m.key;
                  return (
                    <div
                      key={m.key}
                      onClick={() => {
                        setPricingModel(m.key);
                        markDirty();
                      }}
                      className={cn(
                        "p-3 rounded-xl border-2 cursor-pointer transition-all active:scale-[0.99]",
                        isSelected
                          ? "border-[var(--wp-accent)] bg-[var(--wp-accent-subtle)]/30 font-semibold"
                          : "border-[var(--wp-border)] bg-white hover:bg-[var(--wp-surface-subtle)]",
                      )}
                    >
                      <div className="flex items-center justify-between text-xs">
                        <span>{m.title}</span>
                        {isSelected && <Check className="h-3.5 w-3.5 text-[var(--wp-accent)]" />}
                      </div>
                      <p className="text-[11px] text-[var(--wp-text-secondary)] mt-1 font-normal">
                        {m.desc}
                      </p>
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="grid sm:grid-cols-3 gap-4 pt-2 border-t border-[var(--wp-border)]">
              <div>
                <label className="text-xs font-semibold text-[var(--wp-text-primary)] block mb-1">
                  Target Compensation ($)
                </label>
                <div className="relative">
                  <span className="absolute left-3 top-2 text-xs text-[var(--wp-text-secondary)]">
                    $
                  </span>
                  <Input
                    type="number"
                    min={1}
                    value={targetRate}
                    onChange={(e) => {
                      setTargetRate(Math.max(1, parseInt(e.target.value) || 1));
                      markDirty();
                    }}
                    className="pl-6 h-9 text-xs bg-white"
                  />
                </div>
                <span className="text-[10px] text-[var(--wp-text-secondary)] mt-1 block">
                  Preferred rate used for score ranking.
                </span>
              </div>

              <div>
                <label className="text-xs font-semibold text-[var(--wp-text-primary)] block mb-1">
                  Minimum Acceptable Rate ($)
                </label>
                <div className="relative">
                  <span className="absolute left-3 top-2 text-xs text-[var(--wp-text-secondary)]">
                    $
                  </span>
                  <Input
                    type="number"
                    min={1}
                    value={minCompensation}
                    onChange={(e) => {
                      setMinCompensation(Math.max(1, parseInt(e.target.value) || 1));
                      markDirty();
                    }}
                    className="pl-6 h-9 text-xs bg-white"
                  />
                </div>
                <span className="text-[10px] text-[var(--wp-text-primary)] font-medium mt-1 block">
                  Hard Rule: Selection rejects tasks with budgets below this amount.
                </span>
              </div>

              <div>
                <label className="text-xs font-semibold text-[var(--wp-text-primary)] block mb-1">
                  Minimum Assignment Size ($)
                </label>
                <div className="relative">
                  <span className="absolute left-3 top-2 text-xs text-[var(--wp-text-secondary)]">
                    $
                  </span>
                  <Input
                    type="number"
                    min={5}
                    value={minAssignmentSize}
                    onChange={(e) => {
                      setMinAssignmentSize(Math.max(5, parseInt(e.target.value) || 5));
                      markDirty();
                    }}
                    className="pl-6 h-9 text-xs bg-white"
                  />
                </div>
              </div>
            </div>

            <div className="flex items-center gap-3 pt-2 border-t border-[var(--wp-border)]">
              <input
                type="checkbox"
                id="willingToNegotiate"
                checked={willingToNegotiate}
                onChange={(e) => {
                  setWillingToNegotiate(e.target.checked);
                  markDirty();
                }}
                className="h-4 w-4 rounded border-[var(--wp-border)] text-[var(--wp-accent)] focus:ring-[var(--wp-accent)] cursor-pointer"
              />
              <label
                htmlFor="willingToNegotiate"
                className="text-xs text-[var(--wp-text-primary)] cursor-pointer"
              >
                <strong>Willing to negotiate commercial terms:</strong> Permit task owners to
                propose counter-offers within 15% of target rate.
              </label>
            </div>
          </CardContent>
        </Card>
      )}

      {/* SECTION: PAID REVIEW SERVICE */}
      {activeSection === "reviews" && (
        <div className="space-y-5">
          <section className="overflow-hidden rounded-2xl border border-violet-200 bg-white shadow-[0_20px_60px_-50px_rgba(76,29,149,0.8)]">
            <div className="bg-[radial-gradient(circle_at_top_right,#7c3aed_0%,#312e81_42%,#111827_92%)] p-5 text-white sm:p-6">
              <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-violet-200">
                    Review service
                  </p>
                  <h2 className="mt-1 text-xl font-semibold tracking-tight">
                    Offer paid reviews from this Work Profile
                  </h2>
                  <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-200">
                    Review work in the domains you know, whether or not you also accept project
                    delivery assignments.
                  </p>
                </div>
                <label className="flex w-fit cursor-pointer items-center gap-2 rounded-full border border-white/20 bg-white/10 px-3 py-2 text-xs font-semibold backdrop-blur">
                  <input
                    type="checkbox"
                    checked={reviewEnabled}
                    onChange={(event) => {
                      setReviewEnabled(event.target.checked);
                      if (!event.target.checked) setReviewListed(false);
                      markDirty();
                    }}
                    className="h-4 w-4 accent-violet-400"
                  />
                  Offer paid reviews
                </label>
              </div>
            </div>

            <div className={cn("space-y-5 p-5 sm:p-6", !reviewEnabled && "opacity-60")}>
              {workAcceptanceStatus === "UNAVAILABLE" && reviewEnabled ? (
                <div className="rounded-xl border border-violet-200 bg-violet-50 p-3 text-xs leading-5 text-violet-950">
                  Your profile is set to review-only availability. You can receive review
                  engagements without appearing in project-work discovery.
                </div>
              ) : null}

              <div className="grid gap-3 sm:grid-cols-3">
                <label className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs">
                  <span className="block font-semibold text-slate-900">Marketplace listing</span>
                  <span className="mt-1 block leading-5 text-slate-500">
                    Let clients find this review service.
                  </span>
                  <input
                    type="checkbox"
                    checked={reviewListed}
                    disabled={!reviewEnabled}
                    onChange={(event) => {
                      setReviewListed(event.target.checked);
                      markDirty();
                    }}
                    className="mt-3 h-4 w-4 accent-violet-700"
                  />
                </label>
                <label className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs">
                  <span className="block font-semibold text-slate-900">Review availability</span>
                  <select
                    value={reviewAvailability}
                    disabled={!reviewEnabled}
                    onChange={(event) => {
                      setReviewAvailability(event.target.value as typeof reviewAvailability);
                      markDirty();
                    }}
                    className="mt-3 h-9 w-full rounded-lg border border-slate-300 bg-white px-2"
                  >
                    <option value="AVAILABLE">Available</option>
                    <option value="BUSY">Busy</option>
                    <option value="OFFLINE">Offline</option>
                  </select>
                </label>
                <label className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs">
                  <span className="block font-semibold text-slate-900">Typical turnaround</span>
                  <span className="mt-1 block leading-5 text-slate-500">
                    Expected calendar days.
                  </span>
                  <Input
                    type="number"
                    min={1}
                    max={365}
                    value={reviewTurnaroundDays}
                    disabled={!reviewEnabled}
                    onChange={(event) => {
                      setReviewTurnaroundDays(Math.max(1, Number(event.target.value) || 1));
                      markDirty();
                    }}
                    className="mt-3 h-9 bg-white text-xs"
                  />
                </label>
              </div>

              <div className="grid gap-4 lg:grid-cols-2">
                <label className="block text-xs font-semibold text-slate-700">
                  Review service summary
                  <textarea
                    value={reviewSummary}
                    disabled={!reviewEnabled}
                    onChange={(event) => {
                      setReviewSummary(event.target.value);
                      markDirty();
                    }}
                    rows={4}
                    maxLength={1_200}
                    placeholder="Describe the work you can assess, how you approach review, and the limits of your service."
                    className="mt-1.5 w-full resize-y rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm leading-6 outline-none focus:border-violet-500"
                  />
                </label>
                <div className="space-y-3">
                  <label className="block text-xs font-semibold text-slate-700">
                    Availability note
                    <textarea
                      value={reviewNotice}
                      disabled={!reviewEnabled}
                      onChange={(event) => {
                        setReviewNotice(event.target.value);
                        markDirty();
                      }}
                      rows={2}
                      maxLength={1_000}
                      placeholder="Current lead time, blackout dates, or review conditions."
                      className="mt-1.5 w-full resize-y rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs leading-5 outline-none focus:border-violet-500"
                    />
                  </label>
                  <label className="block text-xs font-semibold text-slate-700">
                    Public contact link (optional)
                    <Input
                      type="url"
                      value={reviewContactUrl}
                      disabled={!reviewEnabled}
                      onChange={(event) => {
                        setReviewContactUrl(event.target.value);
                        markDirty();
                      }}
                      placeholder="https://your-site.example/reviews"
                      className="mt-1.5 h-9 bg-white text-xs"
                    />
                  </label>
                </div>
              </div>
            </div>
          </section>

          {reviewEnabled ? (
            <>
              <section className="rounded-2xl border border-slate-300 bg-white p-5 sm:p-6">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
                  <div>
                    <p className="text-[10px] font-bold uppercase tracking-[0.15em] text-violet-700">
                      Review domains
                    </p>
                    <h3 className="mt-1 text-lg font-semibold text-slate-950">
                      Define where your review is useful
                    </h3>
                    <p className="mt-1 text-xs leading-5 text-slate-500">
                      Domain scope and methods are shown when a client compares reviewers.
                    </p>
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => {
                      setReviewDomains((current) => [
                        ...current,
                        {
                          domainTag: "",
                          scope: "",
                          selfAssessedLevel: 3,
                          yearsExperience: null,
                          methods: [],
                        },
                      ]);
                      markDirty();
                    }}
                  >
                    <Plus className="mr-2 h-4 w-4" /> Add domain
                  </Button>
                </div>
                <div className="mt-4 space-y-3">
                  {reviewDomains.length === 0 ? (
                    <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 p-6 text-center text-sm text-slate-500">
                      Add the first domain you are prepared to review.
                    </div>
                  ) : null}
                  {reviewDomains.map((domain, index) => (
                    <article
                      key={`${index}-${domain.domainTag}`}
                      className="rounded-2xl border border-slate-200 bg-slate-50 p-4"
                    >
                      <div className="grid gap-3 lg:grid-cols-[0.8fr_1.4fr_0.45fr_0.45fr_auto]">
                        <label className="text-xs font-semibold text-slate-700">
                          Domain
                          <Input
                            value={domain.domainTag}
                            onChange={(event) => {
                              setReviewDomains((items) =>
                                items.map((item, itemIndex) =>
                                  itemIndex === index
                                    ? { ...item, domainTag: event.target.value }
                                    : item,
                                ),
                              );
                              markDirty();
                            }}
                            placeholder="accessibility"
                            className="mt-1.5 h-9 bg-white text-xs"
                          />
                        </label>
                        <label className="text-xs font-semibold text-slate-700">
                          Review scope
                          <Input
                            value={domain.scope}
                            onChange={(event) => {
                              setReviewDomains((items) =>
                                items.map((item, itemIndex) =>
                                  itemIndex === index
                                    ? { ...item, scope: event.target.value }
                                    : item,
                                ),
                              );
                              markDirty();
                            }}
                            placeholder="WCAG review of live web interfaces and design systems"
                            className="mt-1.5 h-9 bg-white text-xs"
                          />
                        </label>
                        <label className="text-xs font-semibold text-slate-700">
                          Level
                          <select
                            value={domain.selfAssessedLevel}
                            onChange={(event) => {
                              setReviewDomains((items) =>
                                items.map((item, itemIndex) =>
                                  itemIndex === index
                                    ? { ...item, selfAssessedLevel: Number(event.target.value) }
                                    : item,
                                ),
                              );
                              markDirty();
                            }}
                            className="mt-1.5 h-9 w-full rounded-lg border border-slate-300 bg-white px-2 text-xs"
                          >
                            {[1, 2, 3, 4, 5].map((level) => (
                              <option key={level} value={level}>
                                {level}/5
                              </option>
                            ))}
                          </select>
                        </label>
                        <label className="text-xs font-semibold text-slate-700">
                          Years
                          <Input
                            type="number"
                            min={0}
                            max={80}
                            value={domain.yearsExperience ?? ""}
                            onChange={(event) => {
                              setReviewDomains((items) =>
                                items.map((item, itemIndex) =>
                                  itemIndex === index
                                    ? {
                                        ...item,
                                        yearsExperience: event.target.value
                                          ? Number(event.target.value)
                                          : null,
                                      }
                                    : item,
                                ),
                              );
                              markDirty();
                            }}
                            className="mt-1.5 h-9 bg-white text-xs"
                          />
                        </label>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() => {
                            setReviewDomains((items) =>
                              items.filter((_, itemIndex) => itemIndex !== index),
                            );
                            markDirty();
                          }}
                          className="self-end text-rose-700"
                          aria-label={`Remove review domain ${domain.domainTag || index + 1}`}
                        >
                          <X className="h-4 w-4" />
                        </Button>
                      </div>
                      <label className="mt-3 block text-xs font-semibold text-slate-700">
                        Methods (comma separated)
                        <Input
                          value={domain.methods.join(", ")}
                          onChange={(event) => {
                            setReviewDomains((items) =>
                              items.map((item, itemIndex) =>
                                itemIndex === index
                                  ? {
                                      ...item,
                                      methods: event.target.value
                                        .split(",")
                                        .map((method) => method.trim())
                                        .filter(Boolean),
                                    }
                                  : item,
                              ),
                            );
                            markDirty();
                          }}
                          placeholder="manual audit, screen-reader testing, standards review"
                          className="mt-1.5 h-9 bg-white text-xs"
                        />
                      </label>
                    </article>
                  ))}
                </div>
              </section>

              <section className="grid gap-5 lg:grid-cols-2">
                <div className="rounded-2xl border border-slate-300 bg-white p-5">
                  <p className="text-[10px] font-bold uppercase tracking-[0.15em] text-violet-700">
                    Fee and turnaround
                  </p>
                  <div className="mt-4 grid gap-3 sm:grid-cols-2">
                    <label className="text-xs font-semibold text-slate-700">
                      Standard review fee (USD)
                      <Input
                        type="number"
                        min={0}
                        step="0.01"
                        value={reviewFee}
                        onChange={(event) => {
                          setReviewFee(Math.max(0, Number(event.target.value) || 0));
                          markDirty();
                        }}
                        className="mt-1.5 h-10 bg-white text-sm"
                      />
                    </label>
                    <label className="text-xs font-semibold text-slate-700">
                      Fee handling
                      <select
                        value={reviewFeeMode}
                        onChange={(event) => {
                          setReviewFeeMode(event.target.value as typeof reviewFeeMode);
                          markDirty();
                        }}
                        className="mt-1.5 h-10 w-full rounded-lg border border-slate-300 bg-white px-3 text-xs"
                      >
                        <option value="PAYPAL">PayPal through Tenfo</option>
                        <option value="DIRECT">Arranged directly</option>
                      </select>
                    </label>
                  </div>
                  {reviewFeeMode === "PAYPAL" ? (
                    <Link
                      href="/settings?tab=paypal"
                      className="mt-4 inline-flex items-center gap-1.5 text-xs font-semibold text-violet-700 hover:underline"
                    >
                      Check PayPal seller onboarding <ArrowRight className="h-3.5 w-3.5" />
                    </Link>
                  ) : null}
                </div>

                <div className="rounded-2xl border border-slate-300 bg-white p-5">
                  <p className="text-[10px] font-bold uppercase tracking-[0.15em] text-violet-700">
                    Conflicts and independence
                  </p>
                  <label className="mt-4 block text-xs font-semibold text-slate-700">
                    Known conflicts by username
                    <Input
                      value={reviewConflictUsernames}
                      onChange={(event) => {
                        setReviewConflictUsernames(event.target.value);
                        markDirty();
                      }}
                      placeholder="alex, @client-team"
                      className="mt-1.5 h-10 bg-white text-xs"
                    />
                  </label>
                  <label className="mt-3 block text-xs font-semibold text-slate-700">
                    Other conflict notes (optional)
                    <textarea
                      value={reviewConflictNotes}
                      onChange={(event) => {
                        setReviewConflictNotes(event.target.value);
                        markDirty();
                      }}
                      rows={2}
                      maxLength={4_000}
                      placeholder="Organizations, clients, financial interests, or relationships to disclose before matching."
                      className="mt-1.5 w-full resize-y rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs leading-5"
                    />
                  </label>
                  <label className="mt-4 flex cursor-pointer items-start gap-2.5 rounded-xl border border-violet-200 bg-violet-50 p-3 text-xs leading-5 text-violet-950">
                    <input
                      type="checkbox"
                      checked={reviewDisclosureConfirmed}
                      onChange={(event) => {
                        setReviewDisclosureConfirmed(event.target.checked);
                        markDirty();
                      }}
                      className="mt-1 h-4 w-4 accent-violet-700"
                    />
                    I will disclose task-specific conflicts before accepting each review engagement.
                  </label>
                </div>
              </section>

              <section className="rounded-2xl border border-slate-300 bg-white p-5 sm:p-6">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
                  <div>
                    <p className="text-[10px] font-bold uppercase tracking-[0.15em] text-violet-700">
                      Supporting profile evidence
                    </p>
                    <h3 className="mt-1 text-lg font-semibold text-slate-950">
                      Help clients evaluate fit
                    </h3>
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => {
                      setReviewEvidence((current) => [
                        ...current,
                        {
                          kind: "PORTFOLIO",
                          title: "",
                          description: "",
                          url: null,
                          issuer: null,
                        },
                      ]);
                      markDirty();
                    }}
                  >
                    <Plus className="mr-2 h-4 w-4" /> Add evidence
                  </Button>
                </div>
                <div className="mt-4 space-y-3">
                  {reviewEvidence.map((item, index) => (
                    <div
                      key={`${index}-${item.title}`}
                      className="grid gap-3 rounded-xl border border-slate-200 bg-slate-50 p-4 lg:grid-cols-[0.45fr_0.8fr_1.2fr_1fr_auto]"
                    >
                      <select
                        value={item.kind}
                        onChange={(event) => {
                          setReviewEvidence((items) =>
                            items.map((evidence, itemIndex) =>
                              itemIndex === index
                                ? {
                                    ...evidence,
                                    kind: event.target.value as typeof evidence.kind,
                                  }
                                : evidence,
                            ),
                          );
                          markDirty();
                        }}
                        className="h-9 rounded-lg border border-slate-300 bg-white px-2 text-xs"
                      >
                        <option value="PORTFOLIO">Portfolio</option>
                        <option value="CREDENTIAL">Credential</option>
                        <option value="EXPERIENCE">Experience</option>
                        <option value="REFERENCE">Reference</option>
                      </select>
                      <Input
                        value={item.title}
                        onChange={(event) => {
                          setReviewEvidence((items) =>
                            items.map((evidence, itemIndex) =>
                              itemIndex === index
                                ? { ...evidence, title: event.target.value }
                                : evidence,
                            ),
                          );
                          markDirty();
                        }}
                        placeholder="Title"
                        className="h-9 bg-white text-xs"
                      />
                      <Input
                        value={item.description}
                        onChange={(event) => {
                          setReviewEvidence((items) =>
                            items.map((evidence, itemIndex) =>
                              itemIndex === index
                                ? { ...evidence, description: event.target.value }
                                : evidence,
                            ),
                          );
                          markDirty();
                        }}
                        placeholder="Why this supports your review experience"
                        className="h-9 bg-white text-xs"
                      />
                      <Input
                        value={item.url ?? ""}
                        onChange={(event) => {
                          setReviewEvidence((items) =>
                            items.map((evidence, itemIndex) =>
                              itemIndex === index
                                ? { ...evidence, url: event.target.value || null }
                                : evidence,
                            ),
                          );
                          markDirty();
                        }}
                        placeholder="HTTPS link (optional)"
                        className="h-9 bg-white text-xs"
                      />
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                          setReviewEvidence((items) =>
                            items.filter((_, itemIndex) => itemIndex !== index),
                          );
                          markDirty();
                        }}
                        className="text-rose-700"
                      >
                        <X className="h-4 w-4" />
                      </Button>
                    </div>
                  ))}
                  {reviewEvidence.length === 0 ? (
                    <p className="rounded-xl border border-dashed border-slate-300 bg-slate-50 p-5 text-center text-xs text-slate-500">
                      Evidence is optional. Add portfolio work, credentials, experience, or
                      references when useful.
                    </p>
                  ) : null}
                </div>
              </section>
            </>
          ) : null}
        </div>
      )}

      {/* SECTION D: COMMITMENT & ACCEPTANCE RULES */}
      {activeSection === "commitments" && (
        <Card className="border-[var(--wp-border)] shadow-xs overflow-hidden">
          <CardHeader className="bg-[var(--wp-surface-subtle)]/50 border-b border-[var(--wp-border)] pb-4">
            <CardTitle className="text-base font-semibold flex items-center gap-2">
              <ShieldCheck className="h-4 w-4 text-[var(--wp-accent)]" />
              Assignment Acceptance Rules
            </CardTitle>
            <CardDescription className="text-xs sm:text-sm text-[var(--wp-text-secondary)]">
              Rules determining how assignments are offered and confirmed. Finding work is distinct
              from binding contract acceptance.
            </CardDescription>
          </CardHeader>
          <CardContent className="p-5 sm:p-6 grid gap-5">
            {/* Human Approval Invariant */}
            <div className="p-4 rounded-xl border border-[var(--wp-border)] bg-[var(--wp-surface-subtle)]/40 flex items-start gap-3.5">
              <input
                type="checkbox"
                id="requireExplicitApproval"
                checked={requireExplicitApproval}
                onChange={(e) => {
                  setRequireExplicitApproval(e.target.checked);
                  markDirty();
                }}
                className="h-4 w-4 mt-0.5 rounded border-[var(--wp-border)] text-[var(--wp-accent)] focus:ring-[var(--wp-accent)] cursor-pointer"
              />
              <div>
                <label
                  htmlFor="requireExplicitApproval"
                  className="text-xs font-semibold text-[var(--wp-text-primary)] cursor-pointer"
                >
                  Require explicit confirmation before accepting work
                </label>
                <p className="text-[11px] text-[var(--wp-text-secondary)] mt-0.5 leading-relaxed">
                  Finding or recommending an opportunity will never automatically bind you to a
                  contract. You retain final sign-off on scope, delivery dates, and commercial terms
                  before work begins.
                </p>
              </div>
            </div>

            {/* Declined Categories */}
            <div>
              <span className="text-xs font-semibold text-[var(--wp-text-primary)] block mb-1">
                Declined Work Categories (Excluded from Matching)
              </span>
              <div className="flex flex-wrap gap-2 mb-2">
                {declinedCategories.length === 0 ? (
                  <span className="text-xs text-[var(--wp-text-secondary)] italic">
                    No excluded categories
                  </span>
                ) : (
                  declinedCategories.map((cat) => (
                    <span
                      key={cat}
                      className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs bg-[var(--wp-surface-subtle)] text-[var(--wp-text-primary)] border border-[var(--wp-border)]"
                    >
                      <span>{cat}</span>
                      <button
                        type="button"
                        onClick={() => {
                          setDeclinedCategories(declinedCategories.filter((c) => c !== cat));
                          markDirty();
                        }}
                        className="hover:text-[var(--wp-danger)]"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </span>
                  ))
                )}
              </div>
              <div className="flex items-center gap-2 max-w-sm">
                <Input
                  value={customDeclined}
                  onChange={(e) => setCustomDeclined(e.target.value)}
                  placeholder="e.g. crypto, scraping..."
                  className="h-8 text-xs bg-white"
                />
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={handleAddDeclinedCategory}
                  className="h-8 text-xs"
                >
                  Exclude
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* SECTION E: EXECUTION & QUALITY PREFERENCES */}
      {activeSection === "execution" && (
        <Card className="border-[var(--wp-border)] shadow-xs overflow-hidden">
          <CardHeader className="bg-[var(--wp-surface-subtle)]/50 border-b border-[var(--wp-border)] pb-4">
            <CardTitle className="text-base font-semibold flex items-center gap-2">
              <FileCheck className="h-4 w-4 text-[var(--wp-accent)]" />
              Work progress &amp; revision preferences
            </CardTitle>
            <CardDescription className="text-xs sm:text-sm text-[var(--wp-text-secondary)]">
              Choose how you share progress, review context, and revision updates.
            </CardDescription>
          </CardHeader>
          <CardContent className="p-5 sm:p-6 grid gap-5">
            <div className="grid sm:grid-cols-2 gap-4">
              <div>
                <label className="text-xs font-semibold text-[var(--wp-text-primary)] block mb-1">
                  Communication &amp; Progress Preference
                </label>
                <select
                  value={communicationPreference}
                  onChange={(e) => {
                    setCommunicationPreference(e.target.value as typeof communicationPreference);
                    markDirty();
                  }}
                  className="w-full h-9 rounded-lg border border-[var(--wp-border)] bg-white px-3 text-xs text-[var(--wp-text-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--wp-accent)]"
                >
                  <option value="ASYNC">Asynchronous (Task notes and deliverable comments)</option>
                  <option value="REALTIME">
                    Milestone Checkpoints (Notification on stage transitions)
                  </option>
                  <option value="DIRECT">Direct Notes Only (Deliverable submission only)</option>
                </select>
              </div>

              <div>
                <label className="text-xs font-semibold text-[var(--wp-text-primary)] block mb-1">
                  Progress Update Cadence
                </label>
                <select
                  value={updateFrequency}
                  onChange={(e) => {
                    setUpdateFrequency(e.target.value as typeof updateFrequency);
                    markDirty();
                  }}
                  className="w-full h-9 rounded-lg border border-[var(--wp-border)] bg-white px-3 text-xs text-[var(--wp-text-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--wp-accent)]"
                >
                  <option value="CHECKPOINTS_ONLY">On major contract checkpoints</option>
                  <option value="DAILY">Daily status log</option>
                  <option value="ON_MILESTONES">Upon deliverable draft submission</option>
                </select>
              </div>
            </div>

            <div>
              <label className="text-xs font-semibold text-[var(--wp-text-primary)] block mb-1">
                Preferred review-package context
              </label>
              <Input
                value={deliveryFormat}
                onChange={(e) => {
                  setDeliveryFormat(e.target.value);
                  markDirty();
                }}
                placeholder="e.g. Clean CSV with header row and summary diff"
                className="h-9 text-xs bg-white"
              />
            </div>

            {/* Quality Invariant Toggles */}
            <div className="pt-3 border-t border-[var(--wp-border)] space-y-3">
              <span className="text-xs font-semibold text-[var(--wp-text-primary)] block">
                Review &amp; revision notifications
              </span>

              <div className="flex items-center gap-3">
                <input
                  type="checkbox"
                  id="notifyOnVerificationFail"
                  checked={notifyOnVerificationFail}
                  onChange={(e) => {
                    setNotifyOnVerificationFail(e.target.checked);
                    markDirty();
                  }}
                  className="h-4 w-4 rounded border-[var(--wp-border)] text-[var(--wp-accent)] focus:ring-[var(--wp-accent)] cursor-pointer"
                />
                <label
                  htmlFor="notifyOnVerificationFail"
                  className="text-xs text-[var(--wp-text-primary)] cursor-pointer"
                >
                  Notify when a client records a constraint as not met or unclear.
                </label>
              </div>

              <div className="flex items-center gap-3">
                <input
                  type="checkbox"
                  id="notifyOnRevisionRequest"
                  checked={notifyOnRevisionRequest}
                  onChange={(e) => {
                    setNotifyOnRevisionRequest(e.target.checked);
                    markDirty();
                  }}
                  className="h-4 w-4 rounded border-[var(--wp-border)] text-[var(--wp-accent)] focus:ring-[var(--wp-accent)] cursor-pointer"
                />
                <label
                  htmlFor="notifyOnRevisionRequest"
                  className="text-xs text-[var(--wp-text-primary)] cursor-pointer"
                >
                  Notify when a revision is requested, displaying the specific requirements that
                  were not satisfied.
                </label>
              </div>

              <div className="p-3.5 rounded-xl border border-[var(--wp-border)] bg-[var(--wp-surface-subtle)]/50 text-xs text-[var(--wp-text-secondary)] leading-relaxed">
                Review preferences organize communication only; the agreed scope and recorded review
                decisions remain attached to the task.
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* SECTION G: PAYMENT VALIDATION */}
      {activeSection === "payout" && (
        <Card className="border-[var(--wp-border)] shadow-xs overflow-hidden">
          <CardHeader className="bg-[var(--wp-surface-subtle)]/50 border-b border-[var(--wp-border)] pb-4">
            <CardTitle className="text-base font-semibold flex items-center gap-2">
              <Wallet className="h-4 w-4 text-[var(--wp-accent)]" />
              PayPal service payments
            </CardTitle>
            <CardDescription className="text-xs sm:text-sm text-[var(--wp-text-secondary)]">
              Use PayPal seller onboarding for project payments and paid review fees.
            </CardDescription>
          </CardHeader>
          <CardContent className="p-5 sm:p-6 space-y-4 text-sm text-[var(--wp-text-secondary)]">
            <p>
              Review your PayPal connection, seller readiness, and payment records from the payment
              settings.
            </p>
            <Button asChild variant="outline" size="sm" className="text-xs font-medium gap-1.5">
              <Link href="/settings?tab=paypal">
                <span>Open PayPal settings</span>
                <ArrowRight className="h-3.5 w-3.5" />
              </Link>
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Floating Save Actions Bar when Dirty */}
      {isDirty && (
        <div className="sticky bottom-4 z-20 flex min-w-0 flex-col gap-3 rounded-xl border border-[var(--wp-border-strong)] bg-white/95 p-3 shadow-xl backdrop-blur-md animate-in slide-in-from-bottom-2 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
          <div className="flex min-w-0 items-center gap-2 text-xs">
            <span className="h-2 w-2 rounded-full bg-[var(--wp-accent)] animate-pulse" />
            <span className="break-words font-semibold text-[var(--wp-text-primary)]">
              You have unsaved preference changes
            </span>
          </div>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => loadProfile()}
              className="w-full text-xs sm:w-auto"
            >
              Discard Changes
            </Button>
            <Button
              type="submit"
              size="sm"
              disabled={saving}
              className="w-full gap-1.5 text-xs font-semibold sm:w-auto"
            >
              {saving ? (
                <RefreshCw className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Check className="h-3.5 w-3.5" />
              )}
              <span>{saving ? "Saving Changes..." : "Save Preferences"}</span>
            </Button>
          </div>
        </div>
      )}
    </form>
  );
}
