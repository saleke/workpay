import { jsonError } from "@/lib/server/api";

export async function GET() {
  return jsonError(
    {
      code: "TASK_CONTEXT_REQUIRED",
      message:
        "Professional profiles are available only within an owner-authorized task discovery flow.",
    },
    410,
  );
}
