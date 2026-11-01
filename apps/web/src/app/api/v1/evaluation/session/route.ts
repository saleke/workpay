import { z } from "zod";
import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { auditRecords } from "@workpay/shared/db/schema/infra";
import { users } from "@workpay/shared/db/schema/identity";
import { getEnv, newId, sha256Hex } from "@workpay/shared/platform";
import { getDb, jsonError } from "@/lib/server/api";
import { createSession, setSessionCookie } from "@/lib/server/session";

const requestSchema = z
  .object({ perspective: z.enum(["requester", "professional", "reviewer"]) })
  .strict();

const PERSPECTIVES = {
  requester: { userId: "usr_buyer_alice", redirect: "/intake" },
  professional: { userId: "usr_provider_bob", redirect: "/provider" },
  reviewer: { userId: "usr_admin_carol", redirect: "/reviewer/engagements" },
} as const;

const attempts = new Map<string, { count: number; resetsAt: number }>();
const WINDOW_MS = 15 * 60 * 1000;
const MAX_ATTEMPTS = 30;

function requestFingerprint(req: Request): string {
  const forwarded = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  const address = forwarded || req.headers.get("x-real-ip") || "unknown";
  return sha256Hex(address);
}

function assertRateLimit(fingerprint: string): void {
  const now = Date.now();
  const current = attempts.get(fingerprint);
  if (!current || current.resetsAt <= now) {
    attempts.set(fingerprint, { count: 1, resetsAt: now + WINDOW_MS });
    return;
  }
  current.count += 1;
  if (current.count > MAX_ATTEMPTS) {
    throw new Error("Too many evaluator session requests. Please wait and try again.");
  }
}

export async function GET() {
  return NextResponse.json({ enabled: getEnv().EVALUATION_MODE });
}

export async function POST(req: Request) {
  try {
    if (!getEnv().EVALUATION_MODE) {
      return jsonError(
        { code: "NOT_FOUND", message: "Evaluator access is not enabled." },
        404,
      );
    }
    const fingerprint = requestFingerprint(req);
    assertRateLimit(fingerprint);
    const { perspective } = requestSchema.parse(await req.json());
    const selection = PERSPECTIVES[perspective];
    const db = getDb();
    const [user] = await db
      .select({
        id: users.id,
        name: users.name,
        username: users.username,
        displayName: users.displayName,
        email: users.email,
        role: users.role,
      })
      .from(users)
      .where(eq(users.id, selection.userId))
      .limit(1);
    if (!user) {
      return jsonError(
        { code: "PRECONDITION_FAILED", message: "Evaluation fixtures are not available." },
        503,
      );
    }

    const sessionToken = await createSession(user.id);
    await db.insert(auditRecords).values({
      id: newId("audit"),
      actorType: "USER",
      actorId: user.id,
      action: "EVALUATION_SESSION_CREATED",
      targetType: "USER",
      targetId: user.id,
      detail: { perspective, requestFingerprint: fingerprint },
    });

    const response = NextResponse.json({
      data: {
        user: {
          id: user.id,
          name: user.name,
          username: user.username,
          displayName: user.displayName || user.name,
          email: user.email,
          role: user.role,
        },
        perspective,
        redirect: selection.redirect,
      },
    });
    setSessionCookie(response, sessionToken);
    return response;
  } catch (error) {
    return jsonError(error, error instanceof Error && error.message.startsWith("Too many") ? 429 : 500);
  }
}
