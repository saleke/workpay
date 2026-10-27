import { jsonError } from "@/lib/server/api";

export async function POST() {
  return jsonError(
    {
      code: "LEGACY_FINALIZATION_DISABLED",
      message:
        "Legacy task finalization is disabled. Use /intake to create and approve a server-owned brief. Brief approval does not yet create a task or contact a professional.",
    },
    410,
  );
}
