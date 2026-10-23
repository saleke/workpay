import { randomBytes, randomInt } from "node:crypto";
import { type NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { getDb, jsonError } from "@/lib/server/api";
import { getEnv, logger } from "@workpay/shared/platform";
import { users, verificationTokens } from "@workpay/shared/db/schema/identity";

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as { email?: string };
    const email = body.email?.trim().toLowerCase();

    if (!email || !email.includes("@")) {
      return jsonError({ code: "VALIDATION_ERROR", message: "Please provide a valid email address" }, 400);
    }

    const db = getDb();
    const [existingUser] = await db
      .select({ id: users.id, email: users.email })
      .from(users)
      .where(eq(users.email, email))
      .limit(1);

    // If user does not exist, return a generic success message to prevent user enumeration
    if (!existingUser) {
      return NextResponse.json({
        success: true,
        message: "If an account matches this email, a verification code and reset link have been issued.",
      });
    }

    const identifier = `pwd_reset:${email}`;
    const resetToken = randomBytes(32).toString("hex");
    const otpCode = randomInt(100000, 999999).toString();
    const expires = new Date(Date.now() + 60 * 60 * 1000); // 1 hour

    await db.delete(verificationTokens).where(eq(verificationTokens.identifier, identifier));
    await db.insert(verificationTokens).values([
      {
        identifier,
        token: resetToken,
        expires,
      },
      {
        identifier,
        token: otpCode,
        expires,
      },
    ]);

    const env = getEnv();
    const appUrl = env.APP_URL.replace(/\/$/, "");
    const resetUrl = `${appUrl}/reset-password?token=${resetToken}&email=${encodeURIComponent(email)}`;

    logger.info({ email, otpCode, resetUrl }, "generated password reset token and code");

    return NextResponse.json({
      success: true,
      email,
      otpCode,
      resetUrl,
      message: "A password reset link and 6-digit confirmation code have been issued.",
    });
  } catch (error) {
    logger.error({ err: String(error) }, "error initiating password reset");
    return jsonError({ code: "INTERNAL_ERROR", message: "Failed to initiate password reset" }, 500);
  }
}
