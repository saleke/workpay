"use client";

import { useState, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
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
      // First line of description or trimmed request as title
      const trimmed = description.trim();
      const firstLine = trimmed.split("\n")[0]?.trim() || "";
      const derivedTitle = firstLine.length > 5 && firstLine.length < 80 ? firstLine : trimmed.slice(0, 60);

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
      <div className="py-20 text-center max-w-md mx-auto">
        <h1 className="font-serif text-[1.5rem] text-[var(--room-text-strong)] font-normal">
          Drafting your contract...
        </h1>
        <p className="text-[var(--room-muted)] mt-2 text-[var(--text-body)]">
          WorkPay is analyzing your request and structuring the requirements.
        </p>

        <div className="mt-8 space-y-3 text-left border-t border-[var(--room-rule)] pt-6">
          <div
            className={`flex items-center gap-3 text-[var(--text-body)] ${
              stepIndex >= 0 ? "text-[var(--room-text-strong)] font-medium" : "text-[var(--room-muted)]"
            }`}
          >
            <span
              className={`h-1.5 w-1.5 rounded-full ${
                stepIndex >= 0 ? "bg-[var(--room-met)]" : "bg-[var(--room-rule)]"
              }`}
            />
            <span>Read your request</span>
          </div>
          <div
            className={`flex items-center gap-3 text-[var(--text-body)] ${
              stepIndex >= 1 ? "text-[var(--room-text-strong)] font-medium" : "text-[var(--room-muted)]"
            }`}
          >
            <span
              className={`h-1.5 w-1.5 rounded-full ${
                stepIndex >= 1 ? "bg-[var(--room-met)]" : "bg-[var(--room-rule)]"
              }`}
            />
            <span>Writing the requirements</span>
          </div>
          <div
            className={`flex items-center gap-3 text-[var(--text-body)] ${
              stepIndex >= 2 ? "text-[var(--room-text-strong)] font-medium" : "text-[var(--room-muted)]"
            }`}
          >
            <span
              className={`h-1.5 w-1.5 rounded-full ${
                stepIndex >= 2 ? "bg-[var(--room-met)]" : "bg-[var(--room-rule)]"
              }`}
            />
            <span>Finding providers</span>
          </div>
        </div>
      </div>
    );
  }

  return (
    <>
      <p className="screen-label">New task</p>
      <div className="sheet">
        <div className="sheet-meta">
          New task. WorkPay turns this into a contract for you to sign.
        </div>

        {error && (
          <p className="note note-fail mt-3">
            {error}
          </p>
        )}

        <form onSubmit={onSubmit} className="mt-4 space-y-6">
          <div>
            <label
              htmlFor="task-description"
              className="block text-[var(--text-lead)] font-serif text-[var(--ink)] mb-2"
            >
              What do you need done?
            </label>
            <textarea
              id="task-description"
              rows={4}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Describe the deliverable, constraints, and how you will judge completion..."
              required
              className="w-full bg-transparent border-0 border-b border-[var(--paper-rule)] focus:border-[var(--ink)] text-[var(--text-body)] font-serif text-[var(--ink)] placeholder:text-[var(--ink-muted)] placeholder:italic focus:outline-none py-2 resize-y"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-6 pt-2">
            <div>
              <label htmlFor="spend-cap" className="lbl block mb-1">
                Spend up to
              </label>
              <div className="flex items-baseline border-b border-[var(--paper-rule)] focus-within:border-[var(--ink)]">
                <span className="text-[var(--ink)] font-serif mr-1">$</span>
                <input
                  id="spend-cap"
                  type="number"
                  min="1"
                  step="1"
                  value={budget}
                  onChange={(e) => setBudget(e.target.value)}
                  required
                  className="w-full bg-transparent border-0 text-[var(--text-body)] font-serif text-[var(--ink)] focus:outline-none py-1 amount"
                />
              </div>
            </div>

            <div>
              <label htmlFor="finish-by" className="lbl block mb-1">
                Finish by
              </label>
              <input
                id="finish-by"
                type="text"
                value={deadline}
                onChange={(e) => setDeadline(e.target.value)}
                placeholder="Tomorrow, 6:00 PM"
                className="w-full bg-transparent border-0 border-b border-[var(--paper-rule)] focus:border-[var(--ink)] text-[var(--text-body)] font-serif text-[var(--ink)] placeholder:text-[var(--ink-muted)] placeholder:italic focus:outline-none py-1"
              />
            </div>

            <div>
              <label htmlFor="task-files" className="lbl block mb-1">
                Files
              </label>
              <input
                id="task-files"
                type="text"
                value={filesNote}
                onChange={(e) => setFilesNote(e.target.value)}
                placeholder="Optional URL or attachment reference"
                className="w-full bg-transparent border-0 border-b border-[var(--paper-rule)] focus:border-[var(--ink)] text-[var(--text-body)] font-serif text-[var(--ink)] placeholder:text-[var(--ink-muted)] placeholder:italic focus:outline-none py-1"
              />
            </div>
          </div>

          <div className="pt-2">
            <span className="lbl block mb-2">Or choose a starting point:</span>
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
                  className="text-[var(--text-small)] font-serif px-2.5 py-1 border border-[var(--paper-rule)] text-[var(--ink-soft)] hover:border-[var(--ink)] hover:text-[var(--ink)] transition-colors text-left"
                >
                  {p.title}
                </button>
              ))}
            </div>
          </div>

          <div className="sheet-actions">
            <button
              type="submit"
              className="btn"
            >
              Draft the contract
            </button>
            <span className="lbl">
              Nothing is held until you sign the contract.
            </span>
          </div>
        </form>
      </div>
    </>
  );
}
