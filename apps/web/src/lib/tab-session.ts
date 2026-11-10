export const TAB_SESSION_TOKEN_KEY = "tenfo_tab_session";
export const TAB_AUTH_USER_KEY = "tenfo_tab_auth_user";
export const TAB_SIGNED_OUT_KEY = "tenfo_tab_signed_out";
export const TAB_DEMO_PERSONA_KEY = "workpay_persona";
export const TAB_NONCE_KEY = "tenfo_tab_nonce";

export function getTabNonce(): string | null {
  if (typeof window === "undefined") return null;
  const existing = window.sessionStorage.getItem(TAB_NONCE_KEY);
  if (existing) return existing;
  const bytes = new Uint8Array(32);
  window.crypto.getRandomValues(bytes);
  const nonce = Array.from(bytes, (value) => value.toString(16).padStart(2, "0")).join("");
  window.sessionStorage.setItem(TAB_NONCE_KEY, nonce);
  return nonce;
}

export function getTabSessionToken(): string | null {
  if (typeof window === "undefined") return null;
  return window.sessionStorage.getItem(TAB_SESSION_TOKEN_KEY);
}

export function getTabAuthUser<T = unknown>(): T | null {
  if (typeof window === "undefined") return null;
  const value = window.sessionStorage.getItem(TAB_AUTH_USER_KEY);
  if (!value) return null;
  try {
    return JSON.parse(value) as T;
  } catch {
    return null;
  }
}

export function setTabSession(sessionToken: string, user: unknown): void {
  if (typeof window === "undefined") return;
  window.sessionStorage.setItem(TAB_SESSION_TOKEN_KEY, sessionToken);
  window.sessionStorage.setItem(TAB_AUTH_USER_KEY, JSON.stringify(user));
  window.sessionStorage.removeItem(TAB_SIGNED_OUT_KEY);
  window.sessionStorage.removeItem(TAB_DEMO_PERSONA_KEY);
  window.localStorage.removeItem("workpay_auth_user");
  window.localStorage.removeItem("workpay_signed_out");
  window.dispatchEvent(new Event("workpay_auth_change"));
}

export function getTabDemoPersona(): string | null {
  if (typeof window === "undefined") return null;
  return window.sessionStorage.getItem(TAB_DEMO_PERSONA_KEY);
}

export function setTabDemoPersona(persona: string): void {
  if (typeof window === "undefined") return;
  window.sessionStorage.removeItem(TAB_SESSION_TOKEN_KEY);
  window.sessionStorage.removeItem(TAB_AUTH_USER_KEY);
  window.sessionStorage.removeItem(TAB_SIGNED_OUT_KEY);
  window.sessionStorage.setItem(TAB_DEMO_PERSONA_KEY, persona);
  window.dispatchEvent(new Event("workpay_auth_change"));
}

export function updateTabAuthUser(user: unknown): void {
  if (typeof window === "undefined") return;
  const value = JSON.stringify(user);
  if (window.sessionStorage.getItem(TAB_AUTH_USER_KEY) === value) return;
  window.sessionStorage.setItem(TAB_AUTH_USER_KEY, value);
  window.dispatchEvent(new Event("workpay_auth_change"));
}

export function clearTabSession(): void {
  if (typeof window === "undefined") return;
  window.sessionStorage.removeItem(TAB_SESSION_TOKEN_KEY);
  window.sessionStorage.removeItem(TAB_AUTH_USER_KEY);
  window.sessionStorage.setItem(TAB_SIGNED_OUT_KEY, "true");
  window.localStorage.removeItem("workpay_auth_user");
  window.dispatchEvent(new Event("workpay_auth_change"));
}

export function tabSessionHeaders(): Record<string, string> {
  if (typeof window === "undefined") return {};
  const tabNonce = getTabNonce();
  const tabHeader: Record<string, string> = {};
  if (tabNonce) tabHeader["x-workpay-tab"] = tabNonce;
  const token = getTabSessionToken();
  if (token) return { ...tabHeader, "x-workpay-session": token };
  if (window.sessionStorage.getItem(TAB_SIGNED_OUT_KEY) === "true") {
    return { ...tabHeader, "x-workpay-session": "signed-out" };
  }
  const persona = getTabDemoPersona();
  if (persona === "provider") {
    return { ...tabHeader, "x-user-id": "usr_provider_bob", "x-role": "provider" };
  }
  if (persona === "admin_reviewer") {
    return { ...tabHeader, "x-user-id": "usr_admin_carol", "x-role": "admin_reviewer" };
  }
  if (persona === "buyer") {
    return { ...tabHeader, "x-user-id": "usr_buyer_alice", "x-role": "buyer" };
  }
  return tabHeader;
}

export function tabSessionFetch(
  input: RequestInfo | URL,
  init: RequestInit = {},
): Promise<Response> {
  const headers = new Headers(init.headers);
  for (const [name, value] of Object.entries(tabSessionHeaders())) {
    if (!headers.has(name)) headers.set(name, value);
  }
  return fetch(input, { ...init, headers });
}
