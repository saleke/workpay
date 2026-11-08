"use client";

import { FormEvent, useEffect, useRef, useState } from "react";
import { FileAudio2, FileText, Mic, Paperclip, Square, X } from "lucide-react";
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
  const [attachments, setAttachments] = useState<File[]>([]);
  const [rejectedFiles, setRejectedFiles] = useState<string[]>([]);
  const [recordedVoice, setRecordedVoice] = useState<File | null>(null);
  const [recordingVoice, setRecordingVoice] = useState(false);
  const [openingMicrophone, setOpeningMicrophone] = useState(false);
  const [recordingSeconds, setRecordingSeconds] = useState(0);
  const [recordedVoiceUrl, setRecordedVoiceUrl] = useState<string | null>(null);
  const [attachmentError, setAttachmentError] = useState<string | null>(null);
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
    setMessages(conversation.messages);
    setHasOlderMessages(conversation.hasMoreMessages ?? false);
    lastSequenceRef.current = conversation.messages.at(-1)?.sequence ?? 0;
  }, [conversation.messages, conversation.id]);

  useEffect(() => {
    setAttachments([]);
    setRecordedVoice(null);
    setRecordingSeconds(0);
    setAttachmentError(null);
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
    if ((!draft.trim() && queuedAttachments.length === 0) || sending) return;
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
    setError(null);
    const result = await sendTaskConversationMessage(conversation.id, {
      clientMessageId: pendingMessageRef.current.id,
      body,
      attachments: queuedAttachments,
    });
    setSending(false);
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

  const startVoiceRecording = async () => {
    if (openingMicrophone || recordingVoice || mediaRecorderRef.current?.state === "recording") {
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
      if (recordingRequestRef.current !== requestId) {
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
      {!inboxMode && conversation.status === "CONTACT_PENDING" ? (
        <p
          className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900"
          role="status"
        >
          Contact request sent. Messaging opens after the professional accepts.
        </p>
      ) : null}
      {!inboxMode && conversation.status === "OPEN" && conversation.hasWorkExecution ? (
        <p
          className="rounded-lg border border-blue-200 bg-blue-50 p-3 text-sm text-blue-900"
          role="status"
        >
          A work assignment exists.{" "}
          {currentUserId === conversation.providerUserId
            ? "You become committed only after accepting the exact assigned contract."
            : "The professional must still explicitly accept the exact assigned contract before work starts."}
        </p>
      ) : null}
      {!inboxMode && conversation.status === "OPEN" && !conversation.hasWorkExecution ? (
        <p
          className="rounded-lg border border-sky-200 bg-sky-50 p-3 text-sm text-sky-900"
          role="status"
        >
          This is a non-binding discussion, not a work commitment. Work starts only after the buyer
          authorizes the agreed amount and the professional accepts the exact assignment.
        </p>
      ) : null}
      {!inboxMode && conversation.status === "DECLINED" ? (
        <p className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-950">
          The professional declined this contact request. The approved scope remains unchanged; you
          can review other profiles below.
        </p>
      ) : null}
      {!inboxMode && conversation.status === "WITHDRAWN" ? (
        <p className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-950">
          The professional withdrew before a work assignment was created. No work commitment was
          made; you can review other profiles below.
        </p>
      ) : null}
      {!inboxMode && conversation.status === "CLOSED" ? (
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
              {message.attachments?.map((attachment) => {
                const attachmentUrl = `/api/v1/conversations/${encodeURIComponent(
                  conversation.id,
                )}/attachments/${encodeURIComponent(attachment.id)}`;
                return attachment.kind === "AUDIO" ? (
                  <div
                    key={attachment.id}
                    className="mt-2 max-w-full rounded-lg bg-background/80 p-2 text-foreground"
                  >
                    <p className="mb-1 flex items-center gap-1.5 text-xs font-medium">
                      <FileAudio2 className="h-4 w-4" aria-hidden="true" />
                      Voice note · {formatFileSize(attachment.sizeBytes)}
                    </p>
                    <audio
                      controls
                      preload="metadata"
                      src={attachmentUrl}
                      aria-label={`Voice note from ${
                        message.authorUserId === currentUserId ? "you" : "the other participant"
                      }`}
                      className="max-w-full"
                    />
                  </div>
                ) : (
                  <a
                    key={attachment.id}
                    href={attachmentUrl}
                    download={attachment.filename}
                    className="mt-2 flex min-w-0 items-center gap-2 rounded-lg border border-current/15 bg-background/80 px-3 py-2 text-foreground hover:bg-background focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
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
              <time className="mt-1 block text-xs opacity-70" dateTime={message.createdAt}>
                {new Date(message.createdAt).toLocaleString()}
              </time>
            </li>
          ))}
          {messages.length === 0 ? (
            <li className="text-sm text-muted-foreground">No messages yet.</li>
          ) : null}
        </ol>
      ) : null}
      {!hideMessages && conversation.status === "OPEN" ? (
        <form
          onSubmit={submit}
          className="space-y-3 rounded-xl border border-border bg-background p-3 sm:p-4"
        >
          <label htmlFor={`message-${conversation.id}`} className="text-sm font-medium">
            Write a message
          </label>
          <textarea
            id={`message-${conversation.id}`}
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            maxLength={10_000}
            rows={3}
            disabled={sending}
            className="min-h-24 w-full resize-y rounded-lg border border-input bg-background px-3 py-2.5 text-sm leading-relaxed focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            placeholder="Write a message, attach a file, or record a voice note."
          />

          <div className="flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground">
            <span className="rounded-full border border-border bg-muted/40 px-2 py-1">
              Question
            </span>
            <span className="rounded-full border border-border bg-muted/40 px-2 py-1">
              Evidence
            </span>
            <span className="rounded-full border border-border bg-muted/40 px-2 py-1">
              Approval
            </span>
          </div>

          {draftRestored ? (
            <p className="text-xs text-[var(--wp-accent)]">
              Draft restored from your previous message.
            </p>
          ) : null}

          {attachments.length > 0 ? (
            <ul className="space-y-2" aria-label="Files ready to send">
              {attachments.map((file, index) => (
                <li
                  key={`${file.name}-${file.size}-${index}`}
                  className="flex min-w-0 items-center gap-2 rounded-lg border border-border bg-muted/40 px-3 py-2"
                >
                  <Paperclip
                    className="h-4 w-4 shrink-0 text-muted-foreground"
                    aria-hidden="true"
                  />
                  <span className="min-w-0 flex-1 truncate text-sm font-medium">{file.name}</span>
                  <span className="shrink-0 text-xs text-muted-foreground">
                    {formatFileSize(file.size)}
                  </span>
                  <button
                    type="button"
                    className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
                    aria-label={`Remove ${file.name}`}
                    onClick={() =>
                      setAttachments((current) =>
                        current.filter((_, fileIndex) => fileIndex !== index),
                      )
                    }
                    disabled={sending || recordingVoice}
                  >
                    <X className="h-4 w-4" aria-hidden="true" />
                  </button>
                </li>
              ))}
            </ul>
          ) : null}

          {recordedVoice && recordedVoiceUrl ? (
            <div className="space-y-2 rounded-lg border border-border bg-muted/40 p-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="flex items-center gap-2 text-sm font-medium">
                  <FileAudio2 className="h-4 w-4" aria-hidden="true" />
                  Voice note · {formatDuration(recordingSeconds)} ·{" "}
                  {formatFileSize(recordedVoice.size)}
                </p>
                <button
                  type="button"
                  className="inline-flex min-h-9 items-center gap-1 rounded-md px-2 text-sm text-muted-foreground hover:bg-background hover:text-foreground focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
                  onClick={() => {
                    setRecordedVoice(null);
                    setRecordingSeconds(0);
                  }}
                  disabled={sending}
                >
                  <X className="h-4 w-4" aria-hidden="true" />
                  Remove
                </button>
              </div>
              <audio
                controls
                preload="metadata"
                src={recordedVoiceUrl}
                aria-label="Preview your voice note"
                className="w-full"
              />
            </div>
          ) : null}

          {recordingVoice ? (
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2.5 text-rose-950">
              <span className="flex items-center gap-2 text-sm font-medium">
                <span className="h-2.5 w-2.5 animate-pulse rounded-full bg-rose-600" />
                <span aria-hidden="true">
                  Recording · {formatDuration(recordingSeconds)} / 02:00
                </span>
                <span className="sr-only">Recording in progress. Maximum two minutes.</span>
              </span>
            </div>
          ) : null}

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
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                variant="outline"
                className="min-h-10"
                onClick={() => attachmentInputRef.current?.click()}
                disabled={
                  sending ||
                  recordingVoice ||
                  queuedAttachments.length >= MAX_CONVERSATION_ATTACHMENTS
                }
              >
                <Paperclip className="mr-2 h-4 w-4" aria-hidden="true" />
                Attach file
              </Button>
              {recordingVoice ? (
                <Button
                  type="button"
                  variant="outline"
                  className="min-h-10"
                  onClick={stopVoiceRecording}
                  disabled={sending}
                >
                  <Square className="mr-2 h-4 w-4 fill-current" aria-hidden="true" />
                  Stop recording
                </Button>
              ) : (
                <Button
                  type="button"
                  variant="outline"
                  className="min-h-10"
                  onClick={() => void startVoiceRecording()}
                  disabled={
                    sending ||
                    openingMicrophone ||
                    Boolean(recordedVoice) ||
                    queuedAttachments.length >= MAX_CONVERSATION_ATTACHMENTS
                  }
                >
                  <Mic className="mr-2 h-4 w-4" aria-hidden="true" />
                  {openingMicrophone ? "Opening microphone…" : "Record voice note"}
                </Button>
              )}
            </div>
            <Button
              type="submit"
              className="min-h-11 w-full sm:w-auto"
              disabled={
                (!draft.trim() && queuedAttachments.length === 0) || sending || recordingVoice
              }
            >
              {sending
                ? "Sending…"
                : queuedAttachments.length > 0
                  ? `Send message · ${queuedAttachments.length} attachment${queuedAttachments.length === 1 ? "" : "s"}`
                  : "Send message"}
            </Button>
          </div>

          <p className="text-xs leading-relaxed text-muted-foreground">
            Supported: images, PDFs, Office docs, spreadsheets, text files, and audio. Up to 5
            files, 10 MB each and 15 MB total. Voice notes stop at 2 minutes and are visible only to
            conversation participants.
          </p>
          {attachmentError ? (
            <div className="space-y-1" role="alert">
              <p className="text-sm text-destructive">{attachmentError}</p>
              {rejectedFiles.length > 0 ? (
                <ul className="list-disc pl-5 text-xs text-muted-foreground">
                  {rejectedFiles.slice(0, 3).map((reason) => (
                    <li key={reason}>{reason}</li>
                  ))}
                </ul>
              ) : null}
            </div>
          ) : null}
          {error ? (
            <p className="text-sm text-destructive" role="alert">
              {error}
            </p>
          ) : null}
        </form>
      ) : null}
      {!inboxMode && conversation.status === "OPEN" ? (
        <section className="space-y-3 border-t border-border pt-4" aria-label="Agreement changes">
          <div>
            <h3 className="font-medium">Proposed agreement changes</h3>
            <p className="mt-1 text-sm text-muted-foreground">
              Chat is for discussion. A change becomes active only after both of you agree and Tenfo
              records the contract change and completes the required payment-policy steps.
            </p>
            {!conversation.currentContractSnapshot.agreedPrice ? (
              <p className="mt-2 text-sm text-amber-800" role="status">
                No agreed price is recorded for this professional. Before authorizing payment, both
                participants must agree to a proposed price and activate the updated terms.
              </p>
            ) : null}
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
                    until the new version and required simulated policy adjustment are completed.
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
                  The payment simulation is reconciling the updated authorization state. The
                  contract remains unchanged until that state is confirmed.
                </p>
              ) : null}
              {request.status === "ACTIVATION_RECONCILIATION_REQUIRED" ? (
                <p className="text-sm text-destructive" role="alert">
                  The simulation did not provide a confirmed outcome. The change is not active and
                  policy actions are paused until the state is reconciled.
                </p>
              ) : null}
              {request.status === "ACTIVATION_FAILED" ? (
                <p className="text-sm text-destructive" role="status">
                  The simulated authorization was declined. The current contract remains in effect;
                  propose a new change if you still want to proceed.
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
                price agreed with the professional. Existing simulated authorization or capture
                state is not changed by sending or accepting this proposal. Leave the price blank if
                none has been agreed; an existing agreed price stays in effect unless you enter a
                new one.
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
      {!inboxMode && conversation.status === "OPEN" ? (
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
