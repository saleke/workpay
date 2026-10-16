import { getDb, jsonError, jsonOk, resolveActor } from "@/lib/server/api";
import { buildProviderWorkDto } from "@/lib/server/provider";

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id: executionId } = await params;
    const actor = resolveActor(req, "provider");
    const db = getDb();
    const data = await buildProviderWorkDto(db, executionId);
    return jsonOk(data);
  } catch (err) {
    return jsonError(err);
  }
}
