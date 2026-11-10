import { and, eq } from "drizzle-orm";
import { getDb, jsonError, jsonOk } from "@/lib/server/api";
import { requireAuthenticatedSession } from "@/lib/server/conversation-auth";
import { paypalIdentityLinks, providerPaypalAccounts } from "@workpay/shared/db/schema/paypal";
import { providers } from "@workpay/shared/db/schema/providers";
import {
  getConfiguredNewPaymentMode,
  paymentModeEnvironment,
  paypalModeConfigured,
} from "@workpay/shared/integrations";

export async function GET(req: Request) {
  try {
    const { user } = await requireAuthenticatedSession(req);
    if (user.accountClass === "DEMO_FIXTURE") {
      return jsonOk({
        accountClass: user.accountClass,
        mode: "FAKE" as const,
        environment: null,
        configured: true,
        identity: null,
        seller: null,
      });
    }
    const mode = getConfiguredNewPaymentMode();
    const environment = paymentModeEnvironment(mode);
    const db = getDb();
    const [identity, provider] = await Promise.all([
      db
        .select()
        .from(paypalIdentityLinks)
        .where(
          and(
            eq(paypalIdentityLinks.userId, user.id),
            eq(paypalIdentityLinks.environment, environment),
          ),
        )
        .limit(1),
      db.select().from(providers).where(eq(providers.userId, user.id)).limit(1),
    ]);
    const [seller] = provider[0]
      ? await db
          .select()
          .from(providerPaypalAccounts)
          .where(
            and(
              eq(providerPaypalAccounts.providerId, provider[0].id),
              eq(providerPaypalAccounts.environment, environment),
            ),
          )
          .limit(1)
      : [];
    return jsonOk({
      accountClass: user.accountClass,
      mode,
      environment,
      configured: paypalModeConfigured(mode),
      identity: identity[0]
        ? {
            status: identity[0].status,
            email: identity[0].email,
            accountVerified: identity[0].accountVerified,
            linkedAt: identity[0].linkedAt.toISOString(),
          }
        : null,
      seller: seller
        ? {
            status: seller.status,
            paymentsReceivable: seller.paymentsReceivable,
            primaryEmailConfirmed: seller.primaryEmailConfirmed,
            consentStatus: seller.consentStatus,
            actionUrl: seller.actionUrl,
            lastCheckedAt: seller.lastCheckedAt?.toISOString() ?? null,
          }
        : null,
    });
  } catch (error) {
    return jsonError(error);
  }
}
