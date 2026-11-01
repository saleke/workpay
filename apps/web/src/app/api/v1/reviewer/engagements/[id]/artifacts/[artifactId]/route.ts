import { and, desc, eq, inArray } from "drizzle-orm";
import {
  independentReviewEngagements,
  submissionArtifacts,
  workSubmissions,
} from "@workpay/shared/db/schema";
import { getObjectStorage } from "@workpay/shared/integrations";
import { notFound } from "@workpay/shared/platform";
import { getDb, jsonError } from "@/lib/server/api";
import { resolveConversationActor } from "@/lib/server/conversation-auth";

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string; artifactId: string }> },
) {
  try {
    const actor = await resolveConversationActor(req);
    if (!actor.id) return new Response("Not found", { status: 404 });
    const { id: engagementId, artifactId } = await params;
    const db = getDb();
    const [engagement] = await db
      .select()
      .from(independentReviewEngagements)
      .where(
        and(
          eq(independentReviewEngagements.id, engagementId),
          eq(independentReviewEngagements.reviewerUserId, actor.id),
          inArray(independentReviewEngagements.status, ["ENGAGED", "INCONCLUSIVE", "CLOSED"]),
        ),
      )
      .limit(1);
    if (!engagement) throw notFound("Review artifact");

    const [artifact] = await db
      .select()
      .from(submissionArtifacts)
      .where(eq(submissionArtifacts.id, artifactId))
      .limit(1);
    if (!artifact) throw notFound("Review artifact");
    const [submission] = await db
      .select({ id: workSubmissions.id })
      .from(workSubmissions)
      .where(
        and(
          eq(workSubmissions.id, artifact.submissionId),
          eq(workSubmissions.taskId, engagement.taskId),
          eq(workSubmissions.contractVersion, engagement.contractVersion),
          eq(workSubmissions.contractHash, engagement.contractHash),
          inArray(workSubmissions.status, ["SUBMITTED", "UNDER_REVIEW"]),
        ),
      )
      .orderBy(desc(workSubmissions.submittedAt))
      .limit(1);
    if (!submission || submission.id !== artifact.submissionId) throw notFound("Review artifact");

    const bytes = await getObjectStorage().get(artifact.storageKey);
    const body = new ArrayBuffer(bytes.byteLength);
    new Uint8Array(body).set(bytes);
    const filename = artifact.filename.replace(/[\r\n"\\]/g, "_");
    const encodedFilename = encodeURIComponent(artifact.filename).replace(
      /['()*]/g,
      (character) => `%${character.charCodeAt(0).toString(16).toUpperCase()}`,
    );
    return new Response(body, {
      headers: {
        "Content-Type": artifact.contentType ?? "application/octet-stream",
        "Content-Length": String(bytes.byteLength),
        "Content-Disposition": `attachment; filename="${filename}"; filename*=UTF-8''${encodedFilename}`,
        "X-Content-Type-Options": "nosniff",
        "Cache-Control": "private, no-store",
      },
    });
  } catch (error) {
    return jsonError(error);
  }
}
