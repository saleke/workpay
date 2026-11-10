import { randomBytes } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { getDb, jsonError, jsonOk } from "@/lib/server/api";
import { requireAuthenticatedSession } from "@/lib/server/conversation-auth";
import { providerPaypalAccounts } from "@workpay/shared/db/schema/paypal";
import { providers } from "@workpay/shared/db/schema/providers";
import {
  getConfiguredNewPaymentMode,
  getPayPalClient,
  paymentModeEnvironment,
} from "@workpay/shared/integrations";
import { AppError, getEnv, newId, sha256Hex } from "@workpay/shared/platform";
import { paypalRequestId } from "@workpay/shared/integrations/payments/idempotency";

export async function POST(req: Request) {
  try {
    const { user } = await requireAuthenticatedSession(req);
    if (user.accountClass !== "MEMBER") {
      throw new AppError("POLICY_DENIED", "Evaluator providers use simulated payments.");
    }
    const db = getDb();
    const [provider] = await db
      .select()
      .from(providers)
      .where(eq(providers.userId, user.id))
      .limit(1);
    if (!provider) throw new AppError("AUTHORIZATION_ERROR", "Professional profile required.");
    const mode = getConfiguredNewPaymentMode();
    const environment = paymentModeEnvironment(mode);
    const [existing] = await db
      .select()
      .from(providerPaypalAccounts)
      .where(
        and(
          eq(providerPaypalAccounts.providerId, provider.id),
          eq(providerPaypalAccounts.environment, environment),
        ),
      )
      .limit(1);
    if (existing?.status === "ACTIVE") return jsonOk({ status: "ACTIVE" });
    if (
      existing?.actionUrl &&
      existing.onboardingStateHash &&
      !existing.onboardingConsumedAt &&
      existing.onboardingExpiresAt &&
      existing.onboardingExpiresAt > new Date()
    ) {
      return jsonOk({ status: existing.status, actionUrl: existing.actionUrl });
    }

    const accountId = existing?.id ?? newId("ppacct");
    const trackingId = existing?.trackingId ?? `tenfo_${provider.id}_${accountId.slice(-12)}`;
    if (!existing) {
      await db.insert(providerPaypalAccounts).values({
        id: accountId,
        providerId: provider.id,
        userId: user.id,
        environment,
        trackingId,
        status: "PENDING",
      });
    }
    const appUrl = getEnv().APP_URL.replace(/\/$/, "");
    const state = randomBytes(32).toString("base64url");
    const stateHash = sha256Hex(state);
    const returnUrl = `${appUrl}/api/v1/provider/paypal/onboarding/return?state=${encodeURIComponent(state)}`;
    const referral = await getPayPalClient(mode).createPartnerReferral({
      trackingId,
      returnUrl,
      idempotencyKey: paypalRequestId("seller-referral", `${accountId}:${stateHash}`),
    });
    await db
      .update(providerPaypalAccounts)
      .set({
        referralId: referral.referralId,
        actionUrl: referral.actionUrl,
        onboardingStateHash: stateHash,
        onboardingExpiresAt: new Date(Date.now() + 3 * 60 * 60 * 1000),
        onboardingConsumedAt: null,
        updatedAt: new Date(),
      })
      .where(eq(providerPaypalAccounts.id, accountId));
    return jsonOk({ status: "PENDING", actionUrl: referral.actionUrl }, 201);
  } catch (error) {
    return jsonError(error);
  }
}
