import { randomBytes } from "node:crypto";
import { type NextRequest, NextResponse } from "next/server";
import { getEnv, logger } from "@workpay/shared/platform";
import { jsonError } from "@/lib/server/api";

export async function GET(req: NextRequest) {
  try {
    const env = getEnv();
    const clientId = env.GOOGLE_CLIENT_ID;

    const wantsJson =
      req.headers.get("accept")?.includes("application/json") ||
      req.nextUrl.searchParams.get("format") === "json";

    if (!clientId) {
      if (wantsJson) {
        return NextResponse.json({
          configured: false,
          message: "GOOGLE_CLIENT_ID is not configured in environment.",
        });
      }
      const appUrl = env.APP_URL.replace(/\/$/, "");
      return NextResponse.redirect(`${appUrl}/login?error=google_oauth_not_configured`);
    }

    const state = randomBytes(16).toString("hex");
    const appUrl = env.APP_URL.replace(/\/$/, "");
    const redirectUri = `${appUrl}/api/v1/auth/google/callback`;

    const authorizeUrl =
      `https://accounts.google.com/o/oauth2/v2/auth?client_id=${encodeURIComponent(clientId)}` +
      `&redirect_uri=${encodeURIComponent(redirectUri)}` +
      `&response_type=code` +
      `&scope=${encodeURIComponent("openid email profile")}` +
      `&state=${encodeURIComponent(state)}` +
      `&prompt=select_account`;

    if (wantsJson) {
      const res = NextResponse.json({
        configured: true,
        authorizeUrl,
        redirectUri,
        state,
      });
      res.cookies.set("workpay_google_oauth_state", state, {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
        path: "/",
        maxAge: 600,
      });
      return res;
    }

    const res = NextResponse.redirect(authorizeUrl);
    res.cookies.set("workpay_google_oauth_state", state, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: 600,
    });
    return res;
  } catch (error) {
    logger.error({ err: String(error) }, "failed to initiate google oauth");
    return jsonError({ code: "INTERNAL_ERROR", message: "Failed to initiate Google sign-in" }, 500);
  }
}
