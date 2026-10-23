import { type NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { getDb, resolveActorAsync } from "@/lib/server/api";
import { getEnv, logger } from "@workpay/shared/platform";
import { users } from "@workpay/shared/db/schema/identity";

interface GitHubTokenResponse {
  access_token?: string;
  token_type?: string;
  scope?: string;
  error?: string;
  error_description?: string;
}

interface GitHubUserResponse {
  login: string;
  id: number;
  name?: string;
  avatar_url?: string;
  public_repos?: number;
  followers?: number;
  created_at?: string;
}

export async function GET(req: NextRequest) {
  const env = getEnv();
  const appUrl = env.APP_URL.replace(/\/$/, "");
  const settingsAccountUrl = `${appUrl}/settings?tab=account`;

  try {
    const actor = await resolveActorAsync(req);
    if (!actor.id) {
      return NextResponse.redirect(`${appUrl}/login?redirect=${encodeURIComponent("/settings?tab=account")}`);
    }

    const { searchParams } = req.nextUrl;
    const errorParam = searchParams.get("error");
    const errorDesc = searchParams.get("error_description");
    if (errorParam) {
      logger.warn({ errorParam, errorDesc }, "github oauth returned error");
      return NextResponse.redirect(
        `${settingsAccountUrl}&error=github_denied&reason=${encodeURIComponent(errorDesc || errorParam)}`,
      );
    }

    const code = searchParams.get("code");
    const state = searchParams.get("state");
    const cookieState = req.cookies.get("workpay_github_oauth_state")?.value;

    if (!code) {
      return NextResponse.redirect(`${settingsAccountUrl}&error=missing_code`);
    }

    if (cookieState && state && cookieState !== state) {
      logger.warn({ state, cookieState }, "github oauth state mismatch");
      return NextResponse.redirect(`${settingsAccountUrl}&error=state_mismatch`);
    }

    const clientId = env.GITHUB_CLIENT_ID;
    const clientSecret = env.GITHUB_CLIENT_SECRET;
    if (!clientId || !clientSecret) {
      return NextResponse.redirect(`${settingsAccountUrl}&error=github_oauth_not_configured`);
    }

    const redirectUri = `${appUrl}/api/v1/user/github/callback`;

    // 1. Exchange authorization code for access token
    const tokenRes = await fetch("https://github.com/login/oauth/access_token", {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
        "User-Agent": "WorkPay-Verification/1.0",
      },
      body: JSON.stringify({
        client_id: clientId,
        client_secret: clientSecret,
        code,
        redirect_uri: redirectUri,
      }),
    });

    if (!tokenRes.ok) {
      logger.error({ status: tokenRes.status }, "github token exchange request failed");
      return NextResponse.redirect(`${settingsAccountUrl}&error=token_exchange_failed`);
    }

    const tokenData = (await tokenRes.json()) as GitHubTokenResponse;
    if (tokenData.error || !tokenData.access_token) {
      logger.error({ tokenData }, "github oauth returned token error");
      return NextResponse.redirect(
        `${settingsAccountUrl}&error=exchange_error&reason=${encodeURIComponent(tokenData.error_description || tokenData.error || "Token acquisition failed")}`,
      );
    }

    // 2. Fetch authenticated user profile
    const userRes = await fetch("https://api.github.com/user", {
      headers: {
        Authorization: `Bearer ${tokenData.access_token}`,
        Accept: "application/vnd.github.v3+json",
        "User-Agent": "WorkPay-Verification/1.0",
      },
    });

    if (!userRes.ok) {
      logger.error({ status: userRes.status }, "failed to fetch github user profile with access token");
      return NextResponse.redirect(`${settingsAccountUrl}&error=profile_fetch_failed`);
    }

    const ghUser = (await userRes.json()) as GitHubUserResponse;

    // 3. Verify account maturity (must be at least 30 days old)
    if (ghUser.created_at) {
      const createdDate = new Date(ghUser.created_at);
      const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 3600 * 1000);
      if (createdDate > thirtyDaysAgo) {
        return NextResponse.redirect(
          `${settingsAccountUrl}&error=account_too_new&reason=${encodeURIComponent("GitHub account must be at least 30 days old to satisfy developer quality standards.")}`,
        );
      }
    }

    // 4. Update user profile in database
    const db = getDb();
    await db
      .update(users)
      .set({
        githubUsername: ghUser.login,
        githubVerifiedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(users.id, actor.id));

    logger.info(
      { userId: actor.id, githubUsername: ghUser.login, publicRepos: ghUser.public_repos },
      "successfully bound github profile via authentic oauth",
    );

    const res = NextResponse.redirect(`${settingsAccountUrl}&success=github_linked`);
    res.cookies.delete("workpay_github_oauth_state");
    return res;
  } catch (error) {
    logger.error({ err: String(error) }, "github oauth callback exception");
    return NextResponse.redirect(
      `${settingsAccountUrl}&error=oauth_callback_error&reason=${encodeURIComponent(String(error))}`,
    );
  }
}
