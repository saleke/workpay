import { type NextRequest, NextResponse } from "next/server";
import { getRequestSessionToken, getSessionUser } from "@/lib/server/session";
import { jsonError } from "@/lib/server/api";

export async function GET(req: NextRequest) {
  try {
    const sessionToken = getRequestSessionToken(req);

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
