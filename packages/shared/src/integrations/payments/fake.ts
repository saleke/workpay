/**
 * Deterministic fake payment gateway.
 *
 * Used by tests, CI and rehearsals. It records operations in memory so it can
 * honour idempotency keys exactly as a real provider would: replaying the same
 * key returns the original result instead of performing the operation twice.
 *
 * Tests can script outcomes (decline, unknown, out-of-order) to exercise the
 * hard paths without touching PayPal.
 */
import { createHash } from "node:crypto";
import type {
  AuthorizeRequest,
  AuthorizeResult,
  CaptureRequest,
  CaptureResult,
  PaymentGateway,
  RefundRequest,
  RefundResult,
  VoidRequest,
  VoidResult,
  WebhookVerificationInput,
  WebhookVerificationResult,
} from "./types.js";

type Outcome = "SUCCESS" | "DECLINED" | "UNKNOWN";

function deterministicId(prefix: string, key: string): string {
  return `${prefix}_${createHash("sha256").update(key).digest("hex").slice(0, 24)}`;
}

export interface FakePayPalOptions {
  /** Outcome for the next authorize call, then cleared. */
  nextAuthorizeOutcome?: Outcome;
  /** Outcome for the next capture call, then cleared. */
  nextCaptureOutcome?: Outcome;
  /** Treat all webhooks as verified (default) or unverified. */
  webhookVerified?: boolean;
}

export class FakePayPal implements PaymentGateway {
  readonly name = "fake";
  private readonly authorizations = new Map<string, AuthorizeResult>();
  private readonly captures = new Map<string, CaptureResult>();
  private nextAuthorizeOutcome?: Outcome;
  private nextCaptureOutcome?: Outcome;
  private readonly webhookVerified: boolean;

  constructor(options: FakePayPalOptions = {}) {
    this.nextAuthorizeOutcome = options.nextAuthorizeOutcome;
    this.nextCaptureOutcome = options.nextCaptureOutcome;
    this.webhookVerified = options.webhookVerified ?? true;
  }

  async authorize(request: AuthorizeRequest): Promise<AuthorizeResult> {
    const existing = this.authorizations.get(request.idempotencyKey);
    if (existing) return existing;

    const outcome = this.nextAuthorizeOutcome ?? "SUCCESS";
    this.nextAuthorizeOutcome = undefined;

    let result: AuthorizeResult;
    if (outcome === "SUCCESS") {
      result = {
        status: "SUCCESS",
        authorizationId: deterministicId("fake_auth", request.idempotencyKey),
        providerOrderId: request.orderId,
      };
    } else if (outcome === "DECLINED") {
      result = { status: "DECLINED", errorCode: "INSTRUMENT_DECLINED", errorMessage: "Declined" };
    } else {
      result = { status: "UNKNOWN", errorMessage: "Simulated timeout" };
    }
    this.authorizations.set(request.idempotencyKey, result);
    return result;
  }

  async capture(request: CaptureRequest): Promise<CaptureResult> {
    const existing = this.captures.get(request.idempotencyKey);
    if (existing) return existing;

    const outcome = this.nextCaptureOutcome ?? "SUCCESS";
    this.nextCaptureOutcome = undefined;

    const result: CaptureResult =
      outcome === "SUCCESS"
        ? { status: "SUCCESS", captureId: deterministicId("fake_cap", request.idempotencyKey) }
        : outcome === "DECLINED"
          ? { status: "DECLINED", errorCode: "CAPTURE_DECLINED", errorMessage: "Declined" }
          : { status: "UNKNOWN", errorMessage: "Simulated timeout" };

    this.captures.set(request.idempotencyKey, result);
    return result;
  }

  async void(request: VoidRequest): Promise<VoidResult> {
    return { status: "SUCCESS" };
  }

  async refund(request: RefundRequest): Promise<RefundResult> {
    return { status: "SUCCESS", refundId: deterministicId("fake_ref", request.idempotencyKey) };
  }

  async verifyWebhook(input: WebhookVerificationInput): Promise<WebhookVerificationResult> {
    if (!this.webhookVerified) {
      return { verified: false, reason: "signature verification failed" };
    }
    let payload: unknown;
    try {
      payload = JSON.parse(input.rawBody);
    } catch {
      return { verified: false, reason: "invalid json" };
    }
    const event = payload as { id?: string; event_type?: string };
    return {
      verified: true,
      eventId: event.id ?? "fake_evt",
      eventType: event.event_type ?? "UNKNOWN",
      payload,
    };
  }

  /** Test helper: script the next authorize outcome. */
  scriptAuthorize(outcome: Outcome): void {
    this.nextAuthorizeOutcome = outcome;
  }

  /** Test helper: script the next capture outcome. */
  scriptCapture(outcome: Outcome): void {
    this.nextCaptureOutcome = outcome;
  }

  /** Test helper: number of distinct successful captures recorded. */
  successfulCaptureCount(): number {
    let count = 0;
    for (const result of this.captures.values()) if (result.status === "SUCCESS") count += 1;
    return count;
  }
}
