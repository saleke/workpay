"use client";

import { useCallback, useEffect, useState } from "react";
import { parseMoneyInput } from "@workpay/shared/money";
import { Button } from "@/components/ui/button";
import {
  decideIndependentReview,
  createReviewFeeOrder,
  getReviewFeeStatus,
  reconcileReviewFee,
  getTaskReviewerRecommendations,
  listIndependentReviewEngagements,
  proposeIndependentReview,
} from "@/lib/api/endpoints";
import type {
  IndependentReviewEngagementDto,
  TaskConversationDto,
  TaskReviewerRecommendationsDto,
} from "@/lib/api/types";
import { useApi } from "@/lib/use-api";
import { formatMinorMoney } from "@/lib/format";

function ReviewFeePanel({
  engagement,
  currentUserId,
  onPaid,
}: {
  engagement: IndependentReviewEngagementDto;
  currentUserId: string;
  onPaid: () => void;
}) {
  const fee = useApi(
    () => getReviewFeeStatus(engagement.id),
    [engagement.id],
    `review-fee-${engagement.id}`,
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const myPayment = fee.data?.payments.find((payment) => payment.payerUserId === currentUserId);
  const paidCount = fee.data?.payments.filter((payment) => payment.status === "PAID").length ?? 0;
  const totalCount = fee.data?.payments.length ?? 0;

  const approve = async () => {
    setBusy(true);
    setError(null);
    const response =
      myPayment?.status === "UNKNOWN"
        ? await reconcileReviewFee(myPayment.id, crypto.randomUUID())
        : await createReviewFeeOrder(engagement.id, crypto.randomUUID());
    setBusy(false);
    if (response.error || !response.data) {
      setError(response.error?.message ?? "Review fee approval could not be opened.");
      return;
    }
    const approvalUrl =
      "approvalUrl" in response.data && typeof response.data.approvalUrl === "string"
        ? response.data.approvalUrl
        : null;
    if (approvalUrl) {
      window.location.href = approvalUrl;
      return;
    }
    await fee.reload();
    onPaid();
  };

  return (
    <div className="space-y-3 rounded-xl border border-violet-200 bg-violet-50 p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="text-sm font-semibold text-violet-950">Review fee approval</p>
          <p className="mt-0.5 text-xs text-violet-800">
            {paidCount} of {totalCount} payer approval{totalCount === 1 ? "" : "s"} complete
          </p>
        </div>
        {myPayment ? (
          <span className="rounded-full bg-white px-2.5 py-1 text-xs font-semibold text-violet-900">
            {formatMinorMoney({
              amountMinor: myPayment.amountMinor,
              currency: myPayment.currency,
            })}
          </span>
        ) : null}
      </div>
      {myPayment && myPayment.status !== "PAID" ? (
        <Button type="button" disabled={busy} onClick={() => void approve()}>
          {busy
            ? "Preparing fee approval…"
            : myPayment.status === "UNKNOWN"
              ? "Reconcile review fee"
              : myPayment.mode === "FAKE"
                ? "Confirm review fee"
                : "Approve review fee with PayPal"}
        </Button>
      ) : myPayment ? (
        <p className="text-xs font-semibold text-emerald-800">Your fee share is paid.</p>
      ) : (
        <p className="text-xs text-violet-800">Waiting for the agreed payer.</p>
      )}
      {error ? <p className="text-xs text-rose-700">{error}</p> : null}
    </div>
  );
}

export function IndependentReviewPanel({
  conversation,
  currentUserId,
}: {
  conversation: TaskConversationDto;
  currentUserId: string;
}) {
  const [domainDraft, setDomainDraft] = useState("");
  const [domains, setDomains] = useState<string[]>([]);
  const [recommendations, setRecommendations] = useState<TaskReviewerRecommendationsDto | null>(
    null,
  );
  const [selectedReviewerId, setSelectedReviewerId] = useState("");
  const [fee, setFee] = useState("");
  const [reviewBrief, setReviewBrief] = useState("");
  const [feePayer, setFeePayer] = useState<"BUYER" | "PROVIDER" | "SHARED" | "DIRECT">("DIRECT");
  const [engagements, setEngagements] = useState<IndependentReviewEngagementDto[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    const response = await listIndependentReviewEngagements(conversation.id);
    if (response.error) {
      setError(response.error.message);
      return;
    }
    setEngagements(response.data ?? []);
  }, [conversation.id]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const search = async () => {
    const normalized = [
      ...new Set(
        domainDraft
          .split(",")
          .map((domain) => domain.trim().toLowerCase())
          .filter(Boolean),
      ),
    ];
    if (
      normalized.length === 0 ||
      normalized.length > 20 ||
      normalized.some((domain) => domain.length > 128)
    ) {
      setError("Enter 1 to 20 review domains, up to 128 characters each.");
      return;
    }
    setBusy(true);
    setError(null);
    const response = await getTaskReviewerRecommendations(conversation.taskId, normalized);
    setBusy(false);
    if (response.error || !response.data) {
      setError(response.error?.message ?? "Reviewer suggestions could not be loaded.");
      return;
    }
    setDomains(normalized);
    setRecommendations(response.data);
  };

  const propose = async () => {
    if (!selectedReviewerId) return;
    setBusy(true);
    setError(null);
    try {
      const parsedFee = fee.trim() ? parseMoneyInput(fee, "USD").amountMinor : null;
      const requirementKeys = [
        ...new Set(
          conversation.currentContractSnapshot.requirements
            .filter((requirement) => requirement.acceptanceRelevant)
            .map((requirement) => requirement.key),
        ),
      ];
      const response = await proposeIndependentReview(conversation.id, {
        reviewerUserId: selectedReviewerId,
        expectedContractVersion: conversation.currentContractVersion,
        expectedContractHash: conversation.currentContractHash,
        requirementKeys,
        domains,
        brief: reviewBrief,
        feeMinor: parsedFee,
        feeCurrency: "USD",
        feePayer,
        feeMode: selectedReviewer?.feeMode ?? "DIRECT",
      });
      if (response.error) {
        setError(response.error.message);
        return;
      }
      setSelectedReviewerId("");
      setReviewBrief("");
      await refresh();
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "The reviewer fee is invalid.");
    } finally {
      setBusy(false);
    }
  };

  const decide = async (
    engagement: IndependentReviewEngagementDto,
    decision: "accept" | "decline",
  ) => {
    setBusy(true);
    setError(null);
    const response = await decideIndependentReview(conversation.id, engagement.id, { decision });
    setBusy(false);
    if (response.error) {
      setError(response.error.message);
      return;
    }
    await refresh();
  };

  const canPropose =
    conversation.status === "OPEN" &&
    currentUserId === conversation.buyerUserId &&
    !engagements.some((engagement) =>
      ["PROPOSED", "AWAITING_REVIEWER", "AWAITING_FEE_AUTHORIZATION", "ENGAGED"].includes(
        engagement.status,
      ),
    );
  const criteria = conversation.currentContractSnapshot.requirements.filter(
    (requirement) => requirement.acceptanceRelevant,
  );
  const selectedReviewer = recommendations?.recommendations.find(
    (reviewer) => reviewer.userId === selectedReviewerId,
  );

  return (
    <section
      className="space-y-3 rounded-lg border border-border p-3"
      aria-label="Independent review"
    >
      <div>
        <h4 className="font-medium">Independent review agreement</h4>
        <p className="mt-1 text-xs text-muted-foreground">
          Agree the reviewer, review focus, and fee arrangement before sending a package to them.
        </p>
      </div>

      {engagements.map((engagement) => {
        const isBuyer = currentUserId === engagement.buyerUserId;
        const isProvider = currentUserId === engagement.providerUserId;
        const needsPartyConsent =
          engagement.status === "PROPOSED" &&
          ((isBuyer && !engagement.buyerAcceptedAt) ||
            (isProvider && !engagement.providerAcceptedAt));
        return (
          <div key={engagement.id} className="space-y-2 rounded-md bg-muted/40 p-3 text-sm">
            <p className="font-medium">
              Review v{engagement.contractVersion} · {engagement.status.replaceAll("_", " ")}
            </p>
            <p className="text-xs text-muted-foreground">
              Criteria: {engagement.requirementKeys.join(", ")} · Fee payer: {engagement.feePayer}
              {engagement.feeMinor !== null
                ? ` · USD ${(engagement.feeMinor / 100).toFixed(2)}`
                : ""}
            </p>
            {needsPartyConsent ? (
              <div className="flex flex-wrap gap-2">
                <Button
                  type="button"
                  disabled={busy}
                  onClick={() => void decide(engagement, "accept")}
                >
                  Agree to reviewer and terms
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  disabled={busy}
                  onClick={() => void decide(engagement, "decline")}
                >
                  Decline
                </Button>
              </div>
            ) : null}
            {engagement.status === "AWAITING_FEE_AUTHORIZATION" ? (
              <ReviewFeePanel
                engagement={engagement}
                currentUserId={currentUserId}
                onPaid={() => void refresh()}
              />
            ) : null}
          </div>
        );
      })}

      {canPropose ? (
        <div className="space-y-3 border-t border-border pt-3">
          <label className="grid gap-1 text-sm">
            <span>Review domains</span>
            <div className="flex gap-2">
              <input
                value={domainDraft}
                onChange={(event) => setDomainDraft(event.target.value)}
                placeholder="e.g. accessibility, financial analysis"
                className="min-w-0 flex-1 rounded-md border border-input bg-background px-3 py-2"
              />
              <Button type="button" variant="outline" onClick={() => void search()} disabled={busy}>
                Find reviewers
              </Button>
            </div>
          </label>
          {recommendations ? (
            <div className="space-y-2">
              <p className="text-xs text-muted-foreground">{recommendations.reason}</p>
              {recommendations.recommendations.map((reviewer) => (
                <label
                  key={reviewer.userId}
                  className="flex cursor-pointer gap-2 rounded-md border p-3"
                >
                  <input
                    type="radio"
                    name={`reviewer-${conversation.id}`}
                    checked={selectedReviewerId === reviewer.userId}
                    onChange={() => {
                      setSelectedReviewerId(reviewer.userId);
                      setFee(
                        reviewer.feeMinor === null ? "" : (reviewer.feeMinor / 100).toFixed(2),
                      );
                      setFeePayer(reviewer.feeMode === "DIRECT" ? "DIRECT" : "BUYER");
                    }}
                  />
                  <span className="min-w-0">
                    <span className="block font-medium">{reviewer.displayName}</span>
                    <span className="block text-xs text-muted-foreground">{reviewer.summary}</span>
                    <span className="block text-xs text-muted-foreground">
                      Matching domains: {reviewer.matchedDomains.join(", ")} ·{" "}
                      {reviewer.typicalTurnaroundDays
                        ? `${reviewer.typicalTurnaroundDays} day turnaround`
                        : "Turnaround by agreement"}
                      {reviewer.feeMinor !== null
                        ? ` · USD ${(reviewer.feeMinor / 100).toFixed(2)}`
                        : ""}
                    </span>
                  </span>
                </label>
              ))}
            </div>
          ) : null}
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="grid gap-1 text-sm">
              <span>Reviewer fee in USD (optional)</span>
              <input
                value={fee}
                onChange={(event) => setFee(event.target.value)}
                placeholder="Leave blank if arranged directly"
                className="rounded-md border border-input bg-background px-3 py-2"
              />
            </label>
            <label className="grid gap-1 text-sm">
              <span>Fee payer</span>
              <select
                value={feePayer}
                disabled={selectedReviewer?.feeMode === "DIRECT"}
                onChange={(event) => setFeePayer(event.target.value as typeof feePayer)}
                className="rounded-md border border-input bg-background px-3 py-2"
              >
                {selectedReviewer?.feeMode === "DIRECT" ? (
                  <option value="DIRECT">Arranged directly</option>
                ) : (
                  <>
                    <option value="BUYER">Buyer</option>
                    <option value="PROVIDER">Professional</option>
                    <option value="SHARED">Shared</option>
                  </>
                )}
              </select>
            </label>
          </div>
          <label className="grid gap-1 text-sm">
            <span>Review request</span>
            <textarea
              value={reviewBrief}
              onChange={(event) => setReviewBrief(event.target.value)}
              rows={3}
              minLength={20}
              maxLength={4_000}
              placeholder="Explain what the reviewer should inspect, the decision you need help with, and any known ambiguity."
              className="rounded-md border border-input bg-background px-3 py-2"
            />
          </label>
          <p className="text-xs text-muted-foreground">
            The review plan covers {criteria.length} acceptance-relevant criteria. Fee handling is
            arranged between the parties and reviewer.
          </p>
          {selectedReviewer?.feeMode === "PAYPAL" ? (
            <p className="text-xs text-violet-800">
              PayPal fee shares are approved and paid before the reviewer engagement begins.
            </p>
          ) : null}
          {criteria.length === 0 ? (
            <p className="text-sm text-destructive">
              This contract has no acceptance-relevant criteria to include in a review plan.
            </p>
          ) : null}
          <Button
            type="button"
            disabled={
              busy || !selectedReviewerId || criteria.length === 0 || reviewBrief.trim().length < 20
            }
            onClick={() => void propose()}
          >
            Propose this reviewer and review plan
          </Button>
        </div>
      ) : null}
      {error ? (
        <p className="text-sm text-destructive" role="alert">
          {error}
        </p>
      ) : null}
    </section>
  );
}
