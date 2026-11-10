import { AppError } from "@workpay/shared/platform";

export const MAX_PROFILE_PHOTO_BYTES = 5 * 1024 * 1024;
const MAX_DIMENSION = 4096;
const MIN_DIMENSION = 32;

export interface ProfilePhotoInfo {
  contentType: "image/jpeg" | "image/png" | "image/webp";
  width: number;
  height: number;
}

function readJpegDimensions(bytes: Uint8Array): { width: number; height: number } | null {
  let offset = 2;
  while (offset + 8 < bytes.length) {
    if (bytes[offset] !== 0xff) {
      offset += 1;
      continue;
    }
    const marker = bytes[offset + 1];
    offset += 2;
    if (marker === undefined || marker === 0xd9 || marker === 0xda) break;
    if (marker === 0x00 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) continue;
    const length = ((bytes[offset] ?? 0) << 8) | (bytes[offset + 1] ?? 0);
    if (length < 2 || offset + length > bytes.length) break;
    const isStartOfFrame =
      (marker >= 0xc0 && marker <= 0xc3) ||
      (marker >= 0xc5 && marker <= 0xc7) ||
      (marker >= 0xc9 && marker <= 0xcb) ||
      (marker >= 0xcd && marker <= 0xcf);
    if (isStartOfFrame && length >= 7) {
      return {
        height: ((bytes[offset + 3] ?? 0) << 8) | (bytes[offset + 4] ?? 0),
        width: ((bytes[offset + 5] ?? 0) << 8) | (bytes[offset + 6] ?? 0),
      };
    }
    offset += length;
  }
  return null;
}

function readWebpDimensions(bytes: Uint8Array): { width: number; height: number } | null {
  const kind = String.fromCharCode(...bytes.slice(12, 16));
  if (kind === "VP8X" && bytes.length >= 30) {
    return {
      width: 1 + (bytes[24]! | (bytes[25]! << 8) | (bytes[26]! << 16)),
      height: 1 + (bytes[27]! | (bytes[28]! << 8) | (bytes[29]! << 16)),
    };
  }
  if (kind === "VP8 " && bytes.length >= 30) {
    return {
      width: (bytes[26]! | (bytes[27]! << 8)) & 0x3fff,
      height: (bytes[28]! | (bytes[29]! << 8)) & 0x3fff,
    };
  }
  if (kind === "VP8L" && bytes.length >= 25 && bytes[20] === 0x2f) {
    const b1 = bytes[21]!;
    const b2 = bytes[22]!;
    const b3 = bytes[23]!;
    const b4 = bytes[24]!;
    return {
      width: 1 + b1 + ((b2 & 0x3f) << 8),
      height: 1 + (b2 >> 6) + (b3 << 2) + ((b4 & 0x0f) << 10),
    };
  }
  return null;
}

export function inspectProfilePhoto(bytes: Uint8Array): ProfilePhotoInfo {
  if (bytes.byteLength < 24 || bytes.byteLength > MAX_PROFILE_PHOTO_BYTES) {
    throw new AppError("VALIDATION_ERROR", "Choose an image no larger than 5 MB.");
  }

  let contentType: ProfilePhotoInfo["contentType"] | null = null;
  let dimensions: { width: number; height: number } | null = null;
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    contentType = "image/jpeg";
    dimensions = readJpegDimensions(bytes);
  } else if (
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47 &&
    bytes[4] === 0x0d &&
    bytes[5] === 0x0a &&
    bytes[6] === 0x1a &&
    bytes[7] === 0x0a
  ) {
    contentType = "image/png";
    dimensions = {
      width:
        (bytes[16]! * 0x1000000 + bytes[17]! * 0x10000 + bytes[18]! * 0x100 + bytes[19]!) >>> 0,
      height:
        (bytes[20]! * 0x1000000 + bytes[21]! * 0x10000 + bytes[22]! * 0x100 + bytes[23]!) >>> 0,
    };
  } else if (
    String.fromCharCode(...bytes.slice(0, 4)) === "RIFF" &&
    String.fromCharCode(...bytes.slice(8, 12)) === "WEBP"
  ) {
    contentType = "image/webp";
    dimensions = readWebpDimensions(bytes);
  }

  if (!contentType || !dimensions) {
    throw new AppError("VALIDATION_ERROR", "Use a valid JPEG, PNG, or WebP image.");
  }
  if (
    dimensions.width < MIN_DIMENSION ||
    dimensions.height < MIN_DIMENSION ||
    dimensions.width > MAX_DIMENSION ||
    dimensions.height > MAX_DIMENSION
  ) {
    throw new AppError(
      "VALIDATION_ERROR",
      "Profile photos must be between 32 and 4096 pixels in each dimension.",
    );
  }
  return { contentType, ...dimensions };
}

export function profilePhotoStorageKey(userId: string, photoId: string): string {
  return `profile-photos/${userId}/${photoId}`;
}

export function parseStoredProfilePhoto(image: string | null, userId: string): string | null {
  if (!image) return null;
  const match = image.match(
    new RegExp(
      `^/api/v1/users/${userId.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}/photo/([a-zA-Z0-9_-]+)$`,
    ),
  );
  return match?.[1] ?? null;
}
