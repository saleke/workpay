/**
 * Payment gateway factory. The fake gateway is the default so tests and CI
 * never depend on PayPal being reachable.
 */
import { AppError } from "../../platform/errors.js";
import { getEnv } from "../../platform/env.js";
import { FakePayPal } from "./fake.js";
import { SandboxPayPal } from "./paypal.js";
import type { PaymentGateway } from "./types.js";

let cached: PaymentGateway | null = null;

export function getPaymentGateway(): PaymentGateway {
  if (cached) return cached;
  const env = getEnv();
  if (env.PAYMENT_GATEWAY === "fake") {
    cached = new FakePayPal();
    return cached;
  }
  if (!env.PAYPAL_CLIENT_ID || !env.PAYPAL_CLIENT_SECRET || !env.PAYPAL_WEBHOOK_ID) {
    throw new AppError(
      "VALIDATION_ERROR",
      "PayPal credentials are required when PAYMENT_GATEWAY=paypal",
    );
  }
  cached = new SandboxPayPal({
    clientId: env.PAYPAL_CLIENT_ID,
    clientSecret: env.PAYPAL_CLIENT_SECRET,
    webhookId: env.PAYPAL_WEBHOOK_ID,
    env: env.PAYPAL_ENV,
  });
  return cached;
}

/** Test helper: inject a specific gateway. */
export function setPaymentGateway(gateway: PaymentGateway | null): void {
  cached = gateway;
}

export function getPayPalOAuthClient(): SandboxPayPal | null {
  const env = getEnv();
  if (!env.PAYPAL_CLIENT_ID || !env.PAYPAL_CLIENT_SECRET) {
    return null;
  }
  return new SandboxPayPal({
    clientId: env.PAYPAL_CLIENT_ID,
    clientSecret: env.PAYPAL_CLIENT_SECRET,
    webhookId: env.PAYPAL_WEBHOOK_ID ?? "noop-webhook-id",
    env: env.PAYPAL_ENV,
  });
}

export * from "./types.js";
export { FakePayPal } from "./fake.js";
export { SandboxPayPal, type PayPalUserInfo } from "./paypal.js";

