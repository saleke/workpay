import { describe, expect, it } from "vitest";
import {
  inspectProfilePhoto,
  parseStoredProfilePhoto,
  profilePhotoStorageKey,
} from "../../src/lib/server/profile-photo";

function png(width: number, height: number): Uint8Array {
  const bytes = new Uint8Array(24);
  bytes.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  bytes[16] = (width >>> 24) & 0xff;
  bytes[17] = (width >>> 16) & 0xff;
  bytes[18] = (width >>> 8) & 0xff;
  bytes[19] = width & 0xff;
  bytes[20] = (height >>> 24) & 0xff;
  bytes[21] = (height >>> 16) & 0xff;
  bytes[22] = (height >>> 8) & 0xff;
  bytes[23] = height & 0xff;
  return bytes;
}

describe("profile photo validation", () => {
  it("recognizes PNG dimensions from file bytes", () => {
    expect(inspectProfilePhoto(png(512, 384))).toEqual({
      contentType: "image/png",
      width: 512,
      height: 384,
    });
  });

  it("rejects unsupported data and unreasonable dimensions", () => {
    expect(() => inspectProfilePhoto(new Uint8Array(24))).toThrow(
      "Use a valid JPEG, PNG, or WebP image.",
    );
    expect(() => inspectProfilePhoto(png(5000, 5000))).toThrow("between 32 and 4096 pixels");
  });

  it("only parses the current user's immutable photo URL", () => {
    const image = "/api/v1/users/usr_123/photo/photo_456";
    expect(parseStoredProfilePhoto(image, "usr_123")).toBe("photo_456");
    expect(parseStoredProfilePhoto(image, "usr_999")).toBeNull();
    expect(profilePhotoStorageKey("usr_123", "photo_456")).toBe("profile-photos/usr_123/photo_456");
  });
});
