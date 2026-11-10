import { AppError } from "../../platform/errors.js";
import { getEnv } from "../../platform/env.js";

export type PaymentMode = "FAKE" | "PAYPAL_SANDBOX" | "PAYPAL_LIVE";
export type PayPalPaymentMode = Exclude<PaymentMode, "FAKE">;
export type PayPalEnvironment = "SANDBOX" | "LIVE";

export interface PayPalConfig {
  mode: PayPalPaymentMode;
  environment: PayPalEnvironment;
  clientId: string;
  clientSecret: string;
  webhookId: string;
  partnerMerchantId: string;
  bnCode: string;
  timeoutMs: number;
}

export function isPayPalMode(mode: PaymentMode): mode is PayPalPaymentMode {
  return mode === "PAYPAL_SANDBOX" || mode === "PAYPAL_LIVE";
}

export function paymentModeEnvironment(mode: PayPalPaymentMode): PayPalEnvironment {
  return mode === "PAYPAL_LIVE" ? "LIVE" : "SANDBOX";
}

export function getConfiguredNewPaymentMode(): PayPalPaymentMode {
  return getEnv().PAYPAL_NEW_PAYMENT_MODE;
}

export function getPayPalConfig(mode: PayPalPaymentMode): PayPalConfig {
  const env = getEnv();
  const live = mode === "PAYPAL_LIVE";
  if (live && !env.PAYPAL_LIVE_ENABLED) {
    throw new AppError("POLICY_DENIED", "Live PayPal payments are not enabled.");
  }
  const clientId = live ? env.PAYPAL_LIVE_CLIENT_ID : env.PAYPAL_SANDBOX_CLIENT_ID;
  const clientSecret = live ? env.PAYPAL_LIVE_CLIENT_SECRET : env.PAYPAL_SANDBOX_CLIENT_SECRET;
  const webhookId = live ? env.PAYPAL_LIVE_WEBHOOK_ID : env.PAYPAL_SANDBOX_WEBHOOK_ID;
  const partnerMerchantId = live
    ? env.PAYPAL_LIVE_PARTNER_MERCHANT_ID
    : env.PAYPAL_SANDBOX_PARTNER_MERCHANT_ID;
  const bnCode = live ? env.PAYPAL_LIVE_BN_CODE : env.PAYPAL_SANDBOX_BN_CODE;
  const missing = [
    ["client ID", clientId],
    ["client secret", clientSecret],
    ["webhook ID", webhookId],
    ["partner merchant ID", partnerMerchantId],
    ["BN code", bnCode],
  ].filter(([, value]) => !value);
  if (missing.length > 0) {
    throw new AppError(
      "VALIDATION_ERROR",
      `${live ? "Live" : "Sandbox"} PayPal is not fully configured. Missing ${missing
        .map(([name]) => name)
        .join(", ")}.`,
    );
  }
  return {
    mode,
    environment: live ? "LIVE" : "SANDBOX",
    clientId: clientId!,
    clientSecret: clientSecret!,
    webhookId: webhookId!,
    partnerMerchantId: partnerMerchantId!,
    bnCode: bnCode!,
    timeoutMs: env.PAYPAL_TIMEOUT_MS,
  };
}

export function paypalModeConfigured(mode: PayPalPaymentMode): boolean {
  try {
    getPayPalConfig(mode);
    return true;
  } catch {
    return false;
  }
}
