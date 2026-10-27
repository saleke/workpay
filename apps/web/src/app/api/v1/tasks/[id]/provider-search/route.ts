import { jsonError } from "@/lib/server/api";

export async function POST() {
  return jsonError(
    {
      code: "AUTOMATED_OUTREACH_DISABLED",
      message:
        "Automated provider selection and outreach are disabled. Future discovery will let the buyer choose a candidate and explicitly approve contact.",
    },
    410,
  );
}
