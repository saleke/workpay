"use client";

import { useEffect, useState } from "react";
import {
  BadgeCheck,
  CalendarDays,
  Check,
  CircleDollarSign,
  Clock3,
  FileCheck2,
  Send,
  ShieldCheck,
  UserCheck,
} from "lucide-react";
import { Button } from "@/components/ui/button";
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
  const [declineNote, setDeclineNote] = useState("");

  const refresh = async () => {
    const result = await getWorkCommitment(conversation.id);
    if (result.error) {
      setError(result.error.message);
    } else {
      setCommitment(result.data ?? null);
      setError(null);
    }
    setLoading(false);
  };

  useEffect(() => {
    setLoading(true);
    void refresh();
    const timer = window.setInterval(() => void refresh(), 8_000);
    return () => window.clearInterval(timer);
  }, [conversation.id]);

  const finish = async (result: Awaited<ReturnType<typeof getWorkCommitment>>) => {
    setBusy(false);
    if (result.error) {
      setError(result.error.message);
      return;
    }
    setCommitment(result.data ?? null);
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
      className="overflow-hidden rounded-2xl border border-slate-300 bg-white shadow-[0_18px_50px_-38px_rgba(15,23,42,0.8)]"
    >
      <div className="bg-[linear-gradient(135deg,#172033_0%,#26365d_58%,#304b7b_100%)] px-4 py-4 text-white">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-indigo-200">
              Mutual commitment
            </p>
            <h3 className="mt-1 text-base font-semibold tracking-tight">
              Choose the work, together
            </h3>
          </div>
          <ShieldCheck className="h-5 w-5 text-emerald-300" aria-hidden="true" />
        </div>
        <p className="mt-2 max-w-md text-xs leading-5 text-slate-200">
          Messages stay non-binding. Work becomes committed only after the professional accepts the
          exact proposal and the client confirms that professional.
        </p>
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
            <div className="rounded-xl border border-indigo-100 bg-indigo-50/60 p-3">
              <p className="flex items-center gap-2 text-xs font-semibold text-indigo-950">
                <FileCheck2 className="h-4 w-4" /> Send an exact work proposal
              </p>
              <p className="mt-1 text-xs leading-5 text-indigo-900/80">
                This invites the professional to accept scope version{" "}
                {conversation.currentContractVersion}. It does not select them until you confirm
                after their response.
              </p>
            </div>
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
            <label className="flex cursor-pointer items-start gap-2.5 rounded-xl border border-slate-200 p-3 text-xs leading-5 text-slate-600">
              <input
                type="checkbox"
                checked={acknowledged}
                onChange={(event) => setAcknowledged(event.target.checked)}
                className="mt-1 h-4 w-4 rounded border-slate-300 accent-indigo-700"
              />
              <span>
                I reviewed the scope and understand the professional must accept before I make the
                final selection.
              </span>
            </label>
            <Button
              className="min-h-11 w-full bg-indigo-700 hover:bg-indigo-800"
              disabled={busy || !acknowledged || !amount.trim()}
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
            <p className="mt-1 text-xs leading-5 text-slate-500">
              This remains a discussion. If the client sends exact terms, they will appear here and
              in Proposed work inside Work Studio.
            </p>
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
            <p className="text-[10px] text-slate-500">
              Contract v{commitment.contractVersion} · terms {commitment.termsHash.slice(0, 10)}
            </p>

            {commitment.status === "AWAITING_PROVIDER" && !isBuyer ? (
              <div className="space-y-3 rounded-xl border border-amber-200 bg-amber-50 p-3">
                <div>
                  <p className="text-sm font-semibold text-amber-950">Your decision is required</p>
                  <p className="mt-1 text-xs leading-5 text-amber-900">
                    Accept only if you can deliver this exact scope for the stated compensation and
                    target date. The client must still confirm you afterward.
                  </p>
                </div>
                <label className="flex items-start gap-2 text-xs leading-5 text-amber-950">
                  <input
                    type="checkbox"
                    checked={acknowledged}
                    onChange={(event) => setAcknowledged(event.target.checked)}
                    className="mt-1 h-4 w-4 accent-emerald-700"
                  />
                  I reviewed the scope, acceptance rules, compensation, and delivery target.
                </label>
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
                  You are not committed yet. You will make the final selection if the professional
                  accepts.
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
                    Confirming selects {commitment.providerDisplayName}, closes competing work
                    proposals for this task, and creates the agreement used for payment
                    authorization.
                  </p>
                </div>
                <label className="flex items-start gap-2 text-xs leading-5 text-emerald-950">
                  <input
                    type="checkbox"
                    checked={acknowledged}
                    onChange={(event) => setAcknowledged(event.target.checked)}
                    className="mt-1 h-4 w-4 accent-emerald-700"
                  />
                  I choose this professional and accept these exact terms as our work commitment.
                </label>
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
                    Not now
                  </Button>
                </div>
              </div>
            ) : null}

            {commitment.status === "AWAITING_CLIENT" && !isBuyer ? (
              <div className="space-y-3 rounded-xl border border-indigo-200 bg-indigo-50 p-3">
                <p className="text-sm font-semibold text-indigo-950">Accepted by you</p>
                <p className="mt-1 text-xs leading-5 text-indigo-900">
                  The client is deciding among accepted proposals. Do not begin work until they
                  confirm you and Work Studio moves it to accepted work.
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
                  Both sides accepted the same terms. Payment authorization and permission to start
                  remain separate safeguards.
                </p>
              </div>
            ) : null}

            {commitment.status === "PROVIDER_DECLINED" ||
            commitment.status === "BUYER_WITHDRAWN" ||
            commitment.status === "NOT_SELECTED" ||
            commitment.status === "SUPERSEDED" ? (
              <div className="rounded-xl border border-slate-300 bg-slate-50 p-3">
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
