import { type NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { getDb, resolveActorAsync } from "@/lib/server/api";
import { getEnv, logger } from "@workpay/shared/platform";
import { getPayPalOAuthClient } from "@workpay/shared/integrations/payments";
import { users } from "@workpay/shared/db/schema/identity";
import { providers } from "@workpay/shared/db/schema/providers";

export async function GET(req: NextRequest) {
  const env = getEnv();
  const appUrl = env.APP_URL.replace(/\/$/, "");
  const settingsPaymentsUrl = `${appUrl}/settings?tab=paypal`;

  try {
    const actor = await resolveActorAsync(req);
    if (!actor.id) {
      return NextResponse.redirect(`${appUrl}/login?redirect=${encodeURIComponent("/settings?tab=paypal")}`);
    }

    const { searchParams } = req.nextUrl;
    const errorParam = searchParams.get("error");
    const errorDesc = searchParams.get("error_description");
    if (errorParam) {
      logger.warn({ errorParam, errorDesc }, "paypal oauth returned error");
      return NextResponse.redirect(`${settingsPaymentsUrl}&error=paypal_denied&reason=${encodeURIComponent(errorDesc || errorParam)}`);
    }

    const code = searchParams.get("code");
    const state = searchParams.get("state");
    const cookieState = req.cookies.get("workpay_paypal_oauth_state")?.value;

    if (!code) {
      return NextResponse.redirect(`${settingsPaymentsUrl}&error=missing_code`);
    }

    if (cookieState && state && cookieState !== state) {
      logger.warn({ state, cookieState }, "paypal oauth state mismatch");
      return NextResponse.redirect(`${settingsPaymentsUrl}&error=state_mismatch`);
    }

    const client = getPayPalOAuthClient();
    if (!client) {
      return NextResponse.redirect(`${settingsPaymentsUrl}&error=paypal_not_configured`);
    }

    const redirectUri = `${appUrl}/api/v1/user/paypal/callback`;
    const accessToken = await client.exchangeOAuthCode(code, redirectUri);
    const userInfo = await client.getUserInfo(accessToken);

    const db = getDb();
    const actorId = actor.id;

    await db
      .update(users)
      .set({
        paypalPayerId: userInfo.payerId || null,
        paypalPayoutEmail: userInfo.email || null,
        paypalVerified: true,
        paypalLinkedAt: new Date(),
        legalName: userInfo.name || undefined,
        idVerificationStatus: "VERIFIED",
        idVerifiedAt: new Date(),
        idDocumentType: "PAYPAL_FINANCIAL_KYC",
        updatedAt: new Date(),
      })
      .where(eq(users.id, actorId));

    if (userInfo.email) {
      await db
        .update(providers)
        .set({
          payoutEmail: userInfo.email,
          updatedAt: new Date(),
        })
        .where(eq(providers.userId, actorId));
    }

    logger.info(
      { userId: actorId, payerId: userInfo.payerId, email: userInfo.email },
      "successfully bound paypal account via authentic oauth",
    );

    const res = NextResponse.redirect(`${settingsPaymentsUrl}&success=paypal_bound`);
    res.cookies.delete("workpay_paypal_oauth_state");
    return res;
  } catch (error) {
    logger.error({ err: String(error) }, "paypal oauth callback failed");
    return NextResponse.redirect(
      `${settingsPaymentsUrl}&error=exchange_failed&reason=${encodeURIComponent(String(error))}`,
    );
  }
}
