import { jsonError } from "@/lib/server/api";

export async function GET() {
  return jsonError(
    {
      code: "LIVE_PAYMENTS_DISABLED",
      message: "PayPal account linking is disabled during lifecycle validation.",
    },
    410,
  );
}
