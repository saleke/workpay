"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

const SAMPLE_PROMPTS = [
  {
    title: "Clean 5,000 customer records",
    description: "Clean customer CSV. Remove duplicates, preserve customer IDs, validate emails, and keep schema intact.",
    budget: "150",
    deadline: "Tomorrow, 6:00 PM",
  },
  {
    title: "Translate onboarding guide to Spanish",
    description: "Translate product guide into formal Spanish. Preserve all Markdown links and match the 41 approved glossary terms.",
    budget: "80",
    deadline: "In 2 days",
  },
  {
    title: "Audit PostgreSQL schema and indices",
    description: "Analyze database tables for missing composite indexes, query performance bottlenecks, and foreign key cascades.",
    budget: "300",
    deadline: "In 3 days",
  },
];

const DEFAULT_PROMPT = SAMPLE_PROMPTS[0]!;

export default function LandingPage() {
  const router = useRouter();
  const [selectedPrompt, setSelectedPrompt] = useState(DEFAULT_PROMPT);
  const [requestText, setRequestText] = useState(DEFAULT_PROMPT.description);
  const [spendUpTo, setSpendUpTo] = useState(DEFAULT_PROMPT.budget);
  const [deadlineText, setDeadlineText] = useState(DEFAULT_PROMPT.deadline);

  const handleSelectPrompt = (prompt: (typeof SAMPLE_PROMPTS)[number]) => {
    setSelectedPrompt(prompt);
    setRequestText(prompt.description);
    setSpendUpTo(prompt.budget);
    setDeadlineText(prompt.deadline);
  };

  const handleStartDraft = (e: React.FormEvent) => {
    e.preventDefault();
    const query = new URLSearchParams({
      desc: requestText.trim(),
      budget: spendUpTo.trim() || "150",
    });
    router.push(`/tasks/new?${query.toString()}`);
  };

  return (
    <div className="min-h-screen bg-[var(--room)] text-[var(--room-text)] px-4 py-6 sm:py-10">
      <div className="mx-auto max-w-[52rem]">
        {/* The Shell (Header on the room) */}
        <header className="flex flex-wrap items-baseline gap-4 sm:gap-6 pb-6 text-sm text-[var(--room-muted)]">
          <Link
            href="/"
            className="font-[family-name:var(--font-voice)] text-xl font-normal text-[var(--room-text-strong)] mr-auto tracking-tight"
          >
            WorkPay
          </Link>
          <a href="#thesis" className="hover:text-[var(--room-text-strong)] transition-colors">
            Thesis
          </a>
          <a href="#proof" className="hover:text-[var(--room-text-strong)] transition-colors">
            Proof engine
          </a>
          <Link href="/tasks" className="hover:text-[var(--room-text-strong)] transition-colors">
            Tasks
          </Link>
          <Link href="/login" className="hover:text-[var(--room-text-strong)] transition-colors">
            Sign in
          </Link>
          <Link
            href="/tasks/new"
            className="rounded-[var(--radius-control)] bg-[var(--paper)] px-3 py-1 text-xs font-medium text-[var(--ink)] hover:opacity-90 transition-opacity"
          >
            New task
          </Link>
        </header>

        {/* The Hero Contract Sheet (The only bright object on the screen) */}
        <main className="sheet mt-4 mb-14 shadow-xs">
          <div className="sheet-meta">
            WorkPay specification 01. Autonomous execution and payment on proof.
          </div>

          <h1 className="sheet-title text-2xl sm:text-3xl mt-2 mb-3">
            Money follows proof
          </h1>

          <p className="text-[var(--ink-soft)] leading-relaxed">
            You tell WorkPay what you need done. It turns your intent into a binding contract with explicit requirements, holds the funds in PayPal escrow, finds an eligible provider, and releases the money only when every requirement is proven.
          </p>

          <hr className="rule" />

          {/* Interactive Intake on the Sheet */}
          <form onSubmit={handleStartDraft} className="space-y-4">
            <div>
              <div className="sheet-meta mb-1 font-medium">What do you need done?</div>
              <textarea
                value={requestText}
                onChange={(e) => setRequestText(e.target.value)}
                rows={3}
                required
                className="w-full bg-transparent border-0 border-b border-[var(--paper-rule)] px-0 py-1 text-[var(--ink)] font-[family-name:var(--font-voice)] text-base focus:border-[var(--ink)] focus:outline-hidden resize-none leading-relaxed"
                placeholder="Describe the outcome you want verified..."
              />
            </div>

            {/* Prompt preset suggestions */}
            <div className="flex flex-wrap items-center gap-2 pt-1">
              <span className="sheet-meta">Examples:</span>
              {SAMPLE_PROMPTS.map((p) => (
                <button
                  key={p.title}
                  type="button"
                  onClick={() => handleSelectPrompt(p)}
                  className={`text-xs px-2 py-0.5 rounded-[var(--radius-sheet)] border transition-colors ${
                    selectedPrompt.title === p.title
                      ? "border-[var(--ink)] text-[var(--ink)] font-medium"
                      : "border-[var(--paper-rule)] text-[var(--ink-muted)] hover:text-[var(--ink)]"
                  }`}
                >
                  {p.title}
                </button>
              ))}
            </div>

            {/* Three Ruled Blanks */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-3">
              <div>
                <div className="sheet-meta mb-1">Spend up to</div>
                <div className="flex items-baseline border-b border-[var(--paper-rule)] focus-within:border-[var(--ink)]">
                  <span className="font-mono text-sm text-[var(--ink-muted)] mr-1">$</span>
                  <input
                    type="number"
                    min="1"
                    value={spendUpTo}
                    onChange={(e) => setSpendUpTo(e.target.value)}
                    className="w-full bg-transparent border-0 px-0 py-1 font-mono text-sm text-[var(--ink)] focus:outline-hidden"
                  />
                </div>
              </div>

              <div>
                <div className="sheet-meta mb-1">Deadline</div>
                <div className="border-b border-[var(--paper-rule)] focus-within:border-[var(--ink)]">
                  <input
                    type="text"
                    value={deadlineText}
                    onChange={(e) => setDeadlineText(e.target.value)}
                    className="w-full bg-transparent border-0 px-0 py-1 text-sm text-[var(--ink)] focus:outline-hidden"
                  />
                </div>
              </div>

              <div>
                <div className="sheet-meta mb-1">Files</div>
                <div className="border-b border-[var(--paper-rule)] py-1 text-xs text-[var(--ink-muted)]">
                  Input dataset attached
                </div>
              </div>
            </div>

            <div className="pt-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <span className="sheet-meta">
                Nothing is held until you review and sign.
              </span>
              <button type="submit" className="btn self-start sm:self-auto">
                Draft the contract
              </button>
            </div>
          </form>

          <hr className="rule" />

          {/* Living Proof Demonstration */}
          <div id="proof" className="space-y-3 pt-1">
            <div className="sheet-meta">
              Sample contract in force. Translate onboarding guide to Spanish.
            </div>

            <div className="space-y-2 pt-1">
              <div className="flex items-start justify-between gap-3 py-1.5 border-b border-[var(--paper-rule)] text-sm">
                <div>
                  <span>1. Preserve every code snippet and link formatting</span>
                </div>
                <span className="state-label note-met shrink-0">Met</span>
              </div>

              <div className="flex items-start justify-between gap-3 py-1.5 border-b border-[var(--paper-rule)] text-sm">
                <div>
                  <span>2. Maintain formal Latin American Spanish (usted)</span>
                </div>
                <span className="state-label note-met shrink-0">Met</span>
              </div>

              <div className="flex items-start justify-between gap-3 py-1.5 border-b border-[var(--paper-rule)] text-sm">
                <div className="space-y-0.5">
                  <span>3. Match 41 approved product terminology keys</span>
                  <p className="note note-unsure text-xs">
                    38 of 41 terms matched. Three were unclear.
                  </p>
                </div>
                <span className="state-label note-unsure shrink-0">Review needed</span>
              </div>
            </div>

            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-3">
              <div className="text-sm">
                <span className="amount font-semibold">$80</span> is held in PayPal escrow. It stays held until you decide.
              </div>
              <div className="stamp note-fail border-[var(--ink-fail)] shrink-0 self-start sm:self-auto">
                Payment held
              </div>
            </div>
          </div>
        </main>

        {/* The Room Pillars (Beneath the sheet) */}
        <section id="thesis" className="border-t border-[var(--room-rule)] pt-8 pb-12">
          <p className="text-xs uppercase tracking-wider text-[var(--room-muted)] font-mono mb-6">
            The Three Principles
          </p>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-8 text-sm">
            <div className="space-y-2">
              <h3 className="font-[family-name:var(--font-voice)] text-base font-normal text-[var(--room-text-strong)]">
                1. Intent to contract
              </h3>
              <p className="text-[var(--room-muted)] leading-relaxed">
                You speak in natural language. WorkPay synthesizes verifiable requirements with mathematical acceptance boundaries. No vague deliverables or moving goalposts.
              </p>
            </div>

            <div className="space-y-2">
              <h3 className="font-[family-name:var(--font-voice)] text-base font-normal text-[var(--room-text-strong)]">
                2. Autonomous matching
              </h3>
              <p className="text-[var(--room-muted)] leading-relaxed">
                WorkPay finds qualified providers across GitHub and specialist pools. It negotiates within your spend limit, but can never raise your limit without your signature.
              </p>
            </div>

            <div className="space-y-2">
              <h3 className="font-[family-name:var(--font-voice)] text-base font-normal text-[var(--room-text-strong)]">
                3. PayPal escrow on proof
              </h3>
              <p className="text-[var(--room-muted)] leading-relaxed">
                Funds are held upfront in PayPal escrow so the specialist knows the money is real. Not a cent is released on delivery. Payment is released only when automated verification passes.
              </p>
            </div>
          </div>
        </section>

        {/* Footer */}
        <footer className="border-t border-[var(--room-rule)] py-6 flex flex-wrap items-center justify-between gap-4 text-xs text-[var(--room-muted)]">
          <div>WorkPay. Autonomous Agentic Escrow Engine.</div>
          <div className="flex items-center gap-4">
            <Link href="/tasks" className="hover:text-[var(--room-text-strong)]">
              Tasks
            </Link>
            <Link href="/payments" className="hover:text-[var(--room-text-strong)]">
              Payments
            </Link>
            <Link href="/review" className="hover:text-[var(--room-text-strong)]">
              Arbitration
            </Link>
            <Link href="/login" className="hover:text-[var(--room-text-strong)]">
              Sign in
            </Link>
          </div>
        </footer>
      </div>
    </div>
  );
}
