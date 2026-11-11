import { describe, expect, it } from "vitest";
import { SandboxPayPal } from "./paypal.js";

function response(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function client(fetchImpl: typeof fetch) {
  return new SandboxPayPal({
    clientId: "client-id",
    clientSecret: "client-secret",
    webhookId: "webhook-id",
    partnerMerchantId: "PARTNER123",
    bnCode: "TENFO_BN",
    env: "sandbox",
    fetchImpl,
  });
}

describe("PayPal Orders gateway", () => {
  it("builds the current Log in with PayPal authorization URL", () => {
    const paypal = client((async () => response(500, {})) as typeof fetch);
    const authorizeUrl = new URL(
      paypal.getOAuthAuthorizeUrl({
        redirectUri: "https://tenfo.example/api/v1/user/paypal/callback",
        state: "state-token",
        scope: "openid profile email https://uri.paypal.com/services/paypalattributes",
      }),
    );
    expect(authorizeUrl.origin).toBe("https://www.sandbox.paypal.com");
    expect(authorizeUrl.pathname).toBe("/connect");
    expect(authorizeUrl.searchParams.get("flowEntry")).toBe("static");
    expect(authorizeUrl.searchParams.get("client_id")).toBe("client-id");
    expect(authorizeUrl.searchParams.get("redirect_uri")).toBe(
      "https://tenfo.example/api/v1/user/paypal/callback",
    );
  });

  it("creates an AUTHORIZE order for the explicit seller and returns payer approval", async () => {
    const calls: Array<{ url: string; init?: RequestInit }> = [];
    const fetchImpl = (async (url: string | URL | Request, init?: RequestInit) => {
      calls.push({ url: String(url), init });
      if (String(url).endsWith("/v1/oauth2/token")) {
        return response(200, { access_token: "token", expires_in: 3600 });
      }
      return response(201, {
        id: "ORDER123",
        status: "CREATED",
        links: [
          { rel: "payer-action", href: "https://www.sandbox.paypal.com/approve/ORDER123" },
        ],
      });
    }) as typeof fetch;
    const result = await client(fetchImpl).createOrder({
      localOrderId: "porder_1",
      paymentId: "pay_1",
      amount: { amountMinor: 1234, currency: "USD" },
      description: "Approved work",
      payeeMerchantId: "SELLER123",
      returnUrl: "https://tenfo.test/return",
      cancelUrl: "https://tenfo.test/cancel",
      idempotencyKey: "request-1",
    });
    expect(result).toMatchObject({
      status: "SUCCESS",
      orderId: "ORDER123",
      approvalUrl: "https://www.sandbox.paypal.com/approve/ORDER123",
    });
    const orderCall = calls.at(-1)!;
    const body = JSON.parse(String(orderCall.init?.body));
    expect(body.intent).toBe("AUTHORIZE");
    expect(body.purchase_units[0]).toMatchObject({
      reference_id: "porder_1",
      custom_id: "pay_1",
      payee: { merchant_id: "SELLER123" },
      amount: { currency_code: "USD", value: "12.34" },
    });
    const headers = orderCall.init?.headers as Record<string, string>;
    expect(headers["PayPal-Partner-Attribution-Id"]).toBe("TENFO_BN");
    expect(headers["PayPal-Auth-Assertion"]).toContain(".");
  });

  it("does not allow the legacy authorize method to bypass buyer approval", async () => {
    const result = await client((async () => response(500, {})) as typeof fetch).authorize({
      orderId: "order",
      amount: { amountMinor: 100, currency: "USD" },
      description: "test",
      idempotencyKey: "key",
    });
    expect(result).toMatchObject({ status: "DECLINED", errorCode: "PAYER_APPROVAL_REQUIRED" });
  });

  it("treats a non-COMPLETED capture as unknown for reconciliation", async () => {
    const fetchImpl = (async (url: string | URL | Request) => {
      if (String(url).endsWith("/v1/oauth2/token")) {
        return response(200, { access_token: "token", expires_in: 3600 });
      }
      return response(201, { id: "CAP123", status: "PENDING" });
    }) as typeof fetch;
    const result = await client(fetchImpl).capture({
      authorizationId: "AUTH123",
      amount: { amountMinor: 100, currency: "USD" },
      idempotencyKey: "capture-key",
      payeeMerchantId: "SELLER123",
    });
    expect(result).toMatchObject({ status: "UNKNOWN", captureId: "CAP123" });
  });

  it("classifies an in-progress idempotent request as unknown", async () => {
    const fetchImpl = (async (url: string | URL | Request) => {
      if (String(url).endsWith("/v1/oauth2/token")) {
        return response(200, { access_token: "token", expires_in: 3600 });
      }
      return response(409, {
        name: "RESOURCE_CONFLICT",
        details: [{ issue: "PREVIOUS_REQUEST_IN_PROGRESS", description: "Still processing" }],
      });
    }) as typeof fetch;
    const result = await client(fetchImpl).createOrder({
      localOrderId: "porder_1",
      paymentId: "pay_1",
      amount: { amountMinor: 100, currency: "USD" },
      description: "Work",
      payeeMerchantId: "SELLER123",
      returnUrl: "https://tenfo.test/return",
      cancelUrl: "https://tenfo.test/cancel",
      idempotencyKey: "request-409",
    });
    expect(result).toMatchObject({
      status: "UNKNOWN",
      errorCode: "RESOURCE_CONFLICT",
      errorMessage: "Still processing",
    });
  });

  it("requires a final CREATED authorization with provider expiry and binding data", async () => {
    const expiresAt = "2026-12-01T00:00:00Z";
    const fetchImpl = (async (url: string | URL | Request) => {
      if (String(url).endsWith("/v1/oauth2/token")) {
        return response(200, { access_token: "token", expires_in: 3600 });
      }
      return response(201, {
        id: "ORDER123",
        status: "COMPLETED",
        payer: { payer_id: "PAYER123" },
        purchase_units: [
          {
            reference_id: "porder_1",
            custom_id: "pay_1",
            invoice_id: "porder_1",
            payee: { merchant_id: "SELLER123" },
            payments: {
              authorizations: [
                {
                  id: "AUTH123",
                  status: "CREATED",
                  expiration_time: expiresAt,
                  amount: { currency_code: "USD", value: "12.34" },
                },
              ],
            },
          },
        ],
      });
    }) as typeof fetch;
    const result = await client(fetchImpl).authorizeApprovedOrder({
      orderId: "ORDER123",
      payeeMerchantId: "SELLER123",
      idempotencyKey: "authorize-1",
    });
    expect(result).toMatchObject({
      status: "SUCCESS",
      authorizationId: "AUTH123",
      authorizationStatus: "CREATED",
      referenceId: "porder_1",
      customId: "pay_1",
      invoiceId: "porder_1",
    });
    expect(result.authorizationExpiresAt?.toISOString()).toBe("2026-12-01T00:00:00.000Z");
  });

  it("sends a final capture and validates its economic relationship", async () => {
    let captureBody: Record<string, unknown> | null = null;
    const fetchImpl = (async (url: string | URL | Request, init?: RequestInit) => {
      if (String(url).endsWith("/v1/oauth2/token")) {
        return response(200, { access_token: "token", expires_in: 3600 });
      }
      captureBody = JSON.parse(String(init?.body));
      return response(201, {
        id: "CAP123",
        status: "COMPLETED",
        amount: { currency_code: "USD", value: "12.34" },
        payee: { merchant_id: "SELLER123" },
        supplementary_data: {
          related_ids: { order_id: "ORDER123", authorization_id: "AUTH123" },
        },
      });
    }) as typeof fetch;
    const result = await client(fetchImpl).capture({
      authorizationId: "AUTH123",
      amount: { amountMinor: 1234, currency: "USD" },
      idempotencyKey: "capture-final",
      payeeMerchantId: "SELLER123",
    });
    expect(captureBody).toMatchObject({ final_capture: true });
    expect(result).toMatchObject({
      status: "SUCCESS",
      captureId: "CAP123",
      orderId: "ORDER123",
      authorizationId: "AUTH123",
      payeeMerchantId: "SELLER123",
      amount: { amountMinor: 1234, currency: "USD" },
    });
  });

  it("accepts the documented links-only partner referral response", async () => {
    const fetchImpl = (async (url: string | URL | Request) => {
      if (String(url).endsWith("/v1/oauth2/token")) {
        return response(200, { access_token: "token", expires_in: 3600 });
      }
      return response(201, {
        links: [
          {
            rel: "self",
            href: "https://api-m.sandbox.paypal.com/v2/customer/partner-referrals/REF123",
          },
          {
            rel: "action_url",
            href: "https://www.sandbox.paypal.com/bizsignup/partner/entry?token=REF123",
          },
        ],
      });
    }) as typeof fetch;
    await expect(
      client(fetchImpl).createPartnerReferral({
        trackingId: "tracking-1",
        returnUrl: "https://tenfo.test/return",
        idempotencyKey: "referral-1",
      }),
    ).resolves.toEqual({
      referralId: "REF123",
      actionUrl: "https://www.sandbox.paypal.com/bizsignup/partner/entry?token=REF123",
    });
  });

  it("derives seller consent from this partner's PPCP product and OAuth grant", async () => {
    const fetchImpl = (async (url: string | URL | Request) => {
      if (String(url).endsWith("/v1/oauth2/token")) {
        return response(200, { access_token: "token", expires_in: 3600 });
      }
      return response(200, {
        merchant_id: "SELLER123",
        tracking_id: "tracking-1",
        payments_receivable: true,
        primary_email_confirmed: true,
        products: [{ name: "PPCP", vetting_status: "SUBSCRIBED" }],
        oauth_integrations: [
          {
            oauth_third_party: [
              {
                partner_client_id: "client-id",
                merchant_client_id: "merchant-client",
                scopes: ["https://uri.paypal.com/services/payments/payment/authcapture"],
              },
            ],
          },
        ],
      });
    }) as typeof fetch;
    await expect(client(fetchImpl).getMerchantIntegration("SELLER123")).resolves.toMatchObject({
      merchantId: "SELLER123",
      consentStatus: true,
      productReady: true,
      oauthIntegrationReady: true,
    });
  });

  it("reports webhook verification outages as unknown, not invalid signatures", async () => {
    const fetchImpl = (async (url: string | URL | Request) => {
      if (String(url).endsWith("/v1/oauth2/token")) {
        return response(200, { access_token: "token", expires_in: 3600 });
      }
      return response(503, { name: "SERVICE_UNAVAILABLE" });
    }) as typeof fetch;
    const result = await client(fetchImpl).verifyWebhook({
      headers: {
        "paypal-transmission-id": "transmission-1",
        "paypal-transmission-time": "2026-11-09T00:00:00Z",
        "paypal-cert-url": "https://api.paypal.com/cert.pem",
        "paypal-auth-algo": "SHA256withRSA",
        "paypal-transmission-sig": "signature",
      },
      rawBody: JSON.stringify({ id: "WH123", event_type: "PAYMENT.CAPTURE.COMPLETED" }),
    });
    expect(result).toMatchObject({ status: "UNKNOWN", verified: false });
  });

  it("rejects provider links from an unexpected origin", async () => {
    const fetchImpl = (async (url: string | URL | Request) => {
      if (String(url).endsWith("/v1/oauth2/token")) {
        return response(200, { access_token: "token", expires_in: 3600 });
      }
      return response(201, {
        id: "ORDER123",
        links: [{ rel: "payer-action", href: "https://evil.test/approve" }],
      });
    }) as typeof fetch;
    const result = await client(fetchImpl).createOrder({
      localOrderId: "porder_1",
      paymentId: "pay_1",
      amount: { amountMinor: 100, currency: "USD" },
      description: "Work",
      payeeMerchantId: "SELLER123",
      returnUrl: "https://tenfo.test/return",
      cancelUrl: "https://tenfo.test/cancel",
      idempotencyKey: "bad-link",
    });
    expect(result.status).toBe("UNKNOWN");
  });
});
