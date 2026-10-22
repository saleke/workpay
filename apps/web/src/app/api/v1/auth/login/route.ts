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
        email: users.email,
        passwordHash: users.passwordHash,
        role: users.role,
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
          email: user.email,
          role: user.role,
        },
      },
    });

    setSessionCookie(res, sessionToken);
    return res;
  } catch (err) {
    return jsonError(err);
  }
}
