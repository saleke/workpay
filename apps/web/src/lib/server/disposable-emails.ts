/**
 * Disposable email blocker and domain verification utility for WorkPay.
 * Protects platform integrity against burner accounts, Sybil attacks, and disposable identities.
 */

const DISPOSABLE_DOMAINS = new Set<string>([
  "mailinator.com",
  "guerrillamail.com",
  "guerrillamailblock.com",
  "guerrillamail.net",
  "guerrillamail.biz",
  "guerrillamail.org",
  "guerrillamail.info",
  "grr.la",
  "sharklasers.com",
  "spam4.me",
  "pokemail.net",
  "10minutemail.com",
  "10minutemail.net",
  "tempmail.com",
  "temp-mail.org",
  "temp-mail.io",
  "tempmailo.com",
  "throwawaymail.com",
  "throwawaymail.net",
  "trashmail.com",
  "trashmail.net",
  "trashmail.me",
  "mytrashmail.com",
  "yopmail.com",
  "yopmail.fr",
  "yopmail.net",
  "dispostable.com",
  "getairmail.com",
  "mohmal.com",
  "burnermail.io",
  "fakeinbox.com",
  "emailondeck.com",
  "getnada.com",
  "mailcatch.com",
  "mintemail.com",
  "spamgourmet.com",
  "mailexpire.com",
  "dropmail.me",
  "tempail.com",
  "generator.email",
  "disposablemail.com",
  "tmailor.com",
  "mytemp.email",
  "crazymailing.com",
  "armyspy.com",
  "cuvox.de",
  "dayrep.com",
  "einrot.com",
  "fleckens.hu",
  "gustr.com",
  "jourrapide.com",
  "rhyta.com",
  "superrito.com",
  "teleworm.us",
]);

/**
 * Returns true if the provided email domain is in the disposable blacklist.
 */
export function isDisposableEmail(email: string): boolean {
  if (!email || typeof email !== "string") return false;
  const parts = email.trim().toLowerCase().split("@");
  if (parts.length !== 2) return false;
  const domain = parts[1];
  if (!domain) return false;
  return DISPOSABLE_DOMAINS.has(domain);
}

/**
 * Validates that an email address is syntactically sound and not from a disposable service.
 */
export function validateEmailForRegistration(email: string): { ok: boolean; message?: string } {
  const trimmed = email.trim().toLowerCase();
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(trimmed)) {
    return { ok: false, message: "Please provide a valid email address." };
  }
  if (isDisposableEmail(trimmed)) {
    return {
      ok: false,
      message:
        "Disposable and temporary email addresses are not permitted on WorkPay. Please provide a verified corporate or personal domain email.",
    };
  }
  return { ok: true };
}

/**
 * Validates a platform username handle (@username).
 * Must be 3 to 30 characters, alphanumeric, underscores, or hyphens.
 */
export function validateUsername(username: string): { ok: boolean; message?: string } {
  const normalized = username.trim().toLowerCase();
  if (normalized.length < 3) {
    return { ok: false, message: "Username must be at least 3 characters long." };
  }
  if (normalized.length > 30) {
    return { ok: false, message: "Username cannot exceed 30 characters." };
  }
  const usernameRegex = /^[a-z0-9][a-z0-9_-]*[a-z0-9]$/;
  if (!usernameRegex.test(normalized)) {
    return {
      ok: false,
      message:
        "Username must contain only lowercase letters, numbers, underscores, or hyphens, and cannot start or end with a symbol.",
    };
  }
  return { ok: true };
}
