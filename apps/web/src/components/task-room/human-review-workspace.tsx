"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  ArrowUpRight,
  BadgeCheck,
  CalendarCheck2,
  Check,
  CircleHelp,
  ClipboardCheck,
  FileText,
  Link2,
  MessageSquareText,
  Paperclip,
  RotateCw,
  Scale,
  ShieldCheck,
  Sparkles,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  addWorkReviewContext,
  assessWorkReviewRequirement,
  decideWorkReview,
  listWorkReviews,
  openWorkReview,
} from "@/lib/api/endpoints";
import type {
  ExecutionDto,
  ProviderWorkRequirementDto,
  TaskStatus,
  WorkReviewAssessmentStatus,
  WorkReviewDto,
} from "@/lib/api/types";
import { cn } from "@/lib/utils";

const assessmentOptions: Array<{
  value: WorkReviewAssessmentStatus;
  label: string;
  hint: string;
  active: string;
}> = [
  {
    value: "MET",
    label: "Meets",
    hint: "Satisfied for this review",
    active: "border-emerald-500 bg-emerald-50 text-emerald-950",
  },
  {
    value: "PARTIAL",
    label: "Partly",
    hint: "Some parts remain",
    active: "border-amber-500 bg-amber-50 text-amber-950",
  },
  {
    value: "NOT_MET",
    label: "Not met",
    hint: "Does not satisfy it",
    active: "border-rose-500 bg-rose-50 text-rose-950",
  },
  {
    value: "UNCLEAR",
    label: "Unclear",
    hint: "Cannot determine yet",
    active: "border-violet-500 bg-violet-50 text-violet-950",
  },
  {
    value: "NOT_APPLICABLE",
    label: "N/A",
    hint: "Not relevant here",
    active: "border-slate-500 bg-slate-100 text-slate-950",
  },
];

export function RequirementAssessment({
  review,
  requirement,
  onChanged,
}: {
  review: WorkReviewDto;
  requirement: ProviderWorkRequirementDto;
  onChanged: (review: WorkReviewDto) => void;
}) {
  const existing = review.assessments.find(
    (assessment) =>
      assessment.requirementKey === requirement.key &&
      assessment.assessedByUserId === review.currentUserId,
  );
  const otherAssessments = review.assessments.filter(
    (assessment) =>
      assessment.requirementKey === requirement.key &&
      assessment.assessedByUserId !== review.currentUserId,
  );
  const [status, setStatus] = useState<WorkReviewAssessmentStatus | null>(existing?.status ?? null);
  const [rationale, setRationale] = useState(existing?.rationale ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setStatus(existing?.status ?? null);
    setRationale(existing?.rationale ?? "");
  }, [existing?.status, existing?.rationale]);

  const save = async () => {
    if (!status) return;
    setSaving(true);
    setError(null);
    const result = await assessWorkReviewRequirement(review.id, requirement.key, {
      status,
      ...(rationale.trim() ? { rationale: rationale.trim() } : {}),
    });
    setSaving(false);
    if (result.error || !result.data) {
      setError(result.error?.message ?? "Assessment could not be saved.");
      return;
    }
    onChanged(result.data);
  };

  return (
    <article className="rounded-2xl border border-slate-200 bg-white p-4 shadow-[0_12px_35px_-32px_rgba(15,23,42,0.8)]">
      <div className="flex items-start gap-3">
        <span className="mt-0.5 grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-slate-100 font-mono text-[10px] font-bold text-slate-600">
          {requirement.key.slice(0, 4).toUpperCase()}
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold leading-6 text-slate-950">{requirement.statement}</p>
          <p className="mt-0.5 text-[11px] text-slate-500">Agreement constraint</p>
        </div>
      </div>
      <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-5">
        {assessmentOptions.map((option) => (
          <button
            key={option.value}
            type="button"
            onClick={() => setStatus(option.value)}
            aria-pressed={status === option.value}
            className={cn(
              "rounded-xl border px-2 py-2 text-left transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500",
              status === option.value
                ? option.active
                : "border-slate-200 bg-slate-50 text-slate-600 hover:border-slate-300 hover:bg-white",
            )}
          >
            <span className="block text-xs font-bold">{option.label}</span>
            <span className="mt-0.5 block text-[10px] leading-4 opacity-75">{option.hint}</span>
          </button>
        ))}
      </div>
      {otherAssessments.length > 0 ? (
        <div className="mt-3 space-y-1 rounded-xl border border-violet-200 bg-violet-50 p-3 text-xs text-violet-950">
          {otherAssessments.map((assessment) => (
            <p key={assessment.id}>
              Agreed reviewer: {assessment.status.replaceAll("_", " ").toLowerCase()}
              {assessment.rationale ? ` · ${assessment.rationale}` : ""}
            </p>
          ))}
        </div>
      ) : null}
      <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-end">
        <label className="min-w-0 flex-1 text-xs font-medium text-slate-700">
          Review note {status === "MET" ? "(optional)" : "(required)"}
          <textarea
            value={rationale}
            onChange={(event) => setRationale(event.target.value)}
            rows={2}
            maxLength={4_000}
            placeholder="What did you inspect, observe, or remain unsure about?"
            className="mt-1.5 w-full resize-y rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm leading-5 outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/15"
          />
        </label>
        <Button
          type="button"
          variant="outline"
          disabled={!status || saving || (status !== "MET" && rationale.trim().length < 4)}
          onClick={() => void save()}
          className="sm:mb-0.5"
        >
          {saving ? "Saving…" : existing ? "Update assessment" : "Record assessment"}
        </Button>
      </div>
      {error ? (
        <p className="mt-2 text-xs text-rose-700" role="alert">
          {error}
        </p>
      ) : null}
    </article>
  );
}

export function HumanReviewWorkspace({
  taskId,
  taskStatus,
  execution,
  requirements,
  onChanged,
}: {
  taskId: string;
  taskStatus: TaskStatus;
  execution: ExecutionDto;
  requirements: ProviderWorkRequirementDto[];
  onChanged: () => void;
}) {
  const [reviews, setReviews] = useState<WorkReviewDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [kind, setKind] = useState<"CHECKPOINT" | "FINAL">("CHECKPOINT");
  const [title, setTitle] = useState("Progress checkpoint");
  const [openingNote, setOpeningNote] = useState("");
  const [responseWindowDays, setResponseWindowDays] = useState(5);
  const [selectedKeys, setSelectedKeys] = useState<string[]>([]);
  const [opening, setOpening] = useState(false);
  const [contextMode, setContextMode] = useState<"NOTE" | "LINK" | "FILE">("NOTE");
  const [contextLabel, setContextLabel] = useState("");
  const [contextNote, setContextNote] = useState("");
  const [contextUrl, setContextUrl] = useState("");
  const [addingContext, setAddingContext] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const [decisionReason, setDecisionReason] = useState("");
  const [riskAcknowledged, setRiskAcknowledged] = useState(false);
  const [showDissatisfaction, setShowDissatisfaction] = useState(false);
  const [dissatisfactionRemedy, setDissatisfactionRemedy] = useState<
    "REVISION" | "PAID_REVIEW" | "CANCEL" | "OTHER"
  >("REVISION");
  const [deciding, setDeciding] = useState<string | null>(null);

  const refresh = async () => {
    const result = await listWorkReviews(taskId);
    setLoading(false);
    if (result.error) {
      setError(result.error.message);
      return;
    }
    setReviews(result.data ?? []);
    setError(null);
  };

  useEffect(() => {
    void refresh();
    const timer = window.setInterval(() => void refresh(), 8_000);
    return () => window.clearInterval(timer);
  }, [taskId]);

  useEffect(() => {
    if (kind === "FINAL") {
      setTitle("Final work review");
      setSelectedKeys(
        requirements.filter((item) => item.acceptanceRelevant).map((item) => item.key),
      );
    } else {
      setTitle("Progress checkpoint");
      setSelectedKeys([]);
    }
  }, [kind, requirements]);

  const activeReview = reviews.find(
    (review) =>
      review.status === "REQUESTED" ||
      review.status === "PREPARING" ||
      review.status === "CLARIFICATION_REQUESTED" ||
      review.status === "READY_FOR_REVIEW" ||
      review.status === "REFERRED" ||
      review.status === "DISSATISFIED" ||
      review.status === "CLIENT_RESPONSE_OVERDUE",
  );
  const completedCheckpoints = reviews.filter((review) => review.status === "CHECKPOINT_ACCEPTED");
  const activeRequirements = activeReview
    ? activeReview.requirements.filter((requirement) =>
        activeReview.requirementKeys.includes(requirement.key),
      )
    : [];
  const packageReady =
    activeReview?.status === "READY_FOR_REVIEW" ||
    activeReview?.status === "REFERRED" ||
    activeReview?.status === "DISSATISFIED" ||
    activeReview?.status === "CLIENT_RESPONSE_OVERDUE";
  const canAssess = packageReady && activeReview?.status !== "REFERRED";
  const ambiguousAssessments = activeReview?.assessments.filter(
    (assessment) => assessment.status !== "MET",
  );
  const allAssessed = activeReview
    ? activeReview.requirementKeys.every((key) =>
        activeReview.assessments.some((assessment) => assessment.requirementKey === key),
      )
    : false;
  const canOpen =
    !activeReview && taskStatus === "WORK_IN_PROGRESS" && execution.status === "IN_PROGRESS";

  const openReview = async () => {
    setOpening(true);
    setError(null);
    const result = await openWorkReview(
      taskId,
      { kind, title, openingNote, requirementKeys: selectedKeys, responseWindowDays },
      crypto.randomUUID(),
    );
    setOpening(false);
    if (result.error) {
      setError(result.error.message);
      return;
    }
    setOpeningNote("");
    await refresh();
    onChanged();
  };

  const addContext = async () => {
    if (!activeReview) return;
    setAddingContext(true);
    setError(null);
    const input =
      contextMode === "NOTE"
        ? ({ type: "NOTE", note: contextNote, label: contextLabel || undefined } as const)
        : contextMode === "LINK"
          ? ({
              type: "LINK",
              label: contextLabel,
              url: contextUrl,
              note: contextNote || undefined,
            } as const)
          : fileRef.current?.files?.[0]
            ? ({
                type: "FILE",
                file: fileRef.current.files[0],
                label: contextLabel || undefined,
                note: contextNote || undefined,
              } as const)
            : null;
    if (!input) {
      setAddingContext(false);
      setError("Choose a file to add to the review context.");
      return;
    }
    const result = await addWorkReviewContext(activeReview.id, input);
    setAddingContext(false);
    if (result.error || !result.data) {
      setError(result.error?.message ?? "Review context could not be added.");
      return;
    }
    setReviews((current) =>
      current.map((review) => (review.id === result.data!.id ? result.data! : review)),
    );
    setContextLabel("");
    setContextNote("");
    setContextUrl("");
    if (fileRef.current) fileRef.current.value = "";
  };

  const decide = async (
    decision:
      | "ACCEPT_CHECKPOINT"
      | "ACCEPT_FINAL"
      | "REQUEST_CHANGES"
      | "CANCEL_REVIEW"
      | "REFER_TO_REVIEWER"
      | "EXPRESS_DISSATISFACTION",
  ) => {
    if (!activeReview) return;
    setDeciding(decision);
    setError(null);
    const result = await decideWorkReview(
      activeReview.id,
      {
        decision,
        reason: decisionReason,
        riskAcknowledged,
        ...(decision === "EXPRESS_DISSATISFACTION" ? { dissatisfactionRemedy } : {}),
      },
      crypto.randomUUID(),
    );
    setDeciding(null);
    if (result.error) {
      setError(result.error.message);
      return;
    }
    setDecisionReason("");
    setRiskAcknowledged(false);
    setShowDissatisfaction(false);
    await refresh();
    onChanged();
  };

  return (
    <div className="space-y-5">
      <section className="overflow-hidden rounded-2xl border border-slate-300 bg-white shadow-[0_22px_65px_-52px_rgba(15,23,42,0.95)]">
        <div className="bg-[radial-gradient(circle_at_top_right,#4f46e5_0%,#263461_34%,#111827_78%)] p-5 text-white sm:p-6">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-indigo-200">
                Review workspace
              </p>
              <h2 className="mt-1 text-xl font-semibold tracking-tight sm:text-2xl">
                Review work in its real context
              </h2>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-200">
                Use live links, notes, files, and the agreement constraints that matter for this
                review.
              </p>
            </div>
            <span className="inline-flex w-fit items-center gap-2 rounded-full border border-white/20 bg-white/10 px-3 py-1.5 text-xs font-semibold text-white backdrop-blur">
              <ShieldCheck className="h-4 w-4 text-emerald-300" /> Client decision
            </span>
          </div>
        </div>

        {completedCheckpoints.length > 0 ? (
          <div className="border-b border-slate-200 bg-emerald-50/60 px-5 py-4 sm:px-6">
            <p className="text-[10px] font-bold uppercase tracking-[0.15em] text-emerald-800">
              Accepted progress trail
            </p>
            <ol className="mt-2 flex gap-2 overflow-x-auto pb-1">
              {[...completedCheckpoints].reverse().map((review) => (
                <li
                  key={review.id}
                  className="min-w-52 rounded-xl border border-emerald-200 bg-white px-3 py-2"
                >
                  <p className="flex items-center gap-1.5 text-xs font-semibold text-emerald-900">
                    <CalendarCheck2 className="h-3.5 w-3.5" /> Checkpoint {review.sequence}
                  </p>
                  <p className="mt-1 truncate text-xs text-slate-700">{review.title}</p>
                </li>
              ))}
            </ol>
          </div>
        ) : null}

        {loading ? (
          <p className="p-6 text-sm text-slate-500" role="status">
            Opening the review…
          </p>
        ) : null}

        {!loading && canOpen ? (
          <div className="space-y-5 p-5 sm:p-6">
            <div className="grid gap-3 sm:grid-cols-2">
              <button
                type="button"
                onClick={() => setKind("CHECKPOINT")}
                aria-pressed={kind === "CHECKPOINT"}
                className={cn(
                  "rounded-2xl border p-4 text-left transition",
                  kind === "CHECKPOINT"
                    ? "border-indigo-500 bg-indigo-50 ring-2 ring-indigo-500/10"
                    : "border-slate-200 hover:border-slate-300",
                )}
              >
                <Sparkles className="h-5 w-5 text-indigo-700" />
                <span className="mt-2 block text-sm font-bold text-slate-950">
                  Progress checkpoint
                </span>
                <span className="mt-1 block text-xs leading-5 text-slate-600">
                  Ask for a focused package, record a milestone, then let work continue.
                </span>
              </button>
              <button
                type="button"
                onClick={() => setKind("FINAL")}
                aria-pressed={kind === "FINAL"}
                className={cn(
                  "rounded-2xl border p-4 text-left transition",
                  kind === "FINAL"
                    ? "border-emerald-500 bg-emerald-50 ring-2 ring-emerald-500/10"
                    : "border-slate-200 hover:border-slate-300",
                )}
              >
                <BadgeCheck className="h-5 w-5 text-emerald-700" />
                <span className="mt-2 block text-sm font-bold text-slate-950">Final review</span>
                <span className="mt-1 block text-xs leading-5 text-slate-600">
                  Request the context needed for the final acceptance decision.
                </span>
              </button>
            </div>

            <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(18rem,0.72fr)]">
              <div className="space-y-3">
                <label className="block text-xs font-semibold text-slate-700">
                  Name this review moment
                  <input
                    value={title}
                    onChange={(event) => setTitle(event.target.value)}
                    maxLength={160}
                    className="mt-1.5 h-11 w-full rounded-xl border border-slate-300 px-3 text-sm outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/15"
                  />
                </label>
                <label className="block text-xs font-semibold text-slate-700">
                  Client response window
                  <select
                    value={responseWindowDays}
                    onChange={(event) => setResponseWindowDays(Number(event.target.value))}
                    className="mt-1.5 h-10 w-full rounded-xl border border-slate-300 bg-white px-3 text-xs"
                  >
                    <option value={2}>2 days</option>
                    <option value={5}>5 days</option>
                    <option value={7}>7 days</option>
                    <option value={14}>14 days</option>
                    <option value={30}>30 days</option>
                  </select>
                </label>
                <label className="block text-xs font-semibold text-slate-700">
                  What should the professional prepare for review?
                  <textarea
                    value={openingNote}
                    onChange={(event) => setOpeningNote(event.target.value)}
                    rows={4}
                    maxLength={8_000}
                    placeholder="Example: Review the live staging site at the agreed breakpoint, including navigation, checkout flow, and mobile behavior."
                    className="mt-1.5 w-full resize-y rounded-xl border border-slate-300 px-3 py-2.5 text-sm leading-6 outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/15"
                  />
                </label>
              </div>
              <fieldset className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                <legend className="px-1 text-xs font-bold uppercase tracking-[0.12em] text-slate-600">
                  Agreement lenses
                </legend>
                <p className="mb-3 text-xs leading-5 text-slate-500">
                  Choose what this checkpoint covers. Final review includes every
                  acceptance-relevant constraint.
                </p>
                <div className="max-h-48 space-y-2 overflow-y-auto pr-1">
                  {requirements.map((requirement) => {
                    const checked = selectedKeys.includes(requirement.key);
                    return (
                      <label
                        key={requirement.key}
                        className="flex cursor-pointer items-start gap-2 rounded-lg border border-slate-200 bg-white p-2.5 text-xs leading-5 text-slate-700"
                      >
                        <input
                          type="checkbox"
                          checked={checked}
                          disabled={kind === "FINAL"}
                          onChange={(event) =>
                            setSelectedKeys((current) =>
                              event.target.checked
                                ? [...new Set([...current, requirement.key])]
                                : current.filter((key) => key !== requirement.key),
                            )
                          }
                          className="mt-1 h-4 w-4 accent-indigo-700"
                        />
                        <span>{requirement.statement}</span>
                      </label>
                    );
                  })}
                </div>
              </fieldset>
            </div>
            <Button
              type="button"
              className="min-h-11 bg-indigo-700 hover:bg-indigo-800"
              disabled={
                opening ||
                title.trim().length < 3 ||
                openingNote.trim().length < 8 ||
                selectedKeys.length === 0
              }
              onClick={() => void openReview()}
            >
              <ClipboardCheck className="mr-2 h-4 w-4" />
              {opening
                ? "Sending request…"
                : kind === "FINAL"
                  ? "Request final review package"
                  : "Request checkpoint package"}
            </Button>
          </div>
        ) : null}

        {!loading && !activeReview && !canOpen ? (
          <div className="p-5 sm:p-6">
            <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-6 text-center">
              <CircleHelp className="mx-auto h-7 w-7 text-slate-400" />
              <p className="mt-2 text-sm font-semibold text-slate-900">No review window is open</p>
              <p className="mx-auto mt-1 max-w-xl text-xs leading-5 text-slate-600">
                Reviews can begin after the professional starts work. They are opened by the client,
                not triggered by an upload or a platform judgment.
              </p>
            </div>
          </div>
        ) : null}
      </section>

      {activeReview ? (
        <section className="space-y-5 rounded-2xl border border-slate-300 bg-slate-50/70 p-4 sm:p-6">
          <div className="flex flex-col gap-3 border-b border-slate-200 pb-4 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <p className="text-[10px] font-bold uppercase tracking-[0.15em] text-indigo-700">
                {activeReview.kind === "FINAL"
                  ? "Final review"
                  : `Checkpoint ${activeReview.sequence}`}
              </p>
              <h3 className="mt-1 text-xl font-semibold text-slate-950">{activeReview.title}</h3>
              <p className="mt-2 max-w-3xl whitespace-pre-wrap text-sm leading-6 text-slate-600">
                {activeReview.openingNote}
              </p>
            </div>
            <span className="inline-flex w-fit rounded-full bg-white px-3 py-1 text-xs font-semibold text-slate-700 shadow-sm">
              {activeReview.status === "REFERRED"
                ? "With agreed reviewer"
                : activeReview.status === "DISSATISFIED"
                  ? "Dissatisfaction recorded"
                  : activeReview.status === "CLIENT_RESPONSE_OVERDUE"
                    ? "Response overdue"
                : activeReview.status === "READY_FOR_REVIEW"
                  ? "Package ready"
                  : activeReview.status === "CLARIFICATION_REQUESTED"
                    ? "Clarification requested"
                    : "Provider preparing package"}
            </span>
          </div>

          {activeReview.status === "CLIENT_RESPONSE_OVERDUE" ? (
            <div className="rounded-2xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-950">
              The agreed response window has passed. You can still record a decision; the
              professional can also record the delay and request resolution.
            </div>
          ) : null}
          {activeReview.status === "DISSATISFIED" ? (
            <div className="rounded-2xl border border-rose-300 bg-rose-50 p-4">
              <p className="text-sm font-semibold text-rose-950">Resolution is in progress</p>
              <p className="mt-1 text-xs leading-5 text-rose-900">
                Requested remedy: {activeReview.dissatisfactionRemedy?.replaceAll("_", " ").toLowerCase()}.
                Payment release remains blocked.
              </p>
              {activeReview.providerResponseNote ? (
                <p className="mt-3 whitespace-pre-wrap rounded-xl bg-white/70 p-3 text-xs leading-5 text-rose-950">
                  Professional response: {activeReview.providerResponseNote}
                </p>
              ) : null}
            </div>
          ) : null}

          {!packageReady ? (
            <div
              className={cn(
                "rounded-2xl border p-4",
                activeReview.status === "CLARIFICATION_REQUESTED"
                  ? "border-amber-300 bg-amber-50"
                  : "border-indigo-200 bg-indigo-50",
              )}
            >
              <p className="text-sm font-semibold text-slate-950">
                {activeReview.status === "CLARIFICATION_REQUESTED"
                  ? "The professional needs more context"
                  : "Review request sent"}
              </p>
              <p className="mt-1 text-xs leading-5 text-slate-700">
                {activeReview.status === "CLARIFICATION_REQUESTED"
                  ? activeReview.providerResponseSummary
                  : "The professional can assemble the package from notes, live links, and optional files."}
              </p>
            </div>
          ) : activeReview.providerResponseSummary ? (
            <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4">
              <p className="text-xs font-bold uppercase tracking-[0.12em] text-emerald-800">
                Professional response
              </p>
              <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-emerald-950">
                {activeReview.providerResponseSummary}
              </p>
              {activeReview.packageHash ? (
                <p className="mt-2 font-mono text-[10px] text-emerald-800">
                  Package {activeReview.packageHash.slice(0, 12)}
                </p>
              ) : null}
            </div>
          ) : null}
          {activeReview.responseDueAt &&
          ["READY_FOR_REVIEW", "CLIENT_RESPONSE_OVERDUE"].includes(activeReview.status) ? (
            <p className="text-xs font-medium text-slate-500">
              Response due {new Date(activeReview.responseDueAt).toLocaleString()}
            </p>
          ) : null}
          {activeReview.reviewerSummary ? (
            <div className="rounded-2xl border border-violet-200 bg-violet-50 p-4">
              <p className="text-xs font-bold uppercase tracking-[0.12em] text-violet-800">
                Paid reviewer summary
              </p>
              <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-violet-950">
                {activeReview.reviewerSummary}
              </p>
            </div>
          ) : null}

          <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_20rem]">
            <div className="space-y-3">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <h4 className="text-sm font-bold text-slate-900">Review context ledger</h4>
                  <p className="text-xs text-slate-500">
                    Request resources and the professional's package stay together here.
                  </p>
                </div>
                <span className="text-xs font-semibold text-slate-500">
                  {activeReview.items.length} item{activeReview.items.length === 1 ? "" : "s"}
                </span>
              </div>
              {activeReview.items.length > 0 ? (
                <ol className="space-y-2">
                  {activeReview.items.map((item) => (
                    <li key={item.id} className="rounded-xl border border-slate-200 bg-white p-3">
                      <div className="flex items-start gap-3">
                        <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-indigo-50 text-indigo-700">
                          {item.type === "LINK" ? (
                            <Link2 className="h-4 w-4" />
                          ) : item.type === "FILE" ? (
                            <FileText className="h-4 w-4" />
                          ) : (
                            <MessageSquareText className="h-4 w-4" />
                          )}
                        </span>
                        <div className="min-w-0 flex-1">
                          <p className="text-xs font-semibold text-slate-900">
                            {item.label || (item.type === "NOTE" ? "Review note" : item.filename)}
                            {item.authorUserId === activeReview.providerUserId
                              ? " · Professional"
                              : " · Client"}
                          </p>
                          {item.note ? (
                            <p className="mt-1 whitespace-pre-wrap text-xs leading-5 text-slate-600">
                              {item.note}
                            </p>
                          ) : null}
                          {item.type === "LINK" && item.url ? (
                            <a
                              href={item.url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="mt-2 inline-flex items-center gap-1 text-xs font-semibold text-indigo-700 hover:underline"
                            >
                              Open live context <ArrowUpRight className="h-3.5 w-3.5" />
                            </a>
                          ) : null}
                          {item.type === "FILE" && item.downloadUrl ? (
                            <a
                              href={item.downloadUrl}
                              className="mt-2 inline-flex items-center gap-1 text-xs font-semibold text-indigo-700 hover:underline"
                            >
                              Download {item.filename} <ArrowUpRight className="h-3.5 w-3.5" />
                            </a>
                          ) : null}
                        </div>
                      </div>
                    </li>
                  ))}
                </ol>
              ) : (
                <div className="rounded-xl border border-dashed border-slate-300 bg-white p-4 text-xs leading-5 text-slate-500">
                  The opening note is the first context. Add a live URL for website or system work,
                  a note for observed behavior, or a file only when a file is actually useful.
                </div>
              )}
            </div>

            <aside className="rounded-2xl border border-slate-200 bg-white p-4">
              <p className="text-xs font-bold uppercase tracking-[0.12em] text-slate-600">
                Add request context
              </p>
              <div className="mt-3 grid grid-cols-3 gap-1 rounded-lg bg-slate-100 p-1">
                {(
                  [
                    ["NOTE", "Note"],
                    ["LINK", "Link"],
                    ["FILE", "File"],
                  ] as const
                ).map(([value, label]) => (
                  <button
                    key={value}
                    type="button"
                    onClick={() => setContextMode(value)}
                    className={cn(
                      "rounded-md px-2 py-1.5 text-xs font-semibold transition",
                      contextMode === value
                        ? "bg-white text-slate-950 shadow-sm"
                        : "text-slate-500",
                    )}
                  >
                    {label}
                  </button>
                ))}
              </div>
              <div className="mt-3 space-y-2.5">
                {contextMode !== "NOTE" ? (
                  <input
                    value={contextLabel}
                    onChange={(event) => setContextLabel(event.target.value)}
                    placeholder={
                      contextMode === "LINK" ? "What this link shows" : "File label (optional)"
                    }
                    className="h-10 w-full rounded-lg border border-slate-300 px-3 text-xs outline-none focus:border-indigo-500"
                  />
                ) : null}
                {contextMode === "LINK" ? (
                  <input
                    value={contextUrl}
                    onChange={(event) => setContextUrl(event.target.value)}
                    placeholder="https://staging.example.com/page"
                    inputMode="url"
                    className="h-10 w-full rounded-lg border border-slate-300 px-3 text-xs outline-none focus:border-indigo-500"
                  />
                ) : null}
                {contextMode === "FILE" ? (
                  <label className="flex min-h-20 cursor-pointer flex-col items-center justify-center rounded-xl border border-dashed border-slate-300 bg-slate-50 px-3 text-center text-xs text-slate-600">
                    <Paperclip className="mb-1 h-4 w-4" />
                    <span>Choose a useful file, up to 25 MB</span>
                    <input ref={fileRef} type="file" className="sr-only" />
                  </label>
                ) : null}
                <textarea
                  value={contextNote}
                  onChange={(event) => setContextNote(event.target.value)}
                  rows={3}
                  placeholder={
                    contextMode === "NOTE"
                      ? "Record what you observed, tried, or need clarified."
                      : "Optional context for this item"
                  }
                  className="w-full resize-y rounded-lg border border-slate-300 px-3 py-2 text-xs leading-5 outline-none focus:border-indigo-500"
                />
                <Button
                  type="button"
                  variant="outline"
                  className="w-full"
                  disabled={
                    addingContext ||
                    (contextMode === "NOTE" && !contextNote.trim()) ||
                    (contextMode === "LINK" && (!contextLabel.trim() || !contextUrl.trim()))
                  }
                  onClick={() => void addContext()}
                >
                  {addingContext ? "Adding…" : `Add ${contextMode.toLowerCase()}`}
                </Button>
              </div>
            </aside>
          </div>

          {activeReview.status === "REFERRED" ? (
            <div className="rounded-2xl border border-violet-200 bg-violet-50 p-4 text-sm text-violet-950">
              The agreed reviewer is assessing this package. Their decision and notes will appear in
              this review record.
            </div>
          ) : null}

          {canAssess ? (
            <div className="space-y-3 border-t border-slate-200 pt-5">
              <div>
                <h4 className="text-sm font-bold text-slate-900">Review against the agreement</h4>
                <p className="mt-1 text-xs leading-5 text-slate-500">
                  Record what you found and preserve uncertainty where the answer is not clear.
                </p>
              </div>
              {activeRequirements.map((requirement) => (
                <RequirementAssessment
                  key={requirement.key}
                  review={activeReview}
                  requirement={requirement}
                  onChanged={(updated) =>
                    setReviews((current) =>
                      current.map((review) => (review.id === updated.id ? updated : review)),
                    )
                  }
                />
              ))}
            </div>
          ) : null}

          {canAssess ? (
            <div className="rounded-2xl border border-slate-300 bg-white p-4 sm:p-5">
              <div className="flex items-start gap-3">
                <Scale className="mt-0.5 h-5 w-5 shrink-0 text-indigo-700" />
                <div>
                  <h4 className="text-sm font-bold text-slate-950">Record the review decision</h4>
                  <p className="mt-1 text-xs leading-5 text-slate-600">
                    A completed checkpoint records progress. Final acceptance unlocks the separate
                    payment-release policy.
                  </p>
                </div>
              </div>
              <textarea
                value={decisionReason}
                onChange={(event) => setDecisionReason(event.target.value)}
                rows={3}
                maxLength={4_000}
                placeholder="Explain what you reviewed, what remains ambiguous, and why this decision is appropriate."
                className="mt-4 w-full resize-y rounded-xl border border-slate-300 px-3 py-2.5 text-sm leading-6 outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/15"
              />
              {(ambiguousAssessments?.length ?? 0) > 0 ? (
                <label className="mt-3 flex cursor-pointer items-start gap-2.5 rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs leading-5 text-amber-950">
                  <input
                    type="checkbox"
                    checked={riskAcknowledged}
                    onChange={(event) => setRiskAcknowledged(event.target.checked)}
                    className="mt-1 h-4 w-4 accent-amber-700"
                  />
                  I see {ambiguousAssessments?.length} partial, unmet, unclear, or waived constraint
                  {ambiguousAssessments?.length === 1 ? "" : "s"} and intentionally account for them
                  in my decision.
                </label>
              ) : null}
              {showDissatisfaction ? (
                <div className="mt-3 space-y-3 rounded-2xl border border-rose-300 bg-rose-50 p-4">
                  <div>
                    <p className="text-sm font-semibold text-rose-950">Record dissatisfaction</p>
                    <p className="mt-1 text-xs leading-5 text-rose-900">
                      Identify partial, unmet, or unclear constraints above, explain the problem, and
                      choose the outcome you are asking the professional to consider.
                    </p>
                  </div>
                  <label className="block text-xs font-semibold text-rose-950">
                    Requested remedy
                    <select
                      value={dissatisfactionRemedy}
                      onChange={(event) =>
                        setDissatisfactionRemedy(
                          event.target.value as typeof dissatisfactionRemedy,
                        )
                      }
                      className="mt-1.5 h-10 w-full rounded-xl border border-rose-300 bg-white px-3 text-xs"
                    >
                      <option value="REVISION">Revision against the current agreement</option>
                      <option value="PAID_REVIEW">Use the agreed paid reviewer</option>
                      <option value="CANCEL">Discuss cancellation</option>
                      <option value="OTHER">Propose another resolution</option>
                    </select>
                  </label>
                  <div className="flex flex-wrap gap-2">
                    <Button
                      type="button"
                      className="bg-rose-700 hover:bg-rose-800"
                      disabled={
                        deciding !== null ||
                        decisionReason.trim().length < 20 ||
                        !allAssessed ||
                        !(activeReview.assessments ?? []).some((assessment) =>
                          ["PARTIAL", "NOT_MET", "UNCLEAR"].includes(assessment.status),
                        )
                      }
                      onClick={() => void decide("EXPRESS_DISSATISFACTION")}
                    >
                      {deciding === "EXPRESS_DISSATISFACTION"
                        ? "Recording…"
                        : "Record dissatisfaction"}
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      onClick={() => setShowDissatisfaction(false)}
                    >
                      Keep reviewing
                    </Button>
                  </div>
                </div>
              ) : null}
              <div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
                <Button
                  type="button"
                  disabled={
                    deciding !== null ||
                    decisionReason.trim().length < 8 ||
                    !allAssessed ||
                    ((ambiguousAssessments?.length ?? 0) > 0 && !riskAcknowledged)
                  }
                  className="bg-emerald-700 hover:bg-emerald-800"
                  onClick={() =>
                    void decide(
                      activeReview.kind === "FINAL" ? "ACCEPT_FINAL" : "ACCEPT_CHECKPOINT",
                    )
                  }
                >
                  <Check className="mr-2 h-4 w-4" />
                  {deciding?.startsWith("ACCEPT")
                    ? "Recording…"
                    : activeReview.kind === "FINAL"
                      ? "Accept final work"
                      : "Complete checkpoint"}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  disabled={deciding !== null || decisionReason.trim().length < 8}
                  onClick={() => void decide("REQUEST_CHANGES")}
                >
                  Request changes
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  disabled={deciding !== null || decisionReason.trim().length < 8}
                  onClick={() => void decide("REFER_TO_REVIEWER")}
                >
                  Refer to paid reviewer
                </Button>
                {activeReview.kind === "FINAL" &&
                activeReview.status !== "DISSATISFIED" ? (
                  <Button
                    type="button"
                    variant="outline"
                    disabled={deciding !== null || !allAssessed}
                    onClick={() => setShowDissatisfaction(true)}
                    className="border-rose-300 text-rose-800 hover:bg-rose-50"
                  >
                    I am dissatisfied
                  </Button>
                ) : activeReview.status !== "DISSATISFIED" ? (
                  <Button
                    type="button"
                    variant="ghost"
                    disabled={deciding !== null || decisionReason.trim().length < 8}
                    onClick={() => void decide("CANCEL_REVIEW")}
                  >
                    Close without decision
                  </Button>
                ) : null}
              </div>
              <p className="mt-3 text-xs text-slate-500">
                Need a specialist opinion?{" "}
                <Link
                  href={
                    activeReview.conversationId
                      ? `/messages?conversation=${encodeURIComponent(activeReview.conversationId)}`
                      : `/reviewers?taskId=${encodeURIComponent(taskId)}`
                  }
                  className="font-semibold text-indigo-700 hover:underline"
                >
                  Set up a paid reviewer
                </Link>
                . Their review stays attached to this task.
              </p>
            </div>
          ) : null}
        </section>
      ) : null}

      {error ? (
        <div
          className="flex items-start justify-between gap-3 rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-900"
          role="alert"
        >
          <span>{error}</span>
          <button type="button" onClick={() => void refresh()} aria-label="Retry review request">
            <RotateCw className="h-4 w-4" />
          </button>
        </div>
      ) : null}
    </div>
  );
}
