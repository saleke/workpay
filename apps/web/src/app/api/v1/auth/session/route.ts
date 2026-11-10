import { jsonError, jsonOk } from "@/lib/server/api";
import { getRequestSessionToken, getSessionUser } from "@/lib/server/session";

export async function GET(req: Request) {
  try {
    const token = getRequestSessionToken(req);
    const user = await getSessionUser(token);
    return jsonOk({ user });
  } catch (err) {
    return jsonError(err);
  }
}
