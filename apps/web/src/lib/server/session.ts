import { randomBytes } from "node:crypto";
import { and, eq, gt, ne } from "drizzle-orm";
import { NextResponse } from "next/server";
import { getDb } from "@workpay/shared/db";
import { isPersonaIdentityVerified } from "@workpay/shared/domain";
import { sessions, users } from "@workpay/shared/db/schema/identity";
import { sha256Hex } from "@workpay/shared/platform";
import { SESSION_COOKIE_NAME } from "./request-session";

export {
  getRequestSessionToken,
  SESSION_COOKIE_NAME,
  SESSION_HEADER_NAME,
} from "./request-session";
const SESSION_MAX_AGE_SECONDS = 30 * 24 * 60 * 60; // 30 days

export interface AuthenticatedUser {
  id: string;
  name: string | null;
  username: string | null;
  displayName: string | null;
  legalName: string | null;
  email: string;
  role: "buyer" | "provider" | "admin_reviewer";
  accountClass: "UNCLASSIFIED" | "DEMO_FIXTURE" | "MEMBER";
  image: string | null;
  githubUsername: string | null;
  githubVerifiedAt: Date | string | null;
  idVerificationStatus: string;
  idVerifiedAt: Date | string | null;
  idDocumentType: string | null;
}

/**
 * Create a new user session in the database and return the raw session token.
 */
export async function createSession(userId: string): Promise<string> {
  const db = getDb();
  const sessionToken = randomBytes(32).toString("hex");
  const expires = new Date(Date.now() + SESSION_MAX_AGE_SECONDS * 1000);

  await db.insert(sessions).values({
    sessionToken,
    userId,
    expires,
  });

  return sessionToken;
}

export async function createSessionHandoff(userId: string, tabNonceHash: string): Promise<string> {
  const sessionToken = await createSession(userId);
  const handoffCode = randomBytes(32).toString("hex");
  try {
    await getDb()
      .update(sessions)
      .set({
        handoffCodeHash: sha256Hex(handoffCode),
        handoffTabNonceHash: tabNonceHash,
        handoffExpiresAt: new Date(Date.now() + 5 * 60 * 1000),
      })
      .where(eq(sessions.sessionToken, sessionToken));
    return handoffCode;
  } catch (error) {
    await destroySession(sessionToken).catch(() => undefined);
    throw error;
  }
}

export async function consumeSessionHandoff(
  handoffCode: string,
  tabNonce: string,
): Promise<{ sessionToken: string; user: AuthenticatedUser } | null> {
  const [session] = await getDb()
    .update(sessions)
    .set({ handoffCodeHash: null, handoffTabNonceHash: null, handoffExpiresAt: null })
    .where(
      and(
        eq(sessions.handoffCodeHash, sha256Hex(handoffCode)),
        eq(sessions.handoffTabNonceHash, sha256Hex(tabNonce)),
        gt(sessions.handoffExpiresAt, new Date()),
      ),
    )
    .returning({ sessionToken: sessions.sessionToken });
  if (!session) return null;
  const user = await getSessionUser(session.sessionToken);
  return user ? { sessionToken: session.sessionToken, user } : null;
}

/**
 * Validate a session token and return the associated user, or null if expired/invalid.
 */
export async function getSessionUser(
  sessionToken?: string | null,
): Promise<AuthenticatedUser | null> {
  if (!sessionToken) return null;
  const db = getDb();

  const [row] = await db
    .select({
      id: users.id,
      name: users.name,
      username: users.username,
      displayName: users.displayName,
      legalName: users.legalName,
      email: users.email,
      role: users.role,
      accountClass: users.accountClass,
      image: users.image,
      githubUsername: users.githubUsername,
      githubVerifiedAt: users.githubVerifiedAt,
      idVerificationStatus: users.idVerificationStatus,
      idVerificationProvider: users.idVerificationProvider,
      idVerifiedAt: users.idVerifiedAt,
      idDocumentType: users.idDocumentType,
      expires: sessions.expires,
    })
    .from(sessions)
    .innerJoin(users, eq(sessions.userId, users.id))
    .where(and(eq(sessions.sessionToken, sessionToken), gt(sessions.expires, new Date())))
    .limit(1);

  if (!row) return null;

  const isIdentityVerified = isPersonaIdentityVerified(
    row.idVerificationStatus,
    row.idVerificationProvider,
  );

  return {
    id: row.id,
    name: row.name,
    username: row.username,
    displayName: row.displayName || row.name,
    legalName: row.legalName,
    email: row.email,
    role: row.role as AuthenticatedUser["role"],
    accountClass: row.accountClass,
    image: row.image,
    githubUsername: row.githubUsername,
    githubVerifiedAt: row.githubVerifiedAt,
    idVerificationStatus: isIdentityVerified ? "VERIFIED" : "UNVERIFIED",
    idVerifiedAt: isIdentityVerified ? row.idVerifiedAt : null,
    idDocumentType: isIdentityVerified ? row.idDocumentType : null,
  };
}

/**
 * Invalidate and remove a session from the database.
 */
export async function destroySession(sessionToken: string): Promise<void> {
  const db = getDb();
  await db.delete(sessions).where(eq(sessions.sessionToken, sessionToken));
}

export async function destroyAllOtherSessionsForUser(
  userId: string,
  keepSessionToken?: string | null,
): Promise<void> {
  const db = getDb();

  if (keepSessionToken) {
    await db
      .delete(sessions)
      .where(and(eq(sessions.userId, userId), ne(sessions.sessionToken, keepSessionToken)));
    return;
  }

  await db.delete(sessions).where(eq(sessions.userId, userId));
}

/**
 * Attach the session cookie to an outgoing Next.js response.
 */
export function setSessionCookie(res: NextResponse, sessionToken: string): void {
  res.cookies.set({
    name: SESSION_COOKIE_NAME,
    value: sessionToken,
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_MAX_AGE_SECONDS,
  });
}

/**
 * Clear the session cookie from an outgoing Next.js response.
 */
export function clearSessionCookie(res: NextResponse): void {
  res.cookies.set({
    name: SESSION_COOKIE_NAME,
    value: "",
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 0,
  });
}
