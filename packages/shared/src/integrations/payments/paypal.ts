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
import { paypalRequestId } from "./idempotency.js";
import type {
  AuthorizeRequest,
  AuthorizeApprovedOrderResult,
  AuthorizeResult,
  CaptureRequest,
  CaptureResult,
  CreatePayPalOrderRequest,
  CreatePayPalOrderResult,
  MerchantIntegrationStatus,
  PaymentGateway,
  PartnerReferralRequest,
  PartnerReferralResult,
  PayPalOrderDetails,
  PayPalResourceDetails,
  RefundRequest,
  RefundResult,
  VoidRequest,
  VoidResult,
  WebhookVerificationInput,
  WebhookVerificationResult,
} from "./types.js";

export interface PayPalOptions {
  clientId: string;
  clientSecret: string;
  webhookId?: string;
  env: "sandbox" | "live";
  partnerMerchantId?: string;
  bnCode?: string;
  timeoutMs?: number;
  fetchImpl?: typeof fetch;
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
      return await (this.options.fetchImpl ?? fetch)(url, { ...init, signal: controller.signal });
    } finally {
      clearTimeout(timeout);
    }
  }

  private async request(
    method: string,
    path: string,
    body: unknown,
    idempotencyKey: string,
    extraHeaders: Record<string, string> = {},
  ): Promise<{ status: number; json: unknown }> {
    const token = await this.getAccessToken();
    const response = await this.fetchWithTimeout(`${this.baseUrl}${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        "PayPal-Request-Id": idempotencyKey,
        Prefer: "return=representation",
        ...extraHeaders,
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

  private partnerHeaders(merchantId?: string): Record<string, string> {
    const headers: Record<string, string> = {};
    if (this.options.bnCode) headers["PayPal-Partner-Attribution-Id"] = this.options.bnCode;
    if (merchantId) {
      const encode = (value: object) =>
        Buffer.from(JSON.stringify(value)).toString("base64url").replace(/=+$/g, "");
      headers["PayPal-Auth-Assertion"] = `${encode({ alg: "none" })}.${encode({
        iss: this.options.clientId,
        payer_id: merchantId,
      })}.`;
    }
    return headers;
  }

  async createOrder(request: CreatePayPalOrderRequest): Promise<CreatePayPalOrderResult> {
    try {
      const result = await this.request(
        "POST",
        "/v2/checkout/orders",
        {
          intent: "AUTHORIZE",
          purchase_units: [
            {
              reference_id: request.localOrderId,
              custom_id: request.paymentId,
              invoice_id: request.localOrderId,
              description: request.description,
              payee: { merchant_id: request.payeeMerchantId },
              amount: {
                currency_code: request.amount.currency,
                value: minorToDecimalString(request.amount.amountMinor),
              },
            },
          ],
          payment_source: {
            paypal: {
              experience_context: {
                return_url: request.returnUrl,
                cancel_url: request.cancelUrl,
                user_action: "PAY_NOW",
                shipping_preference: "NO_SHIPPING",
              },
            },
          },
        },
        request.idempotencyKey,
        this.partnerHeaders(request.payeeMerchantId),
      );
      if (result.status >= 400) {
        return this.mutationFailure("order create", result.status, result.json);
      }
      const body = result.json as {
        id?: string;
        status?: string;
        links?: Array<{ rel?: string; href?: string }>;
      };
      const approvalUrl = body.links?.find(
        (link) => link.rel === "payer-action" || link.rel === "approve",
      )?.href;
      if (!body.id || !approvalUrl) {
        return { status: "UNKNOWN", errorMessage: "PayPal order response omitted approval data" };
      }
      const safeApprovalUrl = this.requirePayPalWebUrl(approvalUrl, "approval");
      return {
        status: "SUCCESS",
        orderId: body.id,
        approvalUrl: safeApprovalUrl,
        providerStatus: body.status,
      };
    } catch (error) {
      logger.warn({ err: String(error) }, "paypal order creation unknown");
      return { status: "UNKNOWN", errorMessage: String(error) };
    }
  }

  async getOrder(orderId: string, payeeMerchantId?: string): Promise<PayPalOrderDetails> {
    const result = await this.request(
      "GET",
      `/v2/checkout/orders/${encodeURIComponent(orderId)}`,
      undefined,
      paypalRequestId("paypal-order-get", orderId),
      this.partnerHeaders(payeeMerchantId),
    );
    if (result.status >= 400) {
      throw new AppError("EXTERNAL_FAILURE", "PayPal order retrieval failed", {
        details: { status: result.status },
      });
    }
    return parseOrderDetails(result.json);
  }

  async authorizeApprovedOrder(input: {
    orderId: string;
    payeeMerchantId: string;
    idempotencyKey: string;
  }): Promise<AuthorizeApprovedOrderResult> {
    try {
      const result = await this.request(
        "POST",
        `/v2/checkout/orders/${encodeURIComponent(input.orderId)}/authorize`,
        {},
        input.idempotencyKey,
        this.partnerHeaders(input.payeeMerchantId),
      );
      if (result.status >= 400) {
        return this.mutationFailure("authorization", result.status, result.json);
      }
      const details = parseOrderDetails(result.json);
      if (
        details.status !== "COMPLETED" ||
        !details.authorizationId ||
        details.authorizationStatus !== "CREATED" ||
        !details.authorizationExpiresAt
      ) {
        return {
          status: "UNKNOWN",
          errorMessage: "PayPal authorization response was incomplete or non-final",
        };
      }
      return {
        status: "SUCCESS",
        authorizationId: details.authorizationId,
        providerOrderId: details.id,
        providerStatus: details.status,
        ...(details.amount ? { amount: details.amount } : {}),
        ...(details.payerId ? { payerId: details.payerId } : {}),
        ...(details.payeeMerchantId ? { payeeMerchantId: details.payeeMerchantId } : {}),
        ...(details.referenceId ? { referenceId: details.referenceId } : {}),
        ...(details.customId ? { customId: details.customId } : {}),
        ...(details.invoiceId ? { invoiceId: details.invoiceId } : {}),
        authorizationStatus: details.authorizationStatus,
        authorizationExpiresAt: details.authorizationExpiresAt,
      };
    } catch (error) {
      return { status: "UNKNOWN", errorMessage: String(error) };
    }
  }

  async getAuthorization(
    authorizationId: string,
    payeeMerchantId: string,
  ): Promise<PayPalResourceDetails> {
    return this.getPaymentResource("authorizations", authorizationId, payeeMerchantId);
  }

  async getCapture(captureId: string, payeeMerchantId: string): Promise<PayPalResourceDetails> {
    return this.getPaymentResource("captures", captureId, payeeMerchantId);
  }

  private async getPaymentResource(
    kind: "authorizations" | "captures",
    id: string,
    payeeMerchantId: string,
  ): Promise<PayPalResourceDetails> {
    const result = await this.request(
      "GET",
      `/v2/payments/${kind}/${encodeURIComponent(id)}`,
      undefined,
      paypalRequestId(`paypal-${kind}-get`, id),
      this.partnerHeaders(payeeMerchantId),
    );
    if (result.status >= 400) {
      throw new AppError("EXTERNAL_FAILURE", `PayPal ${kind} retrieval failed`, {
        details: { status: result.status },
      });
    }
    return parseResourceDetails(result.json);
  }

  async createPartnerReferral(request: PartnerReferralRequest): Promise<PartnerReferralResult> {
    if (!this.options.partnerMerchantId) {
      throw new AppError("VALIDATION_ERROR", "PayPal partner merchant ID is not configured.");
    }
    const result = await this.request(
      "POST",
      "/v2/customer/partner-referrals",
      {
        tracking_id: request.trackingId,
        operations: [
          {
            operation: "API_INTEGRATION",
            api_integration_preference: {
              rest_api_integration: {
                integration_method: "PAYPAL",
                integration_type: "THIRD_PARTY",
                third_party_details: { features: ["PAYMENT", "REFUND"] },
              },
            },
          },
        ],
        products: ["PPCP"],
        legal_consents: [{ type: "SHARE_DATA_CONSENT", granted: true }],
        partner_config_override: {
          return_url: request.returnUrl,
          return_url_description: "Return to Tenfo",
        },
      },
      request.idempotencyKey,
      this.partnerHeaders(),
    );
    if (result.status >= 400) {
      const declined = this.declinedFromBody(result.status, result.json);
      throw new AppError("EXTERNAL_FAILURE", declined.errorMessage ?? "PayPal onboarding failed", {
        details: { code: declined.errorCode, status: result.status },
      });
    }
    const body = result.json as {
      id?: string;
      links?: Array<{ rel?: string; href?: string }>;
    };
    const actionUrl = body.links?.find((link) => link.rel === "action_url")?.href;
    const selfUrl = body.links?.find((link) => link.rel === "self")?.href;
    const safeActionUrl = actionUrl ? this.requirePayPalWebUrl(actionUrl, "onboarding") : null;
    const referralId = body.id ?? (selfUrl ? this.referralIdFromSelfUrl(selfUrl) : null);
    if (!referralId || !safeActionUrl) {
      throw new AppError("EXTERNAL_UNKNOWN", "PayPal onboarding response was incomplete.");
    }
    return { referralId, actionUrl: safeActionUrl };
  }

  async getMerchantIntegration(merchantId: string): Promise<MerchantIntegrationStatus> {
    if (!this.options.partnerMerchantId) {
      throw new AppError("VALIDATION_ERROR", "PayPal partner merchant ID is not configured.");
    }
    const result = await this.request(
      "GET",
      `/v1/customer/partners/${encodeURIComponent(this.options.partnerMerchantId)}/merchant-integrations/${encodeURIComponent(merchantId)}`,
      undefined,
      paypalRequestId("paypal-merchant-status", merchantId),
      this.partnerHeaders(),
    );
    if (result.status >= 400) {
      throw new AppError("EXTERNAL_FAILURE", "PayPal merchant status retrieval failed", {
        details: { status: result.status },
      });
    }
    const body = result.json as {
      merchant_id?: string;
      tracking_id?: string;
      payments_receivable?: boolean;
      primary_email_confirmed?: boolean;
      products?: Array<{ name?: string; vetting_status?: string }>;
      oauth_integrations?: Array<{
        oauth_third_party?: Array<{
          partner_client_id?: string;
          merchant_client_id?: string;
          scopes?: string[];
        }>;
      }>;
    };
    const products = (body.products ?? []).map((product) =>
      [product.name, product.vetting_status].filter(Boolean).join(":"),
    );
    const currentIntegrations = (body.oauth_integrations ?? []).flatMap((integration) =>
      (integration.oauth_third_party ?? []).filter(
        (oauth) => oauth.partner_client_id === this.options.clientId,
      ),
    );
    const permissions = [...new Set(currentIntegrations.flatMap((oauth) => oauth.scopes ?? []))];
    const productReady = (body.products ?? []).some(
      (product) =>
        product.name === "PPCP" &&
        ["SUBSCRIBED", "APPROVED", "ACTIVE"].includes(product.vetting_status ?? ""),
    );
    const oauthIntegrationReady =
      currentIntegrations.length > 0 &&
      permissions.some((scope) => scope.includes("/payments/payment/authcapture"));
    if (!body.merchant_id || body.merchant_id !== merchantId) {
      throw new AppError("EXTERNAL_UNKNOWN", "PayPal merchant status omitted or changed its ID.");
    }
    return {
      merchantId: body.merchant_id,
      trackingId: body.tracking_id ?? null,
      paymentsReceivable: body.payments_receivable === true,
      primaryEmailConfirmed: body.primary_email_confirmed === true,
      consentStatus: oauthIntegrationReady,
      productReady,
      oauthIntegrationReady,
      products,
      permissions,
    };
  }

  async authorize(request: AuthorizeRequest): Promise<AuthorizeResult> {
    return {
      status: "DECLINED",
      errorCode: "PAYER_APPROVAL_REQUIRED",
      errorMessage: `Create and approve PayPal order ${request.orderId} before authorization.`,
    };
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
          final_capture: true,
        },
        request.idempotencyKey,
        this.partnerHeaders(request.payeeMerchantId),
      );
      if (result.status >= 400) {
        return this.mutationFailure("capture", result.status, result.json);
      }
      const capture = parseResourceDetails(result.json);
      const captureId = capture.id;
      if (!captureId) return { status: "UNKNOWN", errorMessage: "missing capture id" };
      const common = {
        captureId,
        providerStatus: capture.status,
        ...(capture.amount ? { amount: capture.amount } : {}),
        ...(capture.payeeMerchantId ? { payeeMerchantId: capture.payeeMerchantId } : {}),
        ...(capture.orderId ? { orderId: capture.orderId } : {}),
        ...(capture.authorizationId ? { authorizationId: capture.authorizationId } : {}),
      };
      if (
        capture.status !== "COMPLETED" ||
        capture.amount?.amountMinor !== request.amount.amountMinor ||
        capture.amount.currency !== request.amount.currency ||
        capture.authorizationId !== request.authorizationId ||
        (capture.payeeMerchantId !== null &&
          request.payeeMerchantId !== undefined &&
          capture.payeeMerchantId !== request.payeeMerchantId)
      ) {
        return {
          status: "UNKNOWN",
          ...common,
          errorCode: "CAPTURE_BINDING_UNCONFIRMED",
          errorMessage: `PayPal capture response was not economically final (${capture.status})`,
        };
      }
      return { status: "SUCCESS", ...common };
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
        this.partnerHeaders(request.payeeMerchantId),
      );
      if (result.status >= 400) return this.mutationFailure("void", result.status, result.json);
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
        this.partnerHeaders(request.payeeMerchantId),
      );
      if (result.status >= 400) return this.mutationFailure("refund", result.status, result.json);
      return { status: "SUCCESS", refundId: (result.json as { id?: string }).id };
    } catch (error) {
      return { status: "UNKNOWN", errorMessage: String(error) };
    }
  }

  async verifyWebhook(input: WebhookVerificationInput): Promise<WebhookVerificationResult> {
    if (!this.options.webhookId) {
      return {
        status: "UNKNOWN",
        verified: false,
        reason: "paypal webhook id is not configured",
      };
    }

    const headers = input.headers;
    const transmissionId = headers["paypal-transmission-id"];
    const transmissionTime = headers["paypal-transmission-time"];
    const certUrl = headers["paypal-cert-url"];
    const authAlgo = headers["paypal-auth-algo"];
    const transmissionSig = headers["paypal-transmission-sig"];

    if (!transmissionId || !transmissionTime || !certUrl || !authAlgo || !transmissionSig) {
      return { status: "INVALID", verified: false, reason: "missing signature headers" };
    }
    let payload: { id?: string; event_type?: string };
    try {
      payload = JSON.parse(input.rawBody) as { id?: string; event_type?: string };
    } catch {
      return { status: "INVALID", verified: false, reason: "invalid webhook JSON" };
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
          webhook_event: payload,
        },
        paypalRequestId("webhook-verify", transmissionId),
      );
      if (
        result.status === 408 ||
        result.status === 409 ||
        result.status === 429 ||
        result.status >= 500
      ) {
        return {
          status: "UNKNOWN",
          verified: false,
          reason: `PayPal verification was unavailable (${result.status})`,
        };
      }
      if (result.status >= 400) {
        return {
          status: "INVALID",
          verified: false,
          reason: `PayPal rejected verification (${result.status})`,
        };
      }
      const verificationStatus = (result.json as { verification_status?: string })
        .verification_status;
      if (verificationStatus !== "SUCCESS") {
        return {
          status: "INVALID",
          verified: false,
          reason: `verification status ${verificationStatus}`,
        };
      }
      return {
        status: "VERIFIED",
        verified: true,
        eventId: payload.id,
        eventType: payload.event_type,
        payload,
      };
    } catch (error) {
      return { status: "UNKNOWN", verified: false, reason: String(error) };
    }
  }

  getOAuthAuthorizeUrl(params: { redirectUri: string; state: string; scope?: string }): string {
    const authBase =
      this.options.env === "live" ? "https://www.paypal.com" : "https://www.sandbox.paypal.com";
    const scope = params.scope ?? "openid profile email";
    const search = new URLSearchParams({
      flowEntry: "static",
      client_id: this.options.clientId,
      response_type: "code",
      scope,
      redirect_uri: params.redirectUri,
      state: params.state,
    });
    return `${authBase}/connect?${search.toString()}`;
  }

  async exchangeOAuthCodeForTokens(
    code: string,
    redirectUri: string,
  ): Promise<{ accessToken: string; refreshToken?: string; scope: string[] }> {
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
    const body = (await response.json()) as {
      access_token: string;
      refresh_token?: string;
      scope?: string;
    };
    return {
      accessToken: body.access_token,
      ...(body.refresh_token ? { refreshToken: body.refresh_token } : {}),
      scope: body.scope?.split(/\s+/).filter(Boolean) ?? [],
    };
  }

  async exchangeOAuthCode(code: string, redirectUri: string): Promise<string> {
    return (await this.exchangeOAuthCodeForTokens(code, redirectUri)).accessToken;
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
      email_verified?: boolean | string;
    };
    const payerId = body.payer_id ?? (body.user_id ? (body.user_id.split("/").pop() ?? "") : "");
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
      emailVerified: body.email_verified === true || body.email_verified === "true",
    };
  }

  private mutationFailure(
    operation: string,
    status: number,
    body: unknown,
  ): {
    status: "DECLINED" | "UNKNOWN";
    errorCode?: string;
    errorMessage?: string;
  } {
    const errorBody = (body ?? {}) as PayPalErrorBody;
    const issues = [errorBody.name, ...(errorBody.details ?? []).map((detail) => detail.issue)].filter(
      (issue): issue is string => Boolean(issue),
    );
    const ambiguous =
      status === 408 ||
      status === 429 ||
      status >= 500 ||
      (status === 409 &&
        issues.some((issue) =>
          ["PREVIOUS_REQUEST_IN_PROGRESS", "OPERATION_IN_PROGRESS"].includes(issue),
        ));
    const declined = this.declinedFromBody(status, body);
    if (!ambiguous) return declined;
    return {
      status: "UNKNOWN",
      errorCode: declined.errorCode,
      errorMessage: declined.errorMessage ?? `PayPal ${operation} outcome is unknown (${status})`,
    };
  }

  private requirePayPalWebUrl(value: string, purpose: string): string {
    let url: URL;
    try {
      url = new URL(value);
    } catch {
      throw new AppError("EXTERNAL_UNKNOWN", `PayPal ${purpose} URL was invalid.`);
    }
    const expectedHost =
      this.options.env === "live" ? "www.paypal.com" : "www.sandbox.paypal.com";
    if (url.protocol !== "https:" || url.hostname !== expectedHost || url.username || url.password) {
      throw new AppError("EXTERNAL_UNKNOWN", `PayPal ${purpose} URL used an unexpected origin.`);
    }
    return url.toString();
  }

  private referralIdFromSelfUrl(value: string): string | null {
    let url: URL;
    try {
      url = new URL(value);
    } catch {
      return null;
    }
    if (url.protocol !== "https:" || url.origin !== this.baseUrl || url.username || url.password) {
      return null;
    }
    const segments = url.pathname.split("/").filter(Boolean);
    const referralId = segments.at(-1);
    return referralId && /^[A-Za-z0-9_-]{1,128}$/.test(referralId) ? referralId : null;
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
  emailVerified?: boolean;
}

/** Convert integer minor units to the decimal string PayPal expects. */
function minorToDecimalString(amountMinor: number): string {
  const major = Math.trunc(amountMinor / 100);
  const minor = Math.abs(amountMinor % 100);
  return `${major}.${String(minor).padStart(2, "0")}`;
}

function parseProviderMoney(value: unknown): import("../../platform/money.js").Money | null {
  const amount = value as { value?: string; currency_code?: string } | undefined;
  if (!amount?.value || amount.currency_code !== "USD") return null;
  const match = amount.value.match(/^(\d+)\.(\d{2})$/);
  if (!match) return null;
  const amountMinor = Number(match[1]) * 100 + Number(match[2]);
  if (!Number.isSafeInteger(amountMinor)) return null;
  return { amountMinor, currency: "USD" };
}

function parseOrderDetails(body: unknown): PayPalOrderDetails {
  const typed = body as {
    id?: string;
    status?: string;
    payer?: { payer_id?: string };
    purchase_units?: Array<{
      reference_id?: string;
      custom_id?: string;
      invoice_id?: string;
      payee?: { merchant_id?: string };
      amount?: unknown;
      payments?: {
        authorizations?: Array<{
          id?: string;
          status?: string;
          expiration_time?: string;
          amount?: unknown;
        }>;
        captures?: Array<{ id?: string; status?: string; amount?: unknown }>;
      };
    }>;
  };
  if (!typed.id || !typed.status) {
    throw new AppError("EXTERNAL_UNKNOWN", "PayPal order response omitted identity or status.");
  }
  const unit = typed.purchase_units?.[0];
  const authorization = unit?.payments?.authorizations?.[0];
  const capture = unit?.payments?.captures?.[0];
  return {
    id: typed.id,
    status: typed.status,
    payerId: typed.payer?.payer_id ?? null,
    payeeMerchantId: unit?.payee?.merchant_id ?? null,
    referenceId: unit?.reference_id ?? null,
    customId: unit?.custom_id ?? null,
    invoiceId: unit?.invoice_id ?? null,
    amount: parseProviderMoney(authorization?.amount ?? unit?.amount),
    authorizationId: authorization?.id ?? null,
    authorizationStatus: authorization?.status ?? null,
    authorizationExpiresAt: parseProviderDate(authorization?.expiration_time),
    captureId: capture?.id ?? null,
    captureStatus: capture?.status ?? null,
  };
}

function parseResourceDetails(body: unknown): PayPalResourceDetails {
  const typed = body as {
    id?: string;
    status?: string;
    amount?: unknown;
    payee?: { merchant_id?: string };
    expiration_time?: string;
    supplementary_data?: {
      related_ids?: { order_id?: string; authorization_id?: string };
    };
  };
  if (!typed.id || !typed.status) {
    throw new AppError("EXTERNAL_UNKNOWN", "PayPal resource response omitted identity or status.");
  }
  return {
    id: typed.id,
    status: typed.status,
    amount: parseProviderMoney(typed.amount),
    orderId: typed.supplementary_data?.related_ids?.order_id ?? null,
    authorizationId: typed.supplementary_data?.related_ids?.authorization_id ?? null,
    payeeMerchantId: typed.payee?.merchant_id ?? null,
    expiresAt: parseProviderDate(typed.expiration_time),
  };
}

function parseProviderDate(value: string | undefined): Date | null {
  if (!value) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}
