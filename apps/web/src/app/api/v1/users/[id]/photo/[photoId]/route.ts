import { and, eq } from "drizzle-orm";
import { users } from "@workpay/shared/db/schema/identity";
import { getObjectStorage } from "@workpay/shared/integrations";
import { AppError, notFound } from "@workpay/shared/platform";
import { getDb, jsonError } from "@/lib/server/api";
import { inspectProfilePhoto, profilePhotoStorageKey } from "@/lib/server/profile-photo";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string; photoId: string }> },
) {
  try {
    const { id, photoId } = await params;
    if (!/^[a-zA-Z0-9_-]+$/.test(id) || !/^[a-zA-Z0-9_-]+$/.test(photoId)) {
      throw notFound("Profile photo");
    }
    const image = `/api/v1/users/${id}/photo/${photoId}`;
    const [owner] = await getDb()
      .select({ id: users.id })
      .from(users)
      .where(and(eq(users.id, id), eq(users.image, image)))
      .limit(1);
    if (!owner) throw notFound("Profile photo");

    const bytes = await getObjectStorage().get(profilePhotoStorageKey(id, photoId));
    let info;
    try {
      info = inspectProfilePhoto(bytes);
    } catch {
      throw new AppError("INTERNAL_ERROR", "The stored profile photo is invalid.");
    }
    const body = new ArrayBuffer(bytes.byteLength);
    new Uint8Array(body).set(bytes);
    return new Response(body, {
      headers: {
        "Content-Type": info.contentType,
        "Content-Length": String(bytes.byteLength),
        "Cache-Control": "public, max-age=31536000, immutable",
        "X-Content-Type-Options": "nosniff",
        "Content-Security-Policy": "default-src 'none'; sandbox",
      },
    });
  } catch (error) {
    return jsonError(error);
  }
}
