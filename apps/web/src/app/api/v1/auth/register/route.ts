import { z } from "zod";
import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { getDb, jsonError } from "@/lib/server/api";
import { users } from "@workpay/shared/db/schema/identity";
import { providers } from "@workpay/shared/db/schema/providers";
import { hashPassword, newId } from "@workpay/shared/platform";
import { createSession, setSessionCookie } from "@/lib/server/session";

const registerSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(100),
  email: z.string().trim().toLowerCase().email("Invalid email address"),
  password: z.string().min(8, "Password must be at least 8 characters"),
  role: z.enum(["buyer", "provider"]).default("buyer"),
});

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const parsed = registerSchema.parse(body);
    const db = getDb();

    // Check if email already registered
    const [existing] = await db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.email, parsed.email))
      .limit(1);

    if (existing) {
      return jsonError({ code: "DOMAIN_CONFLICT", message: "Email is already registered" }, 409);
    }

    const userId = newId("user");
    const passwordHash = hashPassword(parsed.password);

    await db.insert(users).values({
      id: userId,
      name: parsed.name,
      email: parsed.email,
      passwordHash,
      role: parsed.role,
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
      bio: `Verified specialist: ${parsed.name}`,
      hourlyRateMinor: 5000,
      currency: "USD",
      payoutEmail: parsed.email,
    }).onConflictDoNothing();

    const sessionToken = await createSession(userId);
    const res = NextResponse.json({
      data: {
        user: {
          id: userId,
          name: parsed.name,
          email: parsed.email,
          role: parsed.role,
        },
      },
    });

    setSessionCookie(res, sessionToken);
    return res;
  } catch (err) {
    return jsonError(err);
  }
}
