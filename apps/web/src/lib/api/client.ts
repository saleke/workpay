import { ApiError } from "./errors";

export interface ApiRequestOptions {
  method?: string;
  headers?: Record<string, string>;
  body?: unknown;
  idempotencyKey?: string;
}

export interface ApiResponse<T> {
  data: T | null;
  error: ApiError | null;
  status: number;
}

function getActivePersonaHeaders(): Record<string, string> {
  if (typeof window === "undefined") return {};
  try {
    const authUserStr = window.localStorage.getItem("workpay_auth_user");
    if (authUserStr) {
      const u = JSON.parse(authUserStr);
      if (u && u.id && u.role) {
        return { "x-user-id": u.id, "x-role": u.role };
      }
    }

    const p = window.localStorage.getItem("workpay_persona") || "buyer";
    if (p === "provider") {
      return { "x-user-id": "usr_provider_bob", "x-role": "provider" };
    }
    if (p === "admin_reviewer") {
      return { "x-user-id": "usr_admin_carol", "x-role": "admin_reviewer" };
    }
    return { "x-user-id": "usr_buyer_alice", "x-role": "buyer" };
  } catch {
    return {};
  }
}

export async function apiUpload<T = unknown>(
  path: string,
  formData: FormData,
  idempotencyKey?: string,
): Promise<ApiResponse<T>> {
  const url = path.startsWith("/") ? path : `/${path}`;
  try {
    const headers = new Headers();
    if (idempotencyKey) headers.set("Idempotency-Key", idempotencyKey);
    const personaHeaders = getActivePersonaHeaders();
    for (const [k, v] of Object.entries(personaHeaders)) {
      if (!headers.has(k)) headers.set(k, v);
    }
    const res = await fetch(url, { method: "POST", headers, body: formData, cache: "no-store" });

    let data: T | null = null;
    const contentType = res.headers.get("content-type") ?? "";
    if (contentType.includes("application/json")) {
      try {
        data = (await res.json()) as T;
      } catch {
        data = null;
      }
    }
    if (!res.ok) {
      return {
        data: null,
        error: new ApiError(res.statusText || "Upload failed", res.status, {
          requestId: res.headers.get("x-request-id") ?? undefined,
          details: data,
        }),
        status: res.status,
      };
    }
    return { data, error: null, status: res.status };
  } catch (e) {
    const err = e instanceof Error ? e : new Error(String(e));
    return { data: null, error: new ApiError(err.message, 0), status: 0 };
  }
}

export { ApiError };

function buildHeaders(options: ApiRequestOptions): HeadersInit {
  const h = new Headers(options.headers ?? {});
  h.set("Accept", "application/json");
  if (options.body !== undefined && !h.has("Content-Type")) {
    h.set("Content-Type", "application/json");
  }
  if (options.idempotencyKey) {
    h.set("Idempotency-Key", options.idempotencyKey);
  }
  const personaHeaders = getActivePersonaHeaders();
  for (const [k, v] of Object.entries(personaHeaders)) {
    if (!h.has(k)) h.set(k, v);
  }
  return h;
}

export async function apiFetch<T = unknown>(
  path: string,
  options: ApiRequestOptions = {},
): Promise<ApiResponse<T>> {
  const url = path.startsWith("http") ? path : path.startsWith("/") ? path : `/${path}`;
  try {
    const res = await fetch(url, {
      method: options.method ?? "GET",
      headers: buildHeaders(options),
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
      cache: "no-store",
    });

    let data: T | null = null;
    const contentType = res.headers.get("content-type") ?? "";
    if (contentType.includes("application/json")) {
      try {
        data = (await res.json()) as T;
      } catch {
        data = null;
      }
    }

    if (!res.ok) {
      const err = new ApiError(res.statusText || "Request failed", res.status, {
        requestId: res.headers.get("x-request-id") ?? undefined,
        details: data,
      });
      return { data: null, error: err, status: res.status };
    }
    return { data, error: null, status: res.status };
  } catch (e) {
    const err = e instanceof Error ? e : new Error(String(e));
    return {
      data: null,
      error: new ApiError(err.message, 0, {}),
      status: 0,
    };
  }
}
