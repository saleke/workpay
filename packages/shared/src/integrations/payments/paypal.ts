/**
 * Sandbox PayPal gateway (Orders v2 + Payments v2 + Webhooks v2).
 *
 * Reliability rules encoded here:
 *  - Every mutating call sends a stable idempotency key via PayPal-Request-Id,
 *    so a retry cannot create a second authorization or capture.
 *  - Network failures, timeouts and 5xx responses become UNKNOWN, never a
 *    silent failure. The caller reconciles.
 *  - 4xx business declines become DECLINED with the provider error code.
 *  - Webhook signatures are verified through PayPal before the payload is
 *    trusted, and the raw body is used so the signature check is meaningful.
 */
import { AppError } from "../../platform/errors.js";
import { logger } from "../../platform/logger.js";
import type {
  AuthorizeRequest,
  AuthorizeResult,
  CaptureRequest,
  CaptureResult,
  PaymentGateway,
  PayoutRequest,
  PayoutResult,
  RefundRequest,
  RefundResult,
  VoidRequest,
  VoidResult,
  WebhookVerificationInput,
  WebhookVerificationResult,
} from "./types.js";

interface PayPalOptions {
  clientId: string;
  clientSecret: string;
  webhookId: string;
  env: "sandbox" | "live";
  timeoutMs?: number;
}

interface PayPalErrorBody {
  name?: string;
  message?: string;
  details?: Array<{ issue?: string; description?: string }>;
}

export class SandboxPayPal implements PaymentGateway {
  readonly name = "paypal";
  private readonly baseUrl: string;
  private readonly options: PayPalOptions;
  private token: { value: string; expiresAt: number } | null = null;

  constructor(options: PayPalOptions) {
    this.options = options;
    this.baseUrl =
      options.env === "live" ? "https://api-m.paypal.com" : "https://api-m.sandbox.paypal.com";
  }

  private async getAccessToken(): Promise<string> {
    if (this.token && this.token.expiresAt > Date.now() + 30_000) {
      return this.token.value;
    }
    const basic = Buffer.from(`${this.options.clientId}:${this.options.clientSecret}`).toString(
      "base64",
    );
    const response = await this.fetchWithTimeout(`${this.baseUrl}/v1/oauth2/token`, {
      method: "POST",
      headers: {
        Authorization: `Basic ${basic}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: "grant_type=client_credentials",
    });
    if (!response.ok) {
      throw new AppError("EXTERNAL_FAILURE", "PayPal authentication failed", {
        details: { status: response.status },
      });
    }
    const body = (await response.json()) as { access_token: string; expires_in: number };
    this.token = {
      value: body.access_token,
      expiresAt: Date.now() + body.expires_in * 1000,
    };
    return this.token.value;
  }

  private async fetchWithTimeout(url: string, init: RequestInit): Promise<Response> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.options.timeoutMs ?? 15_000);
    try {
      return await fetch(url, { ...init, signal: controller.signal });
    } finally {
      clearTimeout(timeout);
    }
  }

  private async request(
    method: string,
    path: string,
    body: unknown,
    idempotencyKey: string,
  ): Promise<{ status: number; json: unknown }> {
    const token = await this.getAccessToken();
    const response = await this.fetchWithTimeout(`${this.baseUrl}${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        "PayPal-Request-Id": idempotencyKey,
        Prefer: "return=representation",
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    let json: unknown = undefined;
    const text = await response.text();
    if (text) {
      try {
        json = JSON.parse(text);
      } catch {
        json = { raw: text };
      }
    }
    return { status: response.status, json };
  }

  async authorize(request: AuthorizeRequest): Promise<AuthorizeResult> {
    try {
      const order = await this.request(
        "POST",
        "/v2/checkout/orders",
        {
          intent: "AUTHORIZE",
          purchase_units: [
            {
              reference_id: request.orderId,
              description: request.description,
              amount: {
                currency_code: request.amount.currency,
                value: minorToDecimalString(request.amount.amountMinor),
              },
            },
          ],
        },
        `${request.idempotencyKey}:create`,
      );
      if (order.status >= 500) {
        return { status: "UNKNOWN", errorMessage: `PayPal order create ${order.status}` };
      }
      if (order.status >= 400) {
        return this.declinedFromBody(order.status, order.json);
      }
      const orderId = (order.json as { id?: string }).id;
      if (!orderId) return { status: "UNKNOWN", errorMessage: "missing order id" };

      const auth = await this.request(
        "POST",
        `/v2/checkout/orders/${orderId}/authorize`,
        {},
        `${request.idempotencyKey}:authorize`,
      );
      if (auth.status >= 500) {
        return { status: "UNKNOWN", errorMessage: `PayPal authorize ${auth.status}` };
      }
      if (auth.status >= 400) {
        return this.declinedFromBody(auth.status, auth.json);
      }
      const authorizationId = extractAuthorizationId(auth.json);
      if (!authorizationId) return { status: "UNKNOWN", errorMessage: "missing authorization id" };
      return { status: "SUCCESS", authorizationId, providerOrderId: orderId };
    } catch (error) {
      logger.warn({ err: String(error) }, "paypal authorize unknown");
      return { status: "UNKNOWN", errorMessage: String(error) };
    }
  }

  async capture(request: CaptureRequest): Promise<CaptureResult> {
    try {
      const result = await this.request(
        "POST",
        `/v2/payments/authorizations/${request.authorizationId}/capture`,
        {
          amount: {
            currency_code: request.amount.currency,
            value: minorToDecimalString(request.amount.amountMinor),
          },
        },
        request.idempotencyKey,
      );
      if (result.status >= 500) {
        return { status: "UNKNOWN", errorMessage: `PayPal capture ${result.status}` };
      }
      if (result.status >= 400) {
        return this.declinedFromBody(result.status, result.json);
      }
      const captureId = (result.json as { id?: string }).id;
      if (!captureId) return { status: "UNKNOWN", errorMessage: "missing capture id" };
      return { status: "SUCCESS", captureId };
    } catch (error) {
      logger.warn({ err: String(error) }, "paypal capture unknown");
      return { status: "UNKNOWN", errorMessage: String(error) };
    }
  }

  async void(request: VoidRequest): Promise<VoidResult> {
    try {
      const result = await this.request(
        "POST",
        `/v2/payments/authorizations/${request.authorizationId}/void`,
        {},
        request.idempotencyKey,
      );
      if (result.status >= 500)
        return { status: "UNKNOWN", errorMessage: `PayPal void ${result.status}` };
      if (result.status >= 400) return this.declinedFromBody(result.status, result.json);
      return { status: "SUCCESS" };
    } catch (error) {
      return { status: "UNKNOWN", errorMessage: String(error) };
    }
  }

  async refund(request: RefundRequest): Promise<RefundResult> {
    try {
      const result = await this.request(
        "POST",
        `/v2/payments/captures/${request.captureId}/refund`,
        {
          amount: {
            currency_code: request.amount.currency,
            value: minorToDecimalString(request.amount.amountMinor),
          },
        },
        request.idempotencyKey,
      );
      if (result.status >= 500)
        return { status: "UNKNOWN", errorMessage: `PayPal refund ${result.status}` };
      if (result.status >= 400) return this.declinedFromBody(result.status, result.json);
      return { status: "SUCCESS", refundId: (result.json as { id?: string }).id };
    } catch (error) {
      return { status: "UNKNOWN", errorMessage: String(error) };
    }
  }

  async payout(request: PayoutRequest): Promise<PayoutResult> {
    try {
      const result = await this.request(
        "POST",
        "/v1/payments/payouts",
        {
          sender_batch_header: {
            sender_batch_id: `batch_${request.idempotencyKey.slice(0, 30)}`,
            email_subject: "You received a payment on WorkPay",
            email_message: request.note ?? "Payment for verified deliverable on WorkPay",
          },
          items: [
            {
              recipient_type: "EMAIL",
              amount: {
                value: minorToDecimalString(request.amount.amountMinor),
                currency: request.amount.currency,
              },
              receiver: request.recipientEmail,
              note: request.note ?? "WorkPay verified deliverable settlement",
              sender_item_id: `item_${request.idempotencyKey.slice(0, 30)}`,
            },
          ],
        },
        request.idempotencyKey,
      );
      if (result.status >= 500) {
        return { status: "UNKNOWN", errorMessage: `PayPal payout ${result.status}` };
      }
      if (result.status >= 400) {
        return this.declinedFromBody(result.status, result.json);
      }
      const batchHeader = (result.json as { batch_header?: { payout_batch_id?: string } })?.batch_header;
      return {
        status: "SUCCESS",
        payoutBatchId: batchHeader?.payout_batch_id,
      };
    } catch (error) {
      return { status: "UNKNOWN", errorMessage: String(error) };
    }
  }

  async verifyWebhook(input: WebhookVerificationInput): Promise<WebhookVerificationResult> {
    const headers = input.headers;
    const transmissionId = headers["paypal-transmission-id"];
    const transmissionTime = headers["paypal-transmission-time"];
    const certUrl = headers["paypal-cert-url"];
    const authAlgo = headers["paypal-auth-algo"];
    const transmissionSig = headers["paypal-transmission-sig"];

    if (!transmissionId || !transmissionTime || !certUrl || !authAlgo || !transmissionSig) {
      return { verified: false, reason: "missing signature headers" };
    }

    try {
      const result = await this.request(
        "POST",
        "/v1/notifications/verify-webhook-signature",
        {
          transmission_id: transmissionId,
          transmission_time: transmissionTime,
          cert_url: certUrl,
          auth_algo: authAlgo,
          transmission_sig: transmissionSig,
          webhook_id: this.options.webhookId,
          webhook_event: JSON.parse(input.rawBody),
        },
        `webhook-verify-${transmissionId}`,
      );
      const verificationStatus = (result.json as { verification_status?: string })
        .verification_status;
      if (verificationStatus !== "SUCCESS") {
        return { verified: false, reason: `verification status ${verificationStatus}` };
      }
      const payload = JSON.parse(input.rawBody) as { id?: string; event_type?: string };
      return {
        verified: true,
        eventId: payload.id,
        eventType: payload.event_type,
        payload,
      };
    } catch (error) {
      return { verified: false, reason: String(error) };
    }
  }

  getOAuthAuthorizeUrl(params: { redirectUri: string; state: string; scope?: string }): string {
    const authBase =
      this.options.env === "live" ? "https://www.paypal.com" : "https://www.sandbox.paypal.com";
    const scope = params.scope ?? "openid profile email";
    const search = new URLSearchParams({
      client_id: this.options.clientId,
      response_type: "code",
      scope,
      redirect_uri: params.redirectUri,
      state: params.state,
    });
    return `${authBase}/signin/authorize?${search.toString()}`;
  }

  async exchangeOAuthCode(code: string, redirectUri: string): Promise<string> {
    const basic = Buffer.from(`${this.options.clientId}:${this.options.clientSecret}`).toString(
      "base64",
    );
    const bodyParams = new URLSearchParams({
      grant_type: "authorization_code",
      code,
      redirect_uri: redirectUri,
    });
    const response = await this.fetchWithTimeout(`${this.baseUrl}/v1/oauth2/token`, {
      method: "POST",
      headers: {
        Authorization: `Basic ${basic}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: bodyParams.toString(),
    });
    if (!response.ok) {
      const err = await response.text();
      throw new AppError("EXTERNAL_FAILURE", "PayPal OAuth code exchange failed", {
        details: { status: response.status, body: err },
      });
    }
    const body = (await response.json()) as { access_token: string };
    return body.access_token;
  }

  async getUserInfo(accessToken: string): Promise<PayPalUserInfo> {
    const response = await this.fetchWithTimeout(
      `${this.baseUrl}/v1/identity/oauth2/userinfo?schema=paypalv1.1`,
      {
        method: "GET",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
      },
    );
    if (!response.ok) {
      const err = await response.text();
      throw new AppError("EXTERNAL_FAILURE", "PayPal UserInfo retrieval failed", {
        details: { status: response.status, body: err },
      });
    }
    const body = (await response.json()) as {
      payer_id?: string;
      user_id?: string;
      email?: string;
      name?: string;
      verified?: boolean | string;
      verified_account?: boolean | string;
    };
    const payerId = body.payer_id ?? (body.user_id ? body.user_id.split("/").pop() ?? "" : "");
    const email = body.email ?? "";
    const isVerified =
      body.verified === true ||
      body.verified === "true" ||
      body.verified_account === true ||
      body.verified_account === "true";
    return {
      payerId,
      email,
      name: body.name,
      verifiedAccount: isVerified,
    };
  }

  private declinedFromBody(
    status: number,
    body: unknown,
  ): {
    status: "DECLINED";
    errorCode?: string;
    errorMessage?: string;
  } {
    const errorBody = (body ?? {}) as PayPalErrorBody;
    const detail = errorBody.details?.[0];
    return {
      status: "DECLINED",
      errorCode: errorBody.name ?? `HTTP_${status}`,
      errorMessage: detail?.description ?? errorBody.message ?? `PayPal returned ${status}`,
    };
  }
}

export interface PayPalUserInfo {
  payerId: string;
  email: string;
  name?: string;
  verifiedAccount?: boolean;
}


/** Convert integer minor units to the decimal string PayPal expects. */
function minorToDecimalString(amountMinor: number): string {
  const major = Math.trunc(amountMinor / 100);
  const minor = Math.abs(amountMinor % 100);
  return `${major}.${String(minor).padStart(2, "0")}`;
}

function extractAuthorizationId(body: unknown): string | undefined {
  const typed = body as {
    purchase_units?: Array<{
      payments?: { authorizations?: Array<{ id?: string }> };
    }>;
  };
  return typed.purchase_units?.[0]?.payments?.authorizations?.[0]?.id;
}
