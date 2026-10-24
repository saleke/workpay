import { type NextRequest, NextResponse } from "next/server";
import { getSessionUser, SESSION_COOKIE_NAME } from "@/lib/server/session";
import { jsonError } from "@/lib/server/api";

export async function GET(req: NextRequest) {
  try {
    const cookieHeader = req.headers.get("cookie") ?? "";
    const sessionMatch = cookieHeader.match(new RegExp(`${SESSION_COOKIE_NAME}=([^;]+)`));
    const sessionToken = sessionMatch && sessionMatch[1] ? decodeURIComponent(sessionMatch[1]) : null;

    if (!sessionToken) {
      return NextResponse.json({
        data: { user: null },
      });
    }

    const user = await getSessionUser(sessionToken);
    return NextResponse.json({
      data: { user: user ?? null },
    });
  } catch (err) {
    return jsonError(err);
  }
}
