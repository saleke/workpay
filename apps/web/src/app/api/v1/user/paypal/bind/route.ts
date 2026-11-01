import { jsonError } from "@/lib/server/api";

export async function POST() {
  return jsonError(
    {
      code: "LIVE_PAYMENTS_DISABLED",
      message: "Manual PayPal binding is disabled during lifecycle validation.",
    },
    410,
  );
}
