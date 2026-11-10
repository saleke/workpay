import { and, eq, gt, isNull, sql } from "drizzle-orm";
import { NextResponse } from "next/server";
import { getDb } from "@/lib/server/api";
import { users } from "@workpay/shared/db/schema/identity";
import {
  paypalIdentityLinks,
  paypalOauthAttempts,
  providerPaypalAccounts,
} from "@workpay/shared/db/schema/paypal";
import {
  getConfiguredNewPaymentMode,
  getPayPalOAuthClient,
  paymentModeEnvironment,
} from "@workpay/shared/integrations";
import { getEnv, logger, newId, sha256Hex } from "@workpay/shared/platform";

export async function GET(req: Request) {
  const appUrl = getEnv().APP_URL.replace(/\/$/, "");
  const failure = (code: string) =>
    NextResponse.redirect(`${appUrl}/settings?tab=paypal&paypal=${encodeURIComponent(code)}`);
  try {
    const url = new URL(req.url);
    const code = url.searchParams.get("code");
    const state = url.searchParams.get("state");
    if (!code || !state) return failure("missing_callback_data");

    const db = getDb();
    const stateHash = sha256Hex(state);
    const [attempt] = await db.transaction(async (tx) => {
      const [current] = await tx
        .select()
        .from(paypalOauthAttempts)
        .where(
          and(
            eq(paypalOauthAttempts.stateHash, stateHash),
            gt(paypalOauthAttempts.expiresAt, new Date()),
            isNull(paypalOauthAttempts.consumedAt),
          ),
        )
        .for("update")
        .limit(1);
      if (!current) return [];
      await tx
        .update(paypalOauthAttempts)
        .set({ consumedAt: new Date() })
        .where(eq(paypalOauthAttempts.id, current.id));
      return [current];
    });
    if (!attempt) return failure("invalid_or_expired_state");
    const [user] = await db
      .select({ id: users.id, accountClass: users.accountClass })
      .from(users)
      .where(eq(users.id, attempt.userId))
      .limit(1);
    if (!user || user.accountClass !== "MEMBER") return failure("not_member");

    const mode = getConfiguredNewPaymentMode();
    const environment = paymentModeEnvironment(mode);
    if (attempt.environment !== environment) return failure("environment_changed");
    const redirectUri = `${appUrl}/api/v1/user/paypal/callback`;
    const client = getPayPalOAuthClient(mode);
    const tokens = await client.exchangeOAuthCodeForTokens(code, redirectUri);
    const profile = await client.getUserInfo(tokens.accessToken);
    if (
      !profile.payerId ||
      !profile.email ||
      !profile.verifiedAccount ||
      !profile.emailVerified ||
      !tokens.scope.includes("openid") ||
      !tokens.scope.includes("email")
    ) {
      return failure("account_not_verified");
    }

    await db.transaction(async (tx) => {
      await tx.execute(
        sql`select pg_advisory_xact_lock(hashtext(${`${environment}:${profile.payerId}`}))`,
      );
      const [sellerAccount] = await tx
        .select({ id: providerPaypalAccounts.id })
        .from(providerPaypalAccounts)
        .where(
          and(
            eq(providerPaypalAccounts.environment, environment),
            eq(providerPaypalAccounts.merchantId, profile.payerId),
          ),
        )
        .limit(1);
      if (sellerAccount) throw new Error("A seller PayPal account cannot also fund purchases.");
      await tx
        .insert(paypalIdentityLinks)
        .values({
          id: newId("plink"),
          userId: user.id,
          environment,
          payerId: profile.payerId,
          email: profile.email.toLowerCase(),
          emailVerified: profile.emailVerified,
          accountVerified: profile.verifiedAccount,
          scopes: tokens.scope,
          status: "LINKED",
          revokedAt: null,
          linkedAt: new Date(),
          updatedAt: new Date(),
        })
        .onConflictDoUpdate({
          target: [paypalIdentityLinks.userId, paypalIdentityLinks.environment],
          set: {
            payerId: profile.payerId,
            email: profile.email.toLowerCase(),
            emailVerified: profile.emailVerified,
            accountVerified: profile.verifiedAccount,
            scopes: tokens.scope,
            status: "LINKED",
            revokedAt: null,
            linkedAt: new Date(),
            updatedAt: new Date(),
          },
        });
    });
    const target = new URL(attempt.returnTo, appUrl);
    if (target.origin !== new URL(appUrl).origin) return failure("invalid_return_path");
    target.searchParams.set("paypal", "linked");
    return NextResponse.redirect(target);
  } catch (error) {
    logger.error({ err: String(error) }, "PayPal account linking callback failed");
    return failure("callback_failed");
  }
}
