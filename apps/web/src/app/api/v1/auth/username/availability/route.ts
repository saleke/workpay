import { eq } from "drizzle-orm";
import { getDb, jsonError, jsonOk } from "@/lib/server/api";
import { users } from "@workpay/shared/db/schema/identity";
import { normalizeUsernameInput } from "@workpay/shared/domain";

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const rawUsername = searchParams.get("username") ?? "";

    const normalized = normalizeUsernameInput(rawUsername);
    if (!normalized.ok || !normalized.value) {
      return jsonError(
        { code: "VALIDATION_ERROR", message: normalized.message || "Username is required." },
        400,
      );
    }

    const db = getDb();
    const [existing] = await db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.username, normalized.value))
      .limit(1);

    return jsonOk({
      data: {
        available: !existing,
        username: normalized.value,
      },
    });
  } catch (err) {
    return jsonError(err);
  }
}
