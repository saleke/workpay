export const MAX_CONVERSATION_ATTACHMENT_BYTES = 10 * 1024 * 1024;
export const MAX_CONVERSATION_ATTACHMENTS = 5;
export const MAX_CONVERSATION_UPLOAD_BYTES = 15 * 1024 * 1024;
export const MAX_CONVERSATION_MULTIPART_BYTES = MAX_CONVERSATION_UPLOAD_BYTES + 128 * 1024;
export const MAX_VOICE_NOTE_SECONDS = 120;

const AUDIO_TYPES = new Set([
  "audio/aac",
  "audio/m4a",
  "audio/mpeg",
  "audio/mp3",
  "audio/mp4",
  "audio/ogg",
  "audio/wav",
  "audio/webm",
  "audio/x-m4a",
  "audio/x-wav",
]);

const FILE_TYPES = new Set([
  "application/msword",
  "application/pdf",
  "application/rtf",
  "application/vnd.ms-excel",
  "application/vnd.ms-powerpoint",
  "application/vnd.oasis.opendocument.text",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "image/bmp",
  "image/gif",
  "image/jpeg",
  "image/png",
  "image/webp",
  "text/csv",
  "text/plain",
  "text/rtf",
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
    (["audio/m4a", "audio/mp4", "audio/x-m4a"].includes(mimeType) &&
      (extension === "m4a" || extension === "mp4")) ||
    (["audio/mpeg", "audio/mp3"].includes(mimeType) && extension === "mp3") ||
    (["audio/ogg"].includes(mimeType) && (extension === "ogg" || extension === "oga")) ||
    (["audio/wav", "audio/x-wav"].includes(mimeType) && extension === "wav") ||
    (mimeType === "audio/webm" && extension === "webm") ||
    (mimeType === "application/pdf" && extension === "pdf") ||
    ([
      "application/msword",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    ].includes(mimeType) &&
      (extension === "doc" || extension === "docx")) ||
    ([
      "application/vnd.ms-excel",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    ].includes(mimeType) &&
      (extension === "xls" || extension === "xlsx")) ||
    ([
      "application/vnd.ms-powerpoint",
      "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    ].includes(mimeType) &&
      (extension === "ppt" || extension === "pptx")) ||
    (["application/rtf", "text/rtf"].includes(mimeType) && extension === "rtf") ||
    (["application/vnd.oasis.opendocument.text"].includes(mimeType) && extension === "odt") ||
    (mimeType === "image/jpeg" && (extension === "jpg" || extension === "jpeg")) ||
    (mimeType === "image/png" && extension === "png") ||
    (mimeType === "image/webp" && extension === "webp") ||
    (mimeType === "image/gif" && extension === "gif") ||
    (mimeType === "image/bmp" && extension === "bmp") ||
    (mimeType === "text/csv" && extension === "csv") ||
    (mimeType === "text/plain" && extension === "txt");
  if (!validExtension) return false;

  switch (mimeType) {
    case "audio/aac":
      return bytes[0] === 0xff && (bytes[1] === 0xf1 || bytes[1] === 0xf9);
    case "audio/mp4":
    case "audio/m4a":
    case "audio/x-m4a":
      return bytes.length >= 8 && String.fromCharCode(...bytes.slice(4, 8)) === "ftyp";
    case "audio/mpeg":
    case "audio/mp3":
      return (
        hasPrefix(bytes, [0x49, 0x44, 0x33]) ||
        (bytes[0] === 0xff && bytes[1] !== undefined && (bytes[1] & 0xe0) === 0xe0)
      );
    case "audio/ogg":
      return hasPrefix(bytes, [0x4f, 0x67, 0x67, 0x53]);
    case "audio/wav":
    case "audio/x-wav":
      return (
        hasPrefix(bytes, [0x52, 0x49, 0x46, 0x46]) &&
        bytes.length >= 12 &&
        String.fromCharCode(...bytes.slice(8, 12)) === "WAVE"
      );
    case "audio/webm":
      return hasPrefix(bytes, [0x1a, 0x45, 0xdf, 0xa3]);
    case "application/pdf":
      return hasPrefix(bytes, [0x25, 0x50, 0x44, 0x46, 0x2d]);
    case "application/msword":
    case "application/vnd.ms-excel":
    case "application/vnd.ms-powerpoint":
      return hasPrefix(bytes, [0xd0, 0xcf, 0x11, 0xe0]);
    case "application/vnd.openxmlformats-officedocument.wordprocessingml.document":
    case "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet":
    case "application/vnd.openxmlformats-officedocument.presentationml.presentation":
    case "application/vnd.oasis.opendocument.text":
      return hasPrefix(bytes, [0x50, 0x4b, 0x03, 0x04]);
    case "application/rtf":
    case "text/rtf":
      return hasPrefix(bytes, [0x7b, 0x5c, 0x72, 0x74, 0x66]);
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
    case "image/gif":
      return (
        hasPrefix(bytes, [0x47, 0x49, 0x46, 0x38, 0x37, 0x61]) ||
        hasPrefix(bytes, [0x47, 0x49, 0x46, 0x38, 0x39, 0x61])
      );
    case "image/bmp":
      return hasPrefix(bytes, [0x42, 0x4d]);
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
