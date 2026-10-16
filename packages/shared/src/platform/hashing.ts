/**
 * Deterministic content hashing + canonical JSON. Server-only.
 *
 * Used for contract/agreement/submission identity (section 3.19 contract hash,
 * section 5 commercial agreement hash, section 7.19 submission hash). Hashing MUST be over a
 * canonical serialization so that logically-equal objects hash identically.
 */
import { createHash } from "node:crypto";

/**
 * Canonical JSON: object keys sorted recursively, arrays preserved in order,
 * undefined omitted. This is the input to every economic hash in WorkPay.
 */
export function canonicalize(value: unknown): string {
  return JSON.stringify(canonicalValue(value));
}

function canonicalValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalValue);
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const key of Object.keys(value as Record<string, unknown>).sort()) {
      const v = (value as Record<string, unknown>)[key];
      if (v === undefined) continue;
      out[key] = canonicalValue(v);
    }
    return out;
  }
  return value;
}

export function sha256Hex(input: string): string {
  return createHash("sha256").update(input, "utf8").digest("hex");
}

/** SHA-256 hash of the canonical serialization of an object. */
export function hashObject(value: unknown): string {
  return sha256Hex(canonicalize(value));
}
