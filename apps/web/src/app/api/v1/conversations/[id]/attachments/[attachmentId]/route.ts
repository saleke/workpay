import { and, eq } from "drizzle-orm";
import {
  taskConversationAttachments,
  taskConversationMessages,
  taskConversations,
} from "@workpay/shared/db/schema/conversations";
import { getObjectStorage } from "@workpay/shared/integrations";
import { AppError, notFound, sha256HexOfBytes } from "@workpay/shared/platform";
import { getDb, jsonError } from "@/lib/server/api";
import { resolveConversationActor } from "@/lib/server/conversation-auth";

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string; attachmentId: string }> },
) {
  try {
    const actor = await resolveConversationActor(req);
    if (!actor.id) throw new AppError("AUTHORIZATION_ERROR", "Sign in to access attachments.");
    const { id: conversationId, attachmentId } = await params;
    const [attachment] = await getDb()
      .select({
        id: taskConversationAttachments.id,
        buyerUserId: taskConversations.buyerUserId,
        providerUserId: taskConversations.providerUserId,
        kind: taskConversationAttachments.kind,
        filename: taskConversationAttachments.filename,
        storageKey: taskConversationAttachments.storageKey,
        contentType: taskConversationAttachments.contentType,
        sizeBytes: taskConversationAttachments.sizeBytes,
        sha256: taskConversationAttachments.sha256,
      })
      .from(taskConversationAttachments)
      .innerJoin(
        taskConversationMessages,
        and(
          eq(taskConversationAttachments.messageId, taskConversationMessages.id),
          eq(taskConversationAttachments.conversationId, taskConversationMessages.conversationId),
        ),
      )
      .innerJoin(
        taskConversations,
        eq(taskConversationMessages.conversationId, taskConversations.id),
      )
      .where(
        and(
          eq(taskConversationAttachments.id, attachmentId),
          eq(taskConversationMessages.conversationId, conversationId),
        ),
      )
      .limit(1);

    if (!attachment || ![attachment.buyerUserId, attachment.providerUserId].includes(actor.id)) {
      throw notFound("Conversation attachment");
    }

    const bytes = await getObjectStorage().get(attachment.storageKey);
    if (
      bytes.byteLength !== attachment.sizeBytes ||
      sha256HexOfBytes(bytes) !== attachment.sha256
    ) {
      throw new AppError("INTERNAL_ERROR", "The attachment failed its integrity check.");
    }
    const body = new ArrayBuffer(bytes.byteLength);
    new Uint8Array(body).set(bytes);
    const safeFilename =
      attachment.filename
        .normalize("NFKD")
        .replace(/[^\x20-\x7E]/g, "_")
        .replace(/[\r\n"\\]/g, "_")
        .slice(0, 255) || "attachment";
    const encodedFilename = encodeURIComponent(attachment.filename).replace(
      /['()*]/g,
      (character) => `%${character.charCodeAt(0).toString(16).toUpperCase()}`,
    );
    return new Response(body, {
      headers: {
        "Content-Type": attachment.contentType,
        "Content-Length": String(bytes.byteLength),
        "Content-Disposition": `${attachment.kind === "AUDIO" ? "inline" : "attachment"}; filename="${safeFilename}"; filename*=UTF-8''${encodedFilename}`,
        "X-Content-Type-Options": "nosniff",
        "Cache-Control": "private, no-store",
      },
    });
  } catch (error) {
    return jsonError(error);
  }
}
