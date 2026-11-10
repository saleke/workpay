"use client";

import { useEffect, useRef, useState } from "react";
import { ArrowUpRight, FileText, Link2, MessageSquareText, Paperclip } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  addWorkReviewContext,
  getWorkReview,
  respondToReviewResolution,
  respondToWorkReviewRequest,
} from "@/lib/api/endpoints";
import type { WorkReviewDto } from "@/lib/api/types";
import { cn } from "@/lib/utils";

export function ProviderReviewContext({
  reviewId,
  onChanged,
}: {
  reviewId: string;
  onChanged: () => void;
}) {
  const [review, setReview] = useState<WorkReviewDto | null>(null);
  const [mode, setMode] = useState<"NOTE" | "LINK" | "FILE">("NOTE");
  const [label, setLabel] = useState("");
  const [note, setNote] = useState("");
  const [url, setUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const [responseSummary, setResponseSummary] = useState("");
  const [resolutionNote, setResolutionNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const refresh = async () => {
    const result = await getWorkReview(reviewId);
    if (result.error) setError(result.error.message);
    else setReview(result.data ?? null);
  };

  useEffect(() => {
    void refresh();
    const timer = window.setInterval(() => void refresh(), 10_000);
    return () => window.clearInterval(timer);
  }, [reviewId]);

  const add = async () => {
    const input =
      mode === "NOTE"
        ? ({ type: "NOTE", note, label: label || undefined } as const)
        : mode === "LINK"
          ? ({ type: "LINK", label, url, note: note || undefined } as const)
          : fileRef.current?.files?.[0]
            ? ({
                type: "FILE",
                file: fileRef.current.files[0],
                label: label || undefined,
                note: note || undefined,
              } as const)
            : null;
    if (!input) {
      setError("Choose a file first.");
      return;
    }
    setBusy(true);
    setError(null);
    const result = await addWorkReviewContext(reviewId, input);
    setBusy(false);
    if (result.error || !result.data) {
      setError(result.error?.message ?? "Context could not be added.");
      return;
    }
    setReview(result.data);
    setLabel("");
    setNote("");
    setUrl("");
    if (fileRef.current) fileRef.current.value = "";
    onChanged();
  };

  const respond = async (action: "PREPARE" | "REQUEST_CLARIFICATION" | "SEND_PACKAGE") => {
    setBusy(true);
    setError(null);
    const result = await respondToWorkReviewRequest(
      reviewId,
      { action, ...(responseSummary.trim() ? { summary: responseSummary.trim() } : {}) },
      crypto.randomUUID(),
    );
    setBusy(false);
    if (result.error || !result.data) {
      setError(result.error?.message ?? "The review response could not be updated.");
      return;
    }
    setReview(result.data);
    if (action === "SEND_PACKAGE") setResponseSummary("");
    onChanged();
  };

  const respondToResolution = async (
    response: "ACCEPT_REVISION" | "DISAGREE" | "REQUEST_PAID_REVIEW",
  ) => {
    setBusy(true);
    setError(null);
    const result = await respondToReviewResolution(
      reviewId,
      { response, note: resolutionNote.trim() },
      crypto.randomUUID(),
    );
    setBusy(false);
    if (result.error || !result.data) {
      setError(result.error?.message ?? "The response could not be recorded.");
      return;
    }
    setReview(result.data);
    setResolutionNote("");
    onChanged();
  };

  if (!review) {
    return <p className="text-sm text-slate-500">Loading the client's review window…</p>;
  }

  return (
    <section className="space-y-4 rounded-2xl border border-indigo-200 bg-indigo-50/50 p-4 sm:p-5">
      <div>
        <p className="text-[10px] font-bold uppercase tracking-[0.15em] text-indigo-700">
          {review.kind === "FINAL" ? "Final review request" : "Checkpoint request"}
        </p>
        <h3 className="mt-1 text-lg font-semibold text-slate-950">{review.title}</h3>
        <p className="mt-1 whitespace-pre-wrap text-sm leading-6 text-slate-600">
          {review.openingNote}
        </p>
      </div>
      <div className="rounded-xl border border-indigo-200 bg-white p-3 text-xs leading-5 text-indigo-950">
        Prepare a concise package using a response summary plus any useful live links, notes, or
        files.
      </div>
      {review.status === "REQUESTED" ? (
        <div className="flex flex-col gap-3 rounded-xl border border-indigo-200 bg-white p-3 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-xs leading-5 text-slate-600">
            Acknowledge the request to begin assembling the package.
          </p>
          <Button disabled={busy} onClick={() => void respond("PREPARE")}>
            {busy ? "Opening…" : "Prepare review package"}
          </Button>
        </div>
      ) : null}
      {review.status === "CLARIFICATION_REQUESTED" ? (
        <div className="rounded-xl border border-amber-300 bg-amber-50 p-3 text-xs leading-5 text-amber-950">
          Waiting for the client to add the requested context.
        </div>
      ) : null}
      {review.status === "READY_FOR_REVIEW" || review.status === "REFERRED" ? (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3">
          <p className="text-sm font-semibold text-emerald-950">Review package sent</p>
          <p className="mt-1 whitespace-pre-wrap text-xs leading-5 text-emerald-900">
            {review.providerResponseSummary}
          </p>
        </div>
      ) : null}
      {review.status === "DISSATISFIED" || review.status === "CLIENT_RESPONSE_OVERDUE" ? (
        <div className="space-y-4 rounded-2xl border border-rose-300 bg-rose-50 p-4">
          <div>
            <p className="text-sm font-semibold text-rose-950">
              {review.status === "CLIENT_RESPONSE_OVERDUE"
                ? "Client response window passed"
                : "Client recorded dissatisfaction"}
            </p>
            <p className="mt-1 whitespace-pre-wrap text-xs leading-5 text-rose-900">
              {review.decisionReason ?? "No client decision has been recorded."}
            </p>
          </div>
          <textarea
            value={resolutionNote}
            onChange={(event) => setResolutionNote(event.target.value)}
            rows={4}
            maxLength={4_000}
            placeholder="Respond to the client with what you agree with, dispute, or want reviewed."
            className="w-full resize-y rounded-xl border border-rose-300 bg-white px-3 py-2 text-sm leading-6"
          />
          <div className="grid gap-2 sm:grid-cols-3">
            {review.status === "DISSATISFIED" ? (
              <Button
                disabled={busy || resolutionNote.trim().length < 20}
                className="bg-emerald-700 hover:bg-emerald-800"
                onClick={() => void respondToResolution("ACCEPT_REVISION")}
              >
                Accept revision request
              </Button>
            ) : null}
            <Button
              variant="outline"
              disabled={busy || resolutionNote.trim().length < 20}
              onClick={() => void respondToResolution("DISAGREE")}
            >
              {review.status === "CLIENT_RESPONSE_OVERDUE"
                ? "Record overdue response"
                : "Record disagreement"}
            </Button>
            <Button
              variant="outline"
              disabled={busy || resolutionNote.trim().length < 20}
              onClick={() => void respondToResolution("REQUEST_PAID_REVIEW")}
            >
              Request paid review
            </Button>
          </div>
        </div>
      ) : null}
      {review.items.length > 0 ? (
        <ul className="space-y-2">
          {review.items.map((item) => (
            <li
              key={item.id}
              className="flex items-start gap-2 rounded-xl border bg-white p-3 text-xs"
            >
              {item.type === "LINK" ? (
                <Link2 className="mt-0.5 h-4 w-4 shrink-0 text-indigo-700" />
              ) : item.type === "FILE" ? (
                <FileText className="mt-0.5 h-4 w-4 shrink-0 text-indigo-700" />
              ) : (
                <MessageSquareText className="mt-0.5 h-4 w-4 shrink-0 text-indigo-700" />
              )}
              <span className="min-w-0 flex-1">
                <span className="block font-semibold text-slate-900">
                  {item.label || item.filename || "Review note"}
                </span>
                {item.note ? (
                  <span className="mt-1 block whitespace-pre-wrap text-slate-600">{item.note}</span>
                ) : null}
                {item.type === "LINK" && item.url ? (
                  <a
                    href={item.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="mt-1 inline-flex items-center gap-1 font-semibold text-indigo-700 hover:underline"
                  >
                    Open link <ArrowUpRight className="h-3 w-3" />
                  </a>
                ) : null}
              </span>
            </li>
          ))}
        </ul>
      ) : null}
      {review.status === "REQUESTED" || review.status === "PREPARING" ? (
        <div>
          <div className="grid grid-cols-3 gap-1 rounded-lg bg-indigo-100/70 p-1">
            {(["NOTE", "LINK", "FILE"] as const).map((value) => (
              <button
                key={value}
                type="button"
                onClick={() => setMode(value)}
                className={cn(
                  "rounded-md px-2 py-1.5 text-xs font-semibold",
                  mode === value ? "bg-white text-slate-950 shadow-sm" : "text-indigo-800",
                )}
              >
                {value === "NOTE" ? "Note" : value === "LINK" ? "Live link" : "File"}
              </button>
            ))}
          </div>
          <div className="mt-3 space-y-2">
            {mode !== "NOTE" ? (
              <input
                value={label}
                onChange={(event) => setLabel(event.target.value)}
                placeholder={
                  mode === "LINK" ? "What the reviewer will see" : "File label (optional)"
                }
                className="h-10 w-full rounded-lg border border-indigo-200 bg-white px-3 text-xs outline-none focus:border-indigo-500"
              />
            ) : null}
            {mode === "LINK" ? (
              <input
                value={url}
                onChange={(event) => setUrl(event.target.value)}
                placeholder="https://staging.example.com"
                className="h-10 w-full rounded-lg border border-indigo-200 bg-white px-3 text-xs outline-none focus:border-indigo-500"
              />
            ) : null}
            {mode === "FILE" ? (
              <label className="flex min-h-16 cursor-pointer items-center justify-center gap-2 rounded-lg border border-dashed border-indigo-300 bg-white text-xs text-indigo-900">
                <Paperclip className="h-4 w-4" /> Choose optional file
                <input ref={fileRef} type="file" className="sr-only" />
              </label>
            ) : null}
            <textarea
              value={note}
              onChange={(event) => setNote(event.target.value)}
              rows={3}
              placeholder={
                mode === "NOTE"
                  ? "Explain what changed, how to inspect it, or what remains uncertain."
                  : "Optional context"
              }
              className="w-full resize-y rounded-lg border border-indigo-200 bg-white px-3 py-2 text-xs leading-5 outline-none focus:border-indigo-500"
            />
            <Button
              type="button"
              disabled={
                busy ||
                (mode === "NOTE" && !note.trim()) ||
                (mode === "LINK" && (!label.trim() || !url.trim()))
              }
              onClick={() => void add()}
            >
              {busy ? "Adding context…" : "Add to review"}
            </Button>
          </div>
        </div>
      ) : null}
      {review.status === "PREPARING" ? (
        <div className="space-y-3 rounded-2xl border border-slate-300 bg-white p-4">
          <label className="block text-xs font-semibold text-slate-700">
            Package summary
            <textarea
              value={responseSummary}
              onChange={(event) => setResponseSummary(event.target.value)}
              rows={4}
              maxLength={8_000}
              placeholder="Explain what is ready, where to inspect it, relevant access details, and anything still uncertain."
              className="mt-1.5 w-full resize-y rounded-xl border border-slate-300 px-3 py-2 text-sm leading-6 outline-none focus:border-indigo-500"
            />
          </label>
          <div className="grid gap-2 sm:grid-cols-2">
            <Button
              disabled={busy || responseSummary.trim().length < 8}
              className="bg-emerald-700 hover:bg-emerald-800"
              onClick={() => void respond("SEND_PACKAGE")}
            >
              {busy ? "Sending…" : "Send review package"}
            </Button>
            <Button
              variant="outline"
              disabled={busy || responseSummary.trim().length < 8}
              onClick={() => void respond("REQUEST_CLARIFICATION")}
            >
              Ask client for context
            </Button>
          </div>
        </div>
      ) : null}
      {error ? (
        <p className="text-xs text-rose-700" role="alert">
          {error}
        </p>
      ) : null}
    </section>
  );
}
