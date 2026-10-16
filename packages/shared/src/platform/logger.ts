/**
 * Structured JSON logging with correlation context (ENGINEERING_PLAN section 45).
 *
 * Every log line automatically carries the ambient identifiers
 * (requestId / correlationId / taskId / contractId / paymentId / ...) via
 * AsyncLocalStorage, so economically meaningful operations are traceable
 * end-to-end without threading a context object everywhere.
 */
import { AsyncLocalStorage } from "node:async_hooks";
import pino, { type Logger } from "pino";

export interface LogContext {
  requestId?: string;
  correlationId?: string;
  causationId?: string;
  taskId?: string;
  contractId?: string;
  agreementId?: string;
  paymentId?: string;
  executionId?: string;
  submissionId?: string;
  verificationId?: string;
  agentRunId?: string;
  jobId?: string;
  consumer?: string;
  actorType?: string;
  actorId?: string;
}

const storage = new AsyncLocalStorage<LogContext>();

export function runWithLogContext<T>(context: LogContext, fn: () => T): T {
  const parent = storage.getStore() ?? {};
  return storage.run({ ...parent, ...context }, fn);
}

/** Merge additional identifiers into the ambient context for the callback. */
export function withLogContext<T>(context: LogContext, fn: () => T): T {
  return runWithLogContext(context, fn);
}

export function getLogContext(): LogContext {
  return storage.getStore() ?? {};
}

const level = process.env.LOG_LEVEL ?? "info";

export const logger: Logger = pino({
  level,
  base: { service: "workpay" },
  timestamp: pino.stdTimeFunctions.isoTime,
  mixin: () => ({ ...storage.getStore() }),
  redact: {
    paths: [
      "password",
      "*.password",
      "*.token",
      "*.accessToken",
      "*.clientSecret",
      "req.headers.authorization",
      "req.headers.cookie",
    ],
    remove: true,
  },
});

/** Create a named logger (e.g. module or job consumer). */
export function createLogger(bindings: Record<string, unknown> = {}): Logger {
  return logger.child(bindings);
}
