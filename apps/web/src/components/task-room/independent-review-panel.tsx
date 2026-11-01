"use client";

import { useCallback, useEffect, useState } from "react";
import { parseMoneyInput } from "@workpay/shared";
import { Button } from "@/components/ui/button";
import {
  decideIndependentReview,
  getTaskReviewerRecommendations,
  listIndependentReviewEngagements,
  proposeIndependentReview,
} from "@/lib/api/endpoints";
import type {
  IndependentReviewEngagementDto,
  TaskConversationDto,
  TaskReviewerRecommendationsDto,
} from "@/lib/api/types";

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
    const normalized = [...new Set(domainDraft.split(",").map((domain) => domain.trim().toLowerCase()).filter(Boolean))];
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
        feeMinor: parsedFee,
        feeCurrency: "USD",
        feePayer,
      });
      if (response.error) {
        setError(response.error.message);
        return;
      }
      setSelectedReviewerId("");
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
      ["PROPOSED", "AWAITING_REVIEWER", "ENGAGED"].includes(engagement.status),
    );
  const criteria = conversation.currentContractSnapshot.requirements.filter(
    (requirement) => requirement.acceptanceRelevant,
  );

  return (
    <section className="space-y-3 rounded-lg border border-border p-3" aria-label="Independent review">
      <div>
        <h4 className="font-medium">Independent review agreement</h4>
        <p className="mt-1 text-xs text-muted-foreground">
          The buyer and professional agree the reviewer, criteria, fee payer, and contractual
          authority before work starts. The reviewer supplies the judgment; WorkPay does not
          arbitrate. Reviewer profile claims are self-supplied.
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
              {engagement.feeMinor !== null ? ` · USD ${(engagement.feeMinor / 100).toFixed(2)}` : ""}
            </p>
            {needsPartyConsent ? (
              <div className="flex flex-wrap gap-2">
                <Button type="button" disabled={busy} onClick={() => void decide(engagement, "accept")}>
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
                <label key={reviewer.userId} className="flex cursor-pointer gap-2 rounded-md border p-3">
                  <input
                    type="radio"
                    name={`reviewer-${conversation.id}`}
                    checked={selectedReviewerId === reviewer.userId}
                    onChange={() => setSelectedReviewerId(reviewer.userId)}
                  />
                  <span className="min-w-0">
                    <span className="block font-medium">{reviewer.displayName}</span>
                    <span className="block text-xs text-muted-foreground">{reviewer.summary}</span>
                    <span className="block text-xs text-muted-foreground">
                      Matching domains: {reviewer.matchedDomains.join(", ")} · Evidence is supplied
                      by the reviewer and not independently verified.
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
                onChange={(event) => setFeePayer(event.target.value as typeof feePayer)}
                className="rounded-md border border-input bg-background px-3 py-2"
              >
                <option value="DIRECT">Directly between parties and reviewer</option>
                <option value="BUYER">Buyer</option>
                <option value="PROVIDER">Professional</option>
                <option value="SHARED">Shared</option>
              </select>
            </label>
          </div>
          <p className="text-xs text-muted-foreground">
            The review plan covers {criteria.length} acceptance-relevant criteria. Fee handling is
            outside WorkPay; WorkPay does not collect or release reviewer fees.
          </p>
          {criteria.length === 0 ? (
            <p className="text-sm text-destructive">
              This contract has no acceptance-relevant criteria to include in a review plan.
            </p>
          ) : null}
          <Button
            type="button"
            disabled={busy || !selectedReviewerId || criteria.length === 0}
            onClick={() => void propose()}
          >
            Propose this reviewer and review plan
          </Button>
        </div>
      ) : null}
      {error ? <p className="text-sm text-destructive" role="alert">{error}</p> : null}
    </section>
  );
}
