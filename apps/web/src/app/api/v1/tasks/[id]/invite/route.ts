import { jsonError } from "@/lib/server/api";

function disabledOutreach() {
  return jsonError(
    {
      code: "AUTOMATED_OUTREACH_DISABLED",
      message:
        "Legacy task invitations are disabled. Contact a professional only from the user-approved candidate flow.",
    },
    410,
  );
}

export async function GET() {
  return disabledOutreach();
}

export async function POST() {
  return disabledOutreach();
}
