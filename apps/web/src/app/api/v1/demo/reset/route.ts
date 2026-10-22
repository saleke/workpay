import { jsonError, jsonOk } from "@/lib/server/api";
import { resetDatabase } from "@workpay/shared/testing";
import { seed } from "@workpay/shared/db";

export async function POST() {
  try {
    await resetDatabase();
    await seed();
    return jsonOk({ message: "WorkPay demo environment reset and seeded successfully" });
  } catch (err) {
    return jsonError(err);
  }
}
