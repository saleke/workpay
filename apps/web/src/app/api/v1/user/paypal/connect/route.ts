import { randomBytes } from "node:crypto";
import { type NextRequest, NextResponse } from "next/server";
import { getEnv, logger } from "@workpay/shared/platform";
import { getPayPalOAuthClient } from "@workpay/shared/integrations/payments";
import { jsonError, resolveActorAsync } from "@/lib/server/api";

export async function GET(req: NextRequest) {
  try {
    const actor = await resolveActorAsync(req);
    if (!actor.id) {
      return jsonError({ code: "UNAUTHORIZED", message: "Sign in required to link PayPal account" }, 401);
    }

    const env = getEnv();
    const client = getPayPalOAuthClient();
    if (!client) {
      return jsonError(
        {
          code: "CONFIGURATION_ERROR",
          message: "PayPal integration is not configured on this environment",
        },
        503,
      );
    }

    const state = randomBytes(16).toString("hex");
    const appUrl = env.APP_URL.replace(/\/$/, "");
    const redirectUri = `${appUrl}/api/v1/user/paypal/callback`;
    const authorizeUrl = client.getOAuthAuthorizeUrl({
      redirectUri,
      state,
      scope: "openid profile email",
    });

    const wantsJson =
      req.headers.get("accept")?.includes("application/json") ||
      req.nextUrl.searchParams.get("format") === "json";

    if (wantsJson) {
      const res = NextResponse.json({
        authorizeUrl,
        redirectUri,
        state,
      });
      res.cookies.set("workpay_paypal_oauth_state", state, {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
        path: "/",
        maxAge: 600,
      });
      return res;
    }

    const res = NextResponse.redirect(authorizeUrl);
    res.cookies.set("workpay_paypal_oauth_state", state, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: 600,
    });
    return res;
  } catch (error) {
    logger.error({ err: String(error) }, "failed to initiate paypal oauth connection");
    return jsonError({ code: "INTERNAL_ERROR", message: "Failed to initiate PayPal connection" }, 500);
  }
}
