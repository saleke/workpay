/** Persisted-mode payment gateway factory. */
import { FakePayPal } from "./fake.js";
import { SandboxPayPal } from "./paypal.js";
import {
  getConfiguredNewPaymentMode,
  getPayPalConfig,
  type PaymentMode,
  type PayPalPaymentMode,
} from "./config.js";
import type { PaymentGateway } from "./types.js";

const gateways = new Map<PaymentMode, PaymentGateway>();

export function getPayPalClient(mode: PayPalPaymentMode): SandboxPayPal {
  const existing = gateways.get(mode);
  if (existing instanceof SandboxPayPal) return existing;
  const config = getPayPalConfig(mode);
  const client = new SandboxPayPal({
    clientId: config.clientId,
    clientSecret: config.clientSecret,
    webhookId: config.webhookId,
    partnerMerchantId: config.partnerMerchantId,
    bnCode: config.bnCode,
    env: config.environment === "LIVE" ? "live" : "sandbox",
    timeoutMs: config.timeoutMs,
  });
  gateways.set(mode, client);
  return client;
}

export function getPaymentGateway(mode: PaymentMode = "FAKE"): PaymentGateway {
  const existing = gateways.get(mode);
  if (existing) return existing;
  if (mode === "FAKE") {
    const fake = new FakePayPal();
    gateways.set(mode, fake);
    return fake;
  }
  return getPayPalClient(mode);
}

/** Test helper: inject a gateway for one persisted mode. */
export function setPaymentGateway(
  gateway: PaymentGateway | null,
  mode: PaymentMode = "FAKE",
): void {
  if (gateway) gateways.set(mode, gateway);
  else gateways.delete(mode);
}

export function resetPaymentGateways(): void {
  gateways.clear();
}

export function getPayPalOAuthClient(
  mode: PayPalPaymentMode = getConfiguredNewPaymentMode(),
): SandboxPayPal {
  return getPayPalClient(mode);
}

export * from "./types.js";
export * from "./config.js";
export { FakePayPal } from "./fake.js";
export { SandboxPayPal, type PayPalUserInfo } from "./paypal.js";
