import { sql } from "drizzle-orm";
import { getDb } from "@workpay/shared/db";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    await getDb().execute(sql`select 1`);
    return Response.json(
      {
        status: "ready",
        service: "workpay-web",
        database: "reachable",
        timestamp: new Date().toISOString(),
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch {
    return Response.json(
      {
        status: "not_ready",
        service: "workpay-web",
        database: "unreachable",
        timestamp: new Date().toISOString(),
      },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }
}
