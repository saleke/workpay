import { randomBytes } from "node:crypto";
import { and, eq, gt } from "drizzle-orm";
import { NextResponse } from "next/server";
import { getDb } from "@workpay/shared/db";
import { sessions, users } from "@workpay/shared/db/schema/identity";

export const SESSION_COOKIE_NAME = "workpay_session";
const SESSION_MAX_AGE_SECONDS = 30 * 24 * 60 * 60; // 30 days

export interface AuthenticatedUser {
  id: string;
  name: string | null;
  username: string | null;
  displayName: string | null;
  legalName: string | null;
  email: string;
  role: "buyer" | "provider" | "admin_reviewer";
  image: string | null;
  githubUsername: string | null;
  githubVerifiedAt: Date | string | null;
  idVerificationStatus: string;
  idVerifiedAt: Date | string | null;
  idDocumentType: string | null;
  paypalPayerId: string | null;
  paypalPayoutEmail: string | null;
  paypalLinkedAt: Date | string | null;
  paypalVerified: boolean;
  paypalAutoHoldEnabled: boolean;
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

/**
 * Validate a session token and return the associated user, or null if expired/invalid.
 */
export async function getSessionUser(sessionToken?: string | null): Promise<AuthenticatedUser | null> {
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
      image: users.image,
      githubUsername: users.githubUsername,
      githubVerifiedAt: users.githubVerifiedAt,
      idVerificationStatus: users.idVerificationStatus,
      idVerifiedAt: users.idVerifiedAt,
      idDocumentType: users.idDocumentType,
      paypalPayerId: users.paypalPayerId,
      paypalPayoutEmail: users.paypalPayoutEmail,
      paypalLinkedAt: users.paypalLinkedAt,
      paypalVerified: users.paypalVerified,
      paypalAutoHoldEnabled: users.paypalAutoHoldEnabled,
      expires: sessions.expires,
    })
    .from(sessions)
    .innerJoin(users, eq(sessions.userId, users.id))
    .where(and(eq(sessions.sessionToken, sessionToken), gt(sessions.expires, new Date())))
    .limit(1);

  if (!row) return null;

  return {
    id: row.id,
    name: row.name,
    username: row.username,
    displayName: row.displayName || row.name,
    legalName: row.legalName,
    email: row.email,
    role: row.role as AuthenticatedUser["role"],
    image: row.image,
    githubUsername: row.githubUsername,
    githubVerifiedAt: row.githubVerifiedAt,
    idVerificationStatus: row.idVerificationStatus || "UNVERIFIED",
    idVerifiedAt: row.idVerifiedAt,
    idDocumentType: row.idDocumentType,
    paypalPayerId: row.paypalPayerId,
    paypalPayoutEmail: row.paypalPayoutEmail,
    paypalLinkedAt: row.paypalLinkedAt,
    paypalVerified: Boolean(row.paypalVerified),
    paypalAutoHoldEnabled: row.paypalAutoHoldEnabled ?? true,
  };
}

/**
 * Invalidate and remove a session from the database.
 */
export async function destroySession(sessionToken: string): Promise<void> {
  const db = getDb();
  await db.delete(sessions).where(eq(sessions.sessionToken, sessionToken));
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
