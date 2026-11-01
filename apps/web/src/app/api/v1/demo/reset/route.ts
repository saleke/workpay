import { jsonError, jsonOk } from "@/lib/server/api";
import { resetDatabase } from "@workpay/shared/testing";
import { seed } from "@workpay/shared/db";
import { authorizationError } from "@workpay/shared/platform";

export async function POST(req: Request) {
  try {
    const hostname = new URL(req.url).hostname;
    if (
      process.env.NODE_ENV === "production" ||
      process.env.WORKPAY_MODE === "production" ||
      !["localhost", "127.0.0.1", "::1"].includes(hostname)
    ) {
      throw authorizationError();
    }
    await resetDatabase();
    await seed();
    return jsonOk({ message: "WorkPay demo environment reset and seeded successfully" });
  } catch (err) {
    return jsonError(err);
  }
}
