import { jsonError } from "@/lib/server/api";

export async function POST() {
  return jsonError(
    {
      code: "PLATFORM_ADJUDICATION_DISABLED",
      message:
        "WorkPay cannot override verification, decide a party dispute, or release money through a manual case ruling.",
    },
    410,
  );
}
