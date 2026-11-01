/**
 * Opaque, sortable, difficult-to-enumerate identifiers (UUIDv7) with a
 * domain-type prefix. IDs are safe to expose through APIs but are NOT an
 * authorization mechanism (Component 14 section 7): authorization is enforced by the
 * identity/authority layer.
 *
 * newId("task") -> "task_0192f3c1-..." (v7 => lexicographically time-sortable)
 */

const HEX = "0123456789abcdef";

function randomBytes(n: number): Uint8Array {
  const bytes = new Uint8Array(n);
  globalThis.crypto.getRandomValues(bytes);
  return bytes;
}

/** RFC 9562 UUIDv7: 48-bit unix-ms timestamp + version/variant + random. */
export function uuidv7(): string {
  const bytes = randomBytes(16);
  const ts = BigInt(Date.now());

  // 48-bit big-endian timestamp.
  bytes[0] = Number((ts >> 40n) & 0xffn);
  bytes[1] = Number((ts >> 32n) & 0xffn);
  bytes[2] = Number((ts >> 24n) & 0xffn);
  bytes[3] = Number((ts >> 16n) & 0xffn);
  bytes[4] = Number((ts >> 8n) & 0xffn);
  bytes[5] = Number(ts & 0xffn);

  // version 7
  bytes[6] = (bytes[6]! & 0x0f) | 0x70;
  // variant 10xx
  bytes[8] = (bytes[8]! & 0x3f) | 0x80;

  let out = "";
  for (let i = 0; i < 16; i++) {
    if (i === 4 || i === 6 || i === 8 || i === 10) out += "-";
    out += HEX[bytes[i]! >> 4]! + HEX[bytes[i]! & 0x0f]!;
  }
  return out;
}

export type IdPrefix =
  | "task"
  | "tfile"
  | "wspec"
  | "req"
  | "clar"
  | "contract"
  | "creq"
  | "scope"
  | "accrule"
  | "approval"
  | "provider"
  | "reviewer"
  | "irev"
  | "irpt"
  | "rex"
  | "revd"
  | "rconf"
  | "cap"
  | "avail"
  | "rep"
  | "sel"
  | "nego"
  | "offer"
  | "agreement"
  | "pay"
  | "pdec"
  | "pcheck"
  | "pcmd"
  | "poper"
  | "exec"
  | "paccept"
  | "sub"
  | "sart"
  | "vrun"
  | "vres"
  | "adec"
  | "case"
  | "conv"
  | "chg"
  | "cmsg"
  | "msg"
  | "cev"
  | "resol"
  | "cimpact"
  | "arun"
  | "act"
  | "evt"
  | "job"
  | "idem"
  | "audit"
  | "corr"
  | "user"
  | "session"
  | "source"
  | "intakever"
  | "notif"
  | "wh"; // webhook receipt

export type Id<P extends IdPrefix = IdPrefix> = string & { readonly __idPrefix?: P };

export function newId<P extends IdPrefix>(prefix: P): Id<P> {
  return `${prefix}_${uuidv7()}` as Id<P>;
}

export function idHasPrefix(id: string, prefix: IdPrefix): boolean {
  return id.startsWith(`${prefix}_`);
}

/** Correlation IDs group the events of one workflow execution. */
export function newCorrelationId(): string {
  return newId("corr");
}
