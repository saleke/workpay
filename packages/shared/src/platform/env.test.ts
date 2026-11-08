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

  it("rejects PayPal gateways while live money movement is disabled", () => {
    const result = envSchema.safeParse({
      DATABASE_URL: "postgres://localhost/workpay",
      AUTH_SECRET: "test-auth-secret-with-enough-length",
      PAYMENT_GATEWAY: "paypal",
      PAYPAL_ENV: "sandbox",
      PAYPAL_CLIENT_ID: "client-id",
      PAYPAL_CLIENT_SECRET: "client-secret",
    });

    expect(result.success).toBe(false);
  });
});
