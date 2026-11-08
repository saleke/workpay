"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { getReviewerProfile, saveReviewerProfile } from "@/lib/api/endpoints";
import type {
  ReviewerEvidenceDto,
  ReviewerExpertiseDto,
  ReviewerProfileInputDto,
} from "@/lib/api/types";
import { useApi } from "@/lib/use-api";

const EMPTY_EXPERTISE: ReviewerExpertiseDto = {
  domainTag: "",
  scope: "",
  selfAssessedLevel: 3,
  yearsExperience: null,
  methods: [],
};

const EMPTY_EVIDENCE: Omit<ReviewerEvidenceDto, "provenance"> = {
  kind: "PORTFOLIO",
  title: "",
  description: "",
  url: null,
  issuer: null,
};

function parseUsdMinor(value: string): number | null {
  if (!value.trim()) return null;
  const match = /^(\d+)(?:\.(\d{1,2}))?$/.exec(value.trim());
  if (!match) return Number.NaN;
  const amountMinor = Number(match[1]) * 100 + Number((match[2] ?? "").padEnd(2, "0"));
  return Number.isSafeInteger(amountMinor) ? amountMinor : Number.NaN;
}

export function ReviewerProfileEditor() {
  const profile = useApi(() => getReviewerProfile(), [], "reviewer-profile");
  const [hydrated, setHydrated] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [isListed, setIsListed] = useState(false);
  const [available, setAvailable] = useState(true);
  const [offersWork, setOffersWork] = useState(false);
  const [offersReview, setOffersReview] = useState(false);
  const [acceptsReviewOnly, setAcceptsReviewOnly] = useState(false);
  const [reviewAvailability, setReviewAvailability] = useState<"AVAILABLE" | "BUSY" | "OFFLINE">(
    "AVAILABLE",
  );
  const [reviewNotice, setReviewNotice] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [publicContactUrl, setPublicContactUrl] = useState("");
  const [summary, setSummary] = useState("");
  const [languagesText, setLanguagesText] = useState("English");
  const [feeText, setFeeText] = useState("");
  const [turnaroundText, setTurnaroundText] = useState("");
  const [conflictDisclosureConfirmed, setConflictDisclosureConfirmed] = useState(false);
  const [conflictUsernamesText, setConflictUsernamesText] = useState("");
  const [expertise, setExpertise] = useState<ReviewerExpertiseDto[]>([{ ...EMPTY_EXPERTISE }]);
  const [evidence, setEvidence] = useState<Array<Omit<ReviewerEvidenceDto, "provenance">>>([]);

  useEffect(() => {
    if (profile.loading || hydrated) return;
    const savedProfile = profile.data?.profile;
    if (savedProfile) {
      setIsListed(savedProfile.isListed);
      setAvailable(savedProfile.available);
      setOffersWork(savedProfile.offersWork ?? false);
      setOffersReview(savedProfile.offersReview ?? false);
      setAcceptsReviewOnly(savedProfile.acceptsReviewOnly ?? false);
      setReviewAvailability(savedProfile.reviewAvailability ?? "AVAILABLE");
      setReviewNotice(savedProfile.reviewNotice ?? "");
      setDisplayName(savedProfile.displayName);
      setPublicContactUrl(savedProfile.publicContactUrl ?? "");
      setSummary(savedProfile.summary);
      setLanguagesText(savedProfile.languages.join(", "));
      setFeeText(
        savedProfile.feeMinor === null
          ? ""
          : `${Math.floor(savedProfile.feeMinor / 100)}.${String(savedProfile.feeMinor % 100).padStart(2, "0")}`,
      );
      setTurnaroundText(savedProfile.typicalTurnaroundDays?.toString() ?? "");
      setConflictDisclosureConfirmed(savedProfile.conflictDisclosureConfirmed);
      setConflictUsernamesText(
        savedProfile.conflicts
          .map((conflict) => conflict.username)
          .filter((username): username is string => username !== null)
          .join(", "),
      );
      setExpertise(
        savedProfile.expertise.length > 0 ? savedProfile.expertise : [{ ...EMPTY_EXPERTISE }],
      );
      setEvidence(savedProfile.evidence.map(({ provenance: _provenance, ...item }) => item));
    }
    setHydrated(true);
  }, [profile.data, profile.loading, hydrated]);

  const save = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSaving(true);
    setSaveError(null);
    setSaved(false);
    const feeMinor = parseUsdMinor(feeText);
    const input: ReviewerProfileInputDto = {
      isListed,
      available,
      offersWork,
      offersReview,
      acceptsReviewOnly,
      reviewAvailability,
      reviewNotice: reviewNotice.trim() || null,
      displayName,
      publicContactUrl: publicContactUrl.trim() || null,
      summary,
      languages: [
        ...new Set(
          languagesText
            .split(",")
            .map((item) => item.trim())
            .filter(Boolean),
        ),
      ],
      feeMinor,
      typicalTurnaroundDays: turnaroundText.trim() ? Number(turnaroundText) : null,
      conflictDisclosureConfirmed,
      conflictUsernames: [
        ...new Set(
          conflictUsernamesText
            .split(",")
            .map((item) => item.trim().replace(/^@/, ""))
            .filter(Boolean),
        ),
      ],
      expertise: expertise.filter((item) => item.domainTag.trim() || item.scope.trim()),
      evidence: evidence
        .filter((item) => item.title.trim() || item.description.trim())
        .map((item) => ({
          ...item,
          url: item.url?.trim() || null,
          issuer: item.issuer?.trim() || null,
        })),
    };

    if (Number.isNaN(feeMinor)) {
      setSaveError("Enter a valid USD fee with no more than two decimal places.");
      setSaving(false);
      return;
    }

    const result = await saveReviewerProfile(input);
    setSaving(false);
    if (result.error) {
      setSaveError(result.error.message || "Could not save your reviewer profile.");
      return;
    }
    setSaved(true);
    profile.reload();
  };

  const updateExpertise = (index: number, patch: Partial<ReviewerExpertiseDto>) => {
    setExpertise((items) =>
      items.map((item, itemIndex) => (itemIndex === index ? { ...item, ...patch } : item)),
    );
  };

  const updateEvidence = (
    index: number,
    patch: Partial<Omit<ReviewerEvidenceDto, "provenance">>,
  ) => {
    setEvidence((items) =>
      items.map((item, itemIndex) => (itemIndex === index ? { ...item, ...patch } : item)),
    );
  };

  if (profile.loading && !hydrated) {
    return (
      <p className="py-12 text-center text-sm text-muted-foreground">Loading reviewer profile…</p>
    );
  }

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <header className="space-y-3 rounded-3xl border border-[var(--wp-border)] bg-[radial-gradient(circle_at_top,_rgba(139,92,246,0.10),_transparent_48%),linear-gradient(135deg,rgba(15,23,42,0.02),rgba(15,23,42,0.00))] p-6">
        <Link
          href="/reviewers"
          className="inline-flex items-center text-sm font-medium text-violet-700 underline-offset-4 hover:underline"
        >
          ← Back to reviewer discovery
        </Link>
        <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-violet-700">
              Professional profile
            </p>
            <h1 className="mt-2 text-3xl font-semibold text-[var(--charcoal)]">
              Work and review availability
            </h1>
          </div>
          <div className="flex flex-wrap gap-2 text-xs">
            <span className="rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 font-medium text-emerald-700">
              {offersWork ? "Offers work" : "Not offering work"}
            </span>
            <span className="rounded-full border border-violet-200 bg-violet-50 px-2.5 py-1 font-medium text-violet-700">
              {offersReview ? "Available for review" : "Not taking review"}
            </span>
          </div>
        </div>
        <p className="max-w-2xl text-sm leading-6 text-muted-foreground">
          Show the domains where you can deliver work and the domains where you can independently
          review. Review availability is a separate capability, and Tenfo does not certify or
          guarantee the quality of any review claims.
        </p>
      </header>

      {profile.error ? (
        <p
          role="alert"
          className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700"
        >
          Could not load your reviewer profile.
        </p>
      ) : null}
      {saveError ? (
        <p
          role="alert"
          className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700"
        >
          {saveError}
        </p>
      ) : null}
      {saved ? (
        <p
          role="status"
          className="rounded-lg border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800"
        >
          Reviewer profile saved.
        </p>
      ) : null}

      <form className="space-y-5" onSubmit={save}>
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Public profile</CardTitle>
            <CardDescription>
              Share only information you are comfortable making visible to task owners.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="grid gap-3 rounded-2xl border border-violet-200 bg-violet-50/60 p-4 md:grid-cols-3">
              <label className="flex items-start gap-3 rounded-xl bg-white p-3 shadow-sm ring-1 ring-violet-100">
                <input
                  type="checkbox"
                  checked={offersWork}
                  onChange={(event) => setOffersWork(event.target.checked)}
                  className="mt-1"
                />
                <span className="text-sm">
                  <span className="mb-1 block font-medium text-[var(--charcoal)]">
                    I offer work
                  </span>
                  <span className="text-xs text-muted-foreground">
                    Available for project delivery in relevant domains.
                  </span>
                </span>
              </label>
              <label className="flex items-start gap-3 rounded-xl bg-white p-3 shadow-sm ring-1 ring-violet-100">
                <input
                  type="checkbox"
                  checked={offersReview}
                  onChange={(event) => {
                    setOffersReview(event.target.checked);
                    if (!event.target.checked) setAcceptsReviewOnly(false);
                  }}
                  className="mt-1"
                />
                <span className="text-sm">
                  <span className="mb-1 block font-medium text-[var(--charcoal)]">
                    I review work
                  </span>
                  <span className="text-xs text-muted-foreground">
                    Available to assess work against agreed criteria.
                  </span>
                </span>
              </label>
              <label className="flex items-start gap-3 rounded-xl bg-white p-3 shadow-sm ring-1 ring-violet-100">
                <input
                  type="checkbox"
                  checked={acceptsReviewOnly}
                  onChange={(event) => setAcceptsReviewOnly(event.target.checked)}
                  disabled={!offersReview}
                  className="mt-1"
                />
                <span className="text-sm">
                  <span className="mb-1 block font-medium text-[var(--charcoal)]">
                    Review-only mode
                  </span>
                  <span className="text-xs text-muted-foreground">
                    Open to review assignments without full project delivery.
                  </span>
                </span>
              </label>
            </div>
            <div className="grid gap-4 md:grid-cols-[1.2fr_0.8fr]">
              <label className="grid gap-1 text-sm">
                <span>Display name</span>
                <input
                  required
                  minLength={2}
                  maxLength={100}
                  value={displayName}
                  onChange={(event) => setDisplayName(event.target.value)}
                  className="h-11 rounded-xl border border-[var(--wp-border)] bg-white px-3"
                />
              </label>
              <label className="grid gap-1 text-sm">
                <span>Review availability</span>
                <select
                  value={reviewAvailability}
                  onChange={(event) =>
                    setReviewAvailability(event.target.value as "AVAILABLE" | "BUSY" | "OFFLINE")
                  }
                  className="h-11 rounded-xl border border-[var(--wp-border)] bg-white px-3"
                >
                  <option value="AVAILABLE">Available</option>
                  <option value="BUSY">Busy</option>
                  <option value="OFFLINE">Offline</option>
                </select>
              </label>
            </div>
            <label className="grid gap-1 text-sm">
              <span>Public contact link (optional, HTTPS)</span>
              <input
                type="url"
                pattern="[Hh][Tt][Tt][Pp][Ss]://.*"
                value={publicContactUrl}
                onChange={(event) => setPublicContactUrl(event.target.value)}
                placeholder="A contact page or profile you control"
                className="h-10 rounded-lg border px-3"
              />
            </label>
            <label className="grid gap-1 text-sm">
              <span>Review practice summary</span>
              <textarea
                required
                minLength={20}
                maxLength={1200}
                rows={4}
                value={summary}
                onChange={(event) => setSummary(event.target.value)}
                className="rounded-xl border border-[var(--wp-border)] bg-white p-3"
              />
            </label>
            <label className="grid gap-1 text-sm">
              <span>Short note for review availability</span>
              <textarea
                value={reviewNotice}
                onChange={(event) => setReviewNotice(event.target.value)}
                rows={2}
                maxLength={1000}
                placeholder="I usually review UX, accessibility, and checkout flows with a 3-day turnaround."
                className="rounded-xl border border-[var(--wp-border)] bg-white p-3"
              />
            </label>
            <label className="grid gap-1 text-sm">
              <span>Languages, comma-separated</span>
              <input
                required
                value={languagesText}
                onChange={(event) => setLanguagesText(event.target.value)}
                className="h-11 rounded-xl border border-[var(--wp-border)] bg-white px-3"
              />
            </label>
            <div className="grid gap-4 sm:grid-cols-2">
              <label className="grid gap-1 text-sm">
                <span>Indicative fee (USD)</span>
                <input
                  inputMode="decimal"
                  value={feeText}
                  onChange={(event) => setFeeText(event.target.value)}
                  placeholder="Leave blank if discussed directly"
                  className="h-10 rounded-lg border px-3"
                />
              </label>
              <label className="grid gap-1 text-sm">
                <span>Typical turnaround (days)</span>
                <input
                  type="number"
                  min={1}
                  max={365}
                  step={1}
                  value={turnaroundText}
                  onChange={(event) => setTurnaroundText(event.target.value)}
                  className="h-10 rounded-lg border px-3"
                />
              </label>
            </div>
            <label className="flex items-start gap-2 text-sm">
              <input
                type="checkbox"
                checked={available}
                onChange={(event) => setAvailable(event.target.checked)}
                className="mt-1"
              />
              <span>Available to consider independent review requests</span>
            </label>
            <label className="flex items-start gap-2 text-sm">
              <input
                type="checkbox"
                checked={isListed}
                onChange={(event) => setIsListed(event.target.checked)}
                className="mt-1"
              />
              <span>List this profile in reviewer recommendations</span>
            </label>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Review domains</CardTitle>
            <CardDescription>
              Self-assessed experience helps describe fit; it is not independently validated.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {expertise.map((item, index) => (
              <div
                key={`expertise-${index}`}
                className="grid gap-3 rounded-lg border p-3 sm:grid-cols-2"
              >
                <label className="grid gap-1 text-sm">
                  <span>Domain tag</span>
                  <input
                    required
                    minLength={2}
                    maxLength={128}
                    pattern="[A-Za-z0-9][A-Za-z0-9 _./-]*"
                    value={item.domainTag}
                    onChange={(event) => updateExpertise(index, { domainTag: event.target.value })}
                    placeholder="e.g. data-analysis"
                    className="h-10 rounded-lg border px-3"
                  />
                </label>
                <label className="grid gap-1 text-sm">
                  <span>Years of experience (optional)</span>
                  <input
                    type="number"
                    min={0}
                    max={80}
                    step={1}
                    value={item.yearsExperience ?? ""}
                    onChange={(event) =>
                      updateExpertise(index, {
                        yearsExperience: event.target.value ? Number(event.target.value) : null,
                      })
                    }
                    className="h-10 rounded-lg border px-3"
                  />
                </label>
                <label className="grid gap-1 text-sm sm:col-span-2">
                  <span>What you can assess in this domain</span>
                  <textarea
                    required
                    minLength={10}
                    maxLength={500}
                    rows={2}
                    value={item.scope}
                    onChange={(event) => updateExpertise(index, { scope: event.target.value })}
                    className="rounded-lg border p-3"
                  />
                </label>
                <label className="grid gap-1 text-sm">
                  <span>Self-assessed level (1–5)</span>
                  <select
                    value={item.selfAssessedLevel}
                    onChange={(event) =>
                      updateExpertise(index, { selfAssessedLevel: Number(event.target.value) })
                    }
                    className="h-10 rounded-lg border px-3"
                  >
                    {[1, 2, 3, 4, 5].map((level) => (
                      <option key={level} value={level}>
                        {level}
                      </option>
                    ))}
                  </select>
                </label>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() =>
                    setExpertise((items) => items.filter((_, itemIndex) => itemIndex !== index))
                  }
                  disabled={expertise.length === 1}
                >
                  Remove domain
                </Button>
              </div>
            ))}
            <Button
              type="button"
              variant="outline"
              onClick={() => setExpertise((items) => [...items, { ...EMPTY_EXPERTISE }])}
              disabled={expertise.length >= 20}
            >
              {expertise.length >= 20 ? "Maximum review domains reached" : "Add review domain"}
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Supporting evidence</CardTitle>
            <CardDescription>
              Links and descriptions are supplied by you. Credentials, issuers, and examples are not
              verified by Tenfo.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {evidence.map((item, index) => (
              <div
                key={`evidence-${index}`}
                className="grid gap-3 rounded-lg border p-3 sm:grid-cols-2"
              >
                <label className="grid gap-1 text-sm">
                  <span>Evidence type</span>
                  <select
                    value={item.kind}
                    onChange={(event) =>
                      updateEvidence(index, {
                        kind: event.target.value as ReviewerEvidenceDto["kind"],
                      })
                    }
                    className="h-10 rounded-lg border px-3"
                  >
                    <option value="PORTFOLIO">Portfolio</option>
                    <option value="CREDENTIAL">Credential claim</option>
                    <option value="EXPERIENCE">Experience</option>
                    <option value="REFERENCE">Reference</option>
                  </select>
                </label>
                <label className="grid gap-1 text-sm">
                  <span>Title</span>
                  <input
                    required
                    minLength={2}
                    maxLength={160}
                    value={item.title}
                    onChange={(event) => updateEvidence(index, { title: event.target.value })}
                    className="h-10 rounded-lg border px-3"
                  />
                </label>
                <label className="grid gap-1 text-sm sm:col-span-2">
                  <span>Description</span>
                  <textarea
                    required
                    minLength={5}
                    maxLength={500}
                    rows={2}
                    value={item.description}
                    onChange={(event) => updateEvidence(index, { description: event.target.value })}
                    className="rounded-lg border p-3"
                  />
                </label>
                <label className="grid gap-1 text-sm">
                  <span>HTTPS link (optional)</span>
                  <input
                    type="url"
                    pattern="[Hh][Tt][Tt][Pp][Ss]://.*"
                    value={item.url ?? ""}
                    onChange={(event) => updateEvidence(index, { url: event.target.value || null })}
                    className="h-10 rounded-lg border px-3"
                  />
                </label>
                <label className="grid gap-1 text-sm">
                  <span>Issuer, if applicable</span>
                  <input
                    value={item.issuer ?? ""}
                    onChange={(event) =>
                      updateEvidence(index, { issuer: event.target.value || null })
                    }
                    className="h-10 rounded-lg border px-3"
                  />
                </label>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() =>
                    setEvidence((items) => items.filter((_, itemIndex) => itemIndex !== index))
                  }
                >
                  Remove evidence
                </Button>
              </div>
            ))}
            <Button
              type="button"
              variant="outline"
              onClick={() => setEvidence((items) => [...items, { ...EMPTY_EVIDENCE }])}
              disabled={evidence.length >= 20}
            >
              {evidence.length >= 20 ? "Maximum evidence items reached" : "Add evidence"}
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Conflicts and independence</CardTitle>
            <CardDescription>
              Known Tenfo accounts listed here are excluded from your task recommendations. Always
              disclose task-specific interests directly before agreeing to a review.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <label className="grid gap-1 text-sm">
              <span>Known conflicting Tenfo usernames, comma-separated</span>
              <input
                value={conflictUsernamesText}
                onChange={(event) => setConflictUsernamesText(event.target.value)}
                placeholder="e.g. @example"
                className="h-10 rounded-lg border px-3"
              />
            </label>
            <label className="flex items-start gap-2 text-sm">
              <input
                type="checkbox"
                checked={conflictDisclosureConfirmed}
                onChange={(event) => setConflictDisclosureConfirmed(event.target.checked)}
                className="mt-1"
              />
              <span>
                I will disclose task-specific conflicts before accepting a review. Listing does not
                guarantee independence for every task.
              </span>
            </label>
          </CardContent>
        </Card>

        <div className="flex justify-end">
          <Button type="submit" disabled={saving}>
            {saving ? "Saving profile…" : "Save reviewer profile"}
          </Button>
        </div>
      </form>
    </div>
  );
}
