import { sha256Hex } from "../../platform/hashing.js";

export function paypalRequestId(scope: string, key: string): string {
  const digest = sha256Hex(`${scope}:${key}`).slice(0, 32);
  const variant = ((Number.parseInt(digest[16]!, 16) & 0x3) | 0x8).toString(16);
  return `${digest.slice(0, 8)}-${digest.slice(8, 12)}-5${digest.slice(13, 16)}-${variant}${digest.slice(17, 20)}-${digest.slice(20, 32)}`;
}
