import { jsonError, jsonOk } from "@/lib/server/api";
import { getSessionUser, SESSION_COOKIE_NAME } from "@/lib/server/session";

export async function GET(req: Request) {
  try {
    const cookieHeader = req.headers.get("cookie") ?? "";
    const match = cookieHeader.match(new RegExp(`${SESSION_COOKIE_NAME}=([^;]+)`));
    const token = match && match[1] ? decodeURIComponent(match[1]) : null;

    const user = await getSessionUser(token);
    return jsonOk({ user });
  } catch (err) {
    return jsonError(err);
  }
}
