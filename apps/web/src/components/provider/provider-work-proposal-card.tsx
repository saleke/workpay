"use client";

import { useState } from "react";
import Link from "next/link";
import {
  ArrowUpRight,
  CalendarDays,
  Check,
  CircleDollarSign,
  FileCheck2,
  UserCheck,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { WorkProposalTerms } from "@/components/commitments/work-proposal-terms";
import { decideWorkCommitment } from "@/lib/api/endpoints";
import type { WorkCommitmentDto } from "@/lib/api/types";
import { formatMinorMoney } from "@/lib/format";

export function ProviderWorkProposalCard({
  proposal,
  onChanged,
}: {
  proposal: WorkCommitmentDto;
  onChanged: () => void;
}) {
  const [acknowledged, setAcknowledged] = useState(false);
  const [termsReviewed, setTermsReviewed] = useState(false);
  const [declineOpen, setDeclineOpen] = useState(false);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const respond = async (action: "PROVIDER_ACCEPT" | "PROVIDER_DECLINE") => {
    setBusy(true);
    setError(null);
    const result = await decideWorkCommitment(
      proposal.conversationId,
      proposal.id,
      action,
      crypto.randomUUID(),
      action === "PROVIDER_DECLINE" ? note : undefined,
    );
    setBusy(false);
    if (result.error) {
      setError(result.error.message);
      return;
    }
    onChanged();
  };

  return (
    <article className="group overflow-hidden rounded-2xl border border-slate-300 bg-white shadow-[0_18px_55px_-45px_rgba(15,23,42,0.9)] transition hover:-translate-y-0.5 hover:border-indigo-300 hover:shadow-[0_22px_60px_-42px_rgba(49,46,129,0.55)]">
      <div className="grid lg:grid-cols-[minmax(0,1fr)_15rem]">
        <div className="p-5 sm:p-6">
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-full bg-amber-100 px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.12em] text-amber-900">
              {proposal.status === "AWAITING_PROVIDER" ? "Your decision" : "Client deciding"}
            </span>
            <span className="text-xs text-slate-500">From {proposal.buyerDisplayName}</span>
          </div>
          <h3 className="mt-3 text-xl font-semibold tracking-tight text-slate-950">
            {proposal.taskTitle}
          </h3>
          <p className="mt-1.5 line-clamp-2 max-w-2xl text-sm leading-6 text-slate-600">
            {proposal.terms.summary || proposal.taskRequest}
          </p>
          <div className="mt-4 flex flex-wrap gap-x-5 gap-y-2 text-xs text-slate-600">
            <span className="inline-flex items-center gap-1.5 font-semibold text-slate-900">
              <CircleDollarSign className="h-4 w-4 text-emerald-700" />
              {formatMinorMoney(proposal.amount)}
            </span>
            <span className="inline-flex items-center gap-1.5">
              <CalendarDays className="h-4 w-4 text-indigo-600" />
              {proposal.deliveryDeadline
                ? new Date(proposal.deliveryDeadline).toLocaleString([], {
                    month: "short",
                    day: "numeric",
                    hour: "numeric",
                    minute: "2-digit",
                  })
                : "No fixed deadline"}
            </span>
            <span className="inline-flex items-center gap-1.5">
              <FileCheck2 className="h-4 w-4 text-slate-500" />
              {proposal.terms.requirements.length} requirement
              {proposal.terms.requirements.length === 1 ? "" : "s"} · contract v
              {proposal.contractVersion}
            </span>
          </div>
          {proposal.terms.included.length > 0 ? (
            <ul className="mt-4 grid gap-1.5 text-xs text-slate-600 sm:grid-cols-2">
              {proposal.terms.included.slice(0, 4).map((item) => (
                <li key={item} className="flex min-w-0 gap-2">
                  <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-700" />
                  <span className="line-clamp-2">{item}</span>
                </li>
              ))}
            </ul>
          ) : null}
          <div className="mt-4">
            <WorkProposalTerms
              terms={proposal.terms}
              contractVersion={proposal.contractVersion}
              onReviewed={() => setTermsReviewed(true)}
            />
          </div>
        </div>

        <div className="flex flex-col justify-between border-t border-slate-200 bg-slate-50 p-5 lg:border-l lg:border-t-0">
          {proposal.status === "AWAITING_PROVIDER" ? (
            <div className="space-y-3">
              <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">
                Work acceptance
              </p>
              <p className="text-xs leading-5 text-slate-600">
                Your acceptance records these exact terms. The client must still choose you before
                the commitment is active.
              </p>
              <label className="flex cursor-pointer items-start gap-2 text-xs leading-5 text-slate-700">
                <input
                  type="checkbox"
                  checked={acknowledged}
                  onChange={(event) => setAcknowledged(event.target.checked)}
                  disabled={!termsReviewed}
                  className="mt-1 h-4 w-4 accent-emerald-700"
                />
                I reviewed the full work terms, compensation, and delivery target.
              </label>
              {!termsReviewed ? (
                <p className="text-[11px] text-amber-800">
                  Open “Review exact work terms” before accepting.
                </p>
              ) : null}
              <Button
                className="w-full bg-emerald-700 hover:bg-emerald-800"
                disabled={busy || !acknowledged}
                onClick={() => void respond("PROVIDER_ACCEPT")}
              >
                <UserCheck className="mr-2 h-4 w-4" />
                {busy ? "Recording…" : "Accept work proposal"}
              </Button>
              {declineOpen ? (
                <div className="space-y-2">
                  <textarea
                    value={note}
                    onChange={(event) => setNote(event.target.value)}
                    rows={2}
                    maxLength={1_000}
                    placeholder="Optional note to the client"
                    className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs outline-none focus:border-slate-500"
                  />
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={busy}
                      onClick={() => void respond("PROVIDER_DECLINE")}
                    >
                      Confirm decline
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => setDeclineOpen(false)}>
                      Keep proposal
                    </Button>
                  </div>
                </div>
              ) : (
                <Button
                  className="w-full"
                  variant="ghost"
                  disabled={busy}
                  onClick={() => setDeclineOpen(true)}
                >
                  Decline
                </Button>
              )}
            </div>
          ) : (
            <div className="space-y-3">
              <div className="rounded-xl border border-indigo-200 bg-indigo-50 p-3">
                <p className="text-sm font-semibold text-indigo-950">You accepted these terms</p>
                <p className="mt-1 text-xs leading-5 text-indigo-900">
                  The client is making the final selection. Do not begin until this moves to
                  Accepted work.
                </p>
              </div>
              <Button
                className="w-full"
                variant="outline"
                disabled={busy}
                onClick={() => void respond("PROVIDER_DECLINE")}
              >
                Withdraw my acceptance
              </Button>
            </div>
          )}
          <Link
            href={`/messages?conversation=${encodeURIComponent(proposal.conversationId)}`}
            className="mt-4 inline-flex items-center justify-center gap-1.5 text-xs font-semibold text-indigo-700 hover:underline"
          >
            Open Work context <ArrowUpRight className="h-3.5 w-3.5" />
          </Link>
          {error ? (
            <p className="mt-3 rounded-lg bg-rose-50 p-2 text-xs text-rose-900" role="alert">
              {error}
            </p>
          ) : null}
        </div>
      </div>
    </article>
  );
}
