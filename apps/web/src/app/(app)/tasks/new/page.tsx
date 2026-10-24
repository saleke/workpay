"use client";

import { useState, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  ArrowRight,
  CheckCircle2,
  Clock,
  Sparkles,
  AlertCircle,
  Compass,
  Layers,
  ShieldCheck,
  Send,
  RotateCcw,
  Check,
  FileCode2,
  DollarSign,
  PackageCheck,
  Sliders,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { createTask, requestPlanning } from "@/lib/api/endpoints";
import type {
  CognitiveScopeCanvas,
  ScopingDimensionKey,
  ScopingOption,
  ScopingSessionState,
} from "@workpay/shared/domain/scoping";

function newIdempotencyKey(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return `key-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

export default function NewTaskPage() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [mode, setMode] = useState<"consultative" | "manual">("consultative");
  const [rawGoal, setRawGoal] = useState("");
  const [customAnswer, setCustomAnswer] = useState("");
  const [customBudgetDollars, setCustomBudgetDollars] = useState("");
  const [loadingDiagnostic, setLoadingDiagnostic] = useState(false);
  const [finalizing, setFinalizing] = useState(false);
  const [sessionState, setSessionState] = useState<ScopingSessionState | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Manual fallback state
  const [manualDescription, setManualDescription] = useState("");
  const [manualBudget, setManualBudget] = useState("150");
  const [manualDeadline, setManualDeadline] = useState("Tomorrow, 6:00 PM");
  const [manualFilesNote, setManualFilesNote] = useState("");
  const [manualSubmitting, setManualSubmitting] = useState(false);

  useEffect(() => {
    const descParam = searchParams.get("desc");
    const budgetParam = searchParams.get("budget");
    const deadlineParam = searchParams.get("deadline");

    if (descParam) {
      setRawGoal(descParam);
      setManualDescription(descParam);
    }
    if (budgetParam) setManualBudget(budgetParam);
    if (deadlineParam) setManualDeadline(deadlineParam);
  }, [searchParams]);

  // Consultative Engine: Ingest Goal and Start Diagnostic Matrix
  const handleStartConsultation = async (e?: React.FormEvent, overrideGoal?: string) => {
    if (e) e.preventDefault();
    const targetGoal = (overrideGoal || rawGoal).trim();
    if (!targetGoal) {
      setError("Please describe what you want to achieve.");
      return;
    }

    setError(null);
    setLoadingDiagnostic(true);

    try {
      const res = await fetch("/api/v1/scoping/dialogue", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: targetGoal }),
      });

      const json = await res.json();
      if (!res.ok) {
        setError(json.error?.message || "Failed to analyze project objective.");
        return;
      }

      setSessionState(json.data);
    } catch {
      setError("Network error contacting scoping diagnostician. Please try again.");
    } finally {
      setLoadingDiagnostic(false);
    }
  };

  // Consultative Engine: Select Option Turn
  const handleSelectOption = async (option: ScopingOption) => {
    if (!sessionState) return;
    setError(null);
    setLoadingDiagnostic(true);

    try {
      const res = await fetch("/api/v1/scoping/dialogue", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sessionId: sessionState.sessionId,
          message: option.title,
          selectedOptionId: option.id,
          slots: sessionState.filledSlots,
          history: sessionState.dialogue.map((d) => ({
            role: d.role,
            content: d.content,
            selectedOptionId: d.selectedOptionId,
          })),
          literacyLevel: sessionState.technicalLiteracyLevel,
        }),
      });

      const json = await res.json();
      if (!res.ok) {
        setError(json.error?.message || "Failed to process clarification step.");
        return;
      }

      setSessionState(json.data);
    } catch {
      setError("Network error progressing scoping dialogue.");
    } finally {
      setLoadingDiagnostic(false);
    }
  };

  // Consultative Engine: Submit Custom Answer
  const handleCustomAnswer = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!customAnswer.trim() || !sessionState) return;

    setError(null);
    setLoadingDiagnostic(true);
    const answerText = customAnswer.trim();
    setCustomAnswer("");

    try {
      const res = await fetch("/api/v1/scoping/dialogue", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sessionId: sessionState.sessionId,
          message: answerText,
          activeSlotKey: sessionState.currentSlotKey,
          slots: sessionState.filledSlots,
          history: sessionState.dialogue.map((d) => ({
            role: d.role,
            content: d.content,
            selectedOptionId: d.selectedOptionId,
          })),
          literacyLevel: sessionState.technicalLiteracyLevel,
        }),
      });

      const json = await res.json();
      if (!res.ok) {
        setError(json.error?.message || "Failed to process custom answer.");
        return;
      }

      setSessionState(json.data);
    } catch {
      setError("Network error submitting response.");
    } finally {
      setLoadingDiagnostic(false);
    }
  };

  useEffect(() => {
    if (sessionState?.reversePitchCanvas?.estimatedBudgetMinor) {
      setCustomBudgetDollars(
        (sessionState.reversePitchCanvas.estimatedBudgetMinor / 100).toFixed(0),
      );
    }
  }, [sessionState?.reversePitchCanvas?.estimatedBudgetMinor]);

  const handleUpdateBudget = (valStr: string) => {
    setCustomBudgetDollars(valStr);
    const parsed = parseFloat(valStr);
    if (!isNaN(parsed) && parsed > 0 && sessionState?.reversePitchCanvas) {
      const newMinor = Math.round(parsed * 100);
      const updatedMilestones = sessionState.reversePitchCanvas.suggestedMilestones.map((m) => ({
        ...m,
        amountMinor: Math.round((newMinor * m.percentage) / 100),
      }));
      setSessionState({
        ...sessionState,
        reversePitchCanvas: {
          ...sessionState.reversePitchCanvas,
          estimatedBudgetMinor: newMinor,
          suggestedMilestones: updatedMilestones,
        },
      });
    }
  };

  // Finalize Scope: Freeze Intent Baseline (v1_baseline) and Transition to Workspace
  const handleApproveBaseline = async () => {
    if (!sessionState?.reversePitchCanvas) return;
    setError(null);
    setFinalizing(true);

    try {
      const res = await fetch("/api/v1/scoping/finalize", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sessionId: sessionState.sessionId,
          canvas: sessionState.reversePitchCanvas,
        }),
      });

      const json = await res.json();
      if (!res.ok) {
        setError(json.error?.message || "Failed to freeze contract baseline.");
        setFinalizing(false);
        return;
      }

      const redirectUrl = json.data?.redirectUrl || `/tasks/${json.data?.taskId}`;
      router.push(redirectUrl);
    } catch {
      setError("Network error while creating project agreement.");
      setFinalizing(false);
    }
  };

  // Reset Consultation
  const handleResetConsultation = () => {
    setSessionState(null);
    setRawGoal("");
    setError(null);
  };

  // Manual Mode Form Submission
  const onManualSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const amountMinor = Math.round(Number(manualBudget) * 100);
    if (!Number.isFinite(amountMinor) || amountMinor <= 0) {
      setError("Please specify a valid dollar amount.");
      return;
    }

    setManualSubmitting(true);

    try {
      const trimmed = manualDescription.trim();
      const firstLine = trimmed.split("\n")[0]?.trim() || "";
      const derivedTitle =
        firstLine.length > 5 && firstLine.length < 80
          ? firstLine
          : trimmed.length > 60
            ? `${trimmed.slice(0, 57)}...`
            : trimmed;

      const created = await createTask(
        {
          title: derivedTitle || "New work agreement",
          rawRequest: manualFilesNote ? `${trimmed}\n\nReference files: ${manualFilesNote}` : trimmed,
          budgetMinor: amountMinor,
          currency: "USD",
          desiredDeadline: null,
        },
        newIdempotencyKey(),
      );

      if (created.error || !created.data) {
        const msg =
          typeof created.error === "string"
            ? created.error
            : created.error?.message ?? "Could not draft contract. Please try again.";
        setError(msg);
        setManualSubmitting(false);
        return;
      }

      await requestPlanning(created.data.id);
      router.push(`/tasks/${created.data.id}`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "An unexpected error occurred.";
      setError(msg);
      setManualSubmitting(false);
    }
  };

  return (
    <div className="max-w-4xl mx-auto space-y-6 pb-16">
      {/* Top Banner and Mode Switch */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-[var(--wp-border)] pb-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-[var(--wp-text-primary)]">
              {mode === "consultative" ? "Consultative Scoping Studio" : "Direct Task Creation"}
            </h1>
            <Badge variant="outline" className="text-[10px] font-mono border-[var(--wp-border)] text-[var(--wp-accent)]">
              {mode === "consultative" ? "Active Diagnostician" : "Manual Spec"}
            </Badge>
          </div>
          <p className="text-xs sm:text-sm text-[var(--wp-text-secondary)] mt-1">
            {mode === "consultative"
              ? "Tell us what you want to achieve in plain English. Our scoping diagnostician identifies missing technical parameters, guides trade-off decisions, and creates a verified project contract."
              : "Directly enter your pre-written technical specifications, budget ceiling, and delivery deadline."}
          </p>
        </div>

        <div className="flex items-center gap-1.5 p-1 rounded-xl border border-[var(--wp-border)] bg-[var(--wp-surface-subtle)] shrink-0 self-start sm:self-auto">
          <Button
            type="button"
            size="sm"
            variant={mode === "consultative" ? "default" : "ghost"}
            onClick={() => setMode("consultative")}
            className="text-xs font-semibold h-8"
          >
            <Compass className="h-3.5 w-3.5 mr-1.5" />
            Consultative Scoping
          </Button>
          <Button
            type="button"
            size="sm"
            variant={mode === "manual" ? "default" : "ghost"}
            onClick={() => setMode("manual")}
            className="text-xs font-semibold h-8"
          >
            <Sliders className="h-3.5 w-3.5 mr-1.5" />
            Express Form
          </Button>
        </div>
      </div>

      {error && (
        <div className="p-3.5 rounded-xl bg-red-500/10 border border-red-500/20 text-xs text-red-600 dark:text-red-400 flex items-center gap-2">
          <AlertCircle className="h-4 w-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODE 1: CONSULTATIVE SCOPING STUDIO                                      */}
      {/* ========================================================================= */}
      {mode === "consultative" && (
        <div className="space-y-6">
          {/* Understanding Gauge (The Information Threshold Meter) */}
          <Card className="border-[var(--wp-border)] shadow-xs overflow-hidden">
            <CardHeader className="bg-[var(--wp-surface-subtle)]/40 border-b border-[var(--wp-border)] pb-3">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-[var(--wp-accent)]/10 text-[var(--wp-accent)] border border-[var(--wp-accent)]/20">
                    <Compass className="h-4 w-4" />
                  </div>
                  <div>
                    <CardTitle className="text-sm font-semibold">Information Threshold Model</CardTitle>
                    <p className="text-[11px] text-[var(--wp-text-secondary)]">The Understanding Gauge evaluates 4 core baseline dimensions before drafting terms.</p>
                  </div>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  <span className="text-xs font-mono text-[var(--wp-text-secondary)]">Readiness:</span>
                  <Badge
                    className={`text-xs font-mono font-semibold ${
                      sessionState?.understandingGauge && sessionState.understandingGauge >= 85
                        ? "bg-emerald-500/10 text-emerald-600 border-emerald-500/20"
                        : "bg-[var(--wp-accent)]/10 text-[var(--wp-accent)] border-[var(--wp-accent)]/20"
                    }`}
                  >
                    {sessionState ? `${sessionState.understandingGauge}% Complete` : "0% Initializing"}
                  </Badge>
                </div>
              </div>

              {/* Animated Progress Bar */}
              <div className="w-full bg-[var(--wp-surface-subtle)] h-2 rounded-full mt-3 overflow-hidden border border-[var(--wp-border)]">
                <div
                  className="h-full bg-gradient-to-r from-amber-500 to-emerald-500 transition-all duration-700 ease-out"
                  style={{ width: `${sessionState?.understandingGauge || (rawGoal ? 25 : 0)}%` }}
                />
              </div>
            </CardHeader>

            <CardContent className="p-4 sm:p-5">
              {/* 4 Core Dimensions Status Cards */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
                {/* 1. Core Objective */}
                <div className="p-3 rounded-xl border border-[var(--wp-border)] bg-background space-y-1">
                  <div className="flex items-center justify-between">
                    <span className="font-semibold text-[var(--wp-text-primary)] text-[11px]">1. Core Objective</span>
                    {sessionState?.dimensions?.coreObjective?.status === "satisfied" ? (
                      <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />
                    ) : (
                      <span className="h-2 w-2 rounded-full bg-amber-400 animate-pulse" />
                    )}
                  </div>
                  <p className="text-[10px] text-[var(--wp-text-secondary)] leading-relaxed line-clamp-2">
                    {sessionState?.dimensions?.coreObjective?.summary || "Target business outcome or physical asset."}
                  </p>
                </div>

                {/* 2. Technical Constraints */}
                <div className="p-3 rounded-xl border border-[var(--wp-border)] bg-background space-y-1">
                  <div className="flex items-center justify-between">
                    <span className="font-semibold text-[var(--wp-text-primary)] text-[11px]">2. Tech Constraints</span>
                    {sessionState?.dimensions?.technicalConstraints?.status === "satisfied" ? (
                      <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />
                    ) : (
                      <span className="h-2 w-2 rounded-full bg-neutral-300 dark:bg-neutral-700" />
                    )}
                  </div>
                  <p className="text-[10px] text-[var(--wp-text-secondary)] leading-relaxed line-clamp-2">
                    {sessionState?.dimensions?.technicalConstraints?.summary || "Platforms, APIs, stacks, or compliance rules."}
                  </p>
                </div>

                {/* 3. Validation Proof */}
                <div className="p-3 rounded-xl border border-[var(--wp-border)] bg-background space-y-1">
                  <div className="flex items-center justify-between">
                    <span className="font-semibold text-[var(--wp-text-primary)] text-[11px]">3. Validation Proof</span>
                    {sessionState?.dimensions?.validationProof?.status === "satisfied" ? (
                      <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />
                    ) : (
                      <span className="h-2 w-2 rounded-full bg-neutral-300 dark:bg-neutral-700" />
                    )}
                  </div>
                  <p className="text-[10px] text-[var(--wp-text-secondary)] leading-relaxed line-clamp-2">
                    {sessionState?.dimensions?.validationProof?.summary || "Objective third-party proof confirming completion."}
                  </p>
                </div>

                {/* 4. Boundary Constraints */}
                <div className="p-3 rounded-xl border border-[var(--wp-border)] bg-background space-y-1">
                  <div className="flex items-center justify-between">
                    <span className="font-semibold text-[var(--wp-text-primary)] text-[11px]">4. Boundary Limits</span>
                    {sessionState?.dimensions?.boundaryConstraints?.status === "satisfied" ? (
                      <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />
                    ) : (
                      <span className="h-2 w-2 rounded-full bg-neutral-300 dark:bg-neutral-700" />
                    )}
                  </div>
                  <p className="text-[10px] text-[var(--wp-text-secondary)] leading-relaxed line-clamp-2">
                    {sessionState?.dimensions?.boundaryConstraints?.summary || "Resource limits, timelines, and explicit non-features."}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* If Session Has Not Started: Cold Start Ingest Screen */}
          {!sessionState && (
            <Card className="border-[var(--wp-border)] shadow-xs">
              <CardHeader className="pb-4">
                <CardTitle className="text-base font-semibold">Step 1: State Your Ultimate Objective</CardTitle>
                <CardDescription className="text-xs text-[var(--wp-text-secondary)]">
                  Don't worry about technical architectures or programming terms. Simply describe what you want built or solved.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <form onSubmit={handleStartConsultation} className="space-y-4">
                  <div className="space-y-1.5">
                    <Label htmlFor="scoping-raw-goal" className="text-xs font-semibold">
                      Your Goal in Plain English
                    </Label>
                    <textarea
                      id="scoping-raw-goal"
                      rows={5}
                      value={rawGoal}
                      onChange={(e) => setRawGoal(e.target.value)}
                      placeholder="Describe what you want to achieve (e.g. My computer network is slow and drops connection during video calls, or I need an automated data sync between our PostgreSQL database and Shopify, or we need our web app tested for vulnerabilities with remediation proof)..."
                      className="w-full rounded-xl border border-[var(--wp-border)] bg-[var(--wp-surface-subtle)] p-4 text-sm placeholder:text-[var(--wp-text-secondary)] focus:outline-none focus:ring-1 focus:ring-[var(--wp-accent)] focus:bg-background transition-all resize-y"
                    />
                    <p className="text-[11px] text-[var(--wp-text-secondary)] italic mt-1.5">
                      Pro-tip: Feel free to mention your current tools, environment, or any preferred turnaround timeline or budget ceiling. Our diagnostician will structure the technical blueprints and verification proof.
                    </p>
                  </div>

                  <div className="pt-2 flex justify-end">
                    <Button
                      type="submit"
                      disabled={loadingDiagnostic || !rawGoal.trim()}
                      className="text-xs font-semibold"
                    >
                      <Sparkles className="h-3.5 w-3.5 mr-1.5" />
                      {loadingDiagnostic ? "Diagnosing Requirements..." : "Analyze Objective & Scope"}
                    </Button>
                  </div>
                </form>
              </CardContent>
            </Card>
          )}

          {/* Ongoing Consultative Dialogue Loop */}
          {sessionState && !sessionState.thresholdMet && (
            <div className="space-y-6">
              {/* Dialogue Transcript */}
              <div className="space-y-3">
                {sessionState.dialogue.map((msg, i) => (
                  <div
                    key={msg.id || i}
                    className={`flex gap-3 text-xs ${
                      msg.role === "assistant" ? "justify-start" : "justify-end"
                    }`}
                  >
                    {msg.role === "assistant" && (
                      <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-[var(--wp-accent)] text-white font-bold text-[11px]">
                        AI
                      </div>
                    )}
                    <div
                      className={`p-3.5 rounded-2xl max-w-xl leading-relaxed ${
                        msg.role === "assistant"
                          ? "bg-[var(--wp-surface-subtle)] border border-[var(--wp-border)] text-[var(--wp-text-primary)]"
                          : "bg-[var(--wp-accent)] text-white font-medium"
                      }`}
                    >
                      {msg.content}
                    </div>
                  </div>
                ))}
              </div>

              {/* Layer 3: Interactive Option Selection Group */}
              {sessionState.currentOptions && sessionState.currentOptions.length > 0 && (
                <div className="space-y-3 pt-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-[var(--wp-text-primary)] flex items-center gap-1.5">
                      <Layers className="h-3.5 w-3.5 text-[var(--wp-accent)]" />
                      Strategic Choices (Select one to lock down requirements):
                    </span>
                    {sessionState.currentHelperContext && (
                      <span className="text-[10px] text-[var(--wp-text-secondary)] italic">
                        {sessionState.currentHelperContext}
                      </span>
                    )}
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    {sessionState.currentOptions.map((opt) => (
                      <button
                        key={opt.id}
                        type="button"
                        disabled={loadingDiagnostic}
                        onClick={() => handleSelectOption(opt)}
                        className="p-4 rounded-xl border border-[var(--wp-border)] bg-background hover:border-[var(--wp-accent)] hover:shadow-sm text-left transition-all space-y-2.5 flex flex-col justify-between group relative disabled:opacity-60"
                      >
                        <div>
                          <div className="flex items-center justify-between gap-1 mb-1">
                            <span className="font-semibold text-xs text-[var(--wp-text-primary)] group-hover:text-[var(--wp-accent)]">
                              {opt.title}
                            </span>
                            {opt.badge && (
                              <Badge variant="outline" className="text-[9px] font-mono border-[var(--wp-border)] shrink-0">
                                {opt.badge}
                              </Badge>
                            )}
                          </div>

                          <div className="space-y-1.5 text-[11px] text-[var(--wp-text-secondary)] mt-2">
                            <div>
                              <strong className="text-[var(--wp-text-primary)] font-medium">Best if: </strong>
                              {opt.bestIf}
                            </div>
                            <div>
                              <strong className="text-[var(--wp-text-primary)] font-medium">Developer builds: </strong>
                              {opt.developerBuilds}
                            </div>
                          </div>
                        </div>

                        <div className="pt-2 border-t border-[var(--wp-border)]/60 text-[10px] text-[var(--wp-accent)] font-medium flex items-center justify-between">
                          <span>Trade-off: {opt.tradeOff}</span>
                          <ArrowRight className="h-3 w-3 group-hover:translate-x-0.5 transition-transform" />
                        </div>
                      </button>
                    ))}
                  </div>

                  {/* Or Custom Write-In Input */}
                  <form onSubmit={handleCustomAnswer} className="pt-2 flex items-center gap-2">
                    <Input
                      placeholder="Or specify a custom preference or constraint..."
                      value={customAnswer}
                      onChange={(e) => setCustomAnswer(e.target.value)}
                      disabled={loadingDiagnostic}
                      className="text-xs"
                    />
                    <Button
                      type="submit"
                      size="sm"
                      disabled={loadingDiagnostic || !customAnswer.trim()}
                      className="text-xs shrink-0"
                    >
                      <Send className="h-3.5 w-3.5 mr-1" />
                      Submit Choice
                    </Button>
                  </form>
                </div>
              )}
            </div>
          )}

          {/* ========================================================================= */}
          {/* THE REVERSE PITCH PROTOCOL: EXECUTIVE PROJECT INTENT CANVAS               */}
          {/* ========================================================================= */}
          {sessionState && sessionState.thresholdMet && sessionState.reversePitchCanvas && (
            <div className="space-y-6 pt-2">
              <Card className="border-emerald-500/30 shadow-md bg-background overflow-hidden">
                <CardHeader className="bg-emerald-500/10 border-b border-emerald-500/20 pb-4">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div className="flex items-center gap-2.5">
                      <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-500/20 text-emerald-600 border border-emerald-500/30">
                        <ShieldCheck className="h-5 w-5" />
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <CardTitle className="text-base font-bold text-[var(--wp-text-primary)]">
                            Executive Project Intent Canvas
                          </CardTitle>
                          <Badge className="bg-emerald-500/10 text-emerald-600 border-emerald-500/20 text-[10px] font-mono">
                            Scope Baselined
                          </Badge>
                        </div>
                        <p className="text-[11px] text-[var(--wp-text-secondary)] mt-0.5">
                          Review this consultative summary. Once approved, it is cryptographically locked as <code>v1_baseline</code> to protect your PayPal payment authorization.
                        </p>
                      </div>
                    </div>

                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={handleResetConsultation}
                      className="text-xs h-8 shrink-0"
                    >
                      <RotateCcw className="h-3 w-3 mr-1" />
                      Start Over
                    </Button>
                  </div>
                </CardHeader>

                <CardContent className="p-5 sm:p-6 space-y-6">
                  {/* Canvas Title & Domain */}
                  <div className="flex items-center justify-between pb-3 border-b border-[var(--wp-border)]">
                    <div>
                      <span className="text-[10px] uppercase font-mono text-[var(--wp-text-secondary)] block">
                        Project Agreement Title
                      </span>
                      <h2 className="text-lg font-bold text-[var(--wp-text-primary)] mt-0.5">
                        {sessionState.reversePitchCanvas.title}
                      </h2>
                    </div>
                    <Badge variant="outline" className="text-xs font-mono border-[var(--wp-border)]">
                      {sessionState.reversePitchCanvas.domain}
                    </Badge>
                  </div>

                  {/* 4 Pillars of the Cognitive Scope Canvas */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
                    {/* Pillar 1 */}
                    <div className="p-4 rounded-xl border border-[var(--wp-border)] bg-[var(--wp-surface-subtle)]/40 space-y-1.5">
                      <div className="flex items-center gap-1.5 text-[var(--wp-accent)] font-semibold">
                        <PackageCheck className="h-4 w-4" />
                        <span>1. What We Are Building</span>
                      </div>
                      <p className="text-[11px] text-[var(--wp-text-secondary)] leading-relaxed">
                        {sessionState.reversePitchCanvas.whatWeAreBuilding}
                      </p>
                    </div>

                    {/* Pillar 2 */}
                    <div className="p-4 rounded-xl border border-[var(--wp-border)] bg-[var(--wp-surface-subtle)]/40 space-y-1.5">
                      <div className="flex items-center gap-1.5 text-blue-600 font-semibold">
                        <Layers className="h-4 w-4" />
                        <span>2. How It Operates & Delivers</span>
                      </div>
                      <p className="text-[11px] text-[var(--wp-text-secondary)] leading-relaxed">
                        {sessionState.reversePitchCanvas.howItDelivers}
                      </p>
                    </div>

                    {/* Pillar 3 */}
                    <div className="p-4 rounded-xl border border-[var(--wp-border)] bg-[var(--wp-surface-subtle)]/40 space-y-1.5">
                      <div className="flex items-center gap-1.5 text-emerald-600 font-semibold">
                        <ShieldCheck className="h-4 w-4" />
                        <span>3. How Success Is Proven (Validation Proof)</span>
                      </div>
                      <p className="text-[11px] text-[var(--wp-text-secondary)] leading-relaxed">
                        {sessionState.reversePitchCanvas.howSuccessIsProven}
                      </p>
                    </div>

                    {/* Pillar 4 */}
                    <div className="p-4 rounded-xl border border-[var(--wp-border)] bg-[var(--wp-surface-subtle)]/40 space-y-1.5">
                      <div className="flex items-center gap-1.5 text-amber-600 font-semibold">
                        <Clock className="h-4 w-4" />
                        <span>4. Boundaries & Turnaround Limits</span>
                      </div>
                      <p className="text-[11px] text-[var(--wp-text-secondary)] leading-relaxed">
                        {sessionState.reversePitchCanvas.boundariesAndLimits}
                      </p>
                    </div>
                  </div>

                  {/* Suggested Milestones Blueprint */}
                  <div className="space-y-3 pt-2">
                    <span className="text-xs font-semibold text-[var(--wp-text-primary)] block">
                      Proposed Milestone Progression & Deliverable Checks:
                    </span>

                    <div className="space-y-2">
                      {sessionState.reversePitchCanvas.suggestedMilestones.map((m, idx) => (
                        <div
                          key={m.title}
                          className="p-3 rounded-xl border border-[var(--wp-border)] bg-background flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs"
                        >
                          <div className="flex items-start gap-2.5">
                            <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[var(--wp-surface-subtle)] font-mono text-[10px] text-[var(--wp-text-secondary)]">
                              {idx + 1}
                            </span>
                            <div>
                              <div className="font-semibold text-[var(--wp-text-primary)]">
                                {m.title}
                              </div>
                              <p className="text-[11px] text-[var(--wp-text-secondary)] mt-0.5">
                                {m.description}
                              </p>
                              <div className="text-[10px] text-emerald-600 mt-1 flex items-center gap-1">
                                <Check className="h-3 w-3" />
                                <span>Verification Check: {m.deliverableCheck}</span>
                              </div>
                            </div>
                          </div>

                          <div className="text-right shrink-0">
                            <div className="font-mono font-bold text-sm text-[var(--wp-text-primary)]">
                              ${(m.amountMinor / 100).toFixed(2)}
                            </div>
                            <span className="text-[10px] text-[var(--wp-text-secondary)]">
                              {m.percentage}% of allocation
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Valuation & Non-Custodial Guarantee */}
                  <div className="p-4 rounded-xl border border-[var(--wp-border)] bg-[var(--wp-surface-subtle)]/50 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <Label htmlFor="custom-budget-input" className="text-xs font-semibold text-[var(--wp-text-secondary)]">
                          Project Spend Ceiling (Editable):
                        </Label>
                        <Badge variant="outline" className="text-[9px] font-mono border-[var(--wp-border)] text-emerald-600 dark:text-emerald-400">
                          Live recalculation
                        </Badge>
                      </div>
                      <div className="flex items-center gap-2 mt-1">
                        <div className="relative flex items-center">
                          <span className="absolute left-3 text-lg font-bold font-mono text-[var(--wp-text-secondary)]">$</span>
                          <Input
                            id="custom-budget-input"
                            type="number"
                            min={10}
                            max={100000}
                            step={10}
                            value={customBudgetDollars}
                            onChange={(e) => handleUpdateBudget(e.target.value)}
                            className="pl-7 pr-3 h-10 w-36 text-lg font-bold font-mono bg-background border-[var(--wp-border)] rounded-xl"
                            aria-label="Edit project spend ceiling"
                          />
                        </div>
                        <span className="text-sm font-semibold text-[var(--wp-text-secondary)]">USD</span>
                      </div>
                      <p className="text-[11px] text-[var(--wp-text-secondary)] mt-1 max-w-xl">
                        Non-custodial PayPal payment hold rule: Funds are never deducted upfront. A conditional two-party hold is placed for your approved ceiling, and funds are captured only upon your explicit milestone verification.
                      </p>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      <Button
                        type="button"
                        size="lg"
                        disabled={finalizing}
                        onClick={handleApproveBaseline}
                        className="text-xs font-semibold bg-emerald-600 hover:bg-emerald-700 text-white"
                      >
                        <Check className="h-4 w-4 mr-1.5" />
                        {finalizing ? "Freezing Baseline..." : "Yes, You Nailed It - Approve Baseline"}
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>
          )}
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODE 2: DIRECT MANUAL TASK FORM (EXPRESS MODE)                           */}
      {/* ========================================================================= */}
      {mode === "manual" && (
        <Card className="border-[var(--wp-border)] shadow-xs">
          <CardHeader className="pb-4">
            <CardTitle className="text-base font-semibold">Express Specification Form</CardTitle>
            <CardDescription className="text-xs text-[var(--wp-text-secondary)]">
              Directly enter your requirements, spend limit, and deadline for immediate autonomous contract planning.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={onManualSubmit} className="space-y-5">
              <div className="space-y-1.5">
                <Label htmlFor="manual-task-description" className="text-xs font-semibold">
                  What do you need accomplished?
                </Label>
                <textarea
                  id="manual-task-description"
                  rows={5}
                  value={manualDescription}
                  onChange={(e) => setManualDescription(e.target.value)}
                  placeholder="Describe the deliverable, constraints, and how you will judge completion..."
                  required
                  className="w-full rounded-xl border border-[var(--wp-border)] bg-[var(--wp-surface-subtle)] p-4 text-sm text-[var(--wp-text-primary)] placeholder:text-[var(--wp-text-secondary)] focus:outline-none focus:ring-1 focus:ring-[var(--wp-accent)] focus:bg-background transition-all resize-y"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="space-y-1.5">
                  <Label htmlFor="manual-spend-cap" className="text-xs font-semibold">
                    Spend Limit (USD)
                  </Label>
                  <div className="flex items-center gap-2 px-3 py-2 rounded-xl border border-[var(--wp-border)] bg-[var(--wp-surface-subtle)]">
                    <span className="font-semibold text-sm text-[var(--wp-text-primary)]">$</span>
                    <input
                      id="manual-spend-cap"
                      type="number"
                      min="5"
                      step="1"
                      value={manualBudget}
                      onChange={(e) => setManualBudget(e.target.value)}
                      required
                      className="w-full bg-transparent text-sm font-semibold text-[var(--wp-text-primary)] focus:outline-none"
                    />
                  </div>
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="manual-finish-by" className="text-xs font-semibold">
                    Target Deadline
                  </Label>
                  <Input
                    id="manual-finish-by"
                    type="text"
                    value={manualDeadline}
                    onChange={(e) => setManualDeadline(e.target.value)}
                    placeholder="Tomorrow, 6:00 PM"
                    className="text-xs"
                  />
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="manual-task-files" className="text-xs font-semibold">
                    Attachment Reference
                  </Label>
                  <Input
                    id="manual-task-files"
                    type="text"
                    value={manualFilesNote}
                    onChange={(e) => setManualFilesNote(e.target.value)}
                    placeholder="Optional URL or CSV filename"
                    className="text-xs"
                  />
                </div>
              </div>

              <div className="pt-4 border-t border-[var(--wp-border)] flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div className="text-xs text-[var(--wp-text-secondary)]">
                  Funds are never deducted now. PayPal authorization is created only after you review and approve the structured contract.
                </div>

                <Button
                  type="submit"
                  disabled={manualSubmitting}
                  className="text-xs font-semibold shrink-0"
                >
                  <FileCode2 className="h-3.5 w-3.5 mr-1.5" />
                  {manualSubmitting ? "Drafting Agreement..." : "Draft Contract Specification"}
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
