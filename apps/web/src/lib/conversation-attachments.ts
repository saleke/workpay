export const MAX_CONVERSATION_ATTACHMENT_BYTES = 10 * 1024 * 1024;
export const MAX_CONVERSATION_ATTACHMENTS = 5;
export const MAX_CONVERSATION_UPLOAD_BYTES = 15 * 1024 * 1024;
export const MAX_CONVERSATION_MULTIPART_BYTES = MAX_CONVERSATION_UPLOAD_BYTES + 128 * 1024;
export const MAX_VOICE_NOTE_SECONDS = 120;

const AUDIO_TYPES = new Set([
  "audio/aac",
  "audio/mp4",
  "audio/mpeg",
  "audio/ogg",
  "audio/wav",
  "audio/webm",
  "audio/x-m4a",
]);

const FILE_TYPES = new Set([
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "image/jpeg",
  "image/png",
  "image/webp",
  "text/csv",
  "text/plain",
]);

export type ConversationAttachmentKind = "AUDIO" | "FILE";

export function conversationAttachmentKind(contentType: string): ConversationAttachmentKind | null {
  const mimeType = contentType.split(";")[0]?.trim().toLowerCase();
  if (!mimeType) return null;
  if (AUDIO_TYPES.has(mimeType)) return "AUDIO";
  if (FILE_TYPES.has(mimeType)) return "FILE";
  return null;
}

function hasPrefix(bytes: Uint8Array, prefix: number[]): boolean {
  return prefix.every((byte, index) => bytes[index] === byte);
}

export function conversationAttachmentMatchesContent(
  filename: string,
  contentType: string,
  bytes: Uint8Array,
): boolean {
  const mimeType = contentType.split(";")[0]?.trim().toLowerCase() ?? "";
  const extension = filename.split(".").at(-1)?.toLowerCase() ?? "";
  const validExtension =
    (mimeType === "audio/aac" && extension === "aac") ||
    (mimeType === "audio/mp4" && (extension === "m4a" || extension === "mp4")) ||
    (mimeType === "audio/mpeg" && extension === "mp3") ||
    (mimeType === "audio/ogg" && (extension === "ogg" || extension === "oga")) ||
    (mimeType === "audio/wav" && extension === "wav") ||
    (mimeType === "audio/webm" && extension === "webm") ||
    (mimeType === "audio/x-m4a" && extension === "m4a") ||
    (mimeType === "application/pdf" && extension === "pdf") ||
    (mimeType === "application/vnd.openxmlformats-officedocument.wordprocessingml.document" &&
      extension === "docx") ||
    (mimeType === "image/jpeg" && (extension === "jpg" || extension === "jpeg")) ||
    (mimeType === "image/png" && extension === "png") ||
    (mimeType === "image/webp" && extension === "webp") ||
    (mimeType === "text/csv" && extension === "csv") ||
    (mimeType === "text/plain" && extension === "txt");
  if (!validExtension) return false;

  switch (mimeType) {
    case "audio/aac":
      return bytes[0] === 0xff && (bytes[1] === 0xf1 || bytes[1] === 0xf9);
    case "audio/mp4":
    case "audio/x-m4a":
      return bytes.length >= 8 && String.fromCharCode(...bytes.slice(4, 8)) === "ftyp";
    case "audio/mpeg":
      return (
        hasPrefix(bytes, [0x49, 0x44, 0x33]) ||
        (bytes[0] === 0xff && bytes[1] !== undefined && (bytes[1] & 0xe0) === 0xe0)
      );
    case "audio/ogg":
      return hasPrefix(bytes, [0x4f, 0x67, 0x67, 0x53]);
    case "audio/wav":
      return (
        hasPrefix(bytes, [0x52, 0x49, 0x46, 0x46]) &&
        bytes.length >= 12 &&
        String.fromCharCode(...bytes.slice(8, 12)) === "WAVE"
      );
    case "audio/webm":
      return hasPrefix(bytes, [0x1a, 0x45, 0xdf, 0xa3]);
    case "application/pdf":
      return hasPrefix(bytes, [0x25, 0x50, 0x44, 0x46, 0x2d]);
    case "application/vnd.openxmlformats-officedocument.wordprocessingml.document":
      return hasPrefix(bytes, [0x50, 0x4b, 0x03, 0x04]);
    case "image/jpeg":
      return hasPrefix(bytes, [0xff, 0xd8, 0xff]);
    case "image/png":
      return hasPrefix(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    case "image/webp":
      return (
        hasPrefix(bytes, [0x52, 0x49, 0x46, 0x46]) &&
        bytes.length >= 12 &&
        String.fromCharCode(...bytes.slice(8, 12)) === "WEBP"
      );
    case "text/csv":
    case "text/plain":
      return !bytes.includes(0);
    default:
      return false;
  }
}

export function formatFileSize(sizeBytes: number): string {
  if (sizeBytes < 1024 * 1024) return `${Math.max(1, Math.round(sizeBytes / 1024))} KB`;
  return `${(sizeBytes / (1024 * 1024)).toFixed(1)} MB`;
}
