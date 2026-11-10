import { randomBytes } from "node:crypto";
import { NextResponse } from "next/server";
import { getDb, jsonError } from "@/lib/server/api";
import { requireAuthenticatedSession } from "@/lib/server/conversation-auth";
import { paypalOauthAttempts } from "@workpay/shared/db/schema/paypal";
import {
  getConfiguredNewPaymentMode,
  getPayPalOAuthClient,
  paymentModeEnvironment,
} from "@workpay/shared/integrations";
import { AppError, getEnv, newId, sha256Hex } from "@workpay/shared/platform";

export async function GET(req: Request) {
  try {
    const { user, sessionToken } = await requireAuthenticatedSession(req);
    if (user.accountClass !== "MEMBER") {
      throw new AppError("POLICY_DENIED", "Evaluator accounts use simulated payments.");
    }
    const mode = getConfiguredNewPaymentMode();
    const environment = paymentModeEnvironment(mode);
    const state = randomBytes(32).toString("base64url");
    const appUrl = getEnv().APP_URL.replace(/\/$/, "");
    const requestedReturnTo = new URL(req.url).searchParams.get("returnTo");
    let returnTo = "/settings?tab=paypal";
    if (requestedReturnTo) {
      const candidate = new URL(requestedReturnTo, appUrl);
      if (candidate.origin === new URL(appUrl).origin && requestedReturnTo.startsWith("/")) {
        returnTo = `${candidate.pathname}${candidate.search}${candidate.hash}`;
      }
    }
    await getDb()
      .insert(paypalOauthAttempts)
      .values({
        id: newId("poauth"),
        userId: user.id,
        environment,
        stateHash: sha256Hex(state),
        sessionTokenHash: sha256Hex(sessionToken),
        returnTo,
        expiresAt: new Date(Date.now() + 10 * 60 * 1000),
      });
    const redirectUri = `${appUrl}/api/v1/user/paypal/callback`;
    const authorizeUrl = getPayPalOAuthClient(mode).getOAuthAuthorizeUrl({
      redirectUri,
      state,
      scope: "openid profile email https://uri.paypal.com/services/paypalattributes",
    });
    const wantsJson =
      req.headers.get("accept")?.includes("application/json") ||
      new URL(req.url).searchParams.get("format") === "json";
    if (wantsJson) return NextResponse.json({ authorizeUrl });
    return NextResponse.redirect(authorizeUrl);
  } catch (error) {
    return jsonError(error);
  }
}
