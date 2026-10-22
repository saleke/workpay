import { NextResponse } from "next/server";
import { clearSessionCookie, destroySession, SESSION_COOKIE_NAME } from "@/lib/server/session";

export async function POST(req: Request) {
  const cookieHeader = req.headers.get("cookie") ?? "";
  const match = cookieHeader.match(new RegExp(`${SESSION_COOKIE_NAME}=([^;]+)`));
  const token = match && match[1] ? decodeURIComponent(match[1]) : null;

  if (token) {
    try {
      await destroySession(token);
    } catch {
      // Ignore cleanup error if session already gone
    }
  }

  const res = NextResponse.json({ data: { message: "Signed out successfully" } });
  clearSessionCookie(res);
  return res;
}
