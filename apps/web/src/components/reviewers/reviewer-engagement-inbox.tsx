"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { ArrowRight, BriefcaseBusiness, Check, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { decideIndependentReview, listReviewerEngagements } from "@/lib/api/endpoints";
import type { IndependentReviewEngagementDto } from "@/lib/api/types";

export function ReviewerEngagementInbox() {
  const [engagements, setEngagements] = useState<IndependentReviewEngagementDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirmed, setConfirmed] = useState<Record<string, boolean>>({});

  const refresh = useCallback(async () => {
    const response = await listReviewerEngagements();
    setLoading(false);
    if (response.error) setError(response.error.message);
    else setEngagements(response.data ?? []);
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const respond = async (
    engagement: IndependentReviewEngagementDto,
    decision: "accept" | "decline",
  ) => {
    setBusyId(engagement.id);
    setError(null);
    const response = await decideIndependentReview(engagement.conversationId, engagement.id, {
      decision,
      ...(decision === "accept" ? { confirmNoConflict: true } : {}),
    });
    setBusyId(null);
    if (response.error) {
      setError(response.error.message);
      return;
    }
    await refresh();
  };

  if (loading) return <p className="text-sm text-slate-500">Loading review engagements…</p>;

  return (
    <div className="space-y-4">
      {engagements.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-8 text-center">
          <BriefcaseBusiness className="mx-auto h-7 w-7 text-slate-400" />
          <p className="mt-2 text-sm font-semibold text-slate-900">No review engagements yet</p>
          <p className="mt-1 text-xs text-slate-500">
            Agreed review invitations and active review packages will appear here.
          </p>
        </div>
      ) : null}
      {engagements.map((engagement) => {
        const pending = engagement.status === "AWAITING_REVIEWER";
        const ready = engagement.status === "ENGAGED" && engagement.workReviewId;
        return (
          <article
            key={engagement.id}
            className="overflow-hidden rounded-2xl border border-slate-300 bg-white shadow-[0_20px_55px_-48px_rgba(15,23,42,0.9)]"
          >
            <div className="border-b border-slate-200 bg-[linear-gradient(120deg,#f5f3ff_0%,#ffffff_72%)] p-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-[0.15em] text-violet-700">
                    Paid review engagement
                  </p>
                  <h2 className="mt-1 text-lg font-semibold text-slate-950">
                    {engagement.contractContext?.title ?? "Review engagement"}
                  </h2>
                  <p className="mt-1 text-xs leading-5 text-slate-600">
                    {engagement.domains.join(" · ")} · contract v{engagement.contractVersion}
                  </p>
                </div>
                <span className="rounded-full bg-violet-100 px-2.5 py-1 text-xs font-semibold text-violet-900">
                  {engagement.status.replaceAll("_", " ").toLowerCase()}
                </span>
              </div>
            </div>
            <div className="space-y-4 p-5">
              <div className="grid gap-3 text-xs sm:grid-cols-2">
                <div className="rounded-xl bg-slate-50 p-3">
                  <p className="font-semibold text-slate-900">Review focus</p>
                  <p className="mt-1 leading-5 text-slate-600">
                    {engagement.requirementKeys.join(", ")}
                  </p>
                </div>
                <div className="rounded-xl bg-slate-50 p-3">
                  <p className="font-semibold text-slate-900">Fee arrangement</p>
                  <p className="mt-1 leading-5 text-slate-600">
                    {engagement.feePayer}
                    {engagement.feeMinor !== null
                      ? ` · ${engagement.feeCurrency} ${(engagement.feeMinor / 100).toFixed(2)}`
                      : " · arranged directly"}
                  </p>
                </div>
              </div>
              <div className="rounded-xl border border-slate-200 bg-white p-3 text-sm leading-6 text-slate-700">
                {engagement.brief}
              </div>
              {pending ? (
                <div className="space-y-3 rounded-xl border border-violet-200 bg-violet-50 p-4">
                  <label className="flex items-start gap-2 text-xs leading-5 text-violet-950">
                    <input
                      type="checkbox"
                      checked={confirmed[engagement.id] ?? false}
                      onChange={(event) =>
                        setConfirmed((current) => ({
                          ...current,
                          [engagement.id]: event.target.checked,
                        }))
                      }
                      className="mt-1 h-4 w-4 accent-violet-700"
                    />
                    I reviewed the parties, scope, and known relationships and confirm no
                    undisclosed conflict.
                  </label>
                  <div className="flex flex-wrap gap-2">
                    <Button
                      disabled={busyId === engagement.id || !confirmed[engagement.id]}
                      onClick={() => void respond(engagement, "accept")}
                    >
                      <ShieldCheck className="mr-2 h-4 w-4" /> Accept engagement
                    </Button>
                    <Button
                      variant="outline"
                      disabled={busyId === engagement.id}
                      onClick={() => void respond(engagement, "decline")}
                    >
                      Decline
                    </Button>
                  </div>
                </div>
              ) : null}
              {ready ? (
                <Link
                  href={`/reviewer/reviews/${encodeURIComponent(engagement.workReviewId!)}`}
                  className="inline-flex min-h-11 w-full items-center justify-between rounded-xl bg-violet-800 px-4 text-sm font-semibold text-white transition hover:bg-violet-900"
                >
                  <span className="inline-flex items-center gap-2">
                    <Check className="h-4 w-4" /> Open review package
                  </span>
                  <ArrowRight className="h-4 w-4" />
                </Link>
              ) : engagement.status === "ENGAGED" ? (
                <p className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs text-slate-600">
                  Engagement accepted. The client can attach you when a review package is ready.
                </p>
              ) : engagement.status === "AWAITING_FEE_AUTHORIZATION" ? (
                <p className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">
                  Your engagement is accepted. It will become active after the agreed fee approvals
                  are complete.
                </p>
              ) : null}
            </div>
          </article>
        );
      })}
      {error ? (
        <p
          className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-900"
          role="alert"
        >
          {error}
        </p>
      ) : null}
    </div>
  );
}
