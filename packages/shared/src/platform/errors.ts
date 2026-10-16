/**
 * Classified error model (ENGINEERING_PLAN section 53). Errors carry a stable
 * `code` that drives the HTTP status mapping at the API boundary and tells
 * workers whether a failure is retryable.
 *
 * Financial rule (P4): invalid/permission/policy errors must NEVER auto-retry;
 * external UNKNOWN must reconcile, never guess.
 */

export const ERROR_CODES = [
  "VALIDATION_ERROR",
  "AUTHORIZATION_ERROR",
  "NOT_FOUND",
  "DOMAIN_CONFLICT",
  "POLICY_DENIED",
  "REQUIRES_HUMAN_REVIEW",
  "EXTERNAL_FAILURE",
  "EXTERNAL_UNKNOWN",
  "IDEMPOTENCY_CONFLICT",
  "PRECONDITION_FAILED",
  "INTERNAL_ERROR",
] as const;

export type ErrorCode = (typeof ERROR_CODES)[number];

const HTTP_STATUS: Record<ErrorCode, number> = {
  VALIDATION_ERROR: 422,
  AUTHORIZATION_ERROR: 403,
  NOT_FOUND: 404,
  DOMAIN_CONFLICT: 409,
  POLICY_DENIED: 409,
  REQUIRES_HUMAN_REVIEW: 409,
  EXTERNAL_FAILURE: 502,
  // Accepted, pending reconciliation. Not a client failure.
  EXTERNAL_UNKNOWN: 202,
  IDEMPOTENCY_CONFLICT: 409,
  PRECONDITION_FAILED: 409,
  INTERNAL_ERROR: 500,
};

/** Retryable by a generic retry loop. Deliberately conservative for money. */
const RETRYABLE: Record<ErrorCode, boolean> = {
  VALIDATION_ERROR: false,
  AUTHORIZATION_ERROR: false,
  NOT_FOUND: false,
  DOMAIN_CONFLICT: false,
  POLICY_DENIED: false,
  REQUIRES_HUMAN_REVIEW: false,
  EXTERNAL_FAILURE: true,
  // Reconcile, do not blindly retry.
  EXTERNAL_UNKNOWN: false,
  IDEMPOTENCY_CONFLICT: false,
  PRECONDITION_FAILED: false,
  INTERNAL_ERROR: true,
};

export interface AppErrorOptions {
  /** Machine-readable reason within the code (for example a policy check id). */
  reason?: string;
  /** Structured, safe-to-expose detail. Never a stack trace. */
  details?: Record<string, unknown>;
  /** Original cause, for logs only. Never serialized to clients. */
  cause?: unknown;
  /** Human-facing, actionable message override. */
  publicMessage?: string;
}

export class AppError extends Error {
  readonly code: ErrorCode;
  readonly reason?: string;
  readonly details?: Record<string, unknown>;
  override readonly cause?: unknown;
  readonly publicMessage?: string;

  constructor(code: ErrorCode, message: string, options: AppErrorOptions = {}) {
    super(message);
    this.name = "AppError";
    this.code = code;
    if (options.reason !== undefined) this.reason = options.reason;
    if (options.details !== undefined) this.details = options.details;
    if (options.cause !== undefined) this.cause = options.cause;
    if (options.publicMessage !== undefined) this.publicMessage = options.publicMessage;
  }

  get httpStatus(): number {
    return HTTP_STATUS[this.code];
  }

  get retryable(): boolean {
    return RETRYABLE[this.code];
  }

  /** Safe serialization for API responses: `{code,message,reason?,details?}`. */
  toResponse(requestId?: string): {
    error: { code: ErrorCode; message: string; reason?: string; details?: Record<string, unknown> };
    requestId?: string;
  } {
    const message = this.publicMessage ?? this.message;
    const error: {
      code: ErrorCode;
      message: string;
      reason?: string;
      details?: Record<string, unknown>;
    } = { code: this.code, message };
    if (this.reason !== undefined) error.reason = this.reason;
    if (this.details !== undefined) error.details = this.details;
    return requestId === undefined ? { error } : { error, requestId };
  }
}

// Ergonomic constructors.

export const validationError = (message: string, details?: Record<string, unknown>) =>
  new AppError("VALIDATION_ERROR", message, details ? { details } : {});

export const authorizationError = (message = "Not authorized") =>
  new AppError("AUTHORIZATION_ERROR", message);

export const notFound = (what: string) => new AppError("NOT_FOUND", `${what} not found`);

export const conflict = (message: string, details?: Record<string, unknown>) =>
  new AppError("DOMAIN_CONFLICT", message, details ? { details } : {});

export const policyDenied = (reason: string, message: string, details?: Record<string, unknown>) =>
  new AppError("POLICY_DENIED", message, { reason, ...(details ? { details } : {}) });

export const requiresHumanReview = (reason: string, message: string) =>
  new AppError("REQUIRES_HUMAN_REVIEW", message, { reason });

export const externalFailure = (message: string, cause?: unknown) =>
  new AppError("EXTERNAL_FAILURE", message, cause !== undefined ? { cause } : {});

export const externalUnknown = (message: string, details?: Record<string, unknown>) =>
  new AppError("EXTERNAL_UNKNOWN", message, details ? { details } : {});

export function isAppError(e: unknown): e is AppError {
  return e instanceof AppError;
}

export function toAppError(e: unknown): AppError {
  if (isAppError(e)) return e;
  return new AppError("INTERNAL_ERROR", e instanceof Error ? e.message : "Unknown error", {
    cause: e,
  });
}
