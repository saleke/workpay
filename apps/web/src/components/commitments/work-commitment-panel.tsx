"use client";

import { useEffect, useRef, useState } from "react";
import {
  BadgeCheck,
  CalendarDays,
  Check,
  CircleDollarSign,
  Clock3,
  Send,
  UserCheck,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { WorkProposalTerms } from "@/components/commitments/work-proposal-terms";
import {
  decideWorkCommitment,
  getWorkCommitment,
  proposeWorkCommitment,
} from "@/lib/api/endpoints";
import type { TaskConversationDto, WorkCommitmentDto } from "@/lib/api/types";
import { formatMinorMoney } from "@/lib/format";
import { parseMoneyInput } from "@workpay/shared/money";
import { cn } from "@/lib/utils";

function newIdempotencyKey(): string {
  return crypto.randomUUID();
}

function localDateTimeValue(value: string | null): string {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 16);
}

function CommitmentRail({ status }: { status: WorkCommitmentDto["status"] | null }) {
  const providerDone = status === "AWAITING_CLIENT" || status === "CONFIRMED";
  const clientDone = status === "CONFIRMED";
  const closed =
    status === "PROVIDER_DECLINED" ||
    status === "BUYER_WITHDRAWN" ||
    status === "NOT_SELECTED" ||
    status === "SUPERSEDED";
  const steps = [
    { label: "Proposal sent", done: Boolean(status), Icon: Send },
    { label: "Professional accepts", done: providerDone, Icon: UserCheck },
    { label: "Client confirms", done: clientDone, Icon: BadgeCheck },
  ];
  return (
    <ol className="grid grid-cols-3 gap-1" aria-label="Work commitment progress">
      {steps.map(({ label, done, Icon }, index) => (
        <li key={label} className="relative min-w-0">
          {index < steps.length - 1 ? (
            <span
              className={cn(
                "absolute left-[calc(50%+0.9rem)] right-[calc(-50%+0.9rem)] top-3 h-px",
                done && steps[index + 1]?.done ? "bg-emerald-400" : "bg-slate-300",
              )}
              aria-hidden="true"
            />
          ) : null}
          <span
            className={cn(
              "relative mx-auto grid h-6 w-6 place-items-center rounded-full border bg-white",
              done
                ? "border-emerald-500 text-emerald-700"
                : closed
                  ? "border-slate-300 text-slate-400"
                  : "border-indigo-300 text-indigo-700",
            )}
          >
            {done ? <Check className="h-3.5 w-3.5" /> : <Icon className="h-3 w-3" />}
          </span>
          <span className="mt-1.5 block text-center text-[10px] font-medium leading-4 text-slate-600">
            {label}
          </span>
        </li>
      ))}
    </ol>
  );
}

export function WorkCommitmentPanel({
  conversation,
  currentUserId,
  onChanged,
}: {
  conversation: TaskConversationDto;
  currentUserId: string;
  onChanged?: () => void;
}) {
  const isBuyer = conversation.buyerUserId === currentUserId;
  const [commitment, setCommitment] = useState<WorkCommitmentDto | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [amount, setAmount] = useState(() =>
    conversation.currentContractSnapshot.agreedPrice
      ? (conversation.currentContractSnapshot.agreedPrice.amountMinor / 100).toFixed(2)
      : "",
  );
  const [deadline, setDeadline] = useState(() =>
    localDateTimeValue(conversation.currentContractSnapshot.deadline),
  );
  const [acknowledged, setAcknowledged] = useState(false);
  const [termsReviewed, setTermsReviewed] = useState(false);
  const [declineNote, setDeclineNote] = useState("");
  const replacementModeRef = useRef(false);

  const refresh = async () => {
    const result = await getWorkCommitment(conversation.id);
    if (result.error) {
      setError(result.error.message);
    } else {
      const next = result.data ?? null;
      const closed =
        next && ["PROVIDER_DECLINED", "BUYER_WITHDRAWN", "SUPERSEDED"].includes(next.status);
      if (!replacementModeRef.current || !closed) {
        if (!closed) replacementModeRef.current = false;
        setCommitment(next);
      }
      setError(null);
    }
    setLoading(false);
  };

  useEffect(() => {
    setLoading(true);
    replacementModeRef.current = false;
    void refresh();
    const timer = window.setInterval(() => void refresh(), 8_000);
    return () => window.clearInterval(timer);
  }, [conversation.id]);

  useEffect(() => {
    setTermsReviewed(false);
    setAcknowledged(false);
  }, [commitment?.id]);

  const finish = async (result: Awaited<ReturnType<typeof getWorkCommitment>>) => {
    setBusy(false);
    if (result.error) {
      setError(result.error.message);
      return;
    }
    setCommitment(result.data ?? null);
    replacementModeRef.current = false;
    setAcknowledged(false);
    setDeclineNote("");
    window.dispatchEvent(new Event("workpay_commitment_change"));
    onChanged?.();
  };

  const sendProposal = async () => {
    try {
      const parsed = parseMoneyInput(amount, "USD");
      setBusy(true);
      setError(null);
      await finish(
        await proposeWorkCommitment(
          conversation.id,
          {
            amountMinor: parsed.amountMinor,
            currency: "USD",
            deliveryDeadline: deadline ? new Date(deadline).toISOString() : null,
          },
          newIdempotencyKey(),
        ),
      );
    } catch (cause) {
      setBusy(false);
      setError(cause instanceof Error ? cause.message : "Enter a valid compensation amount.");
    }
  };

  const decide = async (
    action: "PROVIDER_ACCEPT" | "PROVIDER_DECLINE" | "BUYER_CONFIRM" | "BUYER_WITHDRAW",
  ) => {
    if (!commitment) return;
    setBusy(true);
    setError(null);
    await finish(
      await decideWorkCommitment(
        conversation.id,
        commitment.id,
        action,
        newIdempotencyKey(),
        action === "PROVIDER_DECLINE" ? declineNote : undefined,
      ),
    );
  };

  return (
    <section
      aria-label="Work commitment"
      className="overflow-hidden rounded-2xl border border-[var(--wp-border)] bg-white"
    >
      <div className="border-b border-[var(--wp-border)] px-4 py-3">
        <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[var(--wp-accent)]">
          Work proposal
        </p>
        <h3 className="mt-1 text-base font-semibold tracking-tight text-[var(--wp-text-primary)]">
          {commitment ? "Terms and acceptance" : isBuyer ? "Send terms" : "Waiting for terms"}
        </h3>
      </div>

      <div className="space-y-4 p-4">
        <CommitmentRail status={commitment?.status ?? null} />

        {loading ? (
          <p className="py-3 text-center text-xs text-slate-500" role="status">
            Checking commitment status…
          </p>
        ) : null}

        {!loading && !commitment && isBuyer ? (
          <div className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="space-y-1.5 text-xs font-medium text-slate-700">
                Compensation (USD)
                <span className="relative block">
                  <CircleDollarSign className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                  <input
                    value={amount}
                    onChange={(event) => setAmount(event.target.value)}
                    inputMode="decimal"
                    placeholder="0.00"
                    className="h-11 w-full rounded-xl border border-slate-300 bg-white pl-9 pr-3 text-sm font-semibold outline-none transition focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/15"
                  />
                </span>
                <span className="block font-normal text-slate-500">
                  Budget ceiling: {formatMinorMoney(conversation.currentContractSnapshot.budget)}
                </span>
              </label>
              <label className="space-y-1.5 text-xs font-medium text-slate-700">
                Delivery target
                <span className="relative block">
                  <CalendarDays className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                  <input
                    type="datetime-local"
                    value={deadline}
                    onChange={(event) => setDeadline(event.target.value)}
                    className="h-11 w-full rounded-xl border border-slate-300 bg-white pl-9 pr-2 text-xs outline-none transition focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/15"
                  />
                </span>
              </label>
            </div>
            <Button
              className="min-h-11 w-full bg-indigo-700 hover:bg-indigo-800"
              disabled={busy || !amount.trim()}
              onClick={() => void sendProposal()}
            >
              <Send className="mr-2 h-4 w-4" />
              {busy ? "Sending exact terms…" : "Send work proposal"}
            </Button>
          </div>
        ) : null}

        {!loading && !commitment && !isBuyer ? (
          <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 p-4 text-center">
            <p className="text-sm font-semibold text-slate-800">No work proposal yet</p>
            <p className="mt-1 text-xs text-slate-500">Terms from the client will appear here.</p>
          </div>
        ) : null}

        {commitment ? (
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-2">
              <div className="rounded-xl bg-slate-50 p-3">
                <p className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wide text-slate-500">
                  <CircleDollarSign className="h-3.5 w-3.5" /> Compensation
                </p>
                <p className="mt-1 text-base font-bold text-slate-900">
                  {formatMinorMoney(commitment.amount)}
                </p>
              </div>
              <div className="rounded-xl bg-slate-50 p-3">
                <p className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wide text-slate-500">
                  <Clock3 className="h-3.5 w-3.5" /> Delivery
                </p>
                <p className="mt-1 text-xs font-semibold leading-5 text-slate-900">
                  {commitment.deliveryDeadline
                    ? new Date(commitment.deliveryDeadline).toLocaleString([], {
                        month: "short",
                        day: "numeric",
                        hour: "numeric",
                        minute: "2-digit",
                      })
                    : "No fixed deadline"}
                </p>
              </div>
            </div>
            <WorkProposalTerms
              terms={commitment.terms}
              contractVersion={commitment.contractVersion}
              onReviewed={() => setTermsReviewed(true)}
            />
            {commitment.status === "AWAITING_PROVIDER" && !isBuyer ? (
              <div className="space-y-3 rounded-xl border border-amber-200 bg-amber-50 p-3">
                <div>
                  <p className="text-sm font-semibold text-amber-950">Your decision is required</p>
                  <p className="mt-1 text-xs leading-5 text-amber-900">
                    Confirm that you can deliver these terms.
                  </p>
                </div>
                <label className="flex items-start gap-2 text-xs leading-5 text-amber-950">
                  <input
                    type="checkbox"
                    checked={acknowledged}
                    onChange={(event) => setAcknowledged(event.target.checked)}
                    disabled={!termsReviewed}
                    className="mt-1 h-4 w-4 accent-emerald-700"
                  />
                  I reviewed the scope, acceptance rules, compensation, and delivery target.
                </label>
                {!termsReviewed ? (
                  <p className="text-[11px] text-amber-800">
                    Open “Review exact work terms” before accepting.
                  </p>
                ) : null}
                <div className="grid gap-2 sm:grid-cols-2">
                  <Button
                    disabled={busy || !acknowledged}
                    className="bg-emerald-700 hover:bg-emerald-800"
                    onClick={() => void decide("PROVIDER_ACCEPT")}
                  >
                    <UserCheck className="mr-2 h-4 w-4" />
                    {busy ? "Recording…" : "Accept proposed work"}
                  </Button>
                  <Button
                    variant="outline"
                    disabled={busy}
                    onClick={() => void decide("PROVIDER_DECLINE")}
                  >
                    Decline proposal
                  </Button>
                </div>
                <textarea
                  value={declineNote}
                  onChange={(event) => setDeclineNote(event.target.value)}
                  maxLength={1_000}
                  rows={2}
                  placeholder="Optional note if declining"
                  className="w-full resize-y rounded-lg border border-amber-200 bg-white px-3 py-2 text-xs outline-none focus:border-amber-500"
                />
              </div>
            ) : null}

            {commitment.status === "AWAITING_PROVIDER" && isBuyer ? (
              <div className="space-y-3 rounded-xl border border-sky-200 bg-sky-50 p-3">
                <p className="text-sm font-semibold text-sky-950">
                  Waiting for professional review
                </p>
                <p className="text-xs leading-5 text-sky-900">
                  The professional is reviewing your proposal.
                </p>
                <Button
                  variant="outline"
                  disabled={busy}
                  onClick={() => void decide("BUYER_WITHDRAW")}
                >
                  Withdraw proposal
                </Button>
              </div>
            ) : null}

            {commitment.status === "AWAITING_CLIENT" && isBuyer ? (
              <div className="space-y-3 rounded-xl border border-emerald-300 bg-emerald-50 p-3 shadow-[0_10px_30px_-24px_rgba(5,150,105,0.8)]">
                <div>
                  <p className="flex items-center gap-2 text-sm font-semibold text-emerald-950">
                    <UserCheck className="h-4 w-4" /> Professional accepted. Your choice is next.
                  </p>
                  <p className="mt-1 text-xs leading-5 text-emerald-900">
                    Confirming selects {commitment.providerDisplayName} for this task.
                  </p>
                </div>
                <label className="flex items-start gap-2 text-xs leading-5 text-emerald-950">
                  <input
                    type="checkbox"
                    checked={acknowledged}
                    onChange={(event) => setAcknowledged(event.target.checked)}
                    disabled={!termsReviewed}
                    className="mt-1 h-4 w-4 accent-emerald-700"
                  />
                  I choose this professional and accept these exact terms as our work commitment.
                </label>
                {!termsReviewed ? (
                  <p className="text-[11px] text-emerald-800">
                    Open “Review exact work terms” before confirming.
                  </p>
                ) : null}
                <div className="grid gap-2 sm:grid-cols-[1fr_auto]">
                  <Button
                    disabled={busy || !acknowledged}
                    className="min-h-11 bg-emerald-700 hover:bg-emerald-800"
                    onClick={() => void decide("BUYER_CONFIRM")}
                  >
                    <BadgeCheck className="mr-2 h-4 w-4" />
                    {busy ? "Confirming selection…" : `Confirm ${commitment.providerDisplayName}`}
                  </Button>
                  <Button
                    variant="outline"
                    disabled={busy}
                    onClick={() => void decide("BUYER_WITHDRAW")}
                  >
                    Withdraw proposal
                  </Button>
                </div>
              </div>
            ) : null}

            {commitment.status === "AWAITING_CLIENT" && !isBuyer ? (
              <div className="space-y-3 rounded-xl border border-indigo-200 bg-indigo-50 p-3">
                <p className="text-sm font-semibold text-indigo-950">Accepted by you</p>
                <p className="mt-1 text-xs leading-5 text-indigo-900">
                  The client is making the final selection.
                </p>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={busy}
                  onClick={() => void decide("PROVIDER_DECLINE")}
                >
                  Withdraw my acceptance
                </Button>
              </div>
            ) : null}

            {commitment.status === "CONFIRMED" ? (
              <div className="rounded-xl border border-emerald-300 bg-emerald-50 p-3">
                <p className="flex items-center gap-2 text-sm font-semibold text-emerald-950">
                  <BadgeCheck className="h-4 w-4" /> Mutual work commitment confirmed
                </p>
                <p className="mt-1 text-xs leading-5 text-emerald-900">
                  Both sides accepted these terms.
                </p>
              </div>
            ) : null}

            {commitment.status === "PROVIDER_DECLINED" ||
            commitment.status === "BUYER_WITHDRAWN" ||
            commitment.status === "NOT_SELECTED" ||
            commitment.status === "SUPERSEDED" ? (
              <div className="space-y-3 rounded-xl border border-slate-300 bg-slate-50 p-3">
                <p className="text-sm font-semibold text-slate-800">
                  {commitment.status === "PROVIDER_DECLINED"
                    ? "Professional declined"
                    : commitment.status === "BUYER_WITHDRAWN"
                      ? "Proposal withdrawn"
                      : commitment.status === "NOT_SELECTED"
                        ? "Another professional was selected"
                        : "Terms changed"}
                </p>
                <p className="mt-1 text-xs leading-5 text-slate-600">
                  No commitment is active from this proposal.
                  {commitment.providerResponseNote
                    ? ` Note: ${commitment.providerResponseNote}`
                    : " You can keep the conversation for context."}
                </p>
                {isBuyer && commitment.status !== "NOT_SELECTED" ? (
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => {
                      setAmount((commitment.amount.amountMinor / 100).toFixed(2));
                      setDeadline(localDateTimeValue(commitment.deliveryDeadline));
                      replacementModeRef.current = true;
                      setCommitment(null);
                    }}
                  >
                    Create a new proposal
                  </Button>
                ) : null}
              </div>
            ) : null}
          </div>
        ) : null}

        {error ? (
          <p
            className="rounded-lg border border-rose-200 bg-rose-50 p-2.5 text-xs text-rose-900"
            role="alert"
          >
            {error}
          </p>
        ) : null}
      </div>
    </section>
  );
}
