/**
 * Server route handler utilities for Next.js App Router (ENGINEERING_PLAN section 6.3).
 *
 * Rules:
 * - Route handlers do: validate (Zod) -> resolve actor/authz -> call domain service -> map response.
 * - No business logic or payment math in route handlers.
 * - Consistent error model: { error: { code, message, details }, requestId }.
 * - Idempotency-Key support via idempotency_records (invariant P4).
 */
import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { getDb, withTransaction, type Database } from "@workpay/shared/db";
import { idempotencyRecords } from "@workpay/shared/db/schema/infra";
import { newCorrelationId, newId, type IdPrefix } from "@workpay/shared/platform";
import { hashObject } from "@workpay/shared/platform";
import { AppError, authorizationError, type ErrorCode } from "@workpay/shared/platform";
import type { Actor } from "@workpay/shared/domain";
import { getSessionUser, SESSION_COOKIE_NAME } from "./session";

const HTTP_STATUS_MAP: Record<ErrorCode, number> = {
  VALIDATION_ERROR: 422,
  AUTHORIZATION_ERROR: 403,
  NOT_FOUND: 404,
  DOMAIN_CONFLICT: 409,
  POLICY_DENIED: 409,
  REQUIRES_HUMAN_REVIEW: 409,
  EXTERNAL_FAILURE: 502,
  EXTERNAL_UNKNOWN: 202,
  IDEMPOTENCY_CONFLICT: 409,
  PRECONDITION_FAILED: 409,
  INTERNAL_ERROR: 500,
};

export function resolveActor(
  req: Request,
  defaultRole: "buyer" | "provider" | "admin_reviewer" = "buyer",
): Actor {
  if (requiresAuthenticatedSession()) throw authorizationError();

  const userIdHeader = req.headers.get("x-user-id");
  const roleHeader = (req.headers.get("x-role") as Actor["role"]) ?? defaultRole;

  if (userIdHeader) {
    if (roleHeader === "provider") {
      return { kind: "PROVIDER", id: userIdHeader };
    }
    if (roleHeader === "admin_reviewer") {
      return { kind: "REVIEWER", id: userIdHeader, role: "admin_reviewer" };
    }
    return { kind: "USER", id: userIdHeader, role: roleHeader ?? "buyer" };
  }

  // Check demo persona cookie if available
  const cookieHeader = req.headers.get("cookie") ?? "";
  const match = cookieHeader.match(/workpay_persona=([^;]+)/);
  const cookiePersona = match && match[1] ? decodeURIComponent(match[1]) : null;

  if (cookiePersona === "provider") {
    return { kind: "PROVIDER", id: "usr_provider_bob" };
  }
  if (cookiePersona === "admin_reviewer") {
    return { kind: "REVIEWER", id: "usr_admin_carol", role: "admin_reviewer" };
  }
  if (cookiePersona === "buyer") {
    return { kind: "USER", id: "usr_buyer_alice", role: "buyer" };
  }

  if (defaultRole === "provider") {
    return { kind: "PROVIDER", id: "usr_provider_bob" };
  }
  if (defaultRole === "admin_reviewer") {
    return { kind: "REVIEWER", id: "usr_admin_carol", role: "admin_reviewer" };
  }
  return { kind: "USER", id: "usr_buyer_alice", role: "buyer" };
}

export async function resolveActorAsync(
  req: Request,
  defaultRole: "buyer" | "provider" | "admin_reviewer" = "buyer",
): Promise<Actor> {
  // 1. Database session is highest priority: authentic logged-in user
  const cookieHeader = req.headers.get("cookie") ?? "";
  const sessionMatch = cookieHeader.match(new RegExp(`${SESSION_COOKIE_NAME}=([^;]+)`));
  const sessionToken = sessionMatch && sessionMatch[1] ? decodeURIComponent(sessionMatch[1]) : null;

  if (sessionToken) {
    const authUser = await getSessionUser(sessionToken);
    if (authUser) {
      if (authUser.role === "provider") {
        return { kind: "PROVIDER", id: authUser.id };
      }
      if (authUser.role === "admin_reviewer") {
        return { kind: "REVIEWER", id: authUser.id, role: "admin_reviewer" };
      }
      return { kind: "USER", id: authUser.id, role: authUser.role };
    }
  }

  if (requiresAuthenticatedSession()) throw authorizationError();

  // 2. Explicit API header (for CLI, curl, automated testing)
  const userIdHeader = req.headers.get("x-user-id");
  const roleHeader = (req.headers.get("x-role") as Actor["role"]) ?? defaultRole;

  if (userIdHeader) {
    if (roleHeader === "provider") {
      return { kind: "PROVIDER", id: userIdHeader };
    }
    if (roleHeader === "admin_reviewer") {
      return { kind: "REVIEWER", id: userIdHeader, role: "admin_reviewer" };
    }
    return { kind: "USER", id: userIdHeader, role: roleHeader ?? "buyer" };
  }

  // 3. Fall back to demo persona only when not authenticated
  return resolveActor(req, defaultRole);
}

function requiresAuthenticatedSession(): boolean {
  return process.env.NODE_ENV === "production" || process.env.WORKPAY_MODE === "production";
}

export function getCorrelationId(req: Request): string {
  return (
    req.headers.get("x-correlation-id") || req.headers.get("x-request-id") || newCorrelationId()
  );
}

export function jsonOk<T>(data: T, status = 200): NextResponse {
  return NextResponse.json(data, {
    status,
    headers: {
      "Cache-Control": "no-store, max-age=0",
    },
  });
}

export function jsonError(err: unknown, fallbackStatus = 500): NextResponse {
  if (err instanceof AppError) {
    const status = HTTP_STATUS_MAP[err.code] ?? fallbackStatus;
    return NextResponse.json(
      {
        error: {
          code: err.code,
          message: err.message,
          details: err.details,
        },
      },
      { status },
    );
  }

  if (typeof err === "object" && err !== null) {
    const obj = err as Record<string, unknown>;
    const code = typeof obj.code === "string" ? obj.code : "INTERNAL_ERROR";
    const message = typeof obj.message === "string" ? obj.message : JSON.stringify(err);
    const details = obj.details;
    return NextResponse.json(
      {
        error: {
          code,
          message,
          ...(details !== undefined ? { details } : {}),
        },
      },
      { status: fallbackStatus },
    );
  }

  const message = String(err);
  return NextResponse.json(
    {
      error: {
        code: "INTERNAL_ERROR",
        message,
      },
    },
    { status: fallbackStatus },
  );
}

export async function withIdempotency<T>(
  scope: string,
  req: Request,
  payload: unknown,
  handler: () => Promise<{ status: number; data: T }>,
): Promise<NextResponse> {
  const idempotencyKey = req.headers.get("Idempotency-Key") || req.headers.get("idempotency-key");
  if (!idempotencyKey) {
    const res = await handler();
    return jsonOk(res.data, res.status);
  }

  const db = getDb();
  const requestHash = hashObject(payload);

  const [existing] = await db
    .select()
    .from(idempotencyRecords)
    .where(
      and(
        eq(idempotencyRecords.scope, scope),
        eq(idempotencyRecords.idempotencyKey, idempotencyKey),
      ),
    )
    .limit(1);

  if (existing) {
    if (existing.requestHash !== requestHash) {
      return jsonError(
        new AppError(
          "IDEMPOTENCY_CONFLICT",
          "Idempotency key reused with a different request payload",
        ),
        409,
      );
    }
    return NextResponse.json(existing.responseBody, {
      status: existing.responseStatus ?? 200,
    });
  }

  const result = await handler();

  await db
    .insert(idempotencyRecords)
    .values({
      id: newId("idem"),
      scope,
      idempotencyKey,
      requestHash,
      responseStatus: result.status,
      responseBody: result.data as Record<string, unknown>,
    })
    .onConflictDoNothing();

  return jsonOk(result.data, result.status);
}

export { getDb, withTransaction };
