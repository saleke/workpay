import { type NextRequest, NextResponse } from "next/server";
import { and, eq, gt } from "drizzle-orm";
import { getDb, jsonError } from "@/lib/server/api";
import { hashPassword, logger } from "@workpay/shared/platform";
import { users, verificationTokens } from "@workpay/shared/db/schema/identity";

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as {
      email?: string;
      tokenOrCode?: string;
      newPassword?: string;
    };

    const email = body.email?.trim().toLowerCase();
    const tokenOrCode = body.tokenOrCode?.trim();
    const newPassword = body.newPassword;

    if (!email || !tokenOrCode) {
      return jsonError({ code: "VALIDATION_ERROR", message: "Email and reset code/token are required" }, 400);
    }

    if (!newPassword || newPassword.length < 8) {
      return jsonError({ code: "VALIDATION_ERROR", message: "New password must be at least 8 characters" }, 400);
    }

    const db = getDb();
    const now = new Date();
    const identifier = `pwd_reset:${email}`;

    const [tokenRecord] = await db
      .select()
      .from(verificationTokens)
      .where(
        and(
          eq(verificationTokens.identifier, identifier),
          eq(verificationTokens.token, tokenOrCode),
          gt(verificationTokens.expires, now),
        ),
      )
      .limit(1);

    if (!tokenRecord) {
      return jsonError(
        {
          code: "INVALID_RESET_CODE",
          message: "The password reset code or link is invalid or has expired. Please request a new code.",
        },
        400,
      );
    }

    const passwordHash = hashPassword(newPassword);

    await db
      .update(users)
      .set({
        passwordHash,
        updatedAt: new Date(),
      })
      .where(eq(users.email, email));

    // Clear reset tokens
    await db.delete(verificationTokens).where(eq(verificationTokens.identifier, identifier));

    logger.info({ email }, "user password reset successfully completed");

    return NextResponse.json({
      success: true,
      message: "Your password has been reset successfully. You can now log in.",
    });
  } catch (error) {
    logger.error({ err: String(error) }, "error executing password reset");
    return jsonError({ code: "INTERNAL_ERROR", message: "Failed to reset password" }, 500);
  }
}
