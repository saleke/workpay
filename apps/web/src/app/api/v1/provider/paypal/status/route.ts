import { and, eq, sql } from "drizzle-orm";
import { getDb, jsonError, jsonOk } from "@/lib/server/api";
import { requireAuthenticatedSession } from "@/lib/server/conversation-auth";
import {
  paypalIdentityLinks,
  providerPaypalAccounts,
} from "@workpay/shared/db/schema/paypal";
import { providers } from "@workpay/shared/db/schema/providers";
import {
  getConfiguredNewPaymentMode,
  getPayPalClient,
  paymentModeEnvironment,
} from "@workpay/shared/integrations";
import { AppError } from "@workpay/shared/platform";

export async function POST(req: Request) {
  try {
    const { user } = await requireAuthenticatedSession(req);
    if (user.accountClass !== "MEMBER") {
      throw new AppError("POLICY_DENIED", "Evaluator providers use simulated payments.");
    }
    const mode = getConfiguredNewPaymentMode();
    const environment = paymentModeEnvironment(mode);
    const db = getDb();
    const [provider] = await db
      .select({ id: providers.id })
      .from(providers)
      .where(eq(providers.userId, user.id))
      .limit(1);
    if (!provider) throw new AppError("AUTHORIZATION_ERROR", "Professional profile required.");
    const [account] = await db
      .select()
      .from(providerPaypalAccounts)
      .where(
        and(
          eq(providerPaypalAccounts.providerId, provider.id),
          eq(providerPaypalAccounts.environment, environment),
        ),
      )
      .limit(1);
    if (!account?.merchantId) {
      throw new AppError("PRECONDITION_FAILED", "Complete PayPal seller onboarding first.");
    }
    const status = await getPayPalClient(mode).getMerchantIntegration(account.merchantId);
    if (!status.trackingId || status.trackingId !== account.trackingId) {
      throw new AppError("DOMAIN_CONFLICT", "PayPal seller tracking does not match this profile.");
    }
    const active =
      status.paymentsReceivable &&
      status.primaryEmailConfirmed &&
      status.consentStatus &&
      status.productReady &&
      status.oauthIntegrationReady;
    const [updated] = await db.transaction(async (tx) => {
      await tx.execute(
        sql`select pg_advisory_xact_lock(hashtext(${`${environment}:${status.merchantId}`}))`,
      );
      const [buyerLink] = await tx
        .select({ id: paypalIdentityLinks.id })
        .from(paypalIdentityLinks)
        .where(
          and(
            eq(paypalIdentityLinks.environment, environment),
            eq(paypalIdentityLinks.payerId, status.merchantId),
            eq(paypalIdentityLinks.status, "LINKED"),
          ),
        )
        .limit(1);
      if (buyerLink) {
        throw new AppError(
          "DOMAIN_CONFLICT",
          "A seller PayPal account cannot also fund purchases.",
        );
      }
      return tx
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
        .where(eq(providerPaypalAccounts.id, account.id))
        .returning();
    });
    return jsonOk(updated);
  } catch (error) {
    return jsonError(error);
  }
}
