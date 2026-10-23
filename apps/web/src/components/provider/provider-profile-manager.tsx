"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  AlertCircle,
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
  Mail,
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
import { StatusBadge } from "@/components/ui/status-badge";
import { toast } from "sonner";
import {
  getProviderProfile,
  updateProviderProfile,
  type ProviderProfileDto,
  type WorkPreferencesDto,
} from "@/lib/api/endpoints";
import { cn } from "@/lib/utils";

const POPULAR_SKILLS = [
  "data-cleaning",
  "data-enrichment",
  "typescript",
  "python",
  "sql-audit",
  "document-processing",
  "translation",
  "ast-verification",
  "dataset-normalization",
  "financial-audit",
];

const POPULAR_TOOLS = [
  "Python",
  "TypeScript",
  "PostgreSQL",
  "Docker",
  "Pandas",
  "Excel",
  "Git",
  "Ast-grep",
];

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
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [isDirty, setIsDirty] = useState(false);
  const [activeSection, setActiveSection] = useState<
    "capabilities" | "availability" | "pricing" | "commitments" | "execution" | "payout"
  >("capabilities");

  // Core profile fields
  const [displayName, setDisplayName] = useState("");
  const [bio, setBio] = useState("");
  const [status, setStatus] = useState<"ACTIVE" | "INACTIVE">("ACTIVE");
  const [payoutEmail, setPayoutEmail] = useState("");
  const [capabilities, setCapabilities] = useState<Array<{ tag: string; proficiency: number }>>([
    { tag: "data-cleaning", proficiency: 5 },
    { tag: "data-enrichment", proficiency: 4 },
  ]);
  const [customSkill, setCustomSkill] = useState("");

  // Availability fields
  const [workAcceptanceStatus, setWorkAcceptanceStatus] = useState<"ACCEPTING" | "LIMITED" | "UNAVAILABLE">("ACCEPTING");
  const [capacity, setCapacity] = useState<number>(2);
  const [activeAssignments, setActiveAssignments] = useState<number>(0);
  const [timezone, setTimezone] = useState("UTC");
  const [availabilitySchedule, setAvailabilitySchedule] = useState("Monday to Friday, 9:00 AM - 5:00 PM UTC");
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
  const [acceptedCategories, setAcceptedCategories] = useState<string[]>(["data-cleaning", "data-enrichment"]);
  const [declinedCategories, setDeclinedCategories] = useState<string[]>([]);
  const [customDeclined, setCustomDeclined] = useState("");

  // Execution & quality preferences
  const [communicationPreference, setCommunicationPreference] = useState<"ASYNC" | "REALTIME" | "DIRECT">("ASYNC");
  const [deliveryFormat, setDeliveryFormat] = useState("Clean CSV with header row and summary diff");
  const [updateFrequency, setUpdateFrequency] = useState<"CHECKPOINTS_ONLY" | "DAILY" | "ON_MILESTONES">("CHECKPOINTS_ONLY");
  const [reviewSpecBeforeAccept, setReviewSpecBeforeAccept] = useState(true);
  const [notifyOnVerificationFail, setNotifyOnVerificationFail] = useState(true);
  const [notifyOnRevisionRequest, setNotifyOnRevisionRequest] = useState(true);
  const [toolsAndTechnologies, setToolsAndTechnologies] = useState<string[]>(["Python", "TypeScript", "PostgreSQL"]);
  const [customTool, setCustomTool] = useState("");
  const [languages, setLanguages] = useState<string[]>(["English"]);

  const loadProfile = async () => {
    setLoading(true);
    try {
      const res = await getProviderProfile();
      if (!res.error && res.data?.provider) {
        const p = res.data.provider;
        setDisplayName(p.displayName || "Freelance Specialist");
        setBio(p.bio ?? "");
        setStatus(p.status);
        setPayoutEmail(p.payoutEmail ?? "");
        if (p.capabilities && p.capabilities.length > 0) {
          setCapabilities(p.capabilities);
        }
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
          setAvailabilitySchedule(wp.availabilitySchedule || "Monday to Friday, 9:00 AM - 5:00 PM UTC");
          setMinNoticeHours(wp.minNoticeHours ?? 4);
          setPlannedUnavailability(wp.plannedUnavailability ?? "");
          setPricingModel(wp.pricingModel || "FIXED");
          setTargetRate(wp.targetRateMinor ? Math.round(wp.targetRateMinor / 100) : 45);
          setMinCompensation(wp.minCompensationMinor ? Math.round(wp.minCompensationMinor / 100) : 25);
          setMinAssignmentSize(wp.minAssignmentSizeMinor ? Math.round(wp.minAssignmentSizeMinor / 100) : 20);
          setWillingToNegotiate(wp.willingToNegotiate ?? true);
          setRequireExplicitApproval(wp.requireExplicitApproval ?? true);
          setAiRecommendationAllowed(wp.aiRecommendationAllowed ?? true);
          if (wp.acceptedCategories) setAcceptedCategories(wp.acceptedCategories);
          if (wp.declinedCategories) setDeclinedCategories(wp.declinedCategories);
          setCommunicationPreference(wp.communicationPreference || "ASYNC");
          setDeliveryFormat(wp.deliveryFormat || "Clean CSV with header row and summary diff");
          setUpdateFrequency(wp.updateFrequency || "CHECKPOINTS_ONLY");
          setReviewSpecBeforeAccept(wp.reviewSpecBeforeAccept ?? true);
          setNotifyOnVerificationFail(wp.notifyOnVerificationFail ?? true);
          setNotifyOnRevisionRequest(wp.notifyOnRevisionRequest ?? true);
          if (wp.toolsAndTechnologies && wp.toolsAndTechnologies.length > 0) {
            setToolsAndTechnologies(wp.toolsAndTechnologies);
          }
          if (wp.languages && wp.languages.length > 0) {
            setLanguages(wp.languages);
          }
        }
      } else {
        setDisplayName("Alice Smith");
        setPayoutEmail("alice.payout@example.com");
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

  const handleToggleSkill = (tag: string) => {
    markDirty();
    const existing = capabilities.find((c) => c.tag === tag);
    if (existing) {
      setCapabilities(capabilities.filter((c) => c.tag !== tag));
    } else {
      setCapabilities([...capabilities, { tag, proficiency: 4 }]);
    }
  };

  const handleAddCustomSkill = () => {
    const trimmed = customSkill.trim().toLowerCase();
    if (!trimmed) return;
    markDirty();
    if (!capabilities.some((c) => c.tag === trimmed)) {
      setCapabilities([...capabilities, { tag: trimmed, proficiency: 4 }]);
    }
    setCustomSkill("");
  };

  const handleToggleTool = (tool: string) => {
    markDirty();
    if (toolsAndTechnologies.includes(tool)) {
      setToolsAndTechnologies(toolsAndTechnologies.filter((t) => t !== tool));
    } else {
      setToolsAndTechnologies([...toolsAndTechnologies, tool]);
    }
  };

  const handleAddCustomTool = () => {
    const trimmed = customTool.trim();
    if (!trimmed) return;
    markDirty();
    if (!toolsAndTechnologies.includes(trimmed)) {
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

    if (!payoutEmail.trim() || !payoutEmail.includes("@")) {
      toast.error("A valid PayPal payout email is required for settlement readiness");
      return;
    }

    setSaving(true);
    try {
      const payload = {
        displayName: displayName.trim(),
        bio: bio.trim() || null,
        hourlyRateMinor: Math.round(targetRate * 100),
        currency: "USD",
        payoutEmail: payoutEmail.trim(),
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

  const isPayoutConfigured = Boolean(payoutEmail && payoutEmail.includes("@"));

  return (
    <form onSubmit={handleSave} className="flex flex-col gap-6">
      {/* Overview Banner: Dual-Role Model */}
      <div className="p-4 sm:p-5 rounded-xl border border-[var(--wp-border)] bg-white shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-start gap-3.5">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[var(--wp-surface-subtle)] text-[var(--wp-text-primary)] border border-[var(--wp-border)]">
            <Briefcase className="h-5 w-5 text-[var(--wp-accent)]" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="font-semibold text-sm text-[var(--wp-text-primary)]">
                Dual-Role Work Preferences
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
            <p className="text-xs text-[var(--wp-text-secondary)] mt-0.5 max-w-2xl leading-relaxed">
              In WorkPay, any user can commission work as a task owner and perform work as a verified worker. Configure what work you can perform, when you are available, and the binding commercial rules under which you will accept assignments.
            </p>
          </div>
        </div>

        {/* Global Save Button */}
        <div className="flex items-center gap-2 shrink-0 self-end sm:self-auto">
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

      {/* Sub-Section Navigation Pills */}
      <div className="flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-none border-b border-[var(--wp-border)]">
        {[
          { key: "capabilities", label: "Capabilities & Skills" },
          { key: "availability", label: "Availability & Capacity" },
          { key: "pricing", label: "Pricing & Commercials" },
          { key: "commitments", label: "Acceptance Rules" },
          { key: "execution", label: "Execution & Quality" },
          { key: "payout", label: "Payout Readiness" },
        ].map((sec) => (
          <button
            key={sec.key}
            type="button"
            onClick={() => setActiveSection(sec.key as typeof activeSection)}
            className={cn(
              "px-3 py-1.5 rounded-lg text-xs font-medium transition-all duration-150 shrink-0 select-none cursor-pointer active:scale-[0.98]",
              activeSection === sec.key
                ? "bg-[var(--wp-text-primary)] text-white font-semibold shadow-xs"
                : "text-[var(--wp-text-secondary)] hover:text-[var(--wp-text-primary)] hover:bg-[var(--wp-surface-subtle)]",
            )}
          >
            {sec.label}
          </button>
        ))}
      </div>

      {/* SECTION A: CAPABILITIES & SKILLS */}
      {activeSection === "capabilities" && (
        <Card className="border-[var(--wp-border)] shadow-xs overflow-hidden">
          <CardHeader className="bg-[var(--wp-surface-subtle)]/50 border-b border-[var(--wp-border)] pb-4">
            <CardTitle className="text-base font-semibold flex items-center gap-2">
              <Tag className="h-4 w-4 text-[var(--wp-accent)]" />
              A. Work Profile &amp; Demonstrated Capabilities
            </CardTitle>
            <CardDescription className="text-xs sm:text-sm text-[var(--wp-text-secondary)]">
              Declare what tasks you can execute. Self-declared tags are matched against contract requirements, while demonstrated skills reflect passing verification history.
            </CardDescription>
          </CardHeader>
          <CardContent className="p-5 sm:p-6 grid gap-5">
            <div className="grid sm:grid-cols-2 gap-4">
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
                  placeholder="e.g. Alice Smith, Data Specialist"
                  className="text-xs bg-white"
                />
              </div>

              <div>
                <label className="text-xs font-semibold text-[var(--wp-text-primary)] block mb-1">
                  Primary Time Zone
                </label>
                <select
                  value={timezone}
                  onChange={(e) => {
                    setTimezone(e.target.value);
                    markDirty();
                  }}
                  className="w-full h-9 rounded-lg border border-[var(--wp-border)] bg-white px-3 text-xs text-[var(--wp-text-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--wp-accent)]"
                >
                  {TIMEZONES.map((tz) => (
                    <option key={tz} value={tz}>
                      {tz}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div>
              <label className="text-xs font-semibold text-[var(--wp-text-primary)] block mb-1">
                Professional Summary &amp; Domain Expertise
              </label>
              <textarea
                value={bio}
                onChange={(e) => {
                  setBio(e.target.value);
                  markDirty();
                }}
                rows={3}
                placeholder="Describe your technical background, verified experience, and specific deliverables you specialize in producing..."
                className="w-full rounded-lg border border-[var(--wp-border)] bg-white p-3 text-xs text-[var(--wp-text-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--wp-accent)]"
              />
            </div>

            {/* Capability Tags */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <div>
                  <span className="text-xs font-semibold text-[var(--wp-text-primary)] block">
                    Execution Capability Tags (Required for Deterministic Matching)
                  </span>
                  <span className="text-[11px] text-[var(--wp-text-secondary)] block">
                    Active contract requirements match against these tags. Higher proficiency gives higher ranking.
                  </span>
                </div>
              </div>

              <div className="flex flex-wrap gap-2 mb-3">
                {POPULAR_SKILLS.map((tag) => {
                  const cap = capabilities.find((c) => c.tag === tag);
                  const isSelected = Boolean(cap);

                  return (
                    <button
                      key={tag}
                      type="button"
                      onClick={() => handleToggleSkill(tag)}
                      className={cn(
                        "flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium border transition-all cursor-pointer active:scale-[0.98]",
                        isSelected
                          ? "bg-[var(--wp-accent-subtle)] text-[var(--wp-accent)] border-[var(--wp-accent)]/40 font-semibold"
                          : "bg-white text-[var(--wp-text-secondary)] border-[var(--wp-border)] hover:border-[var(--wp-border-strong)]",
                      )}
                    >
                      <span>{tag}</span>
                      {isSelected ? (
                        <Check className="h-3 w-3" />
                      ) : (
                        <Plus className="h-3 w-3 opacity-50" />
                      )}
                    </button>
                  );
                })}
              </div>

              {/* Add Custom Tag */}
              <div className="flex items-center gap-2 max-w-sm">
                <Input
                  value={customSkill}
                  onChange={(e) => setCustomSkill(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      handleAddCustomSkill();
                    }
                  }}
                  placeholder="Add custom skill tag..."
                  className="h-8 text-xs bg-white"
                />
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={handleAddCustomSkill}
                  className="h-8 text-xs"
                >
                  Add Tag
                </Button>
              </div>
            </div>

            {/* Tools & Technologies */}
            <div className="pt-3 border-t border-[var(--wp-border)]">
              <span className="text-xs font-semibold text-[var(--wp-text-primary)] block mb-1">
                Tools, Software &amp; Verified Systems
              </span>
              <div className="flex flex-wrap gap-2 mb-3">
                {POPULAR_TOOLS.map((tool) => {
                  const isSelected = toolsAndTechnologies.includes(tool);
                  return (
                    <button
                      key={tool}
                      type="button"
                      onClick={() => handleToggleTool(tool)}
                      className={cn(
                        "px-2.5 py-1 rounded-lg text-xs font-medium border transition-all cursor-pointer active:scale-[0.98]",
                        isSelected
                          ? "bg-[var(--wp-surface-subtle)] text-[var(--wp-text-primary)] border-[var(--wp-border-strong)] font-semibold"
                          : "bg-white text-[var(--wp-text-secondary)] border-[var(--wp-border)] hover:border-[var(--wp-border-strong)]",
                      )}
                    >
                      {tool}
                    </button>
                  );
                })}
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
              B. Work Availability &amp; Workload Capacity
            </CardTitle>
            <CardDescription className="text-xs sm:text-sm text-[var(--wp-text-secondary)]">
              Control your capacity to accept new commitments. Marking yourself unavailable prevents new proposals without affecting work currently in progress.
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
                    color: "text-[var(--wp-success)] border-[var(--wp-success)]/40 bg-[var(--wp-success-subtle)]/30",
                  },
                  {
                    key: "LIMITED" as const,
                    title: "Limited Availability",
                    desc: "Accepting select urgent tasks only with longer turnaround.",
                    color: "text-[var(--wp-accent)] border-[var(--wp-accent)]/40 bg-[var(--wp-accent-subtle)]/30",
                  },
                  {
                    key: "UNAVAILABLE" as const,
                    title: "Not Accepting Work",
                    desc: "Excluded from provider matching. Existing commitments continue safely.",
                    color: "text-[var(--wp-text-secondary)] border-[var(--wp-border-strong)] bg-[var(--wp-surface-subtle)]",
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
                        isSelected ? item.color : "border-[var(--wp-border)] bg-white hover:bg-[var(--wp-surface-subtle)]",
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
                placeholder="e.g. Monday to Friday, 9:00 AM - 5:00 PM UTC"
                className="h-9 text-xs bg-white"
              />
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
              C. Work Pricing &amp; Commercial Terms
            </CardTitle>
            <CardDescription className="text-xs sm:text-sm text-[var(--wp-text-secondary)]">
              Express your pricing structure. Minimum compensation rules are enforced as hard constraints during automated matching.
            </CardDescription>
          </CardHeader>
          <CardContent className="p-5 sm:p-6 grid gap-5">
            <div>
              <label className="text-xs font-semibold text-[var(--wp-text-primary)] block mb-2">
                Supported Pricing Models
              </label>
              <div className="grid sm:grid-cols-3 gap-3">
                {[
                  { key: "FIXED" as const, title: "Fixed-Price Only", desc: "Per-deliverable bounded contracts." },
                  { key: "HOURLY" as const, title: "Hourly Rate", desc: "Estimated hour milestones." },
                  { key: "BOTH" as const, title: "Both Models", desc: "Accept fixed-price deliverables or hourly execution." },
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
                  <span className="absolute left-3 top-2 text-xs text-[var(--wp-text-secondary)]">$</span>
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
                  <span className="absolute left-3 top-2 text-xs text-[var(--wp-text-secondary)]">$</span>
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
                  <span className="absolute left-3 top-2 text-xs text-[var(--wp-text-secondary)]">$</span>
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
              <label htmlFor="willingToNegotiate" className="text-xs text-[var(--wp-text-primary)] cursor-pointer">
                <strong>Willing to negotiate commercial terms:</strong> Permit buyer AI to propose counter-offers within 15% of target rate.
              </label>
            </div>
          </CardContent>
        </Card>
      )}

      {/* SECTION D: COMMITMENT & ACCEPTANCE RULES */}
      {activeSection === "commitments" && (
        <Card className="border-[var(--wp-border)] shadow-xs overflow-hidden">
          <CardHeader className="bg-[var(--wp-surface-subtle)]/50 border-b border-[var(--wp-border)] pb-4">
            <CardTitle className="text-base font-semibold flex items-center gap-2">
              <ShieldCheck className="h-4 w-4 text-[var(--wp-accent)]" />
              D. Assignment Acceptance &amp; Commitment Rules
            </CardTitle>
            <CardDescription className="text-xs sm:text-sm text-[var(--wp-text-secondary)]">
              Rules determining how assignments are offered and confirmed. Finding work is distinct from binding contract acceptance.
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
                <label htmlFor="requireExplicitApproval" className="text-xs font-semibold text-[var(--wp-text-primary)] cursor-pointer">
                  Require Explicit Human Confirmation Before Contract Acceptance (Recommended)
                </label>
                <p className="text-[11px] text-[var(--wp-text-secondary)] mt-0.5 leading-relaxed">
                  Finding or recommending an opportunity will never automatically bind you to a contract. You retain final sign-off on scope, delivery dates, and commercial terms before work begins.
                </p>
              </div>
            </div>

            <div className="p-4 rounded-xl border border-[var(--wp-border)] bg-[var(--wp-surface-subtle)]/40 flex items-start gap-3.5">
              <input
                type="checkbox"
                id="aiRecommendationAllowed"
                checked={aiRecommendationAllowed}
                onChange={(e) => {
                  setAiRecommendationAllowed(e.target.checked);
                  markDirty();
                }}
                className="h-4 w-4 mt-0.5 rounded border-[var(--wp-border)] text-[var(--wp-accent)] focus:ring-[var(--wp-accent)] cursor-pointer"
              />
              <div>
                <label htmlFor="aiRecommendationAllowed" className="text-xs font-semibold text-[var(--wp-text-primary)] cursor-pointer">
                  Permit AI Matching Engine to Propose Suitable Work Opportunities
                </label>
                <p className="text-[11px] text-[var(--wp-text-secondary)] mt-0.5 leading-relaxed">
                  Allow the task planner to surface your profile to task owners whose specifications match your capability tags and commercial rules.
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
                  <span className="text-xs text-[var(--wp-text-secondary)] italic">No excluded categories</span>
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
              E &amp; F. Execution Workflow &amp; Verification Integrity
            </CardTitle>
            <CardDescription className="text-xs sm:text-sm text-[var(--wp-text-secondary)]">
              Operational preferences for deliverables, intermediate reporting, and revision handling.
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
                  <option value="REALTIME">Milestone Checkpoints (Notification on stage transitions)</option>
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
                Preferred Delivery Artifact Format
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
                Verification &amp; Revision Notifications
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
                <label htmlFor="notifyOnVerificationFail" className="text-xs text-[var(--wp-text-primary)] cursor-pointer">
                  Notify immediately if deliverable verification fails with unmet criteria evidence.
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
                <label htmlFor="notifyOnRevisionRequest" className="text-xs text-[var(--wp-text-primary)] cursor-pointer">
                  Notify when a revision is requested, displaying the specific requirements that were not satisfied.
                </label>
              </div>

              <div className="p-3.5 rounded-xl border border-[var(--wp-border)] bg-[var(--wp-surface-subtle)]/50 text-xs text-[var(--wp-text-secondary)] leading-relaxed">
                <strong className="text-[var(--wp-text-primary)]">Invariant Notice:</strong> Worker preferences cannot disable required verification or bypass objective acceptance criteria once a contract is executed.
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* SECTION G: PAYOUT READINESS */}
      {activeSection === "payout" && (
        <Card className="border-[var(--wp-border)] shadow-xs overflow-hidden">
          <CardHeader className="bg-[var(--wp-surface-subtle)]/50 border-b border-[var(--wp-border)] pb-4">
            <CardTitle className="text-base font-semibold flex items-center gap-2">
              <Wallet className="h-4 w-4 text-[var(--wp-accent)]" />
              G. PayPal Payout Readiness &amp; Settlement Routing
            </CardTitle>
            <CardDescription className="text-xs sm:text-sm text-[var(--wp-text-secondary)]">
              Configure where eligible payments are transferred upon verified proof and policy confirmation.
            </CardDescription>
          </CardHeader>
          <CardContent className="p-5 sm:p-6 grid gap-5">
            {/* Payout Status Indicator */}
            <div
              className={cn(
                "p-4 rounded-xl border flex items-start gap-3.5",
                isPayoutConfigured
                  ? "border-[var(--wp-success)]/40 bg-[var(--wp-success-subtle)]/30"
                  : "border-[var(--wp-danger)]/40 bg-[var(--wp-danger-subtle)]/30",
              )}
            >
              {isPayoutConfigured ? (
                <ShieldCheck className="h-5 w-5 text-[var(--wp-success)] shrink-0 mt-0.5" />
              ) : (
                <AlertCircle className="h-5 w-5 text-[var(--wp-danger)] shrink-0 mt-0.5" />
              )}
              <div>
                <div className="flex items-center gap-2">
                  <span className="font-semibold text-xs text-[var(--wp-text-primary)]">
                    {isPayoutConfigured ? "Payout Destination Configured" : "Payout Configuration Incomplete"}
                  </span>
                  <StatusBadge tone={isPayoutConfigured ? "success" : "danger"}>
                    {isPayoutConfigured ? "READY FOR SETTLEMENT" : "PAYOUT BLOCKED"}
                  </StatusBadge>
                </div>
                <p className="text-xs text-[var(--wp-text-secondary)] mt-1 leading-relaxed">
                  {isPayoutConfigured
                    ? `Eligible settlement captures will disburse to ${payoutEmail} via PayPal Payments v2 once acceptance verification passes with zero defects.`
                    : "Please specify a valid PayPal email address. You may still accept tasks, but funds cannot be disbursed until this address is provided."}
                </p>
              </div>
            </div>

            <div>
              <label className="text-xs font-semibold text-[var(--wp-text-primary)] block mb-1">
                PayPal Payout Destination Email
              </label>
              <div className="relative max-w-md">
                <span className="absolute left-3 top-2.5 text-xs text-[var(--wp-text-secondary)]">
                  <Mail className="h-3.5 w-3.5" />
                </span>
                <Input
                  type="email"
                  value={payoutEmail}
                  onChange={(e) => {
                    setPayoutEmail(e.target.value);
                    markDirty();
                  }}
                  placeholder="e.g. worker.paypal@example.com"
                  className="pl-8 h-9 text-xs bg-white"
                />
              </div>
              <span className="text-[11px] text-[var(--wp-text-secondary)] mt-1 block">
                Must be an active PayPal account able to receive incoming business settlements.
              </span>
            </div>

            <div className="pt-3 border-t border-[var(--wp-border)] flex items-center justify-between">
              <div>
                <span className="text-xs font-semibold text-[var(--wp-text-primary)] block">
                  Settlement History &amp; Payment Ledger
                </span>
                <span className="text-[11px] text-[var(--wp-text-secondary)] block">
                  Inspect past disbursements, authorization holds, and audit receipts.
                </span>
              </div>
              <Button asChild variant="outline" size="sm" className="text-xs font-medium gap-1.5">
                <Link href="/payments">
                  <span>View Ledger</span>
                  <ArrowRight className="h-3.5 w-3.5" />
                </Link>
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Floating Save Actions Bar when Dirty */}
      {isDirty && (
        <div className="sticky bottom-4 z-20 p-3 rounded-xl border border-[var(--wp-border-strong)] bg-white/95 backdrop-blur-md shadow-xl flex items-center justify-between gap-4 animate-in slide-in-from-bottom-2">
          <div className="flex items-center gap-2 text-xs">
            <span className="h-2 w-2 rounded-full bg-[var(--wp-accent)] animate-pulse" />
            <span className="font-semibold text-[var(--wp-text-primary)]">You have unsaved preference changes</span>
          </div>
          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => loadProfile()}
              className="text-xs"
            >
              Discard Changes
            </Button>
            <Button
              type="submit"
              size="sm"
              disabled={saving}
              className="text-xs font-semibold gap-1.5"
            >
              {saving ? <RefreshCw className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
              <span>{saving ? "Saving Changes..." : "Save Preferences"}</span>
            </Button>
          </div>
        </div>
      )}
    </form>
  );
}
