"use client";

import { useState, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ArrowRight, CheckCircle2, Clock, Paperclip, Sparkles, AlertCircle } from "lucide-react";
import { createTask, requestPlanning } from "@/lib/api/endpoints";

function newIdempotencyKey(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return `key-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

const PRESETS = [
  {
    title: "Clean 5,000 customer records",
    desc: "Clean, deduplicate, and normalize 5,000 customer records in the attached CSV. Preserve customer IDs, validate emails, and reduce duplicate entries below 1%.",
    budget: "150",
    deadline: "Tomorrow, 6:00 PM",
  },
  {
    title: "Translate onboarding guide to Spanish",
    desc: "Translate our 14-page onboarding guide into neutral Latin American Spanish. Must strictly adhere to the approved product terminology list and preserve markdown syntax.",
    budget: "80",
    deadline: "In 2 days",
  },
  {
    title: "Verify Stripe webhook idempotency",
    desc: "Audit the subscription payment webhook handler in payments-router.ts. Add unit tests verifying duplicate events return HTTP 200 without duplicate database inserts.",
    budget: "120",
    deadline: "Friday, 5:00 PM",
  },
];

export default function NewTaskPage() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [description, setDescription] = useState("");
  const [budget, setBudget] = useState("150");
  const [deadline, setDeadline] = useState("Tomorrow, 6:00 PM");
  const [filesNote, setFilesNote] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [stepIndex, setStepIndex] = useState(0);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const descParam = searchParams.get("desc");
    const budgetParam = searchParams.get("budget");
    const deadlineParam = searchParams.get("deadline");

    if (descParam) setDescription(descParam);
    if (budgetParam) setBudget(budgetParam);
    if (deadlineParam) setDeadline(deadlineParam);
  }, [searchParams]);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const amountMinor = Math.round(Number(budget) * 100);
    if (!Number.isFinite(amountMinor) || amountMinor <= 0) {
      setError("Please specify a valid dollar amount.");
      return;
    }

    setSubmitting(true);
    setStepIndex(1);

    try {
      // Automatic title generation: do not make the user enter a title separately
      const trimmed = description.trim();
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
          rawRequest: filesNote ? `${trimmed}\n\nReference files: ${filesNote}` : trimmed,
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
        setSubmitting(false);
        return;
      }

      setStepIndex(2);

      // Kick off autonomous contract planning
      await requestPlanning(created.data.id);

      // Navigate to task workspace
      router.push(`/tasks/${created.data.id}`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "An unexpected error occurred.";
      setError(msg);
      setSubmitting(false);
    }
  };

  if (submitting) {
    return (
      <div className="py-24 text-center max-w-md mx-auto space-y-6">
        <Sparkles className="h-8 w-8 text-[var(--amber)] mx-auto animate-pulse" />
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-[var(--charcoal)]">
            Synthesizing contract specification...
          </h1>
          <p className="text-sm text-[var(--text-muted)] mt-1.5">
            WorkPay is analyzing your objective, structuring observable acceptance criteria, and preparing the PayPal escrow terms.
          </p>
        </div>

        <div className="workpay-card p-5 space-y-3 text-left">
          <div
            className={`flex items-center gap-3 text-xs sm:text-sm ${
              stepIndex >= 0 ? "text-[var(--charcoal)] font-medium" : "text-[var(--text-muted)]"
            }`}
          >
            <CheckCircle2
              className={`h-4 w-4 shrink-0 ${
                stepIndex >= 0 ? "text-[var(--green)]" : "text-[var(--border-strong)]"
              }`}
            />
            <span>Analyzing intent and constraints</span>
          </div>

          <div
            className={`flex items-center gap-3 text-xs sm:text-sm ${
              stepIndex >= 1 ? "text-[var(--charcoal)] font-medium" : "text-[var(--text-muted)]"
            }`}
          >
            <CheckCircle2
              className={`h-4 w-4 shrink-0 ${
                stepIndex >= 1 ? "text-[var(--green)]" : "text-[var(--border-strong)]"
              }`}
            />
            <span>Structuring verifiable acceptance criteria</span>
          </div>

          <div
            className={`flex items-center gap-3 text-xs sm:text-sm ${
              stepIndex >= 2 ? "text-[var(--charcoal)] font-medium" : "text-[var(--text-muted)]"
            }`}
          >
            <CheckCircle2
              className={`h-4 w-4 shrink-0 ${
                stepIndex >= 2 ? "text-[var(--green)]" : "text-[var(--border-strong)]"
              }`}
            />
            <span>Matching specialist and setting PayPal ceiling</span>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto space-y-6 pb-12">
      <div className="border-b border-[var(--border-subtle)] pb-4">
        <h1 className="text-2xl font-semibold tracking-tight text-[var(--charcoal)]">
          Create New Task
        </h1>
        <p className="text-sm text-[var(--text-muted)] mt-1">
          Describe what you need accomplished. WorkPay will automatically generate a contract with observable acceptance criteria for you to approve.
        </p>
      </div>

      <div className="workpay-card p-6 sm:p-7 space-y-6">
        {error && (
          <div className="p-3.5 rounded-xl bg-red-50 border border-red-200 text-xs text-red-700 flex items-center gap-2">
            <AlertCircle className="h-4 w-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        <form onSubmit={onSubmit} className="space-y-6">
          <div>
            <label
              htmlFor="task-description"
              className="block text-sm font-semibold text-[var(--charcoal)] mb-2"
            >
              What do you need done?
            </label>
            <textarea
              id="task-description"
              rows={5}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Describe the deliverable, constraints, and how you will judge completion (e.g. Clean 5,000 customer records in the attached CSV. Remove duplicates, preserve customer IDs, validate emails...)"
              required
              className="w-full rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-subtle)] p-4 text-sm text-[var(--charcoal)] placeholder:text-[var(--text-muted)] focus:outline-none focus:ring-2 focus:ring-[var(--charcoal)] focus:bg-white transition-all resize-y"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label htmlFor="spend-cap" className="block text-xs font-semibold text-[var(--text-muted)] mb-1.5 uppercase tracking-wider">
                Spend Limit (USD)
              </label>
              <div className="flex items-center gap-2 px-3 py-2 rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-subtle)] focus-within:ring-1 focus-within:ring-[var(--charcoal)] focus-within:bg-white transition-all">
                <span className="font-semibold text-sm text-[var(--charcoal)]">$</span>
                <input
                  id="spend-cap"
                  type="number"
                  min="5"
                  step="1"
                  value={budget}
                  onChange={(e) => setBudget(e.target.value)}
                  required
                  className="w-full bg-transparent text-sm font-semibold text-[var(--charcoal)] focus:outline-none"
                />
              </div>
            </div>

            <div>
              <label htmlFor="finish-by" className="block text-xs font-semibold text-[var(--text-muted)] mb-1.5 uppercase tracking-wider">
                Target Deadline
              </label>
              <input
                id="finish-by"
                type="text"
                value={deadline}
                onChange={(e) => setDeadline(e.target.value)}
                placeholder="Tomorrow, 6:00 PM"
                className="w-full px-3 py-2 rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-subtle)] text-sm text-[var(--charcoal)] placeholder:text-[var(--text-muted)] focus:outline-none focus:ring-1 focus:ring-[var(--charcoal)] focus:bg-white transition-all"
              />
            </div>

            <div>
              <label htmlFor="task-files" className="block text-xs font-semibold text-[var(--text-muted)] mb-1.5 uppercase tracking-wider">
                Attachment Reference
              </label>
              <input
                id="task-files"
                type="text"
                value={filesNote}
                onChange={(e) => setFilesNote(e.target.value)}
                placeholder="Optional URL or CSV filename"
                className="w-full px-3 py-2 rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-subtle)] text-sm text-[var(--charcoal)] placeholder:text-[var(--text-muted)] focus:outline-none focus:ring-1 focus:ring-[var(--charcoal)] focus:bg-white transition-all"
              />
            </div>
          </div>

          {/* Sample Prompts */}
          <div className="pt-2">
            <span className="block text-xs font-semibold text-[var(--text-muted)] mb-2">
              Or select a sample objective:
            </span>
            <div className="flex flex-wrap gap-2">
              {PRESETS.map((p) => (
                <button
                  key={p.title}
                  type="button"
                  onClick={() => {
                    setDescription(p.desc);
                    setBudget(p.budget);
                    setDeadline(p.deadline);
                  }}
                  className="text-xs text-[var(--charcoal)] bg-[var(--surface-subtle)] hover:bg-amber-50 hover:border-amber-200 border border-[var(--border-subtle)] px-3 py-1.5 rounded-lg transition-colors text-left font-medium"
                >
                  {p.title} (${p.budget})
                </button>
              ))}
            </div>
          </div>

          <div className="pt-4 border-t border-[var(--border-subtle)] flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="text-xs text-[var(--text-muted)]">
              Funds are never deducted now. PayPal escrow is authorized only after you review and approve the structured contract.
            </div>

            <button
              type="submit"
              className="flex items-center gap-2 bg-[var(--charcoal)] text-white hover:bg-black px-5 py-2.5 rounded-xl text-sm font-medium transition-all shadow-sm shrink-0 self-start sm:self-auto"
            >
              <span>Draft specification</span>
              <ArrowRight className="h-4 w-4" />
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
