"use client";

import { FormEvent, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { IndependentReviewPanel } from "@/components/task-room/independent-review-panel";
import {
  activateContractChange,
  decideContractChange,
  getTaskConversationMessages,
  listContractChangeRequests,
  proposeContractChange,
  sendTaskConversationMessage,
} from "@/lib/api/endpoints";
import type { ContractChangeRequestDto, TaskConversationDto } from "@/lib/api/types";
import { parseMoneyInput } from "@workpay/shared";
import { formatMinorMoney } from "@/lib/format";

function clientMessageId(): string {
  return crypto.randomUUID();
}

export function ConversationThread({
  conversation,
  currentUserId,
  onAgreementChanged,
}: {
  conversation: TaskConversationDto;
  currentUserId: string;
  onAgreementChanged?: () => void;
}) {
  const [messages, setMessages] = useState(conversation.messages);
  const [draft, setDraft] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [changeRequests, setChangeRequests] = useState<ContractChangeRequestDto[]>([]);
  const [changeReason, setChangeReason] = useState("");
  const [changeSummary, setChangeSummary] = useState(conversation.currentContractSnapshot.summary);
  const [requirementsDraft, setRequirementsDraft] = useState(
    formatRequirements(conversation.currentContractSnapshot.requirements),
  );
  const [included, setIncluded] = useState(
    conversation.currentContractSnapshot.included.join("\n"),
  );
  const [excluded, setExcluded] = useState(
    conversation.currentContractSnapshot.excluded.join("\n"),
  );
  const [budget, setBudget] = useState(
    formatMinorMoney(conversation.currentContractSnapshot.budget),
  );
  const [agreedPrice, setAgreedPrice] = useState(() =>
    conversation.currentContractSnapshot.agreedPrice
      ? formatMinorMoney(conversation.currentContractSnapshot.agreedPrice)
      : "",
  );
  const [showChangeForm, setShowChangeForm] = useState(false);
  const [changeBusyId, setChangeBusyId] = useState<string | null>(null);

  useEffect(() => {
    setMessages(conversation.messages);
  }, [conversation.messages, conversation.id]);

  useEffect(() => {
    setChangeSummary(conversation.currentContractSnapshot.summary);
    setRequirementsDraft(formatRequirements(conversation.currentContractSnapshot.requirements));
    setIncluded(conversation.currentContractSnapshot.included.join("\n"));
    setExcluded(conversation.currentContractSnapshot.excluded.join("\n"));
    setBudget(formatMinorMoney(conversation.currentContractSnapshot.budget));
    setAgreedPrice(
      conversation.currentContractSnapshot.agreedPrice
        ? formatMinorMoney(conversation.currentContractSnapshot.agreedPrice)
        : "",
    );
  }, [conversation.id, conversation.currentContractSnapshot]);

  const refreshChangeRequests = async () => {
    const response = await listContractChangeRequests(conversation.id);
    if (response.error) {
      setError(response.error.message);
      return;
    }
    setChangeRequests(response.data ?? []);
  };

  useEffect(() => {
    if (conversation.status !== "OPEN") return;
    void refreshChangeRequests();
  }, [conversation.id, conversation.status]);

  useEffect(() => {
    if (conversation.status !== "OPEN") return;
    const timer = setInterval(() => {
      const lastSequence = messages.at(-1)?.sequence ?? 0;
      void getTaskConversationMessages(conversation.id, lastSequence).then((response) => {
        if (response.error) {
          setError(response.error.message);
          return;
        }
        if (response.data?.messages.length) {
          setMessages((current) => [...current, ...response.data!.messages]);
        }
      });
    }, 5_000);
    return () => clearInterval(timer);
  }, [conversation.id, conversation.status, messages]);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const body = draft.trim();
    if (!body || sending) return;
    setSending(true);
    setError(null);
    const result = await sendTaskConversationMessage(conversation.id, {
      clientMessageId: clientMessageId(),
      body,
    });
    setSending(false);
    if (result.error || !result.data) {
      setError(result.error?.message ?? "Your message could not be sent.");
      return;
    }
    setMessages((current) => [...current, result.data!]);
    setDraft("");
  };

  const submitChange = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (sending) return;
    setSending(true);
    setError(null);
    try {
      const parsedBudget = parseMoneyInput(
        budget,
        conversation.currentContractSnapshot.budget.currency,
      );
      const parsedAgreedPrice = agreedPrice.trim()
        ? parseMoneyInput(agreedPrice, conversation.currentContractSnapshot.budget.currency)
        : null;
      const result = await proposeContractChange(conversation.id, {
        expectedContractVersion: conversation.currentContractVersion,
        expectedContractHash: conversation.currentContractHash,
        reason: changeReason,
        patch: {
          summary: changeSummary,
          requirements: parseRequirements(
            requirementsDraft,
            conversation.currentContractSnapshot.requirements,
          ),
          included: lines(included),
          excluded: lines(excluded),
          budgetMinor: parsedBudget.amountMinor,
          ...(parsedAgreedPrice ? { agreedPriceMinor: parsedAgreedPrice.amountMinor } : {}),
        },
      });
      if (result.error || !result.data) {
        setError(result.error?.message ?? "The change proposal could not be sent.");
        return;
      }
      setChangeReason("");
      setShowChangeForm(false);
      await refreshChangeRequests();
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "The budget is invalid.");
    } finally {
      setSending(false);
    }
  };

  const decideChange = async (
    request: ContractChangeRequestDto,
    decision: "accept" | "decline" | "withdraw" | "request-cancellation" | "confirm-cancellation",
  ) => {
    setChangeBusyId(request.id);
    setError(null);
    const response = await decideContractChange(conversation.id, request.id, decision);
    setChangeBusyId(null);
    if (response.error) {
      setError(response.error.message);
      return;
    }
    await refreshChangeRequests();
  };

  const activateChange = async (request: ContractChangeRequestDto) => {
    setChangeBusyId(request.id);
    setError(null);
    const response = await activateContractChange(conversation.id, request.id);
    setChangeBusyId(null);
    if (response.error) {
      setError(response.error.message);
      await refreshChangeRequests();
      return;
    }
    await refreshChangeRequests();
    onAgreementChanged?.();
  };

  const hasUnresolvedChange = changeRequests.some(
    (request) =>
      request.status === "PROPOSED" ||
      request.status === "ACCEPTED_PENDING_ACTIVATION" ||
      request.status === "ACTIVATING" ||
      request.status === "ACTIVATION_RECONCILIATION_REQUIRED" ||
      request.status === "CANCELLATION_PENDING",
  );

  return (
    <section aria-label="Private task conversation" className="space-y-4">
      {conversation.status === "CONTACT_PENDING" ? (
        <p
          className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900"
          role="status"
        >
          Contact request sent. Messaging opens after the professional accepts.
        </p>
      ) : null}
      <ol
        className="max-h-96 space-y-3 overflow-y-auto rounded-lg border border-border p-3"
        aria-live="polite"
      >
        {messages.map((message) => (
          <li
            key={message.id}
            className={`max-w-[90%] rounded-lg p-3 text-sm ${
              message.authorUserId === currentUserId
                ? "ml-auto bg-primary text-primary-foreground"
                : "bg-muted text-foreground"
            }`}
          >
            <p className="whitespace-pre-wrap break-words">{message.body}</p>
            <time className="mt-1 block text-xs opacity-70" dateTime={message.createdAt}>
              {new Date(message.createdAt).toLocaleString()}
            </time>
          </li>
        ))}
        {messages.length === 0 ? (
          <li className="text-sm text-muted-foreground">No messages yet.</li>
        ) : null}
      </ol>
      {conversation.status === "OPEN" ? (
        <form onSubmit={submit} className="space-y-2">
          <label htmlFor={`message-${conversation.id}`} className="text-sm font-medium">
            Message
          </label>
          <textarea
            id={`message-${conversation.id}`}
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            maxLength={10_000}
            rows={3}
            className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
            required
          />
          {error ? (
            <p className="text-sm text-destructive" role="alert">
              {error}
            </p>
          ) : null}
          <Button type="submit" disabled={!draft.trim() || sending}>
            {sending ? "Sending…" : "Send message"}
          </Button>
        </form>
      ) : null}
      {conversation.status === "OPEN" ? (
        <section className="space-y-3 border-t border-border pt-4" aria-label="Agreement changes">
          <div>
            <h3 className="font-medium">Proposed agreement changes</h3>
            <p className="mt-1 text-sm text-muted-foreground">
              Discuss freely in chat. A change only becomes active after both of you agree and
              WorkPay completes the required contract and PayPal steps.
            </p>
          </div>
          {changeRequests.map((request) => (
            <article key={request.id} className="space-y-3 rounded-lg border border-border p-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-sm font-medium">
                  Change proposed by{" "}
                  {request.proposerUserId === currentUserId ? "you" : "the other participant"}
                </p>
                <span className="text-xs text-muted-foreground">
                  {changeRequestStatus(request.status)}
                </span>
              </div>
              <p className="text-sm">{request.reason}</p>
              <details className="text-sm">
                <summary className="cursor-pointer font-medium">Review proposed terms</summary>
                <div className="mt-2 space-y-2 rounded bg-muted/40 p-3">
                  <p>{request.proposedTerms.summary}</p>
                  <p>
                    Buyer budget ceiling:{" "}
                    {formatMinorMoney({
                      amountMinor: request.proposedBudgetMinor,
                      currency: request.currency,
                    })}
                  </p>
                  {request.proposedAgreedPriceMinor !== null ? (
                    <p>
                      Agreed price:{" "}
                      {formatMinorMoney({
                        amountMinor: request.proposedAgreedPriceMinor,
                        currency: request.currency,
                      })}
                    </p>
                  ) : null}
                  <p>Included: {request.proposedTerms.included.join("; ") || "None listed"}</p>
                  <p>Excluded: {request.proposedTerms.excluded.join("; ") || "None listed"}</p>
                  {request.paymentAdjustmentPlan ? (
                    <p className="text-xs text-muted-foreground">
                      Funding step after agreement:{" "}
                      {request.paymentAdjustmentPlan.action.replaceAll("_", " ").toLowerCase()}.
                    </p>
                  ) : null}
                </div>
              </details>
              {request.status === "PROPOSED" && request.respondentUserId === currentUserId ? (
                <div className="flex flex-wrap gap-2">
                  <Button
                    type="button"
                    disabled={changeBusyId === request.id}
                    onClick={() => void decideChange(request, "accept")}
                  >
                    Agree to proposed change
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    disabled={changeBusyId === request.id}
                    onClick={() => void decideChange(request, "decline")}
                  >
                    Decline
                  </Button>
                </div>
              ) : null}
              {request.status === "PROPOSED" && request.proposerUserId === currentUserId ? (
                <Button
                  type="button"
                  variant="outline"
                  disabled={changeBusyId === request.id}
                  onClick={() => void decideChange(request, "request-cancellation")}
                >
                  Withdraw proposal
                </Button>
              ) : null}
              {request.status === "ACCEPTED_PENDING_ACTIVATION" ? (
                <div className="space-y-2">
                  <p className="text-sm text-amber-800" role="status">
                    Both participants agreed. The existing contract and payment remain unchanged
                    until the new version and required PayPal adjustment are completed.
                  </p>
                  <Button
                    type="button"
                    disabled={changeBusyId === request.id}
                    onClick={() => void activateChange(request)}
                  >
                    {changeBusyId === request.id ? "Activating…" : "Activate agreed change"}
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    disabled={changeBusyId === request.id}
                    onClick={() => void decideChange(request, "confirm-cancellation")}
                  >
                    Request cancellation of agreed change
                  </Button>
                </div>
              ) : null}
              {request.status === "ACTIVATED" ? (
                <p className="text-sm text-green-800" role="status">
                  Change is active in contract version {conversation.currentContractVersion}.
                </p>
              ) : null}
              {request.status === "ACTIVATING" ? (
                <p className="text-sm text-amber-800" role="status">
                  PayPal is processing the new authorization and release of the previous hold. The
                  contract remains unchanged until both steps are confirmed.
                </p>
              ) : null}
              {request.status === "ACTIVATION_RECONCILIATION_REQUIRED" ? (
                <p className="text-sm text-destructive" role="alert">
                  PayPal did not provide a confirmed outcome. The change is not active and payment
                  actions are paused until the authorization state is reconciled.
                </p>
              ) : null}
              {request.status === "ACTIVATION_FAILED" ? (
                <p className="text-sm text-destructive" role="status">
                  PayPal declined the new authorization. The current contract and existing hold
                  remain in effect; propose a new change if you still want to proceed.
                </p>
              ) : null}
              {request.status === "CANCELLATION_PENDING" ? (
                <div className="space-y-2 text-sm text-amber-800" role="status">
                  Cancellation requested. The agreed change remains on hold until the other
                  participant confirms cancellation.
                  {request.cancellationRequestedBy !== currentUserId ? (
                    <Button
                      type="button"
                      variant="outline"
                      disabled={changeBusyId === request.id}
                      onClick={() => void decideChange(request, "withdraw")}
                    >
                      Confirm cancellation
                    </Button>
                  ) : null}
                </div>
              ) : null}
            </article>
          ))}
          {!hasUnresolvedChange && !showChangeForm ? (
            <Button type="button" variant="outline" onClick={() => setShowChangeForm(true)}>
              Propose a change
            </Button>
          ) : null}
          {showChangeForm && !hasUnresolvedChange ? (
            <form onSubmit={submitChange} className="space-y-3 rounded-lg border border-border p-3">
              <label className="block space-y-1 text-sm">
                <span>Why is this change needed?</span>
                <textarea
                  value={changeReason}
                  onChange={(event) => setChangeReason(event.target.value)}
                  rows={2}
                  minLength={8}
                  maxLength={2_000}
                  required
                  className="w-full rounded-md border border-input bg-background px-3 py-2"
                />
              </label>
              <label className="block space-y-1 text-sm">
                <span>Updated work summary</span>
                <textarea
                  value={changeSummary}
                  onChange={(event) => setChangeSummary(event.target.value)}
                  rows={3}
                  maxLength={8_000}
                  required
                  className="w-full rounded-md border border-input bg-background px-3 py-2"
                />
              </label>
              <label className="block space-y-1 text-sm">
                <span>Requirements (one per line: key | requirement)</span>
                <textarea
                  value={requirementsDraft}
                  onChange={(event) => setRequirementsDraft(event.target.value)}
                  rows={4}
                  className="w-full rounded-md border border-input bg-background px-3 py-2"
                />
              </label>
              <p className="text-xs text-muted-foreground">
                Keep existing keys to preserve their acceptance checks. If a changed requirement
                makes an existing check inaccurate, explain the new acceptance approach in chat
                before proposing it.
              </p>
              <label className="block space-y-1 text-sm">
                <span>Included work (one item per line)</span>
                <textarea
                  value={included}
                  onChange={(event) => setIncluded(event.target.value)}
                  rows={3}
                  className="w-full rounded-md border border-input bg-background px-3 py-2"
                />
              </label>
              <label className="block space-y-1 text-sm">
                <span>Excluded work (one item per line)</span>
                <textarea
                  value={excluded}
                  onChange={(event) => setExcluded(event.target.value)}
                  rows={2}
                  className="w-full rounded-md border border-input bg-background px-3 py-2"
                />
              </label>
              <label className="block space-y-1 text-sm">
                <span>
                  Updated buyer budget ceiling (
                  {conversation.currentContractSnapshot.budget.currency})
                </span>
                <input
                  value={budget}
                  onChange={(event) => setBudget(event.target.value)}
                  inputMode="decimal"
                  required
                  className="w-full rounded-md border border-input bg-background px-3 py-2"
                />
              </label>
              <label className="block space-y-1 text-sm">
                <span>
                  New agreed price ({conversation.currentContractSnapshot.budget.currency})
                </span>
                <input
                  value={agreedPrice}
                  onChange={(event) => setAgreedPrice(event.target.value)}
                  inputMode="decimal"
                  className="w-full rounded-md border border-input bg-background px-3 py-2"
                />
              </label>
              <p className="text-xs text-muted-foreground">
                These are proposed terms, not a charge. The buyer's ceiling is separate from the
                price agreed with the professional. Existing PayPal authorization or capture is not
                changed by sending or accepting this proposal. Leave the price blank if none has
                been agreed; an existing agreed price stays in effect unless you enter a new one.
              </p>
              <div className="flex flex-wrap gap-2">
                <Button type="submit" disabled={sending || !changeReason.trim()}>
                  {sending ? "Sending proposal…" : "Send change proposal"}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  disabled={sending}
                  onClick={() => setShowChangeForm(false)}
                >
                  Cancel
                </Button>
              </div>
            </form>
          ) : null}
        </section>
      ) : null}
      {conversation.status === "OPEN" ? (
        <IndependentReviewPanel conversation={conversation} currentUserId={currentUserId} />
      ) : null}
      {error && conversation.status !== "OPEN" ? (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      ) : null}
    </section>
  );
}

function lines(value: string): string[] {
  return value
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
}

function formatRequirements(
  requirements: TaskConversationDto["contractSnapshot"]["requirements"],
): string {
  return requirements
    .map((requirement) => `${requirement.key} | ${requirement.statement}`)
    .join("\n");
}

function parseRequirements(
  value: string,
  current: TaskConversationDto["contractSnapshot"]["requirements"],
) {
  const currentByKey = new Map(current.map((requirement) => [requirement.key, requirement]));
  return value
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const separator = line.indexOf("|");
      if (separator <= 0 || separator === line.length - 1) {
        throw new Error("Write each requirement as: key | requirement description.");
      }
      const key = line.slice(0, separator).trim();
      const statement = line.slice(separator + 1).trim();
      return {
        key,
        statement,
        acceptanceRelevant: currentByKey.get(key)?.acceptanceRelevant ?? true,
      };
    });
}

function changeRequestStatus(status: ContractChangeRequestDto["status"]): string {
  switch (status) {
    case "PROPOSED":
      return "Awaiting response";
    case "ACCEPTED_PENDING_ACTIVATION":
      return "Agreed — activation pending";
    case "ACTIVATING":
      return "PayPal adjustment in progress";
    case "ACTIVATION_FAILED":
      return "Activation failed";
    case "ACTIVATION_RECONCILIATION_REQUIRED":
      return "Payment reconciliation required";
    case "CANCELLATION_PENDING":
      return "Cancellation awaiting confirmation";
    case "DECLINED":
      return "Declined";
    case "WITHDRAWN":
      return "Withdrawn";
    case "CANCELLED":
      return "Agreed change cancelled";
    case "ACTIVATED":
      return "Active";
  }
}
