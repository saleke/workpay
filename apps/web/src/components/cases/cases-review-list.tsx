"use client";

import { useCallback, useState } from "react";
import Link from "next/link";
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
        setErr("Could not resolve this case.");
      } else {
        reload();
      }
    },
    [reload],
  );

  if (loading && !data) {
    return (
      <div className="py-20 text-center text-[var(--room-muted)] font-serif">
        Loading review cases...
      </div>
    );
  }

  const cases = data ?? [];

  if (cases.length === 0) {
    return (
      <div className="py-20 text-center">
        <h1 className="font-serif text-[1.5rem] text-[var(--room-text-strong)] font-normal">
          No cases awaiting review
        </h1>
        <p className="text-[var(--room-muted)] mt-2 text-[var(--text-body)]">
          Cases are created when automated verification cannot conclusively verify a requirement.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {err && <p className="note note-fail">{err}</p>}

      {cases.map((c) => {
        const isResolved = c.status === "RESOLVED" || c.status === "CLOSED";

        return (
          <div key={c.id}>
            <p className="screen-label">Review needed</p>
            <div className="sheet">
              <div className="sheet-meta">
                Review needed, {c.title}
              </div>
              <h1 className="sheet-title">
                Verification could not decide
              </h1>
              <p style={{ color: "var(--ink-soft)" }}>{c.summary}</p>
              <p className="note note-unsure mt-2">
                Automated checking requires human inspection of the evidence.
              </p>

              <div className="mt-4 pt-3 border-t border-[var(--paper-rule)]">
                <div className="diff-row diff-head">
                  <span>Requirement</span>
                  <span>Expected</span>
                  <span>Submitted</span>
                </div>
                <div className="diff-row" style={{ borderBottom: 0 }}>
                  <span className="font-serif text-[var(--ink)]">Deliverable proof</span>
                  <span>
                    <span className="lbl-inline">Expected: </span>Every acceptance criterion verified
                  </span>
                  <span>
                    <span className="lbl-inline">Work: </span>Unclear verification outcome
                  </span>
                </div>
              </div>

              <div className="flex items-center justify-between mt-4 pt-2">
                <p className="lbl">
                  Payment stays held until you decide.
                </p>
                <Link
                  href={`/tasks/${c.taskId}`}
                  className="lbl text-[var(--ink)] hover:underline"
                >
                  View contract
                </Link>
              </div>

              {!isResolved ? (
                <div className="sheet-actions">
                  <button
                    type="button"
                    disabled={resolving === c.id}
                    onClick={() => resolve(c.id, "RELEASE_PAYMENT")}
                    className="btn"
                  >
                    Accept the work
                  </button>
                  <button
                    type="button"
                    disabled={resolving === c.id}
                    onClick={() => resolve(c.id, "REQUIRE_REVISION")}
                    className="btn btn-quiet"
                  >
                    Ask for a revision
                  </button>
                  <button
                    type="button"
                    disabled={resolving === c.id}
                    onClick={() => resolve(c.id, "UPHOLD_SYSTEM_DECISION")}
                    className="btn btn-quiet"
                  >
                    Open a dispute
                  </button>
                </div>
              ) : (
                <div className="mt-4 pt-3 border-t border-[var(--paper-rule)] flex items-center justify-between">
                  <span className="note note-met">Case resolved.</span>
                  <span className="state-label note-met">Resolved</span>
                </div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
