"use client";

import { useCallback, useState } from "react";
import Link from "next/link";
import { AlertTriangle, CheckCircle2, ChevronRight, FileCheck, Scale, ShieldAlert } from "lucide-react";
import { useApi } from "@/lib/use-api";
import { listCases, resolveCase } from "@/lib/api/endpoints";

function newIdempotencyKey(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return `key-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

export function CasesReviewList() {
  const { data, loading, reload } = useApi(() => listCases(), [], "cases");
  const [resolving, setResolving] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const resolve = useCallback(
    async (caseId: string, outcome: string) => {
      setResolving(caseId);
      setErr(null);
      const res = await resolveCase(caseId, { outcome }, newIdempotencyKey());
      setResolving(null);
      if (res.error) {
        setErr("Could not record ruling on this case.");
      } else {
        reload();
      }
    },
    [reload],
  );

  if (loading && !data) {
    return (
      <div className="py-20 text-center text-sm text-[var(--text-muted)]">
        Opening review cases...
      </div>
    );
  }

  const cases = data ?? [];

  if (cases.length === 0) {
    return (
      <div className="py-20 text-center max-w-md mx-auto">
        <Scale className="h-8 w-8 text-[var(--amber)] mx-auto mb-3" />
        <h1 className="text-xl font-semibold tracking-tight text-[var(--charcoal)]">
          No cases awaiting human review
        </h1>
        <p className="text-sm text-[var(--text-muted)] mt-1.5">
          Review cases are opened only when automated checking cannot conclusively decide a criterion or when an exception occurs.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6 pb-12">
      {/* 1. Header */}
      <div className="border-b border-[var(--border-subtle)] pb-5">
        <h1 className="text-2xl sm:text-3xl font-semibold tracking-tight text-[var(--charcoal)]">
          Arbitration & Human Review
        </h1>
        <p className="text-sm text-[var(--text-muted)] mt-1">
          Inspect uncertain verifications, evaluate evidence diffs, and rule on settlement capture dispatch.
        </p>
      </div>

      {err && (
        <div className="p-3.5 rounded-xl bg-red-50 border border-red-200 text-xs text-red-700">
          {err}
        </div>
      )}

      {/* 2. Cases List */}
      <div className="space-y-6">
        {cases.map((c) => {
          const isResolved = c.status === "RESOLVED" || c.status === "CLOSED";

          return (
            <div key={c.id} className="workpay-card p-6 space-y-5 border-amber-200 bg-amber-50/20">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-semibold px-2.5 py-0.5 rounded-full bg-amber-100 text-amber-800">
                    Review Required
                  </span>
                  <span className="font-mono text-xs text-[var(--text-muted)]">
                    CASE-{c.id.slice(0, 8)}
                  </span>
                </div>

                <Link
                  href={`/tasks/${c.taskId}`}
                  className="inline-flex items-center gap-1 text-xs font-medium text-[var(--charcoal)] hover:underline"
                >
                  <span>Open task workspace</span>
                  <ChevronRight className="h-3.5 w-3.5" />
                </Link>
              </div>

              <div>
                <h2 className="text-lg font-semibold text-[var(--charcoal)]">
                  {c.title}
                </h2>
                <p className="text-sm text-[var(--text-muted)] mt-1">
                  {c.summary}
                </p>
              </div>

              {/* Evidence Diff Card */}
              <div className="p-4 rounded-xl bg-white border border-[var(--border-subtle)] space-y-2 text-xs">
                <div className="font-semibold text-[var(--charcoal)] flex items-center gap-1.5">
                  <FileCheck className="h-4 w-4 text-[var(--amber)]" />
                  <span>Criterion Verification Evidence</span>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2 text-[var(--text-soft)]">
                  <div>
                    <span className="font-semibold text-[var(--charcoal)] block">Expected Criterion:</span>
                    <span>All acceptance checks must pass without semantic ambiguity.</span>
                  </div>
                  <div>
                    <span className="font-semibold text-[var(--charcoal)] block">Observed Deliverable:</span>
                    <span>Automated check scored edge cases near threshold; flagged for human inspector confirmation.</span>
                  </div>
                </div>
              </div>

              <div className="text-xs text-[var(--text-muted)]">
                PayPal authorization hold remains safely locked until an authoritative ruling is submitted below.
              </div>

              {!isResolved ? (
                <div className="flex flex-wrap gap-2 pt-2 border-t border-amber-100">
                  <button
                    type="button"
                    disabled={resolving === c.id}
                    onClick={() => resolve(c.id, "RELEASE_PAYMENT")}
                    className="bg-emerald-600 text-white hover:bg-emerald-700 px-4 py-2 rounded-xl text-xs font-medium transition-colors"
                  >
                    Accept Work & Release Payment
                  </button>
                  <button
                    type="button"
                    disabled={resolving === c.id}
                    onClick={() => resolve(c.id, "REQUIRE_REVISION")}
                    className="bg-amber-600 text-white hover:bg-amber-700 px-4 py-2 rounded-xl text-xs font-medium transition-colors"
                  >
                    Require Specialist Revision
                  </button>
                  <button
                    type="button"
                    disabled={resolving === c.id}
                    onClick={() => resolve(c.id, "UPHOLD_SYSTEM_DECISION")}
                    className="bg-gray-700 text-white hover:bg-black px-4 py-2 rounded-xl text-xs font-medium transition-colors"
                  >
                    Escalate Formal Dispute
                  </button>
                </div>
              ) : (
                <div className="pt-2 border-t border-amber-100 flex items-center justify-between text-xs">
                  <span className="font-semibold text-[var(--green)]">Case decision recorded.</span>
                  <span className="px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 font-semibold">
                    Resolved
                  </span>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
