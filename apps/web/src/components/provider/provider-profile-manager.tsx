"use client";

import { useEffect, useState } from "react";
import {
  Briefcase,
  Check,
  CheckCircle2,
  DollarSign,
  Mail,
  Plus,
  RefreshCw,
  ShieldCheck,
  Tag,
  User,
  X,
} from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { StatusBadge } from "@/components/ui/status-badge";
import {
  getProviderProfile,
  updateProviderProfile,
  type ProviderProfileDto,
} from "@/lib/api/endpoints";

const POPULAR_TAGS = [
  "data-cleaning",
  "data-enrichment",
  "typescript",
  "python",
  "financial-audit",
  "document-processing",
  "ai-eval",
  "smart-contracts",
  "research",
];

export function ProviderProfileManager() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [savedSuccess, setSavedSuccess] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const [isListed, setIsListed] = useState(false);
  const [displayName, setDisplayName] = useState("");
  const [bio, setBio] = useState("");
  const [hourlyRate, setHourlyRate] = useState<number>(45);
  const [payoutEmail, setPayoutEmail] = useState("");
  const [status, setStatus] = useState<"ACTIVE" | "INACTIVE">("ACTIVE");
  const [capabilities, setCapabilities] = useState<Array<{ tag: string; proficiency: number }>>([
    { tag: "data-cleaning", proficiency: 5 },
    { tag: "data-enrichment", proficiency: 4 },
  ]);
  const [customTag, setCustomTag] = useState("");

  const loadProfile = async () => {
    setLoading(true);
    setErrorMessage(null);
    try {
      const res = await getProviderProfile();
      if (!res.error && res.data) {
        setIsListed(res.data.isListed);
        if (res.data.provider) {
          const p = res.data.provider;
          setDisplayName(p.displayName);
          setBio(p.bio ?? "");
          setHourlyRate(p.hourlyRateMinor ? Math.round(p.hourlyRateMinor / 100) : 45);
          setPayoutEmail(p.payoutEmail ?? "");
          setStatus(p.status);
          if (p.capabilities && p.capabilities.length > 0) {
            setCapabilities(p.capabilities);
          }
        } else {
          // Defaults for new profile
          setDisplayName("Freelance Specialist");
          setPayoutEmail("provider.payout@example.com");
        }
      }
    } catch (err) {
      console.error("Failed to load provider profile:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadProfile();
  }, []);

  const handleToggleTag = (tag: string) => {
    const existing = capabilities.find((c) => c.tag === tag);
    if (existing) {
      setCapabilities(capabilities.filter((c) => c.tag !== tag));
    } else {
      setCapabilities([...capabilities, { tag, proficiency: 4 }]);
    }
  };

  const handleAddCustomTag = () => {
    const trimmed = customTag.trim().toLowerCase();
    if (!trimmed) return;
    if (!capabilities.some((c) => c.tag === trimmed)) {
      setCapabilities([...capabilities, { tag: trimmed, proficiency: 4 }]);
    }
    setCustomTag("");
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!displayName.trim()) {
      setErrorMessage("Please enter a display name for your profile.");
      return;
    }
    if (!payoutEmail.trim() || !payoutEmail.includes("@")) {
      setErrorMessage("Please enter a valid PayPal payout email address.");
      return;
    }

    setSaving(true);
    setErrorMessage(null);
    setSavedSuccess(false);

    try {
      const res = await updateProviderProfile({
        displayName: displayName.trim(),
        bio: bio.trim() || null,
        hourlyRateMinor: hourlyRate * 100,
        currency: "USD",
        payoutEmail: payoutEmail.trim(),
        status,
        capabilities,
      });

      if (res.error) {
        setErrorMessage(res.error.message || "Failed to update provider profile.");
      } else {
        setIsListed(true);
        setSavedSuccess(true);
        setTimeout(() => setSavedSuccess(false), 4000);
      }
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <Card className="border-border/80 shadow-xs">
        <CardContent className="p-8 flex items-center justify-center gap-3 text-muted-foreground text-sm">
          <RefreshCw className="h-4 w-4 animate-spin text-primary" />
          <span>Loading provider registry details...</span>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="border-border/80 shadow-xs">
      <CardHeader className="bg-muted/15 border-b border-border/60 pb-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <CardTitle className="text-base font-semibold flex items-center gap-2">
            <Briefcase className="h-4 w-4 text-primary" />
            Specialist Profile &amp; Direct PayPal Settlements
          </CardTitle>
          <div className="flex items-center gap-2">
            <StatusBadge tone={isListed && status === "ACTIVE" ? "success" : "neutral"}>
              {isListed && status === "ACTIVE"
                ? "Active in Talent Network"
                : isListed
                  ? "Profile Paused"
                  : "Unlisted"}
            </StatusBadge>
          </div>
        </div>
        <CardDescription className="text-xs sm:text-sm">
          WorkPay operates on a dual-role architecture: any user account can commission work and earn as an independent specialist. Matchmaking pairs active profiles with relevant objectives automatically.
        </CardDescription>
      </CardHeader>

      <CardContent className="p-6">
        <form onSubmit={handleSave} className="grid gap-6">
          {errorMessage && (
            <div className="p-3 rounded-lg border border-rose-300 bg-rose-50 dark:border-rose-900/60 dark:bg-rose-950/40 text-rose-800 dark:text-rose-200 text-xs font-medium">
              {errorMessage}
            </div>
          )}

          {savedSuccess && (
            <div className="p-3 rounded-lg border border-emerald-300 bg-emerald-50 dark:border-emerald-900/60 dark:bg-emerald-950/40 text-emerald-800 dark:text-emerald-200 text-xs font-semibold flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4 text-emerald-600" />
              Provider profile updated and synchronized with talent discovery registry.
            </div>
          )}

          <div className="grid sm:grid-cols-2 gap-4">
            {/* Display Name */}
            <div className="grid gap-1.5">
              <label className="text-xs font-semibold text-foreground flex items-center gap-1.5">
                <User className="h-3.5 w-3.5 text-muted-foreground" />
                Public Display / Business Name
              </label>
              <Input
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                placeholder="e.g. Apex Data Services or Alice M."
                required
                className="text-sm"
              />
              <span className="text-[11px] text-muted-foreground">
                Visible to buyers during candidate ranking and negotiation.
              </span>
            </div>

            {/* Availability Status */}
            <div className="grid gap-1.5">
              <label className="text-xs font-semibold text-foreground flex items-center gap-1.5">
                <ShieldCheck className="h-3.5 w-3.5 text-muted-foreground" />
                Talent Pool Availability
              </label>
              <div className="flex gap-2">
                <Button
                  type="button"
                  variant={status === "ACTIVE" ? "default" : "outline"}
                  size="sm"
                  onClick={() => setStatus("ACTIVE")}
                  className="flex-1 text-xs font-medium"
                >
                  <Check className="h-3.5 w-3.5 mr-1" />
                  Available for Hire
                </Button>
                <Button
                  type="button"
                  variant={status === "INACTIVE" ? "default" : "outline"}
                  size="sm"
                  onClick={() => setStatus("INACTIVE")}
                  className="flex-1 text-xs font-medium"
                >
                  Paused / Busy
                </Button>
              </div>
              <span className="text-[11px] text-muted-foreground">
                When paused, the matching engine temporarily excludes your profile from new searches.
              </span>
            </div>
          </div>

          <div className="grid sm:grid-cols-2 gap-4">
            {/* PayPal Payout Email */}
            <div className="grid gap-1.5">
              <label className="text-xs font-semibold text-foreground flex items-center gap-1.5">
                <Mail className="h-3.5 w-3.5 text-primary" />
                PayPal Settlement Payout Email
              </label>
              <Input
                type="email"
                value={payoutEmail}
                onChange={(e) => setPayoutEmail(e.target.value)}
                placeholder="e.g. your-paypal-account@example.com"
                required
                className="text-sm font-mono"
              />
              <span className="text-[11px] text-muted-foreground">
                Funds are disbursed directly to this address via PayPal Payouts API upon verified proof.
              </span>
            </div>

            {/* Hourly Rate */}
            <div className="grid gap-1.5">
              <label className="text-xs font-semibold text-foreground flex items-center gap-1.5">
                <DollarSign className="h-3.5 w-3.5 text-emerald-600" />
                Target Hourly Rate (USD)
              </label>
              <div className="relative">
                <span className="absolute left-3 top-2.5 text-xs text-muted-foreground font-mono">$</span>
                <Input
                  type="number"
                  min="0"
                  max="1000"
                  value={hourlyRate}
                  onChange={(e) => setHourlyRate(Number(e.target.value))}
                  className="pl-7 text-sm font-mono"
                />
              </div>
              <span className="text-[11px] text-muted-foreground">
                Used by AI agents as baseline expectation during contract proposal compilation.
              </span>
            </div>
          </div>

          {/* Bio */}
          <div className="grid gap-1.5">
            <label className="text-xs font-semibold text-foreground">
              Professional Overview / Specialization Summary
            </label>
            <Input
              value={bio}
              onChange={(e) => setBio(e.target.value)}
              placeholder="e.g. Specialized in deduplication, tabular data reconciliation, and Python pipelines."
              className="text-sm"
            />
          </div>

          {/* Capabilities */}
          <div className="grid gap-2 pt-2 border-t border-border/50">
            <label className="text-xs font-semibold text-foreground flex items-center gap-1.5">
              <Tag className="h-3.5 w-3.5 text-primary" />
              Specialized Capabilities &amp; Skills
            </label>
            <p className="text-[11px] text-muted-foreground">
              Click tags to toggle your qualifications. The matching algorithm scores candidate capability overlap when matching contracts.
            </p>

            <div className="flex flex-wrap gap-2 pt-1">
              {POPULAR_TAGS.map((tag) => {
                const active = capabilities.some((c) => c.tag === tag);
                return (
                  <button
                    key={tag}
                    type="button"
                    onClick={() => handleToggleTag(tag)}
                    className={`inline-flex items-center gap-1 text-xs px-2.5 py-1 rounded-lg border transition-all ${
                      active
                        ? "border-primary bg-primary/10 text-primary font-semibold shadow-2xs"
                        : "border-border/70 hover:border-border text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    {active ? <Check className="h-3 w-3" /> : <Plus className="h-3 w-3 opacity-60" />}
                    <span>{tag}</span>
                  </button>
                );
              })}
            </div>

            {/* Custom Tag Input */}
            <div className="flex gap-2 max-w-sm mt-2">
              <Input
                value={customTag}
                onChange={(e) => setCustomTag(e.target.value)}
                placeholder="Add custom skill tag..."
                className="h-8 text-xs"
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    handleAddCustomTag();
                  }
                }}
              />
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={handleAddCustomTag}
                className="h-8 text-xs px-3"
              >
                Add
              </Button>
            </div>

            {/* Active Tags Summary */}
            {capabilities.length > 0 && (
              <div className="flex flex-wrap gap-1.5 mt-2 pt-2 border-t border-border/40">
                <span className="text-[11px] font-semibold text-muted-foreground mr-1 self-center">
                  Active Capabilities:
                </span>
                {capabilities.map((c) => (
                  <Badge
                    key={c.tag}
                    variant="secondary"
                    className="gap-1 text-[11px] py-0.5 px-2 bg-muted/80"
                  >
                    <span>{c.tag}</span>
                    <button
                      type="button"
                      onClick={() => handleToggleTag(c.tag)}
                      className="ml-0.5 hover:text-rose-600"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </Badge>
                ))}
              </div>
            )}
          </div>

          <div className="flex items-center justify-between pt-4 border-t border-border/60">
            <span className="text-xs text-muted-foreground">
              Invariant P1: Self-hiring is strictly forbidden by policy gates.
            </span>
            <Button
              type="submit"
              disabled={saving}
              className="font-semibold shadow-xs text-xs px-5"
            >
              {saving ? (
                <>
                  <RefreshCw className="h-3.5 w-3.5 mr-1.5 animate-spin" />
                  Saving Profile...
                </>
              ) : (
                "Save Specialist Profile"
              )}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
