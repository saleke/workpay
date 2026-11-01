import { jsonError } from "@/lib/server/api";

export async function POST() {
  return jsonError(
    {
      code: "LEGACY_PLANNING_DISABLED",
      message:
        "Legacy task planning is disabled. Requirements must come from a versioned, user-confirmed intake brief.",
    },
    410,
  );
}
