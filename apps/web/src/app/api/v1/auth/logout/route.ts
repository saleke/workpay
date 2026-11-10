import { NextResponse } from "next/server";
import {
  clearSessionCookie,
  destroySession,
  getRequestSessionToken,
  SESSION_HEADER_NAME,
} from "@/lib/server/session";

export async function POST(req: Request) {
  const token = getRequestSessionToken(req);

  if (token) {
    try {
      await destroySession(token);
    } catch {
      // Ignore cleanup error if session already gone
    }
  }

  const res = NextResponse.json({ data: { message: "Signed out successfully" } });
  if (!req.headers.get(SESSION_HEADER_NAME)) clearSessionCookie(res);
  return res;
}
