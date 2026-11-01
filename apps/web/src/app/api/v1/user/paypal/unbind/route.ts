import { jsonError } from "@/lib/server/api";

export async function POST() {
  return jsonError(
    {
      code: "LIVE_PAYMENTS_DISABLED",
      message: "PayPal account management is disabled during lifecycle validation.",
    },
    410,
  );
}
