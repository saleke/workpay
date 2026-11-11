"use client";

import { FormEvent, useEffect, useRef, useState } from "react";
import {
  AudioLines,
  FileAudio2,
  FileText,
  Mic,
  Paperclip,
  SendHorizontal,
  Sparkles,
  Square,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { IndependentReviewPanel } from "@/components/task-room/independent-review-panel";
import {
  activateContractChange,
  decideContractChange,
  getTaskConversationMessages,
  listContractChangeRequests,
  proposeContractChange,
  rewriteConversationDraft,
  sendTaskConversationMessage,
  simplifyConversationMessage,
} from "@/lib/api/endpoints";
import type { ConversationMessageExplanation } from "@/lib/api/endpoints";
import type { ContractChangeRequestDto, TaskConversationDto } from "@/lib/api/types";
import { parseMoneyInput } from "@workpay/shared/money";
import { formatMinorMoney } from "@/lib/format";
import { cn } from "@/lib/utils";
import {
  conversationAttachmentKind,
  formatFileSize,
  MAX_CONVERSATION_ATTACHMENT_BYTES,
  MAX_CONVERSATION_ATTACHMENTS,
  MAX_CONVERSATION_UPLOAD_BYTES,
  MAX_VOICE_NOTE_SECONDS,
} from "@/lib/conversation-attachments";

function clientMessageId(): string {
  return crypto.randomUUID();
}

type ConversationMessage = TaskConversationDto["messages"][number];

function mergeMessages(
  current: ConversationMessage[],
  incoming: ConversationMessage[],
): ConversationMessage[] {
  const byId = new Map(current.map((message) => [message.id, message]));
  for (const message of incoming) byId.set(message.id, message);
  return [...byId.values()].sort((left, right) => left.sequence - right.sequence);
}

function messageFingerprint(body: string, attachments: File[]): string {
  return JSON.stringify([
    body,
    attachments.map((file) => [file.name, file.type, file.size, file.lastModified]),
  ]);
}

export function ConversationThread({
  conversation,
  currentUserId,
  onAgreementChanged,
  inboxMode = false,
  onViewed,
  hideMessages = false,
}: {
  conversation: TaskConversationDto;
  currentUserId: string;
  onAgreementChanged?: () => void;
  inboxMode?: boolean;
  onViewed?: (lastReadSequence: number) => void;
  hideMessages?: boolean;
}) {
  const [messages, setMessages] = useState(conversation.messages);
  const [hasOlderMessages, setHasOlderMessages] = useState(conversation.hasMoreMessages ?? false);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [draft, setDraft] = useState("");
  const [draftRestored, setDraftRestored] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [rewritingDraft, setRewritingDraft] = useState(false);
  const [draftAssistMessage, setDraftAssistMessage] = useState<string | null>(null);
  const [explainingMessageId, setExplainingMessageId] = useState<string | null>(null);
  const [messageExplanations, setMessageExplanations] = useState<
    Record<string, ConversationMessageExplanation>
  >({});
  const [visibleExplanationIds, setVisibleExplanationIds] = useState<Set<string>>(new Set());
  const [attachments, setAttachments] = useState<File[]>([]);
  const [rejectedFiles, setRejectedFiles] = useState<string[]>([]);
  const [recordedVoice, setRecordedVoice] = useState<File | null>(null);
  const [recordingVoice, setRecordingVoice] = useState(false);
  const [openingMicrophone, setOpeningMicrophone] = useState(false);
  const [recordingSeconds, setRecordingSeconds] = useState(0);
  const [recordedVoiceUrl, setRecordedVoiceUrl] = useState<string | null>(null);
  const [attachmentError, setAttachmentError] = useState<string | null>(null);
  const [dragActive, setDragActive] = useState(false);
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
  const messageListRef = useRef<HTMLOListElement>(null);
  const scrollAnchorRef = useRef<{ height: number; top: number } | null>(null);
  const attachmentInputRef = useRef<HTMLInputElement>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const recordingChunksRef = useRef<Blob[]>([]);
  const recordingStartedAtRef = useRef(0);
  const recordingRequestRef = useRef(0);
  const pendingMessageRef = useRef<{ id: string; fingerprint: string } | null>(null);
  const draftRef = useRef(draft);
  const sendingRef = useRef(sending);
  const lastSequenceRef = useRef(messages.at(-1)?.sequence ?? 0);
  const queuedAttachments = [...attachments, ...(recordedVoice ? [recordedVoice] : [])];

  const draftStorageKey = `workpay:conversation-draft:${conversation.id}`;

  useEffect(() => {
    try {
      const savedDraft = window.localStorage.getItem(draftStorageKey);
      if (savedDraft && !draft.trim()) {
        setDraft(savedDraft);
        setDraftRestored(true);
        window.setTimeout(() => setDraftRestored(false), 2200);
      }
    } catch {
      // Ignore localStorage failures silently.
    }
    // Reset saved draft when the thread changes to avoid cross-thread leakage.
    return () => {
      setDraftRestored(false);
    };
  }, [conversation.id, draftStorageKey]);

  useEffect(() => {
    if (!conversation.id) return;
    try {
      if (draft.trim()) {
        window.localStorage.setItem(draftStorageKey, draft);
      } else {
        window.localStorage.removeItem(draftStorageKey);
      }
    } catch {
      // Ignore localStorage failures silently.
    }
  }, [conversation.id, draft, draftStorageKey]);

  useEffect(() => {
    draftRef.current = draft;
  }, [draft]);

  useEffect(() => {
    sendingRef.current = sending;
  }, [sending]);

  useEffect(() => {
    setMessages(conversation.messages);
    setHasOlderMessages(conversation.hasMoreMessages ?? false);
    lastSequenceRef.current = conversation.messages.at(-1)?.sequence ?? 0;
  }, [conversation.messages, conversation.id]);

  useEffect(() => {
    setAttachments([]);
    setRecordedVoice(null);
    setRecordingSeconds(0);
    setAttachmentError(null);
    setDraftAssistMessage(null);
    setMessageExplanations({});
    setVisibleExplanationIds(new Set());
    setDragActive(false);
    pendingMessageRef.current = null;
  }, [conversation.id]);

  useEffect(() => {
    if (!recordedVoice) {
      setRecordedVoiceUrl(null);
      return;
    }
    const url = URL.createObjectURL(recordedVoice);
    setRecordedVoiceUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [recordedVoice]);

  useEffect(() => {
    if (!recordingVoice) return;
    const timer = window.setInterval(() => {
      const elapsed = Math.floor((Date.now() - recordingStartedAtRef.current) / 1000);
      setRecordingSeconds(elapsed);
      if (elapsed >= MAX_VOICE_NOTE_SECONDS) {
        mediaRecorderRef.current?.stop();
      }
    }, 250);
    return () => window.clearInterval(timer);
  }, [recordingVoice]);

  useEffect(
    () => () => {
      recordingRequestRef.current += 1;
      if (mediaRecorderRef.current?.state === "recording") mediaRecorderRef.current.stop();
      mediaStreamRef.current?.getTracks().forEach((track) => track.stop());
      mediaRecorderRef.current = null;
      mediaStreamRef.current = null;
    },
    [conversation.id],
  );

  useEffect(() => {
    const list = messageListRef.current;
    if (!list) return;
    const anchor = scrollAnchorRef.current;
    if (anchor) {
      list.scrollTop = anchor.top + list.scrollHeight - anchor.height;
      scrollAnchorRef.current = null;
    } else {
      list.scrollTop = list.scrollHeight;
    }
  }, [messages]);

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
    if (conversation.status !== "OPEN" || hideMessages) return;
    const timer = window.setInterval(() => {
      const lastSequence = lastSequenceRef.current;
      void getTaskConversationMessages(conversation.id, lastSequence).then((response) => {
        if (response.error) {
          setError(response.error.message);
          return;
        }
        if (response.data?.messages.length) {
          const list = messageListRef.current;
          if (list && list.scrollHeight - list.scrollTop - list.clientHeight > 80) {
            scrollAnchorRef.current = { height: list.scrollHeight, top: list.scrollTop };
          }
          setMessages((current) => mergeMessages(current, response.data!.messages));
          const newestSequence = response.data.messages.at(-1)?.sequence;
          if (newestSequence !== undefined) {
            lastSequenceRef.current = newestSequence;
            onViewed?.(newestSequence);
          }
        }
      });
    }, 5_000);
    return () => window.clearInterval(timer);
  }, [conversation.id, conversation.status, hideMessages, onViewed]);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (
      (!draft.trim() && queuedAttachments.length === 0) ||
      sending ||
      openingMicrophone ||
      recordingVoice
    )
      return;
    const body =
      draft.trim() ||
      (recordedVoice
        ? attachments.length > 0
          ? "Voice note and files"
          : "Voice note"
        : `Shared ${attachments.length} ${attachments.length === 1 ? "file" : "files"}`);
    const fingerprint = messageFingerprint(body, queuedAttachments);
    if (pendingMessageRef.current?.fingerprint !== fingerprint) {
      pendingMessageRef.current = { id: clientMessageId(), fingerprint };
    }
    setSending(true);
    sendingRef.current = true;
    setError(null);
    const result = await sendTaskConversationMessage(conversation.id, {
      clientMessageId: pendingMessageRef.current.id,
      body,
      attachments: queuedAttachments,
    });
    setSending(false);
    sendingRef.current = false;
    if (result.error || !result.data) {
      setError(result.error?.message ?? "Your message could not be sent.");
      return;
    }
    pendingMessageRef.current = null;
    setMessages((current) => mergeMessages(current, [result.data!]));
    setDraft("");
    setAttachments([]);
    setRecordedVoice(null);
    setAttachmentError(null);
    onViewed?.(result.data.sequence);
  };

  const addFiles = (selectedFiles: File[]) => {
    if (sending || recordingVoice || openingMicrophone) {
      setAttachmentError("Finish the current send or recording before adding files.");
      return;
    }
    const validFiles: File[] = [];
    const rejected: string[] = [];

    for (const file of selectedFiles) {
      if (file.size === 0) {
        rejected.push(`${file.name} is empty.`);
        continue;
      }
      if (file.size > MAX_CONVERSATION_ATTACHMENT_BYTES) {
        rejected.push(`${file.name} is larger than 10 MB.`);
        continue;
      }
      if (!conversationAttachmentKind(file.type)) {
        rejected.push(`${file.name} has an unsupported format.`);
        continue;
      }
      validFiles.push(file);
    }

    const combined = [...attachments, ...validFiles];
    const allAttachments = [...combined, ...(recordedVoice ? [recordedVoice] : [])];

    if (allAttachments.length > MAX_CONVERSATION_ATTACHMENTS) {
      const overflowCount = allAttachments.length - MAX_CONVERSATION_ATTACHMENTS;
      setAttachmentError(
        `You can attach up to ${MAX_CONVERSATION_ATTACHMENTS} files at once. ${overflowCount} file${overflowCount === 1 ? "" : "s"} were not added.`,
      );
      setRejectedFiles(rejected);
      return;
    }

    if (
      allAttachments.reduce((total, file) => total + file.size, 0) > MAX_CONVERSATION_UPLOAD_BYTES
    ) {
      setAttachmentError("Attachments must total no more than 15 MB. Some files were not added.");
      setRejectedFiles(rejected);
      return;
    }

    setAttachments(combined);
    setRejectedFiles(rejected);
    if (rejected.length > 0) {
      setAttachmentError(
        rejected.length === 1
          ? `${rejected[0]} Please choose a supported file type or a smaller file.`
          : `Some files were skipped: ${rejected.slice(0, 2).join(" ")}${rejected.length > 2 ? " …" : ""}`,
      );
      return;
    }
    setAttachmentError(null);
  };

  const rewriteDraft = async () => {
    if (!draft.trim() || rewritingDraft) return;
    const draftAtRequest = draft;
    setRewritingDraft(true);
    setDraftAssistMessage(null);
    const result = await rewriteConversationDraft(conversation.id, draft.trim());
    setRewritingDraft(false);
    if (result.error || !result.data?.message) {
      setDraftAssistMessage(result.error?.message ?? "This draft could not be improved.");
      return;
    }
    if (draftRef.current !== draftAtRequest) {
      setDraftAssistMessage("Your draft changed while it was being polished. Run Polish again.");
      return;
    }
    setDraft(result.data.message);
    setDraftAssistMessage("Draft improved. Review it before sending.");
  };

  const explainMessage = async (messageId: string) => {
    if (explainingMessageId) return;
    if (messageExplanations[messageId]) {
      setVisibleExplanationIds((current) => {
        const next = new Set(current);
        if (next.has(messageId)) next.delete(messageId);
        else next.add(messageId);
        return next;
      });
      return;
    }
    setExplainingMessageId(messageId);
    setError(null);
    const result = await simplifyConversationMessage(conversation.id, messageId);
    setExplainingMessageId(null);
    if (result.error || !result.data) {
      setError(result.error?.message ?? "This message could not be explained.");
      return;
    }
    setMessageExplanations((current) => ({ ...current, [messageId]: result.data! }));
    setVisibleExplanationIds((current) => new Set(current).add(messageId));
  };

  const startVoiceRecording = async () => {
    if (
      sendingRef.current ||
      openingMicrophone ||
      recordingVoice ||
      mediaRecorderRef.current?.state === "recording"
    ) {
      return;
    }
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") {
      setAttachmentError(
        "Voice recording is not supported in this browser. You can still attach a file instead.",
      );
      return;
    }
    const requestId = ++recordingRequestRef.current;
    setOpeningMicrophone(true);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      if (recordingRequestRef.current !== requestId || sendingRef.current) {
        stream.getTracks().forEach((track) => track.stop());
        return;
      }
      mediaStreamRef.current = stream;
      const supportedTypes = [
        "audio/webm;codecs=opus",
        "audio/webm",
        "audio/mp4",
        "audio/ogg;codecs=opus",
      ];
      const mimeType = supportedTypes.find((type) => MediaRecorder.isTypeSupported(type));
      const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
      mediaRecorderRef.current = recorder;
      recordingChunksRef.current = [];
      recordingStartedAtRef.current = Date.now();
      setRecordingSeconds(0);
      setAttachmentError(null);
      recorder.ondataavailable = (event) => {
        if (recordingRequestRef.current !== requestId) return;
        if (event.data.size > 0) recordingChunksRef.current.push(event.data);
      };
      recorder.onerror = () => {
        if (recordingRequestRef.current !== requestId) return;
        setAttachmentError("The voice note could not be recorded. Please try again.");
        setRecordingVoice(false);
        mediaStreamRef.current?.getTracks().forEach((track) => track.stop());
        mediaStreamRef.current = null;
        mediaRecorderRef.current = null;
      };
      recorder.onstop = () => {
        stream.getTracks().forEach((track) => track.stop());
        if (recordingRequestRef.current !== requestId) return;
        const type = recorder.mimeType || mimeType?.split(";")[0] || "audio/webm";
        const blob = new Blob(recordingChunksRef.current, { type });
        if (blob.size > 0) {
          const extension = type.includes("mp4") ? "m4a" : type.includes("ogg") ? "ogg" : "webm";
          const voiceFile = new File([blob], `voice-note-${Date.now()}.${extension}`, { type });
          const allAttachments = [...attachments, voiceFile];
          if (voiceFile.size > MAX_CONVERSATION_ATTACHMENT_BYTES) {
            setAttachmentError(
              "This voice note is larger than 10 MB. Try recording a shorter note.",
            );
          } else if (allAttachments.length > MAX_CONVERSATION_ATTACHMENTS) {
            setAttachmentError(
              `Remove an attachment before adding a voice note. You can send up to ${MAX_CONVERSATION_ATTACHMENTS} at once.`,
            );
          } else if (
            allAttachments.reduce((total, file) => total + file.size, 0) >
            MAX_CONVERSATION_UPLOAD_BYTES
          ) {
            setAttachmentError("Attachments must total no more than 15 MB.");
          } else {
            setRecordedVoice(voiceFile);
          }
        } else {
          setAttachmentError("The recording was empty. Please record your note again.");
        }
        setRecordingVoice(false);
        mediaStreamRef.current = null;
        mediaRecorderRef.current = null;
      };
      recorder.start(500);
      setRecordingVoice(true);
    } catch (recordingError) {
      if (recordingRequestRef.current !== requestId) return;
      setAttachmentError(
        recordingError instanceof Error && recordingError.name === "NotAllowedError"
          ? "Microphone access was blocked. Allow access to record a voice note, or attach a file instead."
          : "The microphone could not be opened. Check your device and try again, or attach a file instead.",
      );
      mediaStreamRef.current?.getTracks().forEach((track) => track.stop());
      mediaStreamRef.current = null;
      mediaRecorderRef.current = null;
    } finally {
      if (recordingRequestRef.current === requestId) setOpeningMicrophone(false);
    }
  };

  const stopVoiceRecording = () => {
    if (mediaRecorderRef.current?.state === "recording") mediaRecorderRef.current.stop();
  };

  const loadEarlierMessages = async () => {
    const firstSequence = messages[0]?.sequence;
    const list = messageListRef.current;
    if (!firstSequence || !list || loadingOlder) return;
    scrollAnchorRef.current = { height: list.scrollHeight, top: list.scrollTop };
    setLoadingOlder(true);
    const result = await getTaskConversationMessages(conversation.id, undefined, firstSequence);
    setLoadingOlder(false);
    if (result.error || !result.data) {
      scrollAnchorRef.current = null;
      setError(result.error?.message ?? "Earlier messages could not be loaded.");
      return;
    }
    setHasOlderMessages(result.data.hasMoreMessages ?? false);
    setMessages((current) => mergeMessages(current, result.data!.messages));
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
    <section
      aria-label="Private task conversation"
      className={inboxMode ? "flex min-h-0 flex-col gap-3" : "space-y-4"}
    >
      {inboxMode && hasOlderMessages ? (
        <Button
          type="button"
          variant="outline"
          className="self-center"
          disabled={loadingOlder}
          onClick={() => void loadEarlierMessages()}
        >
          {loadingOlder ? "Loading earlier messages…" : "Load earlier messages"}
        </Button>
      ) : null}
      {!inboxMode && !hideMessages && conversation.status === "CONTACT_PENDING" ? (
        <p
          className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900"
          role="status"
        >
          Contact request sent. Messaging opens after the professional accepts.
        </p>
      ) : null}
      {!inboxMode &&
      !hideMessages &&
      conversation.status === "OPEN" &&
      conversation.hasWorkExecution ? (
        <p
          className="rounded-lg border border-blue-200 bg-blue-50 p-3 text-sm text-blue-900"
          role="status"
        >
          A work assignment exists. Open Work Studio for its current start, delivery, and review
          gates.
        </p>
      ) : null}
      {!inboxMode &&
      !hideMessages &&
      conversation.status === "OPEN" &&
      !conversation.hasWorkExecution ? (
        <p
          className="rounded-lg border border-sky-200 bg-sky-50 p-3 text-sm text-sky-900"
          role="status"
        >
          Messages alone are non-binding. Use Work context to send exact terms, record the
          professional's acceptance, and let the client make the final selection before payment.
        </p>
      ) : null}
      {!inboxMode && !hideMessages && conversation.status === "DECLINED" ? (
        <p className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-950">
          The professional declined this contact request. The approved scope remains unchanged; you
          can review other profiles below.
        </p>
      ) : null}
      {!inboxMode && !hideMessages && conversation.status === "WITHDRAWN" ? (
        <p className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-950">
          The professional withdrew before a work assignment was created. No work commitment was
          made; you can review other profiles below.
        </p>
      ) : null}
      {!inboxMode && !hideMessages && conversation.status === "CLOSED" ? (
        <p className="rounded-lg border border-border bg-muted p-3 text-sm text-muted-foreground">
          This conversation is closed. Its messages remain available for your records.
        </p>
      ) : null}
      {!hideMessages ? (
        <ol
          ref={messageListRef}
          className={`space-y-3 overflow-y-auto rounded-lg border border-border p-3 ${
            inboxMode ? "min-h-64 flex-1 bg-[var(--wp-surface-subtle)]" : "max-h-96"
          }`}
          aria-live="polite"
        >
          {messages.map((message) => {
            const mine = message.authorUserId === currentUserId;
            const canExplain =
              currentUserId === conversation.buyerUserId &&
              message.authorUserId === conversation.providerUserId;
            const cachedExplanation = messageExplanations[message.id];
            const explanation = visibleExplanationIds.has(message.id)
              ? cachedExplanation
              : undefined;
            return (
              <li
                key={message.id}
                className={`max-w-[92%] rounded-2xl p-3.5 text-sm shadow-xs ${
                  mine
                    ? "ml-auto rounded-br-md bg-primary text-primary-foreground"
                    : "rounded-bl-md border border-[var(--wp-border)] bg-white text-foreground"
                }`}
              >
                <p className="whitespace-pre-wrap break-words leading-6">{message.body}</p>
                {message.attachments?.map((attachment) => {
                  const attachmentUrl = `/api/v1/conversations/${encodeURIComponent(
                    conversation.id,
                  )}/attachments/${encodeURIComponent(attachment.id)}`;
                  return attachment.kind === "AUDIO" ? (
                    <div
                      key={attachment.id}
                      className="mt-2 max-w-full rounded-xl bg-background/90 p-2.5 text-foreground"
                    >
                      <p className="mb-1.5 flex items-center gap-1.5 text-xs font-medium">
                        <FileAudio2 className="h-4 w-4" aria-hidden="true" />
                        Voice note · {formatFileSize(attachment.sizeBytes)}
                      </p>
                      <audio
                        controls
                        preload="metadata"
                        src={attachmentUrl}
                        aria-label={`Voice note from ${mine ? "you" : "the other participant"}`}
                        className="max-w-full"
                      />
                    </div>
                  ) : (
                    <a
                      key={attachment.id}
                      href={attachmentUrl}
                      download={attachment.filename}
                      className="mt-2 flex min-w-0 items-center gap-2 rounded-xl border border-current/15 bg-background/90 px-3 py-2.5 text-foreground hover:bg-background focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
                    >
                      <FileText className="h-4 w-4 shrink-0" aria-hidden="true" />
                      <span className="min-w-0 flex-1 truncate text-sm font-medium">
                        {attachment.filename}
                      </span>
                      <span className="shrink-0 text-xs opacity-70">
                        {formatFileSize(attachment.sizeBytes)}
                      </span>
                    </a>
                  );
                })}
                <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
                  <time className="text-[10px] opacity-65" dateTime={message.createdAt}>
                    {new Date(message.createdAt).toLocaleString()}
                  </time>
                  {canExplain ? (
                    <button
                      type="button"
                      title="Use AI to create a separate plain-language view"
                      disabled={Boolean(explainingMessageId)}
                      onClick={() => void explainMessage(message.id)}
                      className="inline-flex min-h-8 items-center gap-1.5 rounded-full border border-violet-200 bg-violet-50 px-2.5 text-[11px] font-semibold text-violet-800 transition hover:bg-violet-100 disabled:opacity-60"
                    >
                      {explainingMessageId === message.id ? (
                        <Sparkles className="h-3.5 w-3.5 animate-pulse" />
                      ) : (
                        <AudioLines className="h-3.5 w-3.5" />
                      )}
                      {explanation ? "Hide explanation" : "Explain simply"}
                    </button>
                  ) : null}
                </div>
                {explanation ? (
                  <aside className="mt-3 space-y-3 rounded-xl border border-violet-200 bg-violet-50 p-3 text-violet-950">
                    <div>
                      <p className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-[0.12em] text-violet-700">
                        <Sparkles className="h-3.5 w-3.5" /> AI plain-language view
                      </p>
                      <p className="mt-1.5 text-sm leading-6">{explanation.summary}</p>
                      <p className="mt-1 text-[10px] text-violet-700">
                        The original message above remains authoritative.
                      </p>
                    </div>
                    {explanation.terms.length > 0 ? (
                      <dl className="space-y-2 border-t border-violet-200 pt-2 text-xs">
                        {explanation.terms.map((term) => (
                          <div key={`${term.term}:${term.meaning}`}>
                            <dt className="font-semibold">{term.term}</dt>
                            <dd className="mt-0.5 leading-5 text-violet-900">{term.meaning}</dd>
                          </div>
                        ))}
                      </dl>
                    ) : null}
                    {explanation.suggestedQuestions.length > 0 ? (
                      <div className="border-t border-violet-200 pt-2">
                        <p className="text-[11px] font-semibold">Useful follow-up questions</p>
                        <ul className="mt-1.5 list-disc space-y-1 pl-4 text-xs leading-5 text-violet-900">
                          {explanation.suggestedQuestions.map((question) => (
                            <li key={question}>{question}</li>
                          ))}
                        </ul>
                      </div>
                    ) : null}
                  </aside>
                ) : null}
              </li>
            );
          })}
          {messages.length === 0 ? (
            <li className="text-sm text-muted-foreground">No messages yet.</li>
          ) : null}
        </ol>
      ) : null}
      {!hideMessages && conversation.status === "OPEN" ? (
        <form
          onSubmit={submit}
          onDragEnter={(event) => {
            event.preventDefault();
            if (sending || recordingVoice || openingMicrophone) return;
            setDragActive(true);
          }}
          onDragOver={(event) => event.preventDefault()}
          onDragLeave={(event) => {
            event.preventDefault();
            if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
              setDragActive(false);
            }
          }}
          onDrop={(event) => {
            event.preventDefault();
            setDragActive(false);
            if (sending || recordingVoice || openingMicrophone) return;
            addFiles(Array.from(event.dataTransfer.files));
          }}
          className={cn(
            "relative overflow-hidden rounded-2xl border bg-white shadow-[0_18px_45px_-35px_rgba(15,23,42,0.65)] transition",
            dragActive
              ? "border-[var(--wp-accent)] ring-4 ring-[var(--wp-accent)]/10"
              : "border-[var(--wp-border-strong)]",
          )}
        >
          {dragActive ? (
            <div className="pointer-events-none absolute inset-0 z-20 grid place-items-center bg-white/92 backdrop-blur-sm">
              <div className="rounded-2xl border border-dashed border-[var(--wp-accent)] bg-[var(--wp-accent-subtle)] px-6 py-5 text-center text-sm font-semibold text-[var(--wp-accent)]">
                <Paperclip className="mx-auto mb-2 h-5 w-5" /> Drop files to attach
              </div>
            </div>
          ) : null}

          <div className="space-y-3 p-3.5 sm:p-4">
            <div className="flex items-center justify-between gap-3">
              <label
                htmlFor={`message-${conversation.id}`}
                className="text-xs font-semibold text-[var(--wp-text-secondary)]"
              >
                Message{" "}
                {currentUserId === conversation.buyerUserId
                  ? (conversation.providerDisplayName ?? "professional")
                  : "client"}
              </label>
              <span className="text-[10px] tabular-nums text-[var(--wp-text-muted)]">
                {draft.length.toLocaleString()} / 10,000
              </span>
            </div>
            <textarea
              id={`message-${conversation.id}`}
              value={draft}
              onChange={(event) => {
                setDraft(event.target.value);
                setDraftAssistMessage(null);
              }}
              maxLength={10_000}
              rows={3}
              disabled={sending}
              className="min-h-24 w-full resize-y border-0 bg-transparent px-0 py-1 text-sm leading-6 text-[var(--wp-text-primary)] outline-none placeholder:text-[var(--wp-text-muted)]"
              placeholder="Write naturally. You can polish the draft before sending."
            />

            {draftRestored ? (
              <p className="text-xs text-[var(--wp-accent)]">
                Draft restored for this conversation.
              </p>
            ) : null}
            {draftAssistMessage ? (
              <p
                className={cn(
                  "text-xs",
                  draftAssistMessage.startsWith("Draft improved")
                    ? "text-emerald-700"
                    : "text-rose-700",
                )}
              >
                {draftAssistMessage}
              </p>
            ) : null}
            {currentUserId === conversation.buyerUserId ? (
              <p className="flex items-center gap-1.5 text-[10px] leading-4 text-[var(--wp-text-muted)]">
                <Sparkles className="h-3 w-3 shrink-0" /> AI tools send the selected text, this
                task’s title and summary, and the professional’s display name to the configured AI
                provider. Review every result; nothing is sent to the other person until you press
                Send.
              </p>
            ) : null}

            {attachments.length > 0 ? (
              <ul className="grid gap-2 sm:grid-cols-2" aria-label="Files ready to send">
                {attachments.map((file, index) => (
                  <li
                    key={`${file.name}-${file.size}-${index}`}
                    className="flex min-w-0 items-center gap-2 rounded-xl border border-[var(--wp-border)] bg-[var(--wp-surface-subtle)] px-3 py-2"
                  >
                    <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-white text-[var(--wp-accent)]">
                      <FileText className="h-4 w-4" aria-hidden="true" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-xs font-semibold">{file.name}</span>
                      <span className="text-[10px] text-[var(--wp-text-secondary)]">
                        {formatFileSize(file.size)}
                      </span>
                    </span>
                    <button
                      type="button"
                      className="grid h-8 w-8 shrink-0 place-items-center rounded-full text-[var(--wp-text-secondary)] hover:bg-white hover:text-rose-600"
                      aria-label={`Remove ${file.name}`}
                      onClick={() =>
                        setAttachments((current) =>
                          current.filter((_, fileIndex) => fileIndex !== index),
                        )
                      }
                      disabled={sending || recordingVoice}
                    >
                      <X className="h-3.5 w-3.5" aria-hidden="true" />
                    </button>
                  </li>
                ))}
              </ul>
            ) : null}

            {recordedVoice && recordedVoiceUrl ? (
              <div className="rounded-xl border border-violet-200 bg-violet-50 p-3">
                <div className="mb-2 flex items-center justify-between gap-2">
                  <p className="flex items-center gap-2 text-xs font-semibold text-violet-950">
                    <AudioLines className="h-4 w-4" /> Voice note ·{" "}
                    {formatDuration(recordingSeconds)} · {formatFileSize(recordedVoice.size)}
                  </p>
                  <button
                    type="button"
                    className="grid h-8 w-8 place-items-center rounded-full text-violet-700 hover:bg-white hover:text-rose-600"
                    onClick={() => {
                      setRecordedVoice(null);
                      setRecordingSeconds(0);
                    }}
                    disabled={sending}
                    aria-label="Remove voice note"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
                <audio
                  controls
                  preload="metadata"
                  src={recordedVoiceUrl}
                  aria-label="Preview your voice note"
                  className="h-9 w-full"
                />
              </div>
            ) : null}

            {recordingVoice ? (
              <div className="flex items-center justify-between gap-3 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2.5 text-rose-950">
                <span className="flex items-center gap-2 text-xs font-semibold">
                  <span className="h-2.5 w-2.5 animate-pulse rounded-full bg-rose-600" />
                  Recording {formatDuration(recordingSeconds)} / 2:00
                </span>
                <button
                  type="button"
                  onClick={stopVoiceRecording}
                  className="inline-flex min-h-8 items-center gap-1.5 rounded-full bg-rose-700 px-3 text-xs font-semibold text-white"
                >
                  <Square className="h-3 w-3 fill-current" /> Stop
                </button>
              </div>
            ) : null}

            {attachmentError ? (
              <div className="space-y-1" role="alert">
                <p className="text-xs text-destructive">{attachmentError}</p>
                {rejectedFiles.length > 0 ? (
                  <ul className="list-disc pl-5 text-[11px] text-muted-foreground">
                    {rejectedFiles.slice(0, 3).map((reason) => (
                      <li key={reason}>{reason}</li>
                    ))}
                  </ul>
                ) : null}
              </div>
            ) : null}
            {error ? (
              <p className="text-xs text-destructive" role="alert">
                {error}
              </p>
            ) : null}
          </div>

          <input
            ref={attachmentInputRef}
            type="file"
            accept=".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.csv,.txt,.rtf,.odt,.jpg,.jpeg,.png,.webp,.gif,.bmp,.mp3,.wav,.m4a,.ogg,.webm,audio/*,image/*,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-powerpoint,application/vnd.openxmlformats-officedocument.presentationml.presentation,text/csv,text/plain,text/rtf"
            multiple
            className="sr-only"
            aria-label="Choose files to attach"
            onChange={(event) => {
              addFiles(Array.from(event.currentTarget.files ?? []));
              event.currentTarget.value = "";
            }}
          />
          <div className="flex items-center justify-between gap-3 border-t border-[var(--wp-border)] bg-[var(--wp-surface-subtle)]/70 px-3 py-2.5">
            <div className="flex min-w-0 items-center gap-1.5">
              <button
                type="button"
                title="Attach files"
                aria-label="Attach files"
                onClick={() => attachmentInputRef.current?.click()}
                disabled={
                  sending ||
                  recordingVoice ||
                  queuedAttachments.length >= MAX_CONVERSATION_ATTACHMENTS
                }
                className="inline-flex min-h-9 items-center gap-1.5 rounded-full px-2.5 text-xs font-semibold text-[var(--wp-text-secondary)] transition hover:bg-white hover:text-[var(--wp-text-primary)] disabled:opacity-50"
              >
                <Paperclip className="h-4 w-4" aria-hidden="true" />
                <span className="hidden sm:inline">Attach</span>
              </button>
              {!recordingVoice ? (
                <button
                  type="button"
                  title="Record a voice note"
                  aria-label="Record a voice note"
                  onClick={() => void startVoiceRecording()}
                  disabled={
                    sending ||
                    openingMicrophone ||
                    Boolean(recordedVoice) ||
                    queuedAttachments.length >= MAX_CONVERSATION_ATTACHMENTS
                  }
                  className="inline-flex min-h-9 items-center gap-1.5 rounded-full px-2.5 text-xs font-semibold text-[var(--wp-text-secondary)] transition hover:bg-white hover:text-[var(--wp-text-primary)] disabled:opacity-50"
                >
                  <Mic className={cn("h-4 w-4", openingMicrophone && "animate-pulse")} />
                  <span className="hidden sm:inline">
                    {openingMicrophone ? "Opening…" : "Voice"}
                  </span>
                </button>
              ) : null}
              {currentUserId === conversation.buyerUserId ? (
                <button
                  type="button"
                  title="Improve clarity without changing your meaning"
                  onClick={() => void rewriteDraft()}
                  disabled={!draft.trim() || sending || rewritingDraft}
                  className="inline-flex min-h-9 items-center gap-1.5 rounded-full border border-violet-200 bg-violet-50 px-2.5 text-xs font-semibold text-violet-800 transition hover:bg-violet-100 disabled:opacity-50"
                >
                  <Sparkles className={cn("h-4 w-4", rewritingDraft && "animate-pulse")} />
                  <span className="hidden sm:inline">
                    {rewritingDraft ? "Polishing…" : "Polish"}
                  </span>
                </button>
              ) : null}
            </div>
            <Button
              type="submit"
              className="min-h-10 shrink-0 rounded-xl px-4 shadow-sm"
              disabled={
                (!draft.trim() && queuedAttachments.length === 0) ||
                sending ||
                recordingVoice ||
                openingMicrophone ||
                rewritingDraft
              }
            >
              {sending ? "Sending…" : "Send"}
              <SendHorizontal className="ml-2 h-4 w-4" />
            </Button>
          </div>
        </form>
      ) : null}
      {!inboxMode && conversation.status === "OPEN" && conversation.hasWorkExecution ? (
        <section className="space-y-3 border-t border-border pt-4" aria-label="Agreement changes">
          <div>
            <h3 className="font-medium">Change terms</h3>
            <p className="mt-1 text-sm text-muted-foreground">Update scope, price, or timing.</p>
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
                    Both participants agreed. Activate the change to create the new version.
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
                  Updating the agreement and payment authorization.
                </p>
              ) : null}
              {request.status === "ACTIVATION_RECONCILIATION_REQUIRED" ? (
                <p className="text-sm text-destructive" role="alert">
                  The payment result is unknown. This change remains inactive while it is
                  reconciled.
                </p>
              ) : null}
              {request.status === "ACTIVATION_FAILED" ? (
                <p className="text-sm text-destructive" role="status">
                  The payment adjustment was declined. The current terms remain active.
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
                Keep existing keys for requirements that have not changed.
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
                Leave price blank to keep the current agreed price.
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
      {!inboxMode &&
      conversation.status === "OPEN" &&
      conversation.hasWorkExecution &&
      !conversation.evaluationOnly ? (
        <IndependentReviewPanel conversation={conversation} currentUserId={currentUserId} />
      ) : null}
      {error && (hideMessages || conversation.status !== "OPEN") ? (
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

function formatDuration(seconds: number): string {
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  return `${minutes}:${String(remainingSeconds).padStart(2, "0")}`;
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
      return "Simulation adjustment in progress";
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
