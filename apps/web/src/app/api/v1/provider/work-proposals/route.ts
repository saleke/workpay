import { getDb, jsonError, jsonOk } from "@/lib/server/api";
import { requireProviderPrincipal } from "@/lib/server/conversation-auth";
import { buildWorkCommitmentDto } from "@/lib/server/work-commitment";
import { listProviderWorkCommitments } from "@workpay/shared/domain";

export async function GET(req: Request) {
  try {
    const { actor } = await requireProviderPrincipal(req);
    const rows = await listProviderWorkCommitments(getDb(), actor.id);
    const data = await Promise.all(
      rows.map((row) => buildWorkCommitmentDto(getDb(), row.commitment.id)),
    );
    return jsonOk(data);
  } catch (error) {
    return jsonError(error);
  }
}
