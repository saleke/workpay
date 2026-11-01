"use client";

import { useEffect, useMemo, useState, type FormEvent } from "react";
import { z } from "zod";
import { ArrowRight, Check, CircleHelp, LoaderCircle, RotateCcw, Sparkles } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  BETA_CONTRACT_CURRENCY,
  budgetUsesBetaContractCurrency,
  budgetMeaningSchema,
  intakeVersionSchema,
  isPricedBetaContractBudget,
  professionalBriefDraftSchema,
  type BudgetMeaning,
  type IntakeVersion,
} from "@workpay/shared/domain/intake/model";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { createTaskFromApprovedIntake } from "@/lib/api/endpoints";

const SESSION_STORAGE_KEY = "workpay:intake:last-session:v1";

const intakeResponseSchema = z.object({
  data: z.object({
    sessionId: z.string().min(1),
    version: z.number().int().positive(),
    status: z.enum(["DRAFT", "READY", "APPROVED"]),
    originalRequest: z.string(),
    intake: intakeVersionSchema,
    readiness: z.object({
      ready: z.boolean(),
      blockers: z.array(z.string()),
    }),
  }),
});

type IntakeSession = z.infer<typeof intakeResponseSchema>["data"];
type ProfessionalBriefDraft = z.infer<typeof professionalBriefDraftSchema>;
type IntakeError = {
  message: string;
  code?: string;
  canForgetSavedShortcut?: boolean;
};
type BudgetOption = "proposal" | "undecided" | "ceiling" | "target" | "range";
type BusyAction =
  | "restore"
  | "create"
  | "interpret"
  | "confirm"
  | "scope"
  | "options"
  | "brief"
  | "save-brief"
  | "answer"
  | "budget"
  | "approve"
  | "reopen-budget"
  | "task"
  | null;

const stages = ["Your request", "Understanding", "Core details", "Budget", "Review and approve"];

class IntakeRequestError extends Error {
  constructor(
    message: string,
    readonly code?: string,
  ) {
    super(message);
    this.name = "IntakeRequestError";
  }
}

function getErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message.trim()) return error.message;
  return "Something went wrong. Your saved intake has not been discarded. Please try again.";
}

function getIntakeError(error: unknown): IntakeError {
  if (error instanceof IntakeRequestError) {
    return { message: error.message, ...(error.code ? { code: error.code } : {}) };
  }
  return { message: getErrorMessage(error) };
}

async function requestIntake(url: string, init?: RequestInit): Promise<IntakeSession> {
  const response = await fetch(url, {
    ...init,
    credentials: "same-origin",
    headers: {
      ...(init?.headers ?? {}),
      ...(init?.body ? { "Content-Type": "application/json" } : {}),
    },
    cache: "no-store",
  });

  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    throw new Error("WorkPay returned an unreadable response. Your saved intake is unchanged.");
  }

  if (!response.ok) {
    const errorResponse = z
      .object({ error: z.object({ message: z.string(), code: z.string().optional() }) })
      .safeParse(payload);
    throw new IntakeRequestError(
      errorResponse.success
        ? errorResponse.data.error.message
        : "WorkPay could not complete that step. Your saved intake is unchanged.",
      errorResponse.success ? errorResponse.data.error.code : undefined,
    );
  }

  const parsed = intakeResponseSchema.safeParse(payload);
  if (!parsed.success) {
    throw new Error("WorkPay returned an invalid intake response. Your saved draft is unchanged.");
  }
  return parsed.data.data;
}

function currencyDigits(currency: string): number | null {
  try {
    const digits = new Intl.NumberFormat("en-US", { style: "currency", currency }).resolvedOptions()
      .maximumFractionDigits;
    return typeof digits === "number" ? digits : null;
  } catch {
    return null;
  }
}

function formatAmount(amount: { amountMinor: number; currency: string }): string {
  const digits = currencyDigits(amount.currency);
  if (digits === null) return `${amount.currency} ${amount.amountMinor}`;
  return new Intl.NumberFormat(undefined, {
    style: "currency",
    currency: amount.currency,
    maximumFractionDigits: digits,
  }).format(amount.amountMinor / 10 ** digits);
}

function describeBudget(meaning: BudgetMeaning): string {
  switch (meaning.state) {
    case "not_provided":
      return "No budget was found in the details you shared.";
    case "undecided":
      return "You have not decided on a budget yet.";
    case "ceiling":
      return `Your maximum budget is ${formatAmount(meaning.amount)}.`;
    case "target":
      return `Your target budget is ${formatAmount(meaning.amount)}.`;
    case "range":
      return `Your budget range is ${formatAmount(meaning.minimum)} to ${formatAmount(meaning.maximum)}.`;
    case "ambiguous":
      return `More than one budget amount was mentioned: ${meaning.mentionedAmounts.map(formatAmount).join(", ")}.`;
  }
}

function toProfessionalBriefDraft(
  brief: NonNullable<IntakeVersion["professionalBrief"]>,
): ProfessionalBriefDraft {
  return {
    title: brief.title.text,
    goalAndContext: brief.goalAndContext.text,
    deliverables: brief.deliverables.map(({ text }) => text),
    requirements: brief.requirements.map(({ text }) => text),
    boundaries: brief.boundaries.map(({ text }) => text),
    inputsAndDependencies: brief.inputsAndDependencies.map(({ text }) => text),
    timing: brief.timing?.text ?? "",
  };
}

function getCurrentQuestion(version: IntakeVersion) {
  return version.scopeAssessment?.criticalUnknowns.find(({ id }) =>
    version.unresolvedCriticalUnknownIds.includes(id),
  );
}

function getStageIndex(session: IntakeSession): number {
  const { intake, status } = session;
  if (status === "APPROVED") return 4;
  if (
    intake.scopeAssessment &&
    intake.scopeAssessment.criticalUnknowns.length === 0 &&
    intake.unresolvedCriticalUnknownIds.length === 0
  ) {
    return intake.budget.confirmationSourceId ? 4 : 3;
  }
  if (intake.interpretationConfirmationSourceId) return 2;
  if (intake.interpretation) return 1;
  return 0;
}

function blockerMessage(blocker: string): string {
  switch (blocker) {
    case "interpretation_missing":
      return "The request still needs an interpretation.";
    case "interpretation_not_confirmed":
      return "Review and confirm the interpretation first.";
    case "objective_not_confirmed":
      return "The main outcome is not clear yet. Correct the interpretation with the outcome you want.";
    case "facts_unconfirmed":
      return "Some details need your confirmation.";
    case "scope_assessment_missing":
      return "The essential scope questions have not been checked yet.";
    case "budget_not_confirmed":
      return "Choose or confirm a budget state.";
    case "budget_not_provided":
      return "The budget is still missing. You can set an amount or explicitly say it is undecided.";
    case "budget_undecided":
      return "A specific USD target, ceiling, or range is required before contract review.";
    case "budget_ambiguous":
      return "The budget details conflict. Choose the budget you want to use.";
    case "critical_unknowns_unresolved":
      return "Answer the remaining essential scope question.";
    default:
      return "One more detail is needed before this brief can be approved.";
  }
}

export function IntakeWorkspace() {
  const router = useRouter();
  const [session, setSession] = useState<IntakeSession | null>(null);
  const [restoring, setRestoring] = useState(true);
  const [busy, setBusy] = useState<BusyAction>(null);
  const [error, setError] = useState<IntakeError | null>(null);
  const [requestText, setRequestText] = useState("");
  const [correction, setCorrection] = useState("");
  const [showCorrection, setShowCorrection] = useState(false);
  const [answer, setAnswer] = useState("");
  const [showAnswerOptions, setShowAnswerOptions] = useState(false);
  const [professionalBriefDraft, setProfessionalBriefDraft] =
    useState<ProfessionalBriefDraft | null>(null);
  const [editingProfessionalBrief, setEditingProfessionalBrief] = useState(false);
  const [budgetOption, setBudgetOption] = useState<BudgetOption>("proposal");
  const [editingBudget, setEditingBudget] = useState(false);
  const [currency] = useState(BETA_CONTRACT_CURRENCY);
  const [minimum, setMinimum] = useState("");
  const [maximum, setMaximum] = useState("");
  const [storageWarning, setStorageWarning] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    let sessionId: string | null;
    try {
      sessionId = window.localStorage.getItem(SESSION_STORAGE_KEY);
    } catch {
      setStorageWarning(
        "This browser cannot save a draft link. Your saved intake will remain on your account, but you may need to reopen it from another device or browser.",
      );
      setRestoring(false);
      return () => {
        active = false;
      };
    }
    if (!sessionId) {
      setRestoring(false);
      return () => {
        active = false;
      };
    }

    setBusy("restore");
    void requestIntake(`/api/v1/intake/sessions/${encodeURIComponent(sessionId)}`)
      .then((saved) => {
        if (active) setSession(saved);
      })
      .catch((restoreError: unknown) => {
        if (active) {
          const failure = getIntakeError(restoreError);
          setError({
            ...failure,
            canForgetSavedShortcut: failure.code === "NOT_FOUND",
          });
        }
      })
      .finally(() => {
        if (active) {
          setBusy(null);
          setRestoring(false);
        }
      });

    return () => {
      active = false;
    };
  }, []);

  const version = session?.intake ?? null;
  const currentQuestion = version ? getCurrentQuestion(version) : undefined;
  const needsScopeRecheck = Boolean(
    version?.scopeAssessment &&
    version.scopeAssessment.criticalUnknowns.length > 0 &&
    version.unresolvedCriticalUnknownIds.length === 0,
  );
  const hasExplainedAnswerOptions = Boolean(
    currentQuestion?.answerOptions.some((option) => typeof option !== "string"),
  );
  const budgetReadyForDecision = Boolean(
    version?.scopeAssessment &&
    version.scopeAssessment.criticalUnknowns.length === 0 &&
    version.unresolvedCriticalUnknownIds.length === 0,
  );
  const suggestedBudget = version?.scopeAssessment?.budget.meaning ?? null;
  const suggestedBudgetCanFundBetaContract = Boolean(
    suggestedBudget && isPricedBetaContractBudget(suggestedBudget),
  );
  const stageIndex = session ? getStageIndex(session) : 0;
  const progress = session
    ? session.status === "APPROVED"
      ? 100
      : Math.round((stageIndex / stages.length) * 100)
    : 0;

  const updateSession = async (
    action: Exclude<BusyAction, "restore" | "create" | null>,
    path: string,
    body: unknown,
  ): Promise<IntakeSession | null> => {
    if (!session) return null;
    setBusy(action);
    setError(null);
    try {
      const updated = await requestIntake(
        `/api/v1/intake/sessions/${encodeURIComponent(session.sessionId)}${path}`,
        { method: "POST", body: JSON.stringify(body) },
      );
      setSession(updated);
      return updated;
    } catch (requestError) {
      setError(getIntakeError(requestError));
      return null;
    } finally {
      setBusy(null);
    }
  };

  const handleCreate = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const originalRequest = requestText;
    if (!originalRequest.trim()) {
      setError({ message: "Describe what you need done before continuing." });
      return;
    }
    setBusy("create");
    setError(null);
    try {
      const created = await requestIntake("/api/v1/intake/sessions", {
        method: "POST",
        body: JSON.stringify({ originalRequest }),
      });
      setSession(created);
      setRequestText("");
      try {
        window.localStorage.setItem(SESSION_STORAGE_KEY, created.sessionId);
        setStorageWarning(null);
      } catch {
        setStorageWarning(
          "Your request is saved to your account, but this browser cannot save a shortcut for reopening it.",
        );
      }
    } catch (createError) {
      setError(getIntakeError(createError));
    } finally {
      setBusy(null);
    }
  };

  const handleInterpret = () => {
    if (!session) return;
    void updateSession("interpret", "/interpret", { expectedVersion: session.version });
  };

  const handleInterpretationDecision = async (decision: "confirm" | "correct") => {
    if (!session) return;
    const body =
      decision === "correct"
        ? { expectedVersion: session.version, decision, correction }
        : { expectedVersion: session.version, decision };
    const updated = await updateSession("confirm", "/interpretation", body);
    if (updated && decision === "correct") {
      setCorrection("");
      setShowCorrection(false);
      await updateSession("interpret", "/interpret", { expectedVersion: updated.version });
    }
  };

  const handleScopeAssessment = () => {
    if (!session) return;
    void updateSession("scope", "/scope", { expectedVersion: session.version });
  };

  const handleComposeProfessionalBrief = async () => {
    if (!session) return;
    const updated = await updateSession("brief", "/professional-brief", {
      expectedVersion: session.version,
    });
    if (updated?.intake.professionalBrief) {
      setProfessionalBriefDraft(toProfessionalBriefDraft(updated.intake.professionalBrief));
      setEditingProfessionalBrief(false);
    }
  };

  const handleSaveProfessionalBrief = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!session || !professionalBriefDraft) return;
    const updated = await updateSession("save-brief", "/professional-brief/edit", {
      expectedVersion: session.version,
      brief: professionalBriefDraft,
    });
    if (updated?.intake.professionalBrief) {
      setProfessionalBriefDraft(toProfessionalBriefDraft(updated.intake.professionalBrief));
      setEditingProfessionalBrief(false);
    }
  };

  const handleSuggestAnswerOptions = async () => {
    if (!session || !currentQuestion) return;
    const updated = await updateSession(
      "options",
      `/unknowns/${encodeURIComponent(currentQuestion.id)}/options`,
      { expectedVersion: session.version },
    );
    if (updated) setShowAnswerOptions(true);
  };

  const handleHelpMeChoose = () => {
    if (hasExplainedAnswerOptions) {
      setShowAnswerOptions((shown) => !shown);
      return;
    }
    void handleSuggestAnswerOptions();
  };

  const handleAnswer = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!session || !currentQuestion || !answer.trim()) return;
    const updated = await updateSession(
      "answer",
      `/unknowns/${encodeURIComponent(currentQuestion.id)}/answer`,
      {
        expectedVersion: session.version,
        answer,
      },
    );
    if (!updated) return;
    setAnswer("");
    setShowAnswerOptions(false);
    if (
      updated.intake.unresolvedCriticalUnknownIds.length === 0 &&
      updated.intake.scopeAssessment?.criticalUnknowns.length
    ) {
      await updateSession("scope", "/scope", { expectedVersion: updated.version });
    }
  };

  const selectedBudget = useMemo((): BudgetMeaning | null => {
    if (!suggestedBudget) return null;
    if (budgetOption === "proposal") {
      return isPricedBetaContractBudget(suggestedBudget) ? suggestedBudget : null;
    }
    if (budgetOption === "undecided") return { state: "undecided" };

    const code = currency.trim().toUpperCase();
    const digits = currencyDigits(code);
    if (digits === null) return null;
    const toMinor = (input: string): number | null => {
      if (!input.trim()) return null;
      const amountMinor = Math.round(Number(input) * 10 ** digits);
      return Number.isSafeInteger(amountMinor) && amountMinor >= 0 ? amountMinor : null;
    };
    if (budgetOption === "range") {
      const minimumMinor = toMinor(minimum);
      const maximumMinor = toMinor(maximum);
      if (minimumMinor === null || maximumMinor === null || minimumMinor > maximumMinor) {
        return null;
      }
      const candidate = {
        state: "range" as const,
        minimum: { amountMinor: minimumMinor, currency: code },
        maximum: { amountMinor: maximumMinor, currency: code },
      };
      return budgetMeaningSchema.safeParse(candidate).success ? candidate : null;
    }

    const amountMinor = toMinor(minimum);
    if (amountMinor === null) return null;
    const candidate = {
      state: budgetOption,
      amount: { amountMinor, currency: code },
    };
    return budgetMeaningSchema.safeParse(candidate).success ? candidate : null;
  }, [budgetOption, currency, maximum, minimum, suggestedBudget]);

  useEffect(() => {
    if (
      budgetOption !== "proposal" ||
      !suggestedBudget ||
      isPricedBetaContractBudget(suggestedBudget)
    ) {
      return;
    }
    setBudgetOption(
      suggestedBudget.state === "ceiling" ||
        suggestedBudget.state === "target" ||
        suggestedBudget.state === "range"
        ? suggestedBudget.state
        : "target",
    );
  }, [budgetOption, suggestedBudget]);

  const handleBudget = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!session || !selectedBudget) {
      setError({
        message:
          "Enter a valid budget amount and currency, or choose that your budget is undecided.",
      });
      return;
    }
    const updated = await updateSession("budget", "/budget", {
      expectedVersion: session.version,
      meaning: selectedBudget,
    });
    if (updated) setEditingBudget(false);
  };

  const handleApprove = () => {
    if (!session) return;
    void updateSession("approve", "/approve", { expectedVersion: session.version });
  };

  const handleReopenBudget = async () => {
    if (!session) return;
    const updated = await updateSession("reopen-budget", "/reopen-budget", {
      expectedVersion: session.version,
    });
    if (updated) {
      setEditingBudget(true);
      setProfessionalBriefDraft(null);
      setEditingProfessionalBrief(false);
    }
  };

  const handleContinueToTask = async () => {
    if (!session || busy) return;
    setBusy("task");
    setError(null);
    const result = await createTaskFromApprovedIntake(session.sessionId);
    setBusy(null);
    if (result.error || !result.data) {
      setError({
        message: result.error?.message ?? "Could not create the task from this approved brief.",
        ...(result.error?.code ? { code: result.error.code } : {}),
      });
      return;
    }
    router.push(`/tasks/${encodeURIComponent(result.data.taskId)}`);
  };

  const forgetLocalSession = () => {
    try {
      window.localStorage.removeItem(SESSION_STORAGE_KEY);
    } catch {
      setStorageWarning("This browser could not remove the saved draft shortcut.");
      return;
    }
    setSession(null);
    setError(null);
  };

  if (restoring) {
    return (
      <div className="mx-auto max-w-3xl py-16 text-center" role="status">
        <LoaderCircle className="mx-auto mb-3 h-6 w-6 animate-spin text-[var(--wp-accent)]" />
        <p className="text-sm text-[var(--wp-text-secondary)]">Opening your saved intake…</p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6 pb-16">
      <header className="space-y-2 border-b border-[var(--wp-border)] pb-5">
        <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-[var(--wp-accent)]">
          <Sparkles className="h-4 w-4" />
          WorkPay task intake
        </div>
        <h1 className="text-2xl font-semibold tracking-tight text-[var(--wp-text-primary)] sm:text-3xl">
          Start with what you need done
        </h1>
        <p className="max-w-2xl text-sm leading-6 text-[var(--wp-text-secondary)]">
          Describe the result in your own words. We will check that we understood, ask only for
          details that could change the work, and confirm the budget before preparing a brief.
        </p>
      </header>

      {error && (
        <div
          className="rounded-xl border border-red-500/30 bg-red-500/5 p-4 text-sm text-red-700"
          role="alert"
        >
          <p>{error.message}</p>
          {error.code === "AUTHORIZATION_ERROR" && (
            <Button asChild variant="outline" size="sm" className="mt-3">
              <Link href="/login?from=%2Fintake">Sign in to continue</Link>
            </Button>
          )}
          {error.canForgetSavedShortcut && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="mt-2 px-0 text-red-700"
              onClick={forgetLocalSession}
            >
              Forget the missing draft shortcut and start over
            </Button>
          )}
          {storageWarning && (
            <p
              className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-3 text-sm text-amber-900"
              role="status"
            >
              {storageWarning}
            </p>
          )}
        </div>
      )}

      {!session ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">What would you like help with?</CardTitle>
            <CardDescription>
              No technical terms are required. You can describe a business need, a practical job, or
              a problem you want solved.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleCreate} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="intake-request">Your request</Label>
                <Textarea
                  id="intake-request"
                  value={requestText}
                  onChange={(event) => setRequestText(event.target.value)}
                  placeholder="For example: I run a small bakery and need a way for customers to place cake orders online."
                  rows={6}
                  maxLength={20_000}
                  required
                  aria-describedby="intake-request-help"
                />
                <p id="intake-request-help" className="text-xs text-[var(--wp-text-secondary)]">
                  Share the outcome you want, what you already know, and any important limits or
                  timing. You do not need to decide implementation details.
                </p>
              </div>
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <p className="text-xs text-[var(--wp-text-secondary)]">
                  Your original wording is saved as part of your draft.
                </p>
                <Button type="submit" disabled={busy !== null || !requestText.trim()}>
                  {busy === "create" ? (
                    <>
                      <LoaderCircle className="mr-2 h-4 w-4 animate-spin" />
                      Saving request…
                    </>
                  ) : (
                    <>
                      Save and continue
                      <ArrowRight className="ml-2 h-4 w-4" />
                    </>
                  )}
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      ) : (
        <>
          <Card>
            <CardContent className="space-y-4 p-5">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="text-xs font-medium uppercase tracking-wide text-[var(--wp-text-secondary)]">
                    Intake progress
                  </p>
                  <p className="mt-1 text-sm font-medium text-[var(--wp-text-primary)]">
                    {session.status === "APPROVED"
                      ? "Approved brief saved"
                      : `Step ${Math.min(stageIndex + 1, stages.length)} of ${stages.length}: ${stages[stageIndex]}`}
                  </p>
                </div>
                <Badge
                  variant={
                    session.status === "APPROVED" || session.readiness.ready ? "default" : "outline"
                  }
                >
                  {session.status === "APPROVED"
                    ? "Approved"
                    : session.readiness.ready
                      ? "Ready for review"
                      : "Draft"}
                </Badge>
              </div>
              <progress
                className="h-2 w-full accent-[var(--wp-accent)]"
                max={100}
                value={progress}
                aria-label={`Intake progress ${session.status === "APPROVED" ? 100 : progress}%`}
              />
              <ol className="grid grid-cols-2 gap-2 text-xs sm:grid-cols-5">
                {stages.map((stage, index) => {
                  const complete = index < stageIndex || session.status === "APPROVED";
                  const active = index === stageIndex && session.status !== "APPROVED";
                  return (
                    <li
                      key={stage}
                      aria-current={active ? "step" : undefined}
                      className={`flex items-center gap-2 rounded-lg border px-2.5 py-2 ${
                        complete || active
                          ? "border-[var(--wp-accent)]/30 bg-[var(--wp-accent)]/5 text-[var(--wp-text-primary)]"
                          : "border-[var(--wp-border)] text-[var(--wp-text-secondary)]"
                      }`}
                    >
                      <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full border text-[10px]">
                        {complete ? <Check className="h-3 w-3" /> : index + 1}
                      </span>
                      <span>{stage}</span>
                    </li>
                  );
                })}
              </ol>
              <div className="rounded-lg bg-[var(--wp-surface-subtle)] p-3">
                <p className="text-xs font-semibold text-[var(--wp-text-secondary)]">
                  Your original request
                </p>
                <p className="mt-1 whitespace-pre-wrap text-sm text-[var(--wp-text-primary)]">
                  {session.originalRequest}
                </p>
              </div>
            </CardContent>
          </Card>

          {session.status === "APPROVED" ? (
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Your brief is approved</CardTitle>
                <CardDescription>
                  The approved version is saved. No professional has been selected or contacted.
                  Continue to review the resulting work terms before browsing profiles.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                {version && <BriefSummary version={version} />}
                {version && isPricedBetaContractBudget(version.budget.meaning) ? (
                  <>
                    <p className="text-sm text-[var(--text-secondary)]">
                      Review the work terms and USD budget next. This will not select or contact a
                      professional, and it will not authorize a PayPal payment.
                    </p>
                    <Button
                      type="button"
                      onClick={() => void handleContinueToTask()}
                      disabled={busy !== null}
                    >
                      {busy === "task" ? (
                        <LoaderCircle className="mr-2 h-4 w-4 animate-spin" />
                      ) : (
                        <ArrowRight className="mr-2 h-4 w-4" />
                      )}
                      Continue to contract review
                    </Button>
                  </>
                ) : (
                  <div className="space-y-3 rounded-lg border border-amber-500/30 bg-amber-500/5 p-4">
                    <p className="text-sm font-semibold">Confirm a USD contract budget</p>
                    <p className="text-sm text-[var(--wp-text-secondary)]">
                      Your original currency remains in the intake record, but this beta creates
                      contracts in USD only. WorkPay will not convert the amount or choose an
                      exchange rate for you.
                    </p>
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => void handleReopenBudget()}
                      disabled={busy !== null}
                    >
                      {busy === "reopen-budget" ? (
                        <LoaderCircle className="mr-2 h-4 w-4 animate-spin" />
                      ) : (
                        <RotateCcw className="mr-2 h-4 w-4" />
                      )}
                      Reopen budget step
                    </Button>
                  </div>
                )}
              </CardContent>
            </Card>
          ) : (
            <>
              {version?.interpretation === null ? (
                <Card>
                  <CardHeader>
                    <CardTitle className="text-lg">Let’s make sure we understand</CardTitle>
                    <CardDescription>
                      WorkPay will interpret your request using the original text and any
                      corrections you have made. It will not set a price or treat its assumptions as
                      confirmed.
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    {version.correctionContext && (
                      <p className="rounded-lg border border-[var(--wp-border)] bg-[var(--wp-surface-subtle)] p-3 text-sm">
                        Your correction is saved. WorkPay will use the earlier interpretation only
                        to understand what you are correcting.
                      </p>
                    )}
                    <Button type="button" onClick={handleInterpret} disabled={busy !== null}>
                      {busy === "interpret" ? (
                        <>
                          <LoaderCircle className="mr-2 h-4 w-4 animate-spin" />
                          Checking your request…
                        </>
                      ) : (
                        <>
                          Interpret my request
                          <ArrowRight className="ml-2 h-4 w-4" />
                        </>
                      )}
                    </Button>
                  </CardContent>
                </Card>
              ) : (
                version?.interpretation && (
                  <Card>
                    <CardHeader>
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <CardTitle className="text-lg">Is this what you mean?</CardTitle>
                          <CardDescription>
                            This is a draft understanding, not a commitment. Confirm it or tell us
                            what to change.
                          </CardDescription>
                        </div>
                        <Badge variant="outline">
                          {version.interpretationConfirmationSourceId
                            ? "Confirmed"
                            : "Needs your review"}
                        </Badge>
                      </div>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      <div className="rounded-lg bg-[var(--wp-surface-subtle)] p-4">
                        <h2 className="text-sm font-semibold">In brief</h2>
                        <p className="mt-2 whitespace-pre-wrap text-sm leading-6">
                          {version.interpretation.summary}
                        </p>
                      </div>
                      {version.interpretation.facts.length > 0 ? (
                        <ul className="space-y-2">
                          {version.interpretation.facts.map((fact) => (
                            <li
                              key={fact.id}
                              className="rounded-lg border border-[var(--wp-border)] p-3"
                            >
                              <p className="text-[11px] font-semibold uppercase tracking-wide text-[var(--wp-text-secondary)]">
                                {fact.category}
                              </p>
                              <p className="mt-1 text-sm">{fact.value}</p>
                            </li>
                          ))}
                        </ul>
                      ) : (
                        <p className="text-sm text-amber-800">
                          WorkPay could not identify the main outcome yet. Add more context in a
                          correction before continuing.
                        </p>
                      )}

                      {version.interpretationConfirmationSourceId ? (
                        <Button
                          type="button"
                          variant="outline"
                          onClick={() => setShowCorrection((visible) => !visible)}
                          disabled={busy !== null}
                        >
                          <RotateCcw className="mr-2 h-4 w-4" />
                          Change this understanding
                        </Button>
                      ) : (
                        <div className="flex flex-col gap-2 sm:flex-row">
                          <Button
                            type="button"
                            onClick={() => void handleInterpretationDecision("confirm")}
                            disabled={busy !== null}
                          >
                            {busy === "confirm" ? (
                              <LoaderCircle className="mr-2 h-4 w-4 animate-spin" />
                            ) : (
                              <Check className="mr-2 h-4 w-4" />
                            )}
                            Yes, that’s right
                          </Button>
                          <Button
                            type="button"
                            variant="outline"
                            onClick={() => setShowCorrection((visible) => !visible)}
                            disabled={busy !== null}
                          >
                            Tell us what to change
                          </Button>
                        </div>
                      )}

                      {showCorrection && (
                        <form
                          className="space-y-3 rounded-lg border border-[var(--wp-border)] p-4"
                          onSubmit={(event) => {
                            event.preventDefault();
                            void handleInterpretationDecision("correct");
                          }}
                        >
                          <div className="space-y-2">
                            <Label htmlFor="intake-correction">
                              What did we get wrong or miss?
                            </Label>
                            <Textarea
                              id="intake-correction"
                              value={correction}
                              onChange={(event) => setCorrection(event.target.value)}
                              placeholder="For example: I need customers to pay a deposit when they place an order."
                              rows={3}
                              maxLength={5_000}
                              required
                            />
                          </div>
                          <Button
                            type="submit"
                            variant="secondary"
                            disabled={busy !== null || !correction.trim()}
                          >
                            {busy === "confirm" || busy === "interpret" ? (
                              <LoaderCircle className="mr-2 h-4 w-4 animate-spin" />
                            ) : null}
                            Save correction and check again
                          </Button>
                        </form>
                      )}

                      {version.interpretationConfirmationSourceId && (
                        <p className="text-xs text-[var(--wp-text-secondary)]">
                          The confirmed facts are preserved in your draft. You can revise them
                          before approval.
                        </p>
                      )}
                    </CardContent>
                  </Card>
                )
              )}

              {version?.interpretationConfirmationSourceId && (
                <Card>
                  <CardHeader>
                    <CardTitle className="text-lg">Only the details that affect the work</CardTitle>
                    <CardDescription>
                      WorkPay checks for missing details that could change the result, amount of
                      work, timing, access, or budget. It does not need you to choose technical
                      tools or small design preferences now.
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    {!version.scopeAssessment ? (
                      <Button
                        type="button"
                        onClick={handleScopeAssessment}
                        disabled={busy !== null}
                      >
                        {busy === "scope" ? (
                          <LoaderCircle className="mr-2 h-4 w-4 animate-spin" />
                        ) : (
                          <CircleHelp className="mr-2 h-4 w-4" />
                        )}
                        Check what else matters
                      </Button>
                    ) : currentQuestion ? (
                      <form className="space-y-3" onSubmit={handleAnswer}>
                        <div className="rounded-lg border border-[var(--wp-border)] p-4">
                          <p className="text-xs font-semibold uppercase tracking-wide text-[var(--wp-text-secondary)]">
                            One detail that could affect the work
                          </p>
                          <h2 className="mt-2 text-base font-semibold">
                            {currentQuestion.question}
                          </h2>
                          <p className="mt-3 text-xs font-semibold uppercase tracking-wide text-[var(--wp-text-secondary)]">
                            Why this matters
                          </p>
                          <p className="mt-1 text-sm leading-6 text-[var(--wp-text-secondary)]">
                            {currentQuestion.whyItMatters}
                          </p>
                        </div>
                        <div className="space-y-2">
                          <p className="text-sm text-[var(--wp-text-secondary)]">
                            Not sure? WorkPay can suggest a few possibilities and briefly explain
                            each one. You decide whether any fits.
                          </p>
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            aria-expanded={showAnswerOptions}
                            aria-controls="scope-answer-options"
                            disabled={busy !== null}
                            onClick={handleHelpMeChoose}
                          >
                            {busy === "options" ? (
                              <LoaderCircle className="mr-2 h-4 w-4 animate-spin" />
                            ) : null}
                            {busy === "options"
                              ? "Preparing options..."
                              : showAnswerOptions
                                ? "Hide options"
                                : "Help me choose"}
                          </Button>
                          {showAnswerOptions && currentQuestion.answerOptions.length > 0 && (
                            <fieldset id="scope-answer-options" className="space-y-2">
                              <legend className="text-sm font-medium">
                                Choose an option, or write your own
                              </legend>
                              <div className="grid gap-2 sm:grid-cols-2">
                                {currentQuestion.answerOptions.map((option, index) => {
                                  const label = typeof option === "string" ? option : option.label;
                                  const explanation =
                                    typeof option === "string" ? null : option.explanation;
                                  return (
                                    <Button
                                      key={`${label}-${index}`}
                                      type="button"
                                      variant={answer === label ? "secondary" : "outline"}
                                      aria-pressed={answer === label}
                                      disabled={busy !== null}
                                      className="h-auto min-h-16 justify-start whitespace-normal p-3 text-left"
                                      onClick={() => setAnswer(label)}
                                    >
                                      <span className="flex flex-col items-start gap-1">
                                        <span className="font-medium">{label}</span>
                                        {explanation && (
                                          <span className="text-xs font-normal text-[var(--wp-text-secondary)]">
                                            {explanation}
                                          </span>
                                        )}
                                      </span>
                                    </Button>
                                  );
                                })}
                              </div>
                            </fieldset>
                          )}
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="scope-answer">
                            {showAnswerOptions ? "Or tell us in your own words" : "Your answer"}
                          </Label>
                          <Textarea
                            id="scope-answer"
                            value={answer}
                            onChange={(event) => setAnswer(event.target.value)}
                            rows={3}
                            maxLength={5_000}
                            required
                          />
                        </div>
                        <Button type="submit" disabled={busy !== null || !answer.trim()}>
                          {busy === "answer" || busy === "scope" ? (
                            <LoaderCircle className="mr-2 h-4 w-4 animate-spin" />
                          ) : null}
                          Save answer
                        </Button>
                        <p className="text-xs text-[var(--wp-text-secondary)]">
                          One question at a time. If an answer raises another important point,
                          WorkPay will check again.
                        </p>
                      </form>
                    ) : needsScopeRecheck ? (
                      <div className="space-y-3">
                        <p className="text-sm text-emerald-800">
                          Your answers are saved. WorkPay will check whether they resolved the
                          remaining scope questions.
                        </p>
                        <Button
                          type="button"
                          onClick={handleScopeAssessment}
                          disabled={busy !== null}
                        >
                          {busy === "scope" ? (
                            <LoaderCircle className="mr-2 h-4 w-4 animate-spin" />
                          ) : null}
                          Review my answers
                        </Button>
                      </div>
                    ) : (
                      <div className="space-y-2">
                        <p className="text-sm text-emerald-800">
                          No additional core scope question is waiting for an answer.
                        </p>
                        <p className="text-xs text-[var(--wp-text-secondary)]">
                          WorkPay may ask another focused question if your budget details reveal
                          something that could materially change the work.
                        </p>
                      </div>
                    )}
                  </CardContent>
                </Card>
              )}

              {budgetReadyForDecision && version && (
                <Card>
                  <CardHeader>
                    <CardTitle className="text-lg">Confirm the budget state</CardTitle>
                    <CardDescription>
                      WorkPay preserves the currency you stated, but beta contracts use USD. Enter a
                      USD amount explicitly; WorkPay will not choose an exchange rate for you.
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    {version.budget.confirmationSourceId && !editingBudget ? (
                      <div className="space-y-3">
                        <p className="rounded-lg bg-[var(--wp-surface-subtle)] p-3 text-sm">
                          {describeBudget(version.budget.meaning)}
                        </p>
                        <Button
                          type="button"
                          variant="outline"
                          onClick={() => setEditingBudget(true)}
                          disabled={busy !== null}
                        >
                          Change budget decision
                        </Button>
                      </div>
                    ) : (
                      <>
                        <p className="rounded-lg border border-[var(--wp-border)] p-3 text-sm">
                          WorkPay understood:{" "}
                          {suggestedBudget
                            ? describeBudget(suggestedBudget)
                            : "No budget details yet."}
                        </p>
                        {suggestedBudget && !budgetUsesBetaContractCurrency(suggestedBudget) && (
                          <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-3 text-sm">
                            <p className="font-semibold">Your original currency is preserved</p>
                            <p className="mt-1 text-[var(--wp-text-secondary)]">
                              The amount above cannot be used as the beta contract budget. Enter the
                              USD target, ceiling, or range you explicitly accept. No automatic
                              conversion will be applied.
                            </p>
                          </div>
                        )}
                        <form className="space-y-4" onSubmit={handleBudget}>
                          <fieldset className="space-y-2">
                            <legend className="text-sm font-medium">
                              What budget should we use?
                            </legend>
                            <div className="grid gap-2 sm:grid-cols-2">
                              {suggestedBudget && suggestedBudgetCanFundBetaContract && (
                                <BudgetChoice
                                  checked={budgetOption === "proposal"}
                                  label={`Use what I said: ${describeBudget(suggestedBudget)}`}
                                  onSelect={() => setBudgetOption("proposal")}
                                />
                              )}
                              <BudgetChoice
                                checked={budgetOption === "undecided"}
                                label="Keep this as a draft without a contract budget"
                                onSelect={() => setBudgetOption("undecided")}
                              />
                              <BudgetChoice
                                checked={budgetOption === "ceiling"}
                                label="Set a maximum amount"
                                onSelect={() => setBudgetOption("ceiling")}
                              />
                              <BudgetChoice
                                checked={budgetOption === "target"}
                                label="Set a target amount"
                                onSelect={() => setBudgetOption("target")}
                              />
                              <BudgetChoice
                                checked={budgetOption === "range"}
                                label="Set a range"
                                onSelect={() => setBudgetOption("range")}
                              />
                            </div>
                          </fieldset>

                          {budgetOption !== "proposal" && budgetOption !== "undecided" && (
                            <div className="grid gap-3 sm:grid-cols-2">
                              <div className="space-y-2">
                                <Label htmlFor="budget-currency">Currency code</Label>
                                <Input
                                  id="budget-currency"
                                  value={currency}
                                  readOnly
                                  aria-readonly="true"
                                />
                                <p className="text-xs text-[var(--wp-text-secondary)]">
                                  USD is the only contract currency enabled in this beta.
                                </p>
                              </div>
                              <div className="space-y-2">
                                <Label htmlFor="budget-minimum">
                                  {budgetOption === "range" ? "Minimum amount" : "Amount"}
                                </Label>
                                <Input
                                  id="budget-minimum"
                                  type="number"
                                  inputMode="decimal"
                                  min="0"
                                  step="any"
                                  value={minimum}
                                  onChange={(event) => setMinimum(event.target.value)}
                                  required
                                />
                              </div>
                              {budgetOption === "range" && (
                                <div className="space-y-2">
                                  <Label htmlFor="budget-maximum">Maximum amount</Label>
                                  <Input
                                    id="budget-maximum"
                                    type="number"
                                    inputMode="decimal"
                                    min="0"
                                    step="any"
                                    value={maximum}
                                    onChange={(event) => setMaximum(event.target.value)}
                                    required
                                  />
                                </div>
                              )}
                            </div>
                          )}
                          <Button type="submit" disabled={busy !== null}>
                            {busy === "budget" ? (
                              <LoaderCircle className="mr-2 h-4 w-4 animate-spin" />
                            ) : null}
                            Confirm budget
                          </Button>
                        </form>
                      </>
                    )}
                  </CardContent>
                </Card>
              )}

              {version && version.budget.confirmationSourceId && (
                <Card>
                  <CardHeader>
                    <CardTitle className="text-lg">
                      {version.approvedAt
                        ? "Approved professional-facing brief"
                        : "Prepare the professional-facing brief"}
                    </CardTitle>
                    <CardDescription>
                      WorkPay organizes your confirmed details into a clear task brief instead of
                      sending professionals an intake question-and-answer transcript. Review and
                      edit it before approval. This does not select or contact anyone.
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    {!session.readiness.ready && (
                      <div
                        className="space-y-2 rounded-lg border border-amber-500/30 bg-amber-500/5 p-4"
                        role="status"
                      >
                        <p className="text-sm font-semibold">A few things still need attention</p>
                        <ul className="list-disc space-y-1 pl-5 text-sm">
                          {session.readiness.blockers.map((blocker) => (
                            <li key={blocker}>{blockerMessage(blocker)}</li>
                          ))}
                        </ul>
                      </div>
                    )}
                    {version.professionalBrief ? (
                      <form className="space-y-4" onSubmit={handleSaveProfessionalBrief}>
                        <ProfessionalBriefEditor
                          brief={
                            professionalBriefDraft ??
                            toProfessionalBriefDraft(version.professionalBrief)
                          }
                          budget={version.budget.meaning}
                          disabled={
                            !editingProfessionalBrief ||
                            version.approvedAt !== null ||
                            busy !== null
                          }
                          onChange={setProfessionalBriefDraft}
                        />
                        {version.approvedAt === null && (
                          <div className="flex flex-col gap-3 border-t border-[var(--wp-border)] pt-4">
                            {editingProfessionalBrief ? (
                              <div className="flex flex-wrap gap-2">
                                <Button type="submit" disabled={busy !== null}>
                                  {busy === "save-brief" ? (
                                    <LoaderCircle className="mr-2 h-4 w-4 animate-spin" />
                                  ) : null}
                                  Save brief edits
                                </Button>
                                <Button
                                  type="button"
                                  variant="outline"
                                  disabled={busy !== null}
                                  onClick={() => {
                                    setProfessionalBriefDraft(
                                      version.professionalBrief
                                        ? toProfessionalBriefDraft(version.professionalBrief)
                                        : null,
                                    );
                                    setEditingProfessionalBrief(false);
                                  }}
                                >
                                  Discard edits
                                </Button>
                              </div>
                            ) : (
                              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                                <p className="text-xs text-[var(--wp-text-secondary)]">
                                  Approval records this exact brief for possible later discovery. It
                                  does not start discovery or contact anyone.
                                </p>
                                <div className="flex flex-wrap gap-2">
                                  <Button
                                    type="button"
                                    variant="outline"
                                    onClick={() => setEditingProfessionalBrief(true)}
                                    disabled={busy !== null}
                                  >
                                    Edit brief
                                  </Button>
                                  <Button
                                    type="button"
                                    onClick={handleApprove}
                                    disabled={
                                      busy !== null ||
                                      !session.readiness.ready ||
                                      editingProfessionalBrief
                                    }
                                  >
                                    {busy === "approve" ? (
                                      <LoaderCircle className="mr-2 h-4 w-4 animate-spin" />
                                    ) : (
                                      <Check className="mr-2 h-4 w-4" />
                                    )}
                                    Approve this brief
                                  </Button>
                                </div>
                              </div>
                            )}
                          </div>
                        )}
                      </form>
                    ) : version.approvedAt !== null ? (
                      <BriefSummary version={version} />
                    ) : (
                      <>
                        <BriefSummary version={version} />
                        <div className="flex flex-col gap-3 border-t border-[var(--wp-border)] pt-4 sm:flex-row sm:items-center sm:justify-between">
                          <p className="text-xs text-[var(--wp-text-secondary)]">
                            First compose a professional-facing brief from the details you
                            confirmed. Nothing will be sent.
                          </p>
                          <Button
                            type="button"
                            onClick={handleComposeProfessionalBrief}
                            disabled={busy !== null || !session.readiness.ready}
                          >
                            {busy === "brief" ? (
                              <LoaderCircle className="mr-2 h-4 w-4 animate-spin" />
                            ) : (
                              <Sparkles className="mr-2 h-4 w-4" />
                            )}
                            {busy === "brief" ? "Preparing brief..." : "Prepare professional brief"}
                          </Button>
                        </div>
                      </>
                    )}
                  </CardContent>
                </Card>
              )}
            </>
          )}
        </>
      )}
    </div>
  );
}

function BudgetChoice({
  checked,
  label,
  onSelect,
}: {
  checked: boolean;
  label: string;
  onSelect: () => void;
}) {
  return (
    <Button
      type="button"
      variant={checked ? "secondary" : "outline"}
      aria-pressed={checked}
      onClick={onSelect}
      className="h-auto min-h-11 w-full justify-start whitespace-normal px-3 py-3 text-left"
    >
      {label}
    </Button>
  );
}

function ConfirmedBudget({ version }: { version: IntakeVersion }) {
  return (
    <div className="rounded-lg border border-[var(--wp-border)] p-4">
      <h2 className="text-sm font-semibold">Budget decision</h2>
      <p className="mt-2 text-sm">{describeBudget(version.budget.meaning)}</p>
    </div>
  );
}

function ProfessionalBriefEditor({
  brief,
  budget,
  disabled,
  onChange,
}: {
  brief: ProfessionalBriefDraft;
  budget: BudgetMeaning;
  disabled: boolean;
  onChange: (brief: ProfessionalBriefDraft) => void;
}) {
  const updateLines = (
    field: "deliverables" | "requirements" | "boundaries" | "inputsAndDependencies",
    value: string,
  ) => {
    onChange({
      ...brief,
      [field]: value
        .split("\n")
        .map((item) => item.trim())
        .filter(Boolean),
    });
  };

  return (
    <div className="space-y-4">
      <div className="space-y-2 rounded-lg border border-[var(--wp-border)] p-4">
        <Label htmlFor="professional-brief-title">Task title</Label>
        <Input
          id="professional-brief-title"
          value={brief.title}
          disabled={disabled}
          required
          onChange={(event) => onChange({ ...brief, title: event.target.value })}
        />
        <Label htmlFor="professional-brief-goal">Goal and context</Label>
        <Textarea
          id="professional-brief-goal"
          value={brief.goalAndContext}
          rows={3}
          disabled={disabled}
          required
          onChange={(event) => onChange({ ...brief, goalAndContext: event.target.value })}
        />
      </div>
      <ProfessionalBriefList
        id="professional-brief-deliverables"
        title="Requested deliverables"
        hint="One item per line."
        value={brief.deliverables.join("\n")}
        disabled={disabled}
        required
        onChange={(value) => updateLines("deliverables", value)}
      />
      <ProfessionalBriefList
        id="professional-brief-requirements"
        title="Confirmed requirements"
        hint="Only include requirements that were stated or confirmed."
        value={brief.requirements.join("\n")}
        disabled={disabled}
        onChange={(value) => updateLines("requirements", value)}
      />
      <ProfessionalBriefList
        id="professional-brief-boundaries"
        title="Boundaries and exclusions"
        hint="One item per line."
        value={brief.boundaries.join("\n")}
        disabled={disabled}
        onChange={(value) => updateLines("boundaries", value)}
      />
      <ProfessionalBriefList
        id="professional-brief-inputs"
        title="Inputs and dependencies"
        hint="Materials or access the requester said they can provide."
        value={brief.inputsAndDependencies.join("\n")}
        disabled={disabled}
        onChange={(value) => updateLines("inputsAndDependencies", value)}
      />
      <div className="space-y-2 rounded-lg border border-[var(--wp-border)] p-4">
        <Label htmlFor="professional-brief-timing">Timing</Label>
        <Textarea
          id="professional-brief-timing"
          value={brief.timing}
          placeholder="No timing details provided."
          rows={2}
          disabled={disabled}
          onChange={(event) => onChange({ ...brief, timing: event.target.value })}
        />
      </div>
      <div className="rounded-lg border border-[var(--wp-border)] p-4">
        <h3 className="text-sm font-semibold">Requester’s stated budget</h3>
        <p className="mt-2 text-sm">{describeBudget(budget)}</p>
        <p className="mt-1 text-xs text-[var(--wp-text-secondary)]">
          This is the requester’s budget context, not an agreed price or offer.
        </p>
      </div>
    </div>
  );
}

function ProfessionalBriefList({
  id,
  title,
  hint,
  value,
  disabled,
  required = false,
  onChange,
}: {
  id: string;
  title: string;
  hint: string;
  value: string;
  disabled: boolean;
  required?: boolean;
  onChange: (value: string) => void;
}) {
  return (
    <div className="space-y-2 rounded-lg border border-[var(--wp-border)] p-4">
      <Label htmlFor={id}>{title}</Label>
      <Textarea
        id={id}
        value={value}
        rows={Math.min(5, Math.max(2, value.split("\n").length))}
        disabled={disabled}
        required={required}
        onChange={(event) => onChange(event.target.value)}
      />
      <p className="text-xs text-[var(--wp-text-secondary)]">{hint}</p>
    </div>
  );
}

function BriefSummary({ version }: { version: IntakeVersion }) {
  return (
    <div className="space-y-3">
      {version.interpretation && (
        <div className="space-y-2 rounded-lg border border-[var(--wp-border)] p-4">
          <h2 className="text-sm font-semibold">Intended outcome and requirements</h2>
          <p className="whitespace-pre-wrap text-sm leading-6">{version.interpretation.summary}</p>
          <ul className="space-y-2 pt-2">
            {version.interpretation.facts.map((fact) => (
              <li key={fact.id} className="text-sm">
                <span className="mr-2 text-xs uppercase text-[var(--wp-text-secondary)]">
                  {fact.category}
                </span>
                {fact.value}
              </li>
            ))}
          </ul>
        </div>
      )}
      <ConfirmedBudget version={version} />
      {version.clarificationAnswers.length > 0 && (
        <div className="rounded-lg border border-[var(--wp-border)] p-4">
          <h2 className="text-sm font-semibold">Answers to core questions</h2>
          <ul className="mt-2 space-y-2 text-sm">
            {version.clarificationAnswers.map((answer) => (
              <li key={answer.sourceId}>
                <p className="font-medium">{answer.question}</p>
                <p className="text-[var(--wp-text-secondary)]">{answer.answer}</p>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
