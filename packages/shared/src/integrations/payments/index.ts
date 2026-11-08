/**
 * Payment gateway factory. The fake gateway is the default so tests and CI
 * never depend on PayPal being reachable.
 */
import { AppError } from "../../platform/errors.js";
import { getEnv } from "../../platform/env.js";
import { FakePayPal } from "./fake.js";
import type { PaymentGateway } from "./types.js";

let cached: PaymentGateway | null = null;

export function getPaymentGateway(): PaymentGateway {
  if (cached) return cached;
  const env = getEnv();
  if (env.PAYMENT_GATEWAY === "fake") {
    cached = new FakePayPal();
    return cached;
  }
  throw new AppError(
    "POLICY_DENIED",
    "Live PayPal is disabled while the user-led lifecycle is being validated.",
  );
}

/** Test helper: inject a specific gateway. */
export function setPaymentGateway(gateway: PaymentGateway | null): void {
  cached = gateway;
}

export function getPayPalOAuthClient(): null {
  return null;
}

export * from "./types.js";
export { FakePayPal } from "./fake.js";
export { SandboxPayPal, type PayPalUserInfo } from "./paypal.js";
