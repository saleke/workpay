import { and, eq } from "drizzle-orm";
import { getDb, jsonError } from "@/lib/server/api";
import { requireTaskOwner } from "@/lib/server/conversation-auth";
import { submissionArtifacts, workSubmissions } from "@workpay/shared/db/schema/execution";
import { getObjectStorage } from "@workpay/shared/integrations";
import { AppError, notFound, sha256HexOfBytes } from "@workpay/shared/platform";

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string; artifactId: string }> },
) {
  try {
    const { id: submissionId, artifactId } = await params;
    const [artifact] = await getDb()
      .select({
        taskId: workSubmissions.taskId,
        filename: submissionArtifacts.filename,
        contentType: submissionArtifacts.contentType,
        storageKey: submissionArtifacts.storageKey,
        sizeBytes: submissionArtifacts.sizeBytes,
        sha256: submissionArtifacts.sha256,
      })
      .from(submissionArtifacts)
      .innerJoin(workSubmissions, eq(submissionArtifacts.submissionId, workSubmissions.id))
      .where(
        and(
          eq(submissionArtifacts.id, artifactId),
          eq(submissionArtifacts.submissionId, submissionId),
        ),
      )
      .limit(1);
    if (!artifact) throw notFound("Submission artifact");
    await requireTaskOwner(req, artifact.taskId);

    const bytes = await getObjectStorage().get(artifact.storageKey);
    if (
      bytes.byteLength !== artifact.sizeBytes ||
      (artifact.sha256 && sha256HexOfBytes(bytes) !== artifact.sha256)
    ) {
      throw new AppError("INTERNAL_ERROR", "The artifact failed its integrity check.");
    }
    const body = new ArrayBuffer(bytes.byteLength);
    new Uint8Array(body).set(bytes);
    const asciiFilename =
      artifact.filename
        .normalize("NFKD")
        .replace(/[^\x20-\x7E]/g, "_")
        .replace(/[\r\n"\\]/g, "_")
        .slice(0, 255) || "artifact";
    const encodedFilename = encodeURIComponent(artifact.filename).replace(
      /['()*]/g,
      (character) => `%${character.charCodeAt(0).toString(16).toUpperCase()}`,
    );
    return new Response(body, {
      headers: {
        "Content-Type": artifact.contentType ?? "application/octet-stream",
        "Content-Length": String(bytes.byteLength),
        "Content-Disposition": `attachment; filename="${asciiFilename}"; filename*=UTF-8''${encodedFilename}`,
        "X-Content-Type-Options": "nosniff",
        "Cache-Control": "private, no-store",
      },
    });
  } catch (error) {
    return jsonError(error);
  }
}
