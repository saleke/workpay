import { and, eq, gt, isNull, sql } from "drizzle-orm";
import { NextResponse } from "next/server";
import { getDb } from "@/lib/server/api";
import { users } from "@workpay/shared/db/schema/identity";
import { paypalIdentityLinks, providerPaypalAccounts } from "@workpay/shared/db/schema/paypal";
import { providers } from "@workpay/shared/db/schema/providers";
import {
  getConfiguredNewPaymentMode,
  getPayPalClient,
  paymentModeEnvironment,
} from "@workpay/shared/integrations";
import { getEnv, logger, sha256Hex } from "@workpay/shared/platform";

export async function GET(req: Request) {
  const appUrl = getEnv().APP_URL.replace(/\/$/, "");
  const redirect = (status: string) =>
    NextResponse.redirect(`${appUrl}/settings?tab=paypal&seller=${encodeURIComponent(status)}`);
  try {
    const callbackUrl = new URL(req.url);
    const state = callbackUrl.searchParams.get("state");
    const merchantId =
      callbackUrl.searchParams.get("merchantIdInPayPal") ??
      callbackUrl.searchParams.get("merchantId");
    if (!state || !merchantId || !/^[A-Z0-9]{8,32}$/.test(merchantId)) {
      return redirect("missing_callback_data");
    }
    const mode = getConfiguredNewPaymentMode();
    const environment = paymentModeEnvironment(mode);
    const db = getDb();
    const [account] = await db.transaction(async (tx) => {
      const [current] = await tx
        .select()
        .from(providerPaypalAccounts)
        .where(
          and(
            eq(providerPaypalAccounts.environment, environment),
            eq(providerPaypalAccounts.onboardingStateHash, sha256Hex(state)),
            gt(providerPaypalAccounts.onboardingExpiresAt, new Date()),
            isNull(providerPaypalAccounts.onboardingConsumedAt),
          ),
        )
        .for("update")
        .limit(1);
      if (!current) return [];
      await tx
        .update(providerPaypalAccounts)
        .set({ onboardingConsumedAt: new Date(), updatedAt: new Date() })
        .where(eq(providerPaypalAccounts.id, current.id));
      return [current];
    });
    if (!account) return redirect("onboarding_not_started");
    const [owner] = await db
      .select({ accountClass: users.accountClass })
      .from(providers)
      .innerJoin(users, eq(providers.userId, users.id))
      .where(eq(providers.id, account.providerId))
      .limit(1);
    if (!owner || owner.accountClass !== "MEMBER") return redirect("not_member");
    const status = await getPayPalClient(mode).getMerchantIntegration(merchantId);
    if (
      status.merchantId !== merchantId ||
      !status.trackingId ||
      status.trackingId !== account.trackingId
    ) {
      return redirect("tracking_mismatch");
    }
    const active =
      status.paymentsReceivable &&
      status.primaryEmailConfirmed &&
      status.consentStatus &&
      status.productReady &&
      status.oauthIntegrationReady;
    const roleConflict = await db.transaction(async (tx) => {
      await tx.execute(
        sql`select pg_advisory_xact_lock(hashtext(${`${environment}:${merchantId}`}))`,
      );
      const [buyerLink] = await tx
        .select({ id: paypalIdentityLinks.id })
        .from(paypalIdentityLinks)
        .where(
          and(
            eq(paypalIdentityLinks.environment, environment),
            eq(paypalIdentityLinks.payerId, merchantId),
            eq(paypalIdentityLinks.status, "LINKED"),
          ),
        )
        .limit(1);
      if (buyerLink) return true;
      await tx
        .update(providerPaypalAccounts)
        .set({
          merchantId: status.merchantId,
          status: active ? "ACTIVE" : "RESTRICTED",
          paymentsReceivable: status.paymentsReceivable,
          primaryEmailConfirmed: status.primaryEmailConfirmed,
          consentStatus: status.consentStatus,
          products: status.products,
          permissions: status.permissions,
          lastCheckedAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(providerPaypalAccounts.id, account.id));
      return false;
    });
    if (roleConflict) return redirect("account_role_conflict");
    return redirect(active ? "active" : "restricted");
  } catch (error) {
    logger.error({ err: String(error) }, "PayPal seller onboarding callback failed");
    return redirect("callback_failed");
  }
}
