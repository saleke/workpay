import { type NextRequest, NextResponse } from "next/server";
import { eq, or } from "drizzle-orm";
import { getDb, resolveActorAsync } from "@/lib/server/api";
import { getEnv, logger, newId } from "@workpay/shared/platform";
import { users } from "@workpay/shared/db/schema/identity";
import { providers } from "@workpay/shared/db/schema/providers";
import { createSession, setSessionCookie } from "@/lib/server/session";

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
  email?: string;
  avatar_url?: string;
  public_repos?: number;
  followers?: number;
  created_at?: string;
}

interface GitHubEmailResponse {
  email: string;
  primary: boolean;
  verified: boolean;
}

export async function GET(req: NextRequest) {
  const env = getEnv();
  const appUrl = env.APP_URL.replace(/\/$/, "");
  const settingsAccountUrl = `${appUrl}/settings?tab=account`;

  try {
    const actor = await resolveActorAsync(req);
    const { searchParams } = req.nextUrl;
    const errorParam = searchParams.get("error");
    const errorDesc = searchParams.get("error_description");
    if (errorParam) {
      logger.warn({ errorParam, errorDesc }, "github oauth returned error");
      const target = actor.id ? `${settingsAccountUrl}&error=github_denied` : `${appUrl}/login?error=github_denied`;
      return NextResponse.redirect(
        `${target}&reason=${encodeURIComponent(errorDesc || errorParam)}`,
      );
    }

    const code = searchParams.get("code");
    const state = searchParams.get("state");
    const cookieState = req.cookies.get("workpay_github_oauth_state")?.value;

    if (!code) {
      const target = actor.id ? settingsAccountUrl : `${appUrl}/login`;
      return NextResponse.redirect(`${target}?error=missing_code`);
    }

    if (cookieState && state && cookieState !== state) {
      logger.warn({ state, cookieState }, "github oauth state mismatch");
      const target = actor.id ? settingsAccountUrl : `${appUrl}/login`;
      return NextResponse.redirect(`${target}?error=state_mismatch`);
    }

    const clientId = env.GITHUB_CLIENT_ID;
    const clientSecret = env.GITHUB_CLIENT_SECRET;
    if (!clientId || !clientSecret) {
      const target = actor.id ? settingsAccountUrl : `${appUrl}/login`;
      return NextResponse.redirect(`${target}?error=github_oauth_not_configured`);
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
      const target = actor.id ? settingsAccountUrl : `${appUrl}/login`;
      return NextResponse.redirect(`${target}?error=token_exchange_failed`);
    }

    const tokenData = (await tokenRes.json()) as GitHubTokenResponse;
    if (tokenData.error || !tokenData.access_token) {
      logger.error({ tokenData }, "github oauth returned token error");
      const target = actor.id ? settingsAccountUrl : `${appUrl}/login`;
      return NextResponse.redirect(
        `${target}?error=exchange_error&reason=${encodeURIComponent(tokenData.error_description || tokenData.error || "Token acquisition failed")}`,
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
      const target = actor.id ? settingsAccountUrl : `${appUrl}/login`;
      return NextResponse.redirect(`${target}?error=profile_fetch_failed`);
    }

    const ghUser = (await userRes.json()) as GitHubUserResponse;

    // 3. Fetch user email if not public in profile
    let primaryEmail = ghUser.email;
    if (!primaryEmail) {
      try {
        const emailsRes = await fetch("https://api.github.com/user/emails", {
          headers: {
            Authorization: `Bearer ${tokenData.access_token}`,
            Accept: "application/vnd.github.v3+json",
            "User-Agent": "WorkPay-Verification/1.0",
          },
        });
        if (emailsRes.ok) {
          const emails = (await emailsRes.json()) as GitHubEmailResponse[];
          const primary = emails.find((e) => e.primary && e.verified) || emails.find((e) => e.verified) || emails[0];
          if (primary) {
            primaryEmail = primary.email;
          }
        }
      } catch (e) {
        logger.warn({ err: String(e) }, "unable to fetch github user emails");
      }
    }

    const db = getDb();

    // 4. Case A: User is already logged in -> Bind GitHub to their existing account
    if (actor.id) {
      // Verify account maturity (must be at least 30 days old for developer verification)
      if (ghUser.created_at) {
        const createdDate = new Date(ghUser.created_at);
        const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 3600 * 1000);
        if (createdDate > thirtyDaysAgo) {
          return NextResponse.redirect(
            `${settingsAccountUrl}&error=account_too_new&reason=${encodeURIComponent("GitHub account must be at least 30 days old to satisfy developer quality standards.")}`,
          );
        }
      }

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
    }

    // 5. Case B: User is NOT logged in -> Sign In or Register via GitHub OAuth
    const fallbackEmail = primaryEmail || `${ghUser.login.toLowerCase()}@users.noreply.github.com`;

    const [existingUser] = await db
      .select()
      .from(users)
      .where(or(eq(users.githubUsername, ghUser.login), eq(users.email, fallbackEmail.toLowerCase())))
      .limit(1);

    let activeUserId: string;

    if (existingUser) {
      activeUserId = existingUser.id;
      await db
        .update(users)
        .set({
          githubUsername: ghUser.login,
          githubVerifiedAt: existingUser.githubVerifiedAt ?? new Date(),
          emailVerified: existingUser.emailVerified ?? new Date(),
          image: existingUser.image || ghUser.avatar_url || null,
          updatedAt: new Date(),
        })
        .where(eq(users.id, activeUserId));
    } else {
      activeUserId = newId("user");
      const baseHandle = ghUser.login.toLowerCase().replace(/[^a-z0-9_-]/g, "_").slice(0, 24);

      await db.insert(users).values({
        id: activeUserId,
        name: ghUser.name || ghUser.login,
        displayName: ghUser.name || ghUser.login,
        username: baseHandle,
        email: fallbackEmail.toLowerCase(),
        emailVerified: new Date(),
        githubUsername: ghUser.login,
        githubVerifiedAt: new Date(),
        image: ghUser.avatar_url || null,
        role: "buyer",
        idVerificationStatus: "UNVERIFIED",
        paypalVerified: false,
      });

      await db
        .insert(providers)
        .values({
          id: newId("provider"),
          userId: activeUserId,
          displayName: ghUser.name || ghUser.login,
          type: "HUMAN",
          status: "ACTIVE",
          hourlyRateMinor: 5000,
          currency: "USD",
          payoutEmail: fallbackEmail.toLowerCase(),
        })
        .onConflictDoNothing();

      logger.info({ userId: activeUserId, githubUsername: ghUser.login }, "registered new user via github oauth");
    }

    const sessionToken = await createSession(activeUserId);
    const res = NextResponse.redirect(`${appUrl}/tasks`);
    res.cookies.delete("workpay_github_oauth_state");
    setSessionCookie(res, sessionToken);
    return res;
  } catch (error) {
    logger.error({ err: String(error) }, "github oauth callback exception");
    return NextResponse.redirect(
      `${settingsAccountUrl}&error=oauth_callback_error&reason=${encodeURIComponent(String(error))}`,
    );
  }
}
