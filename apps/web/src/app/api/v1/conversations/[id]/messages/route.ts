import { z } from "zod";
import { eq, inArray } from "drizzle-orm";
import { getCorrelationId, getDb, jsonError, jsonOk, withTransaction } from "@/lib/server/api";
import { getConversationForParticipant, sendTaskMessage } from "@workpay/shared/domain";
import { resolveConversationActor } from "@/lib/server/conversation-auth";
import {
  taskConversationAttachments,
  taskConversations,
} from "@workpay/shared/db/schema/conversations";
import { AppError, logger, newId, sha256HexOfBytes } from "@workpay/shared/platform";
import type { ConversationAttachmentInput } from "@workpay/shared/domain";
import { buildStorageKey, getObjectStorage } from "@workpay/shared/integrations";
import {
  conversationAttachmentKind,
  conversationAttachmentMatchesContent,
  MAX_CONVERSATION_ATTACHMENT_BYTES,
  MAX_CONVERSATION_ATTACHMENTS,
  MAX_CONVERSATION_MULTIPART_BYTES,
  MAX_CONVERSATION_UPLOAD_BYTES,
} from "@/lib/conversation-attachments";

const sendMessageSchema = z
  .object({
    clientMessageId: z
      .string()
      .min(8)
      .max(64)
      .regex(/^[A-Za-z0-9_-]+$/),
    body: z.string().trim().min(1).max(10_000),
  })
  .strict();

interface UploadedConversationAttachment {
  id: string;
  filename: string;
  storageKey: string;
}

const MAX_CONVERSATION_JSON_BYTES = 16 * 1024;

async function removeUnpersistedObjects(uploaded: UploadedConversationAttachment[]): Promise<void> {
  if (uploaded.length === 0) return;
  let persistedIds: Set<string>;
  try {
    const persisted = await getDb()
      .select({ id: taskConversationAttachments.id })
      .from(taskConversationAttachments)
      .where(
        inArray(
          taskConversationAttachments.id,
          uploaded.map((attachment) => attachment.id),
        ),
      );
    persistedIds = new Set(persisted.map((attachment) => attachment.id));
  } catch (error) {
    logger.error(
      { err: String(error), attachmentIds: uploaded.map((attachment) => attachment.id) },
      "could not verify whether conversation attachments were persisted; retaining objects",
    );
    return;
  }
  const storage = getObjectStorage();
  const objectsToDelete = uploaded.filter((attachment) => !persistedIds.has(attachment.id));
  const results = await Promise.allSettled(
    objectsToDelete.map((attachment) => storage.delete(attachment.storageKey)),
  );
  results.forEach((result, index) => {
    if (result.status === "rejected") {
      logger.error(
        { err: String(result.reason), attachmentId: objectsToDelete[index]?.id },
        "failed to remove an unpersisted conversation attachment",
      );
    }
  });
}

async function readRequestBody(req: Request, maxBytes: number): Promise<ArrayBuffer> {
  const contentLength = req.headers.get("content-length");
  if (contentLength !== null) {
    const parsedLength = Number(contentLength);
    if (!Number.isSafeInteger(parsedLength) || parsedLength < 0) {
      throw new AppError("VALIDATION_ERROR", "The upload size is invalid.");
    }
    if (parsedLength > maxBytes) {
      throw new AppError("VALIDATION_ERROR", "The message upload is too large.");
    }
  }
  if (!req.body) throw new AppError("VALIDATION_ERROR", "The message upload is empty.");

  const reader = req.body.getReader();
  const chunks: Uint8Array[] = [];
  let totalBytes = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    totalBytes += value.byteLength;
    if (totalBytes > maxBytes) {
      await reader.cancel();
      throw new AppError("VALIDATION_ERROR", "The message upload is too large.");
    }
    chunks.push(value);
  }

  const body = new Uint8Array(totalBytes);
  let offset = 0;
  for (const chunk of chunks) {
    body.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return body.buffer;
}

async function readMultipartFormData(req: Request): Promise<FormData> {
  const contentType = req.headers.get("content-type");
  if (!contentType) throw new AppError("VALIDATION_ERROR", "Multipart content type is required.");
  const body = await readRequestBody(req, MAX_CONVERSATION_MULTIPART_BYTES);
  try {
    return await new Response(body, { headers: { "Content-Type": contentType } }).formData();
  } catch {
    throw new AppError("VALIDATION_ERROR", "The multipart message could not be parsed.");
  }
}

async function readJsonBody(req: Request): Promise<unknown> {
  const body = await readRequestBody(req, MAX_CONVERSATION_JSON_BYTES);
  try {
    return JSON.parse(new TextDecoder().decode(body)) as unknown;
  } catch {
    throw new AppError("VALIDATION_ERROR", "The message body must be valid JSON.");
  }
}

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const actor = await resolveConversationActor(req);
    if (!actor.id) throw new AppError("AUTHORIZATION_ERROR", "Sign in to access conversations.");
    const { id: conversationId } = await params;
    const searchParams = new URL(req.url).searchParams;
    const after = searchParams.get("after");
    const before = searchParams.get("before");
    const afterSequence = after === null ? undefined : Number(after);
    const beforeSequence = before === null ? undefined : Number(before);
    if (
      afterSequence !== undefined &&
      (!Number.isSafeInteger(afterSequence) || afterSequence < 0)
    ) {
      throw new AppError("VALIDATION_ERROR", "The message cursor is invalid.");
    }
    if (
      beforeSequence !== undefined &&
      (!Number.isSafeInteger(beforeSequence) || beforeSequence < 1)
    ) {
      throw new AppError("VALIDATION_ERROR", "The message cursor is invalid.");
    }
    if (afterSequence !== undefined && beforeSequence !== undefined) {
      throw new AppError("VALIDATION_ERROR", "Choose either a newer or earlier message cursor.");
    }
    return jsonOk(
      await getConversationForParticipant(getDb(), {
        conversationId,
        userId: actor.id,
        afterSequence,
        beforeSequence,
      }),
    );
  } catch (error) {
    return jsonError(error);
  }
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const uploaded: UploadedConversationAttachment[] = [];
  try {
    const actor = await resolveConversationActor(req);
    if (!actor.id || (actor.kind !== "USER" && actor.kind !== "PROVIDER")) {
      throw new AppError(
        "AUTHORIZATION_ERROR",
        "Only conversation participants can send messages.",
      );
    }
    const userId = actor.id;
    const { id: conversationId } = await params;
    const db = getDb();
    const [existingConversation] = await db
      .select({
        id: taskConversations.id,
        buyerUserId: taskConversations.buyerUserId,
        providerUserId: taskConversations.providerUserId,
        status: taskConversations.status,
      })
      .from(taskConversations)
      .where(eq(taskConversations.id, conversationId))
      .limit(1);
    if (
      !existingConversation ||
      ![existingConversation.buyerUserId, existingConversation.providerUserId].includes(userId)
    ) {
      throw new AppError("NOT_FOUND", "Conversation not found.");
    }
    if (existingConversation.status !== "OPEN") {
      throw new AppError(
        "DOMAIN_CONFLICT",
        "Messages are available after the professional accepts the contact request.",
      );
    }

    const isMultipart = req.headers
      .get("content-type")
      ?.toLowerCase()
      .includes("multipart/form-data");
    let messageInput: z.infer<typeof sendMessageSchema>;
    let files: File[] = [];

    if (isMultipart) {
      const formData = await readMultipartFormData(req);
      const rawFiles = formData.getAll("attachments");
      if (!rawFiles.every((value): value is File => value instanceof File)) {
        throw new AppError("VALIDATION_ERROR", "Each attachment must be a file.");
      }
      files = rawFiles;
      const rawBody = formData.get("body");
      const rawClientMessageId = formData.get("clientMessageId");
      if (typeof rawBody !== "string" || typeof rawClientMessageId !== "string") {
        throw new AppError("VALIDATION_ERROR", "Message text and identifier are required.");
      }
      if (files.length === 0 && !rawBody.trim()) {
        throw new AppError("VALIDATION_ERROR", "Write a message or attach a file.");
      }
      const fallbackBody = files.some((file) => conversationAttachmentKind(file.type) === "AUDIO")
        ? "Voice note"
        : "Shared files";
      messageInput = sendMessageSchema.parse({
        clientMessageId: rawClientMessageId,
        body: rawBody.trim() || fallbackBody,
      });
    } else {
      messageInput = sendMessageSchema.parse(await readJsonBody(req));
    }

    if (files.length > MAX_CONVERSATION_ATTACHMENTS) {
      throw new AppError(
        "VALIDATION_ERROR",
        `Send no more than ${MAX_CONVERSATION_ATTACHMENTS} attachments in one message.`,
      );
    }
    const totalBytes = files.reduce((total, file) => total + file.size, 0);
    if (totalBytes > MAX_CONVERSATION_UPLOAD_BYTES) {
      throw new AppError("VALIDATION_ERROR", "Attachments must total no more than 15 MB.");
    }
    if (
      files.some(
        (file) =>
          file.size === 0 ||
          file.size > MAX_CONVERSATION_ATTACHMENT_BYTES ||
          !conversationAttachmentKind(file.type),
      )
    ) {
      throw new AppError(
        "VALIDATION_ERROR",
        "Use supported audio, image, PDF, DOCX, CSV, or plain-text files up to 10 MB each.",
      );
    }

    const attachmentInputs: ConversationAttachmentInput[] = [];
    const storage = getObjectStorage();
    for (const file of files) {
      const id = newId("catt");
      const filename = file.name.replace(/[\u0000-\u001f/\\"]/g, "_").slice(0, 255) || "attachment";
      const storageKey = buildStorageKey(
        `conversation-attachments/${conversationId}`,
        id,
        filename,
      );
      const bytes = new Uint8Array(await file.arrayBuffer());
      const kind = conversationAttachmentKind(file.type);
      if (!kind) throw new AppError("VALIDATION_ERROR", "This attachment type is not supported.");
      const contentType = file.type.split(";")[0]?.trim().toLowerCase() ?? "";
      if (!conversationAttachmentMatchesContent(filename, contentType, bytes)) {
        throw new AppError(
          "VALIDATION_ERROR",
          "The attachment contents do not match its declared file type.",
        );
      }
      uploaded.push({ id, filename, storageKey });
      await storage.put({ key: storageKey, body: bytes, contentType });
      attachmentInputs.push({
        id,
        kind,
        filename,
        storageKey,
        contentType,
        sizeBytes: bytes.byteLength,
        sha256: sha256HexOfBytes(bytes),
      });
    }

    const data = await withTransaction(async (tx) => {
      return sendTaskMessage(tx, {
        conversationId,
        authorUserId: userId,
        ...messageInput,
        attachments: attachmentInputs,
        actor,
        correlationId: getCorrelationId(req),
      });
    });

    const persistedIds = new Set(data.attachments.map((attachment) => attachment.id));
    await removeUnpersistedObjects(
      uploaded.filter((attachment) => !persistedIds.has(attachment.id)),
    );
    return jsonOk(data, 201);
  } catch (error) {
    await removeUnpersistedObjects(uploaded);
    return jsonError(error);
  }
}
