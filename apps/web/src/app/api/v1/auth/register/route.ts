import { randomBytes } from "node:crypto";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { getDb, jsonError } from "@/lib/server/api";
import { users, verificationTokens } from "@workpay/shared/db/schema/identity";
import { providers } from "@workpay/shared/db/schema/providers";
import { hashPassword, newId, logger } from "@workpay/shared/platform";
import { isEmailDeliveryConfigured, sendVerificationEmail } from "@workpay/shared/integrations";
import { createSession, setSessionCookie } from "@/lib/server/session";
import { validateEmailForRegistration } from "@/lib/server/disposable-emails";
import { normalizeUsernameInput } from "@workpay/shared/domain";

const registerSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(100),
  username: z.string().trim().min(1, "Username is required").max(100),
  email: z.string().trim().toLowerCase().email("Invalid email address"),
  password: z.string().min(8, "Password must be at least 8 characters"),
  role: z.enum(["buyer", "provider"]).default("buyer"),
});

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const result = registerSchema.safeParse(body);
    if (!result.success) {
      return jsonError(
        { code: "VALIDATION_ERROR", message: "Check the registration details and try again." },
        400,
      );
    }
    const parsed = result.data;
    const db = getDb();

    // Step 1: Validate email against disposable/burner domain blacklist
    const emailValidation = validateEmailForRegistration(parsed.email);
    if (!emailValidation.ok) {
      return jsonError({ code: "VALIDATION_ERROR", message: emailValidation.message }, 400);
    }

    // Require an explicit username handle from the user, rather than deriving one from the name.
    const usernameResult = normalizeUsernameInput(parsed.username);
    if (!usernameResult.ok || !usernameResult.value) {
      return jsonError(
        { code: "VALIDATION_ERROR", message: usernameResult.message || "Username is required." },
        400,
      );
    }
    const normalizedUsername = usernameResult.value;

    // Check if email already registered
    const [existingEmail] = await db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.email, parsed.email))
      .limit(1);

    if (existingEmail) {
      return jsonError({ code: "DOMAIN_CONFLICT", message: "Email is already registered" }, 409);
    }

    // Check if username handle is already taken
    const [existingUsername] = await db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.username, normalizedUsername))
      .limit(1);

    if (existingUsername) {
      return jsonError(
        {
          code: "DOMAIN_CONFLICT",
          message: `Username @${normalizedUsername} is already registered. Please choose a different handle.`,
        },
        409,
      );
    }

    const userId = newId("user");
    const passwordHash = hashPassword(parsed.password);

    await db.insert(users).values({
      id: userId,
      name: parsed.name,
      displayName: parsed.name,
      username: normalizedUsername,
      email: parsed.email,
      passwordHash,
      role: parsed.role,
      accountClass: "MEMBER",
      idVerificationStatus: "UNVERIFIED",
    });

    // Automatically provision specialist capabilities so every account
    // can both commission work and fulfill assignments in Work Studio.
    const providerId = newId("provider");
    await db
      .insert(providers)
      .values({
        id: providerId,
        userId,
        displayName: parsed.name,
        type: "HUMAN",
        status: "ACTIVE",
        bio: null,
        hourlyRateMinor: 5000,
        currency: "USD",
        payoutEmail: null,
      })
      .onConflictDoNothing();

    const requiresEmailVerification = isEmailDeliveryConfigured();
    if (requiresEmailVerification) {
      const verifyToken = randomBytes(32).toString("hex");
      const otpCode = Math.floor(100000 + Math.random() * 900000).toString();
      const tokenExpires = new Date(Date.now() + 24 * 60 * 60 * 1000);
      await db
        .insert(verificationTokens)
        .values([
          {
            identifier: parsed.email.toLowerCase(),
            token: verifyToken,
            expires: tokenExpires,
          },
          {
            identifier: parsed.email.toLowerCase(),
            token: otpCode,
            expires: tokenExpires,
          },
        ])
        .onConflictDoNothing();

      const envUrl = process.env.APP_URL || "http://localhost:3000";
      const appUrl = envUrl.replace(/\/$/, "");
      const verificationUrl = `${appUrl}/api/v1/auth/verify-email?token=${verifyToken}`;

      try {
        await sendVerificationEmail({
          email: parsed.email,
          name: parsed.name,
          otpCode,
          verificationUrl,
        });
      } catch (sendErr) {
        logger.error(
          { err: String(sendErr), email: parsed.email },
          "failed to dispatch verification email",
        );
      }
    }

    const sessionToken = await createSession(userId);
    const res = NextResponse.json({
      data: {
        user: {
          id: userId,
          name: parsed.name,
          username: normalizedUsername,
          displayName: parsed.name,
          email: parsed.email,
          image: null,
          role: parsed.role,
          idVerificationStatus: "UNVERIFIED",
        },
        sessionToken,
        requiresEmailVerification,
      },
    });

    setSessionCookie(res, sessionToken);
    return res;
  } catch (err) {
    return jsonError(err);
  }
}
