"use client";

import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  decideIndependentReview,
  listReviewerEngagements,
  submitIndependentReviewReport,
} from "@/lib/api/endpoints";
import type {
  IndependentReviewEngagementDto,
  IndependentReviewFindingDto,
} from "@/lib/api/types";

type FindingDraft = {
  outcome: IndependentReviewFindingDto["outcome"];
  rationale: string;
  evidenceDescription: string;
  evidenceUrl: string;
};

function emptyFindingDraft(): FindingDraft {
  return {
    outcome: "UNCERTAIN",
    rationale: "",
    evidenceDescription: "",
    evidenceUrl: "",
  };
}

export function ReviewerEngagementInbox() {
  const [engagements, setEngagements] = useState<IndependentReviewEngagementDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmNoConflict, setConfirmNoConflict] = useState(false);
  const [reportId, setReportId] = useState<string | null>(null);
  const [reportRationale, setReportRationale] = useState("");
  const [findings, setFindings] = useState<Record<string, FindingDraft>>({});

  const refresh = useCallback(async () => {
    const response = await listReviewerEngagements();
    setLoading(false);
    if (response.error) {
      setError(response.error.message);
      return;
    }
    setEngagements(response.data ?? []);
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const respond = async (
    engagement: IndependentReviewEngagementDto,
    decision: "accept" | "decline",
  ) => {
    setBusy(true);
    setError(null);
    const response = await decideIndependentReview(engagement.conversationId, engagement.id, {
      decision,
      ...(decision === "accept" ? { confirmNoConflict } : {}),
    });
    setBusy(false);
    if (response.error) {
      setError(response.error.message);
      return;
    }
    setConfirmNoConflict(false);
    await refresh();
  };

  const startReport = (engagement: IndependentReviewEngagementDto) => {
    setReportId(engagement.id);
    setReportRationale("");
    setFindings(
      Object.fromEntries(
        engagement.requirementKeys.map((key) => [
          key,
          emptyFindingDraft(),
        ]),
      ),
    );
  };

  const submitReport = async (engagement: IndependentReviewEngagementDto) => {
    const submission = engagement.latestSubmission;
    if (!submission) return;
    setBusy(true);
    setError(null);
    const response = await submitIndependentReviewReport(engagement.conversationId, engagement.id, {
      submissionId: submission.id,
      contractVersion: engagement.contractVersion,
      contractHash: engagement.contractHash,
      rationale: reportRationale,
      findings: engagement.requirementKeys.map((requirementKey) => {
        const finding = findings[requirementKey] ?? emptyFindingDraft();
        return {
          requirementKey,
          outcome: finding.outcome,
          rationale: finding.rationale,
          evidence: [
            {
              description: finding.evidenceDescription,
              ...(finding.evidenceUrl.trim() ? { url: finding.evidenceUrl.trim() } : {}),
            },
          ],
        };
      }),
    });
    setBusy(false);
    if (response.error) {
      setError(response.error.message);
      return;
    }
    setReportId(null);
    await refresh();
  };

  if (loading) return <p className="text-sm text-muted-foreground">Loading review engagements…</p>;

  return (
    <div className="space-y-4">
      {engagements.length === 0 ? (
        <p className="rounded-lg border border-border p-4 text-sm text-muted-foreground">
          No independent review invitations or engagements yet. A task participant must agree the
          review terms before you can accept an assignment.
        </p>
      ) : null}
      {engagements.map((engagement) => {
        const isPending = engagement.status === "AWAITING_REVIEWER";
        const isEngaged = engagement.status === "ENGAGED";
        const submission = engagement.latestSubmission;
        const reportOpen = reportId === engagement.id;
        return (
          <article key={engagement.id} className="space-y-4 rounded-lg border border-border p-4">
            <header>
              <p className="font-semibold">
                {engagement.contractContext?.title ?? "Review request"} · Contract v
                {engagement.contractVersion}
              </p>
              <p className="mt-1 text-sm text-muted-foreground">
                {engagement.domains.join(", ")} · {engagement.status.replaceAll("_", " ")}
              </p>
            </header>
            {engagement.contractContext ? (
              <section className="space-y-3 rounded-md bg-muted/40 p-3" aria-label="Agreed contract context">
                <div>
                  <h3 className="text-sm font-medium">Agreed work and review criteria</h3>
                  <p className="mt-1 whitespace-pre-wrap text-sm">
                    {engagement.contractContext.summary}
                  </p>
                </div>
                <ul className="space-y-2 text-sm">
                  {engagement.contractContext.requirements.map((requirement) => (
                    <li key={requirement.key} className="rounded border bg-background p-2">
                      <p className="font-medium">{requirement.key}: {requirement.statement}</p>
                      {requirement.reviewInstructions
                        .filter((rule) => rule.method === "HUMAN_REVIEW" && rule.instructions)
                        .map((rule, index) => (
                          <p key={`${requirement.key}-${index}`} className="mt-1 text-muted-foreground">
                            Review instructions: {rule.instructions}
                          </p>
                        ))}
                    </li>
                  ))}
                </ul>
                {engagement.contractContext.included.length ? (
                  <p className="text-sm">
                    <span className="font-medium">Included scope:</span>{" "}
                    {engagement.contractContext.included.join("; ")}
                  </p>
                ) : null}
                {engagement.contractContext.excluded.length ? (
                  <p className="text-sm">
                    <span className="font-medium">Excluded scope:</span>{" "}
                    {engagement.contractContext.excluded.join("; ")}
                  </p>
                ) : null}
                <p className="text-xs text-muted-foreground">
                  This material is the contract version explicitly accepted for this engagement
                  (SHA-256 {engagement.contractHash}).
                </p>
              </section>
            ) : null}
            <dl className="grid gap-2 text-sm sm:grid-cols-2">
              <div>
                <dt className="text-muted-foreground">Agreed criteria</dt>
                <dd>
                  {engagement.contractContext?.requirements
                    .map((requirement) => requirement.key)
                    .join(", ") ?? engagement.requirementKeys.join(", ")}
                </dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Fee arrangement</dt>
                <dd>
                  {engagement.feePayer}
                  {engagement.feeMinor !== null
                    ? ` · ${engagement.feeCurrency} ${(engagement.feeMinor / 100).toFixed(2)}`
                    : ""}
                </dd>
              </div>
            </dl>
            {isPending ? (
              <div className="space-y-3 rounded-md bg-muted/40 p-3">
                <p className="text-sm">
                  Accept only if these criteria, terms, and your independence are acceptable. A
                  reviewer report is attributable and may affect contractual acceptance.
                </p>
                <label className="flex items-start gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={confirmNoConflict}
                    onChange={(event) => setConfirmNoConflict(event.target.checked)}
                    className="mt-1"
                  />
                  <span>I have reviewed relevant relationships and confirm no undisclosed conflict.</span>
                </label>
                <div className="flex flex-wrap gap-2">
                  <Button
                    type="button"
                    disabled={busy || !confirmNoConflict}
                    onClick={() => void respond(engagement, "accept")}
                  >
                    Accept review assignment
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    disabled={busy}
                    onClick={() => void respond(engagement, "decline")}
                  >
                    Decline
                  </Button>
                </div>
              </div>
            ) : null}
            {isEngaged && submission ? (
              <div className="space-y-3">
                <p className="text-sm">
                  Current submission available for review
                  {submission.submittedAt ? ` · ${new Date(submission.submittedAt).toLocaleString()}` : ""}
                  . Your findings must address every criterion and include evidence.
                </p>
                {submission.notes ? (
                  <p className="whitespace-pre-wrap rounded-md bg-muted/40 p-3 text-sm">
                    Professional’s submission notes: {submission.notes}
                  </p>
                ) : null}
                {submission.artifacts.length > 0 ? (
                  <ul className="space-y-2 rounded-md border p-3 text-sm" aria-label="Submitted deliverables">
                    {submission.artifacts.map((artifact) => (
                      <li key={artifact.id} className="flex flex-wrap items-center justify-between gap-2">
                        <span>
                          {artifact.filename} · {(artifact.sizeBytes / 1024).toFixed(1)} KB · {artifact.type}
                        </span>
                        <a
                          href={`/api/v1/reviewer/engagements/${encodeURIComponent(engagement.id)}/artifacts/${encodeURIComponent(artifact.id)}`}
                          className="font-medium text-primary underline underline-offset-2"
                        >
                          Download securely
                        </a>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-sm text-destructive">
                    The submission has no attached deliverables, so review cannot proceed.
                  </p>
                )}
                {!reportOpen ? (
                  <Button
                    type="button"
                    disabled={submission.artifacts.length === 0}
                    onClick={() => startReport(engagement)}
                  >
                    Prepare review report
                  </Button>
                ) : (
                  <div className="space-y-4 border-t border-border pt-4">
                    <label className="grid gap-1 text-sm">
                      <span>Overall rationale (at least 20 characters)</span>
                      <textarea
                        rows={3}
                        value={reportRationale}
                        onChange={(event) => setReportRationale(event.target.value)}
                        className="rounded-md border border-input bg-background px-3 py-2"
                      />
                    </label>
                    {engagement.requirementKeys.map((key) => {
                      const finding = findings[key] ?? emptyFindingDraft();
                      const criterion = engagement.contractContext?.requirements.find(
                        (requirement) => requirement.key === key,
                      );
                      return (
                        <fieldset key={key} className="space-y-2 rounded-md border p-3">
                          <legend className="px-1 text-sm font-medium">
                            {key}
                            {criterion ? ` — ${criterion.statement}` : ""}
                          </legend>
                          <label className="grid gap-1 text-sm">
                            <span>Finding</span>
                            <select
                              value={finding.outcome}
                              onChange={(event) =>
                                setFindings((current) => ({
                                  ...current,
                                  [key]: {
                                    ...(current[key] ?? emptyFindingDraft()),
                                    outcome: event.target.value as FindingDraft["outcome"],
                                  },
                                }))
                              }
                              className="rounded-md border border-input bg-background px-3 py-2"
                            >
                              <option value="PASS">Meets criterion</option>
                              <option value="FAIL">Does not meet criterion</option>
                              <option value="UNCERTAIN">Unable to determine</option>
                            </select>
                          </label>
                          <label className="grid gap-1 text-sm">
                            <span>Reason (at least 5 characters)</span>
                            <textarea
                              rows={2}
                              value={finding.rationale}
                              onChange={(event) =>
                                setFindings((current) => ({
                                  ...current,
                                  [key]: {
                                    ...(current[key] ?? emptyFindingDraft()),
                                    rationale: event.target.value,
                                  },
                                }))
                              }
                              className="rounded-md border border-input bg-background px-3 py-2"
                            />
                          </label>
                          <label className="grid gap-1 text-sm">
                            <span>Evidence description (at least 5 characters)</span>
                            <input
                              value={finding.evidenceDescription}
                              onChange={(event) =>
                                setFindings((current) => ({
                                  ...current,
                                  [key]: {
                                    ...(current[key] ?? emptyFindingDraft()),
                                    evidenceDescription: event.target.value,
                                  },
                                }))
                              }
                              className="rounded-md border border-input bg-background px-3 py-2"
                            />
                          </label>
                          <label className="grid gap-1 text-sm">
                            <span>Evidence link (optional, HTTPS only)</span>
                            <input
                              type="url"
                              value={finding.evidenceUrl}
                              onChange={(event) =>
                                setFindings((current) => ({
                                  ...current,
                                  [key]: {
                                    ...(current[key] ?? emptyFindingDraft()),
                                    evidenceUrl: event.target.value,
                                  },
                                }))
                              }
                              className="rounded-md border border-input bg-background px-3 py-2"
                            />
                          </label>
                        </fieldset>
                      );
                    })}
                    <div className="flex flex-wrap gap-2">
                      <Button
                        type="button"
                        disabled={
                          busy ||
                          reportRationale.trim().length < 20 ||
                          engagement.requirementKeys.some(
                            (key) =>
                              (findings[key] ?? emptyFindingDraft()).rationale.trim().length < 5 ||
                              (findings[key] ?? emptyFindingDraft()).evidenceDescription.trim()
                                .length < 5,
                          )
                        }
                        onClick={() => void submitReport(engagement)}
                      >
                        Submit attributable report
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        disabled={busy}
                        onClick={() => setReportId(null)}
                      >
                        Cancel
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            ) : null}
            {engagement.reports.length ? (
              <p className="text-sm text-muted-foreground">
                Report submitted: {engagement.reports.at(-1)?.outcome}
              </p>
            ) : null}
          </article>
        );
      })}
      {error ? <p className="text-sm text-destructive" role="alert">{error}</p> : null}
    </div>
  );
}
