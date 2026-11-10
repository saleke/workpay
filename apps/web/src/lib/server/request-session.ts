export const SESSION_COOKIE_NAME = "workpay_session";
export const SESSION_HEADER_NAME = "x-workpay-session";

export function getRequestSessionToken(req: Request): string | null {
  const headerToken = req.headers.get(SESSION_HEADER_NAME);
  if (headerToken !== null) {
    if (headerToken === "signed-out") return null;
    return /^[a-f0-9]{64}$/.test(headerToken) ? headerToken : null;
  }
  // A tab-aware request without a session token is intentionally unauthenticated;
  // never adopt a shared cookie that may belong to another browser tab.
  if (req.headers.has("x-workpay-tab")) return null;
  const cookieHeader = req.headers.get("cookie") ?? "";
  const match = cookieHeader.match(new RegExp(`(?:^|;\\s*)${SESSION_COOKIE_NAME}=([^;]+)`));
  if (!match?.[1]) return null;
  try {
    return decodeURIComponent(match[1]);
  } catch {
    return null;
  }
}
