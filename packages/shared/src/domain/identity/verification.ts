/**
 * User verification domain rules, disposable email defense, and handle validation.
 */

export const DISPOSABLE_EMAIL_DOMAINS = new Set<string>([
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
]);

/**
 * Payout milestone threshold: individual tasks or cumulative milestone disbursements
 * exceeding $1,000 USD require verified government identity (Persona / Stripe Identity standard).
 */
export const IDENTITY_VERIFICATION_THRESHOLD_MINOR = 100000; // $1,000.00 USD

export function isDisposableEmail(email: string): boolean {
  if (!email || typeof email !== "string") return false;
  const parts = email.trim().toLowerCase().split("@");
  if (parts.length !== 2) return false;
  const domain = parts[1];
  if (!domain) return false;
  return DISPOSABLE_EMAIL_DOMAINS.has(domain);
}

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

export function requiresIdentityVerification(amountMinor: number): boolean {
  return amountMinor >= IDENTITY_VERIFICATION_THRESHOLD_MINOR;
}
