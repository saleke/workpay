import { describe, expect, it } from "vitest";
import { envSchema } from "./env.js";

describe("environment schema", () => {
  it("allows partial optional Persona configuration without enabling the integration", () => {
    const result = envSchema.safeParse({
      DATABASE_URL: "postgres://localhost/workpay",
      AUTH_SECRET: "test-auth-secret-with-enough-length",
      PERSONA_TEMPLATE_ID: "itmpl_test_123",
      PERSONA_ENVIRONMENT_ID: "sandbox",
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.PERSONA_API_KEY).toBeUndefined();
      expect(result.data.PERSONA_WEBHOOK_SECRET).toBeUndefined();
    }
  });

  it("defaults normal-account payments to PayPal Sandbox", () => {
    const result = envSchema.safeParse({
      DATABASE_URL: "postgres://localhost/workpay",
      AUTH_SECRET: "test-auth-secret-with-enough-length",
    });

    expect(result.success).toBe(true);
    if (result.success) expect(result.data.PAYPAL_NEW_PAYMENT_MODE).toBe("PAYPAL_SANDBOX");
  });

  it("fails closed when live mode is selected without approval and full credentials", () => {
    const result = envSchema.safeParse({
      DATABASE_URL: "postgres://localhost/workpay",
      AUTH_SECRET: "test-auth-secret-with-enough-length",
      PAYPAL_NEW_PAYMENT_MODE: "PAYPAL_LIVE",
      PAYPAL_LIVE_ENABLED: false,
    });
    expect(result.success).toBe(false);
  });

  it("accepts live mode only with an explicit enable flag and independent live configuration", () => {
    const result = envSchema.safeParse({
      DATABASE_URL: "postgres://localhost/workpay",
      AUTH_SECRET: "test-auth-secret-with-enough-length",
      PAYPAL_NEW_PAYMENT_MODE: "PAYPAL_LIVE",
      PAYPAL_LIVE_ENABLED: true,
      PAYPAL_LIVE_CLIENT_ID: "live-client",
      PAYPAL_LIVE_CLIENT_SECRET: "live-secret",
      PAYPAL_LIVE_WEBHOOK_ID: "live-webhook",
      PAYPAL_LIVE_PARTNER_MERCHANT_ID: "live-partner",
      PAYPAL_LIVE_BN_CODE: "live-bn",
    });
    expect(result.success).toBe(true);
  });
});
