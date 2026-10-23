import { z } from "zod";
import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { getDb, jsonError } from "@/lib/server/api";
import { users } from "@workpay/shared/db/schema/identity";
import { verifyPassword } from "@workpay/shared/platform";
import { createSession, setSessionCookie } from "@/lib/server/session";

const loginSchema = z.object({
  email: z.string().trim().toLowerCase().email("Invalid email address"),
  password: z.string().min(1, "Password is required"),
});

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const parsed = loginSchema.parse(body);
    const db = getDb();

    const [user] = await db
      .select({
        id: users.id,
        name: users.name,
        username: users.username,
        displayName: users.displayName,
        legalName: users.legalName,
        email: users.email,
        passwordHash: users.passwordHash,
        role: users.role,
        githubUsername: users.githubUsername,
        githubVerifiedAt: users.githubVerifiedAt,
        idVerificationStatus: users.idVerificationStatus,
        idVerifiedAt: users.idVerifiedAt,
        paypalPayerId: users.paypalPayerId,
        paypalPayoutEmail: users.paypalPayoutEmail,
        paypalLinkedAt: users.paypalLinkedAt,
        paypalVerified: users.paypalVerified,
        paypalAutoHoldEnabled: users.paypalAutoHoldEnabled,
      })
      .from(users)
      .where(eq(users.email, parsed.email))
      .limit(1);

    if (!user || !user.passwordHash || !verifyPassword(parsed.password, user.passwordHash)) {
      return jsonError({ code: "AUTHORIZATION_ERROR", message: "Invalid email or password" }, 401);
    }

    const sessionToken = await createSession(user.id);
    const res = NextResponse.json({
      data: {
        user: {
          id: user.id,
          name: user.name,
          username: user.username,
          displayName: user.displayName || user.name,
          legalName: user.legalName,
          email: user.email,
          role: user.role,
          githubUsername: user.githubUsername,
          githubVerifiedAt: user.githubVerifiedAt,
          idVerificationStatus: user.idVerificationStatus || "UNVERIFIED",
          idVerifiedAt: user.idVerifiedAt,
          paypalPayerId: user.paypalPayerId,
          paypalPayoutEmail: user.paypalPayoutEmail,
          paypalLinkedAt: user.paypalLinkedAt,
          paypalVerified: Boolean(user.paypalVerified),
          paypalAutoHoldEnabled: user.paypalAutoHoldEnabled ?? true,
        },
      },
    });

    setSessionCookie(res, sessionToken);
    return res;
  } catch (err) {
    return jsonError(err);
  }
}
