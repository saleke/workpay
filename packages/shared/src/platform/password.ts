import { randomBytes, scryptSync, timingSafeEqual } from "node:crypto";

/**
 * Hash a plaintext password using Node.js scrypt with a random 16-byte salt.
 * Returns a serialized string in format: `<salt_hex>:<hash_hex>`.
 */
export function hashPassword(password: string): string {
  const salt = randomBytes(16).toString("hex");
  const derivedKey = scryptSync(password, salt, 64);
  return `${salt}:${derivedKey.toString("hex")}`;
}

/**
 * Verify a plaintext password against a stored `<salt_hex>:<hash_hex>` hash string.
 * Uses timingSafeEqual to protect against side-channel timing attacks.
 */
export function verifyPassword(password: string, storedHash: string): boolean {
  try {
    const [salt, key] = storedHash.split(":");
    if (!salt || !key) return false;
    const keyBuffer = Buffer.from(key, "hex");
    const derivedKey = scryptSync(password, salt, 64);
    if (keyBuffer.length !== derivedKey.length) return false;
    return timingSafeEqual(keyBuffer, derivedKey);
  } catch {
    return false;
  }
}
