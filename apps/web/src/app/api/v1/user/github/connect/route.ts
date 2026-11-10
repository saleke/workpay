import { type NextRequest, NextResponse } from "next/server";
import { getEnv, logger } from "@workpay/shared/platform";
import { jsonError } from "@/lib/server/api";
import { getRequestSessionToken, getSessionUser } from "@/lib/server/session";
import { createBrowserOAuthAttempt } from "@/lib/server/oauth-attempt";

export async function GET(req: NextRequest) {
  try {
    const sessionUser = await getSessionUser(getRequestSessionToken(req));
    const env = getEnv();
    const clientId = env.GITHUB_CLIENT_ID;

    const wantsJson =
      req.headers.get("accept")?.includes("application/json") ||
      req.nextUrl.searchParams.get("format") === "json";

    if (!clientId) {
      if (wantsJson) {
        return NextResponse.json({
          configured: false,
          message:
            "GITHUB_CLIENT_ID is not configured in environment. You can use the public Gist verification option.",
        });
      }
      const rawAppUrl = env.APP_URL.replace(/\/$/, "");
      const origin = req.headers.get("x-forwarded-host")
        ? `${req.headers.get("x-forwarded-proto") || "https"}://${req.headers.get("x-forwarded-host")}`
        : req.nextUrl.origin || rawAppUrl;
      return NextResponse.redirect(
        `${origin}/settings?tab=account&error=github_oauth_not_configured`,
      );
    }

    const rawAppUrl = env.APP_URL.replace(/\/$/, "");
    const requestedReturnTo = req.nextUrl.searchParams.get("returnTo");
    const returnTo =
      requestedReturnTo?.startsWith("/") && !requestedReturnTo.startsWith("//")
        ? requestedReturnTo
        : sessionUser
          ? "/settings?tab=identity"
          : "/tasks";
    const state = await createBrowserOAuthAttempt({
      req,
      provider: "GITHUB",
      userId: sessionUser?.id,
      returnTo,
    });
    const redirectUri = `${rawAppUrl}/api/v1/user/github/callback`;

    const authorizeUrl =
      `https://github.com/login/oauth/authorize?client_id=${encodeURIComponent(clientId)}` +
      `&redirect_uri=${encodeURIComponent(redirectUri)}` +
      `&scope=${encodeURIComponent("read:user user:email")}` +
      `&state=${encodeURIComponent(state)}`;

    if (wantsJson) {
      return NextResponse.json({
        configured: true,
        authorizeUrl,
        redirectUri,
      });
    }

    return NextResponse.redirect(authorizeUrl);
  } catch (error) {
    logger.error({ err: String(error) }, "failed to initiate github oauth connection");
    return jsonError(
      { code: "INTERNAL_ERROR", message: "Failed to initiate GitHub authorization" },
      500,
    );
  }
}
