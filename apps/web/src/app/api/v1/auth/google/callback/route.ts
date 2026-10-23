import { type NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { getDb } from "@/lib/server/api";
import { getEnv, logger, newId } from "@workpay/shared/platform";
import { users } from "@workpay/shared/db/schema/identity";
import { providers } from "@workpay/shared/db/schema/providers";
import { createSession, setSessionCookie } from "@/lib/server/session";

interface GoogleTokenResponse {
  access_token?: string;
  id_token?: string;
  token_type?: string;
  expires_in?: number;
  error?: string;
  error_description?: string;
}

interface GoogleUserInfoResponse {
  sub: string;
  email: string;
  email_verified?: boolean;
  name?: string;
  picture?: string;
}

export async function GET(req: NextRequest) {
  const env = getEnv();
  const appUrl = env.APP_URL.replace(/\/$/, "");

  try {
    const { searchParams } = req.nextUrl;
    const errorParam = searchParams.get("error");
    if (errorParam) {
      logger.warn({ errorParam }, "google oauth returned error");
      return NextResponse.redirect(`${appUrl}/login?error=google_denied`);
    }

    const code = searchParams.get("code");
    const state = searchParams.get("state");
    const cookieState = req.cookies.get("workpay_google_oauth_state")?.value;

    if (!code) {
      return NextResponse.redirect(`${appUrl}/login?error=missing_code`);
    }

    if (cookieState && state && cookieState !== state) {
      logger.warn({ state, cookieState }, "google oauth state mismatch");
      return NextResponse.redirect(`${appUrl}/login?error=state_mismatch`);
    }

    const clientId = env.GOOGLE_CLIENT_ID;
    const clientSecret = env.GOOGLE_CLIENT_SECRET;
    if (!clientId || !clientSecret) {
      return NextResponse.redirect(`${appUrl}/login?error=google_oauth_not_configured`);
    }

    const redirectUri = `${appUrl}/api/v1/auth/google/callback`;

    // 1. Exchange code for access token
    const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        code,
        grant_type: "authorization_code",
        redirect_uri: redirectUri,
      }),
    });

    if (!tokenRes.ok) {
      logger.error({ status: tokenRes.status }, "google token exchange failed");
      return NextResponse.redirect(`${appUrl}/login?error=token_exchange_failed`);
    }

    const tokenData = (await tokenRes.json()) as GoogleTokenResponse;
    if (!tokenData.access_token) {
      logger.error({ tokenData }, "missing google access token");
      return NextResponse.redirect(`${appUrl}/login?error=missing_access_token`);
    }

    // 2. Fetch authenticated user profile
    const userRes = await fetch("https://www.googleapis.com/oauth2/v3/userinfo", {
      headers: {
        Authorization: `Bearer ${tokenData.access_token}`,
      },
    });

    if (!userRes.ok) {
      logger.error({ status: userRes.status }, "failed to fetch google user info");
      return NextResponse.redirect(`${appUrl}/login?error=profile_fetch_failed`);
    }

    const gUser = (await userRes.json()) as GoogleUserInfoResponse;
    if (!gUser.email) {
      return NextResponse.redirect(`${appUrl}/login?error=missing_email`);
    }

    const db = getDb();
    const normalizedEmail = gUser.email.toLowerCase().trim();

    // 3. Find or create user
    const [existingUser] = await db
      .select()
      .from(users)
      .where(eq(users.email, normalizedEmail))
      .limit(1);

    let activeUserId: string;

    if (existingUser) {
      activeUserId = existingUser.id;
      // Ensure emailVerified is marked since Google verifies the address
      await db
        .update(users)
        .set({
          emailVerified: existingUser.emailVerified ?? new Date(),
          image: existingUser.image || gUser.picture || null,
          updatedAt: new Date(),
        })
        .where(eq(users.id, activeUserId));
    } else {
      activeUserId = newId("user");
      const baseHandle = (gUser.name || normalizedEmail.split("@")[0] || "user")
        .toLowerCase()
        .replace(/[^a-z0-9_-]/g, "_")
        .replace(/_+/g, "_")
        .slice(0, 20);
      const uniqueHandle = `${baseHandle}_${newId("user").slice(0, 4)}`;

      await db.insert(users).values({
        id: activeUserId,
        name: gUser.name || "Google User",
        displayName: gUser.name || "Google User",
        username: uniqueHandle,
        email: normalizedEmail,
        emailVerified: new Date(),
        image: gUser.picture || null,
        role: "buyer",
        idVerificationStatus: "UNVERIFIED",
        paypalVerified: false,
      });

      // Automatically provision provider profile for universal access
      await db
        .insert(providers)
        .values({
          id: newId("provider"),
          userId: activeUserId,
          displayName: gUser.name || "Google User",
          type: "HUMAN",
          status: "ACTIVE",
          hourlyRateMinor: 5000,
          currency: "USD",
          payoutEmail: normalizedEmail,
        })
        .onConflictDoNothing();

      logger.info({ userId: activeUserId, email: normalizedEmail }, "registered new user via google oauth");
    }

    // 4. Create session and set cookie
    const sessionToken = await createSession(activeUserId);
    const res = NextResponse.redirect(`${appUrl}/tasks`);
    res.cookies.delete("workpay_google_oauth_state");
    setSessionCookie(res, sessionToken);

    return res;
  } catch (error) {
    logger.error({ err: String(error) }, "google oauth callback exception");
    return NextResponse.redirect(`${appUrl}/login?error=google_callback_failed`);
  }
}
