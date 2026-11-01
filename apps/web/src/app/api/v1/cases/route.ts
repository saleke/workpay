import { jsonError } from "@/lib/server/api";

export async function GET() {
  return jsonError(
    {
      code: "PLATFORM_ADJUDICATION_DISABLED",
      message:
        "WorkPay does not provide an arbitration queue. Independent review is available only through an engagement agreed by the task participants.",
    },
    410,
  );
}
