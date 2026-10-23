import { randomBytes } from "node:crypto";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { getDb, jsonError } from "@/lib/server/api";
import { users, verificationTokens } from "@workpay/shared/db/schema/identity";
import { providers } from "@workpay/shared/db/schema/providers";
import { hashPassword, newId, logger } from "@workpay/shared/platform";
import { createSession, setSessionCookie } from "@/lib/server/session";
import { validateEmailForRegistration, validateUsername } from "@/lib/server/disposable-emails";

const registerSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(100),
  username: z.string().trim().optional(),
  email: z.string().trim().toLowerCase().email("Invalid email address"),
  password: z.string().min(8, "Password must be at least 8 characters"),
  role: z.enum(["buyer", "provider"]).default("buyer"),
});

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const parsed = registerSchema.parse(body);
    const db = getDb();

    // Step 1: Validate email against disposable/burner domain blacklist
    const emailValidation = validateEmailForRegistration(parsed.email);
    if (!emailValidation.ok) {
      return jsonError({ code: "VALIDATION_ERROR", message: emailValidation.message }, 400);
    }

    // Determine and validate platform username
    const emailPrefix = parsed.email.split("@")[0] ?? "user";
    let normalizedUsername = (parsed.username || "").trim().toLowerCase().replace(/^@+/, "");
    if (!normalizedUsername) {
      // Derive candidate handle from name or email prefix
      normalizedUsername = (parsed.name || emailPrefix)
        .toLowerCase()
        .replace(/[^a-z0-9_-]/g, "_")
        .replace(/_+/g, "_")
        .slice(0, 24);
      if (normalizedUsername.length < 3) {
        normalizedUsername = `user_${newId("user").slice(0, 8)}`;
      }
    }

    const usernameValidation = validateUsername(normalizedUsername);
    if (!usernameValidation.ok) {
      return jsonError({ code: "VALIDATION_ERROR", message: usernameValidation.message }, 400);
    }

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
      idVerificationStatus: "UNVERIFIED",
      paypalVerified: false,
    });

    // Automatically provision specialist capabilities so every account
    // can both commission work and fulfill assignments in Work Studio.
    const providerId = newId("provider");
    await db.insert(providers).values({
      id: providerId,
      userId,
      displayName: parsed.name,
      type: "HUMAN",
      status: "ACTIVE",
      bio: null,
      hourlyRateMinor: 5000,
      currency: "USD",
      payoutEmail: parsed.email,
    }).onConflictDoNothing();

    const verifyToken = randomBytes(32).toString("hex");
    const tokenExpires = new Date(Date.now() + 24 * 60 * 60 * 1000);
    await db
      .insert(verificationTokens)
      .values({
        identifier: parsed.email.toLowerCase(),
        token: verifyToken,
        expires: tokenExpires,
      })
      .onConflictDoNothing();

    logger.info({ email: parsed.email, verifyToken }, "issued email verification token for new user");

    const sessionToken = await createSession(userId);
    const res = NextResponse.json({
      data: {
        user: {
          id: userId,
          name: parsed.name,
          username: normalizedUsername,
          displayName: parsed.name,
          email: parsed.email,
          role: parsed.role,
          idVerificationStatus: "UNVERIFIED",
          paypalVerified: false,
        },
      },
    });

    setSessionCookie(res, sessionToken);
    return res;
  } catch (err) {
    return jsonError(err);
  }
}
