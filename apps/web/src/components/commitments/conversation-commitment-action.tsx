"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  ArrowRight,
  BadgeCheck,
  BriefcaseBusiness,
  CalendarDays,
  CircleDollarSign,
  Loader2,
  UserCheck,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { WorkProposalTerms } from "@/components/commitments/work-proposal-terms";
import { decideWorkCommitment, getWorkCommitment } from "@/lib/api/endpoints";
import type { TaskConversationDto, WorkCommitmentDto } from "@/lib/api/types";
import { formatMinorMoney } from "@/lib/format";

export function ConversationCommitmentAction({
  conversation,
  currentUserId,
  onOpenContext,
  onChanged,
}: {
  conversation: TaskConversationDto;
  currentUserId: string;
  onOpenContext: () => void;
  onChanged: () => void;
}) {
  const isBuyer = conversation.buyerUserId === currentUserId;
  const [commitment, setCommitment] = useState<WorkCommitmentDto | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [confirmedChoice, setConfirmedChoice] = useState(false);
  const [termsReviewed, setTermsReviewed] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = async () => {
    const result = await getWorkCommitment(conversation.id);
    setLoading(false);
    if (result.error) {
      setError(result.error.message);
      return;
    }
    setCommitment(result.data ?? null);
    setError(null);
  };

  useEffect(() => {
    setLoading(true);
    setConfirmedChoice(false);
    setTermsReviewed(false);
    void refresh();
    const timer = window.setInterval(() => void refresh(), 8_000);
    return () => window.clearInterval(timer);
  }, [conversation.id]);

  useEffect(() => {
    setTermsReviewed(false);
    setConfirmedChoice(false);
  }, [commitment?.id]);

  const confirmProfessional = async () => {
    if (!commitment || !confirmedChoice) return;
    setBusy(true);
    setError(null);
    const result = await decideWorkCommitment(
      conversation.id,
      commitment.id,
      "BUYER_CONFIRM",
      crypto.randomUUID(),
    );
    setBusy(false);
    if (result.error || !result.data) {
      setError(result.error?.message ?? "The professional could not be confirmed.");
      return;
    }
    setCommitment(result.data);
    setConfirmedChoice(false);
    window.dispatchEvent(new Event("workpay_commitment_change"));
    window.dispatchEvent(new Event("workpay_messages_inbox_change"));
    onChanged();
  };

  if (loading) {
    return (
      <div className="border-b border-[var(--wp-border)] bg-white px-4 py-3" role="status">
        <div className="mx-auto flex max-w-3xl items-center gap-2 text-xs text-[var(--wp-text-secondary)]">
          <Loader2 className="h-3.5 w-3.5 animate-spin" /> Checking work acceptance
        </div>
      </div>
    );
  }

  if (!commitment) {
    if (!isBuyer) return null;
    return (
      <section className="border-b border-indigo-200 bg-[linear-gradient(90deg,#eef2ff_0%,#ffffff_72%)] px-4 py-3">
        <div className="mx-auto flex max-w-3xl flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex min-w-0 items-start gap-3">
            <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-indigo-700 text-white shadow-sm">
              <BriefcaseBusiness className="h-4.5 w-4.5" />
            </span>
            <div>
              <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-indigo-700">
                Work acceptance
              </p>
              <p className="mt-0.5 text-sm font-semibold text-slate-950">
                Ready to offer this work to{" "}
                {conversation.providerDisplayName ?? "this professional"}?
              </p>
              <p className="mt-0.5 text-xs text-slate-600">
                Set the compensation and delivery target for their decision.
              </p>
            </div>
          </div>
          <Button
            type="button"
            onClick={onOpenContext}
            className="shrink-0 bg-indigo-700 hover:bg-indigo-800"
          >
            Create work proposal <ArrowRight className="ml-1.5 h-4 w-4" />
          </Button>
        </div>
        {error ? <p className="mx-auto mt-2 max-w-3xl text-xs text-rose-700">{error}</p> : null}
      </section>
    );
  }

  if (commitment.status === "AWAITING_PROVIDER") {
    return (
      <section className="border-b border-amber-200 bg-amber-50 px-4 py-3">
        <div className="mx-auto flex max-w-3xl flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-3">
            <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-amber-200 text-amber-900">
              <CircleDollarSign className="h-4 w-4" />
            </span>
            <div>
              <p className="text-sm font-semibold text-amber-950">
                {isBuyer ? "Work proposal sent" : "A work proposal needs your decision"}
              </p>
              <p className="mt-0.5 text-xs text-amber-900">
                {formatMinorMoney(commitment.amount)}
                {commitment.deliveryDeadline
                  ? ` · target ${new Date(commitment.deliveryDeadline).toLocaleDateString()}`
                  : " · no fixed target date"}
              </p>
            </div>
          </div>
          {isBuyer ? (
            <Button
              type="button"
              variant="outline"
              onClick={onOpenContext}
              className="shrink-0 bg-white"
            >
              Review proposal
            </Button>
          ) : (
            <Button asChild className="shrink-0 bg-amber-900 hover:bg-amber-950">
              <Link href="/provider">Accept or decline in Work Studio</Link>
            </Button>
          )}
        </div>
      </section>
    );
  }

  if (commitment.status === "AWAITING_CLIENT" && isBuyer) {
    return (
      <section className="border-b border-emerald-300 bg-[linear-gradient(90deg,#d1fae5_0%,#f0fdf4_52%,#ffffff_100%)] px-4 py-4">
        <div className="mx-auto max-w-3xl">
          <div className="flex items-start gap-3">
            <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-emerald-700 text-white shadow-sm">
              <UserCheck className="h-5 w-5" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-emerald-800">
                Final client decision
              </p>
              <h3 className="mt-0.5 text-base font-semibold text-emerald-950">
                {commitment.providerDisplayName} accepted your work proposal
              </h3>
              <div className="mt-2 flex flex-wrap gap-3 text-xs text-emerald-900">
                <span className="inline-flex items-center gap-1 font-semibold">
                  <CircleDollarSign className="h-3.5 w-3.5" /> {formatMinorMoney(commitment.amount)}
                </span>
                <span className="inline-flex items-center gap-1">
                  <CalendarDays className="h-3.5 w-3.5" />
                  {commitment.deliveryDeadline
                    ? new Date(commitment.deliveryDeadline).toLocaleDateString()
                    : "No fixed target date"}
                </span>
              </div>
            </div>
          </div>
          <div className="mt-3">
            <WorkProposalTerms
              terms={commitment.terms}
              contractVersion={commitment.contractVersion}
              onReviewed={() => setTermsReviewed(true)}
            />
          </div>
          <label className="mt-3 flex cursor-pointer items-start gap-2 rounded-xl border border-emerald-300 bg-white/85 p-3 text-xs leading-5 text-emerald-950">
            <input
              type="checkbox"
              checked={confirmedChoice}
              onChange={(event) => setConfirmedChoice(event.target.checked)}
              disabled={!termsReviewed}
              className="mt-0.5 h-4 w-4 accent-emerald-700"
            />
            I confirm {commitment.providerDisplayName} is the professional I am selecting for this
            work and these exact terms.
          </label>
          {!termsReviewed ? (
            <p className="mt-2 text-[11px] text-emerald-800">
              Open “Review exact work terms” before confirming.
            </p>
          ) : null}
          <div className="mt-3 flex flex-col gap-2 sm:flex-row">
            <Button
              type="button"
              disabled={busy || !confirmedChoice}
              onClick={() => void confirmProfessional()}
              className="bg-emerald-700 hover:bg-emerald-800"
            >
              <BadgeCheck className="mr-2 h-4 w-4" />
              {busy
                ? "Confirming professional…"
                : `Accept ${commitment.providerDisplayName} for this work`}
            </Button>
            <Button type="button" variant="outline" onClick={onOpenContext} disabled={busy}>
              Review exact terms
            </Button>
          </div>
          {error ? <p className="mt-2 text-xs text-rose-700">{error}</p> : null}
        </div>
      </section>
    );
  }

  if (commitment.status === "AWAITING_CLIENT") {
    return (
      <section className="border-b border-indigo-200 bg-indigo-50 px-4 py-3">
        <div className="mx-auto flex max-w-3xl items-center gap-3 text-sm text-indigo-950">
          <UserCheck className="h-4 w-4 shrink-0" />
          <span>
            <strong>You accepted the work proposal.</strong> The client is making the final
            selection.
          </span>
        </div>
      </section>
    );
  }

  if (
    isBuyer &&
    ["PROVIDER_DECLINED", "BUYER_WITHDRAWN", "SUPERSEDED"].includes(commitment.status)
  ) {
    return (
      <section className="border-b border-slate-200 bg-slate-50 px-4 py-3">
        <div className="mx-auto flex max-w-3xl flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-sm font-semibold text-slate-900">The previous proposal is closed</p>
            <p className="mt-0.5 text-xs text-slate-600">
              You can send revised terms while this conversation remains open.
            </p>
          </div>
          <Button type="button" variant="outline" onClick={onOpenContext} className="bg-white">
            Create a new proposal
          </Button>
        </div>
      </section>
    );
  }

  if (commitment.status === "CONFIRMED") {
    return (
      <section className="border-b border-emerald-200 bg-emerald-50 px-4 py-3">
        <div className="mx-auto flex max-w-3xl flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <p className="flex items-center gap-2 text-sm text-emerald-950">
            <BadgeCheck className="h-4 w-4" />
            <strong>Work commitment confirmed.</strong>
          </p>
          {isBuyer ? (
            <Button asChild size="sm" variant="outline" className="bg-white">
              <Link href={`/tasks/${encodeURIComponent(conversation.taskId)}`}>
                Continue to payment
              </Link>
            </Button>
          ) : (
            <Button asChild size="sm" variant="outline" className="bg-white">
              <Link href="/provider">View accepted work</Link>
            </Button>
          )}
        </div>
      </section>
    );
  }

  return null;
}
