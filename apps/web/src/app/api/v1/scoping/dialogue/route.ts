import { jsonError } from "@/lib/server/api";

export async function POST() {
  return jsonError(
    {
      code: "LEGACY_INTAKE_DISABLED",
      message: "The legacy scoping flow is disabled. Start a new intake through /intake.",
    },
    410,
  );
}
