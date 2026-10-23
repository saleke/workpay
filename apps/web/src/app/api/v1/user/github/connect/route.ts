import { randomBytes } from "node:crypto";
import { type NextRequest, NextResponse } from "next/server";
import { getEnv, logger } from "@workpay/shared/platform";
import { jsonError, resolveActorAsync } from "@/lib/server/api";

export async function GET(req: NextRequest) {
  try {
    const actor = await resolveActorAsync(req);
    const env = getEnv();
    const clientId = env.GITHUB_CLIENT_ID;

    const wantsJson =
      req.headers.get("accept")?.includes("application/json") ||
      req.nextUrl.searchParams.get("format") === "json";

    if (!clientId) {
      if (wantsJson) {
        return NextResponse.json({
          configured: false,
          message: "GITHUB_CLIENT_ID is not configured in environment. You can use the manual bio verification option.",
        });
      }
      const appUrl = env.APP_URL.replace(/\/$/, "");
      return NextResponse.redirect(`${appUrl}/settings?tab=account&error=github_oauth_not_configured`);
    }

    const state = randomBytes(16).toString("hex");
    const appUrl = env.APP_URL.replace(/\/$/, "");
    const redirectUri = `${appUrl}/api/v1/user/github/callback`;

    const authorizeUrl =
      `https://github.com/login/oauth/authorize?client_id=${encodeURIComponent(clientId)}` +
      `&redirect_uri=${encodeURIComponent(redirectUri)}` +
      `&scope=${encodeURIComponent("read:user user:email")}` +
      `&state=${encodeURIComponent(state)}`;

    if (wantsJson) {
      const res = NextResponse.json({
        configured: true,
        authorizeUrl,
        redirectUri,
        state,
      });
      res.cookies.set("workpay_github_oauth_state", state, {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
        path: "/",
        maxAge: 600,
      });
      return res;
    }

    const res = NextResponse.redirect(authorizeUrl);
    res.cookies.set("workpay_github_oauth_state", state, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: 600,
    });
    return res;
  } catch (error) {
    logger.error({ err: String(error) }, "failed to initiate github oauth connection");
    return jsonError({ code: "INTERNAL_ERROR", message: "Failed to initiate GitHub authorization" }, 500);
  }
}
