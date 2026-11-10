"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  ArrowUpRight,
  FileText,
  Link2,
  MessageSquareText,
  Paperclip,
  Send,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { RequirementAssessment } from "@/components/task-room/human-review-workspace";
import { addWorkReviewContext, completePaidWorkReview, getWorkReview } from "@/lib/api/endpoints";
import type { WorkReviewDto } from "@/lib/api/types";

export function PaidReviewerWorkspace({ reviewId }: { reviewId: string }) {
  const [review, setReview] = useState<WorkReviewDto | null>(null);
  const [note, setNote] = useState("");
  const [linkLabel, setLinkLabel] = useState("");
  const [linkUrl, setLinkUrl] = useState("");
  const [reviewerSummary, setReviewerSummary] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const refresh = async () => {
    const result = await getWorkReview(reviewId);
    if (result.error) setError(result.error.message);
    else setReview(result.data ?? null);
  };
  useEffect(() => {
    void refresh();
  }, [reviewId]);

  if (!review) {
    return <p className="py-16 text-center text-sm text-slate-500">Opening review package…</p>;
  }
  const requirements = review.requirements.filter((item) =>
    review.requirementKeys.includes(item.key),
  );
  const allAssessed = review.requirementKeys.every((key) =>
    review.assessments.some((assessment) => assessment.requirementKey === key),
  );

  const add = async (type: "NOTE" | "LINK" | "FILE") => {
    const input =
      type === "NOTE"
        ? ({ type, note } as const)
        : type === "LINK"
          ? ({ type, label: linkLabel, url: linkUrl, note: note || undefined } as const)
          : fileRef.current?.files?.[0]
            ? ({ type, file: fileRef.current.files[0], note: note || undefined } as const)
            : null;
    if (!input) return;
    setBusy(true);
    const result = await addWorkReviewContext(review.id, input);
    setBusy(false);
    if (result.error || !result.data) {
      setError(result.error?.message ?? "Context could not be added.");
      return;
    }
    setReview(result.data);
    setNote("");
    setLinkLabel("");
    setLinkUrl("");
    if (fileRef.current) fileRef.current.value = "";
  };

  const complete = async () => {
    setBusy(true);
    const result = await completePaidWorkReview(review.id, reviewerSummary, crypto.randomUUID());
    setBusy(false);
    if (result.error) {
      setError(result.error.message);
      return;
    }
    window.location.href = "/reviewer/engagements";
  };

  return (
    <div className="mx-auto max-w-6xl space-y-6 pb-16">
      <Link
        href="/reviewer/engagements"
        className="inline-flex items-center gap-1 text-sm font-semibold text-violet-700 hover:underline"
      >
        <ArrowLeft className="h-4 w-4" /> Review engagements
      </Link>
      <header className="overflow-hidden rounded-3xl bg-[radial-gradient(circle_at_top_right,#7c3aed_0%,#312e81_38%,#111827_82%)] p-6 text-white shadow-xl sm:p-8">
        <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-violet-200">
          Paid review package
        </p>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight sm:text-3xl">{review.title}</h1>
        <p className="mt-3 max-w-3xl whitespace-pre-wrap text-sm leading-6 text-slate-200">
          {review.openingNote}
        </p>
        {review.providerResponseSummary ? (
          <div className="mt-5 max-w-3xl rounded-2xl border border-white/15 bg-white/10 p-4 backdrop-blur">
            <p className="text-xs font-bold uppercase tracking-wide text-violet-200">
              Professional response
            </p>
            <p className="mt-2 whitespace-pre-wrap text-sm leading-6">
              {review.providerResponseSummary}
            </p>
          </div>
        ) : null}
      </header>

      <section className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <div className="space-y-3">
          <h2 className="text-lg font-semibold text-slate-950">Package context</h2>
          {review.items.map((item) => (
            <article key={item.id} className="rounded-2xl border border-slate-200 bg-white p-4">
              <div className="flex items-start gap-3">
                {item.type === "LINK" ? (
                  <Link2 className="h-4 w-4 text-violet-700" />
                ) : item.type === "FILE" ? (
                  <FileText className="h-4 w-4 text-violet-700" />
                ) : (
                  <MessageSquareText className="h-4 w-4 text-violet-700" />
                )}
                <div className="min-w-0 flex-1 text-sm">
                  <p className="font-semibold text-slate-900">
                    {item.label || item.filename || "Review note"}
                  </p>
                  {item.note ? (
                    <p className="mt-1 whitespace-pre-wrap leading-6 text-slate-600">{item.note}</p>
                  ) : null}
                  {item.url ? (
                    <a
                      href={item.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="mt-2 inline-flex items-center gap-1 text-xs font-semibold text-violet-700 hover:underline"
                    >
                      Open link <ArrowUpRight className="h-3 w-3" />
                    </a>
                  ) : null}
                  {item.downloadUrl ? (
                    <a
                      href={item.downloadUrl}
                      className="mt-2 inline-flex items-center gap-1 text-xs font-semibold text-violet-700 hover:underline"
                    >
                      Download file <ArrowUpRight className="h-3 w-3" />
                    </a>
                  ) : null}
                </div>
              </div>
            </article>
          ))}
        </div>
        <aside className="space-y-3 rounded-2xl border border-violet-200 bg-violet-50 p-4">
          <h2 className="text-sm font-semibold text-violet-950">Add reviewer context</h2>
          <textarea
            value={note}
            onChange={(event) => setNote(event.target.value)}
            rows={3}
            placeholder="Review note or context"
            className="w-full rounded-xl border border-violet-200 bg-white px-3 py-2 text-xs"
          />
          <Button
            variant="outline"
            className="w-full"
            disabled={busy || !note.trim()}
            onClick={() => void add("NOTE")}
          >
            Add note
          </Button>
          <input
            value={linkLabel}
            onChange={(event) => setLinkLabel(event.target.value)}
            placeholder="Link label"
            className="h-9 w-full rounded-lg border border-violet-200 px-3 text-xs"
          />
          <input
            value={linkUrl}
            onChange={(event) => setLinkUrl(event.target.value)}
            placeholder="https://…"
            className="h-9 w-full rounded-lg border border-violet-200 px-3 text-xs"
          />
          <Button
            variant="outline"
            className="w-full"
            disabled={busy || !linkLabel.trim() || !linkUrl.trim()}
            onClick={() => void add("LINK")}
          >
            Add link
          </Button>
          <label className="flex min-h-16 cursor-pointer items-center justify-center gap-2 rounded-xl border border-dashed border-violet-300 bg-white text-xs text-violet-900">
            <Paperclip className="h-4 w-4" /> Choose file
            <input ref={fileRef} type="file" className="sr-only" />
          </label>
          <Button
            variant="outline"
            className="w-full"
            disabled={busy}
            onClick={() => void add("FILE")}
          >
            Add file
          </Button>
        </aside>
      </section>

      <section className="space-y-3">
        <div>
          <h2 className="text-lg font-semibold text-slate-950">Assess the agreed constraints</h2>
          <p className="mt-1 text-sm text-slate-600">
            Record what you found, including partial or unclear results.
          </p>
        </div>
        {requirements.map((requirement) => (
          <RequirementAssessment
            key={requirement.key}
            review={review}
            requirement={requirement}
            onChanged={setReview}
          />
        ))}
      </section>

      <section className="rounded-2xl border border-slate-300 bg-white p-5">
        <div className="flex items-start gap-3">
          <Send className="h-5 w-5 text-violet-700" />
          <div>
            <h2 className="text-sm font-semibold text-slate-950">Return review to client</h2>
            <p className="mt-1 text-xs text-slate-600">
              Summarize your findings and any limits. The client records the final task decision.
            </p>
          </div>
        </div>
        <textarea
          value={reviewerSummary}
          onChange={(event) => setReviewerSummary(event.target.value)}
          rows={4}
          placeholder="Summarize what you reviewed, your findings, and any uncertainty."
          className="mt-4 w-full rounded-xl border border-slate-300 px-3 py-2 text-sm leading-6"
        />
        <div className="mt-4 flex flex-wrap gap-2">
          <Button
            disabled={busy || !allAssessed || reviewerSummary.trim().length < 20}
            onClick={() => void complete()}
          >
            <Send className="mr-2 h-4 w-4" />
            {busy ? "Returning review…" : "Return findings to client"}
          </Button>
        </div>
      </section>
      {error ? (
        <p className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-900">
          {error}
        </p>
      ) : null}
    </div>
  );
}
