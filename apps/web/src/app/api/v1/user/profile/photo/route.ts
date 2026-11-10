import { eq } from "drizzle-orm";
import { users } from "@workpay/shared/db/schema/identity";
import { getObjectStorage } from "@workpay/shared/integrations";
import { AppError, newId } from "@workpay/shared/platform";
import { getDb, jsonError, jsonOk } from "@/lib/server/api";
import { requireAuthenticatedSession } from "@/lib/server/conversation-auth";
import {
  inspectProfilePhoto,
  parseStoredProfilePhoto,
  profilePhotoStorageKey,
} from "@/lib/server/profile-photo";

export async function POST(req: Request) {
  let uploadedKey: string | null = null;
  try {
    const { user } = await requireAuthenticatedSession(req);
    const form = await req.formData();
    const file = form.get("photo");
    if (!(file instanceof File)) {
      throw new AppError("VALIDATION_ERROR", "Choose a profile photo to upload.");
    }
    const bytes = new Uint8Array(await file.arrayBuffer());
    const info = inspectProfilePhoto(bytes);
    const photoId = newId("photo");
    uploadedKey = profilePhotoStorageKey(user.id, photoId);
    await getObjectStorage().put({ key: uploadedKey, body: bytes, contentType: info.contentType });

    const db = getDb();
    const [current] = await db
      .select({ image: users.image })
      .from(users)
      .where(eq(users.id, user.id))
      .limit(1);
    const previousPhotoId = parseStoredProfilePhoto(current?.image ?? null, user.id);
    const image = `/api/v1/users/${user.id}/photo/${photoId}`;
    await db.update(users).set({ image, updatedAt: new Date() }).where(eq(users.id, user.id));

    if (previousPhotoId) {
      await getObjectStorage()
        .delete(profilePhotoStorageKey(user.id, previousPhotoId))
        .catch(() => undefined);
    }
    return jsonOk({ data: { image, width: info.width, height: info.height } }, 201);
  } catch (error) {
    if (uploadedKey)
      await getObjectStorage()
        .delete(uploadedKey)
        .catch(() => undefined);
    return jsonError(error);
  }
}

export async function DELETE(req: Request) {
  try {
    const { user } = await requireAuthenticatedSession(req);
    const db = getDb();
    const [current] = await db
      .select({ image: users.image })
      .from(users)
      .where(eq(users.id, user.id))
      .limit(1);
    const photoId = parseStoredProfilePhoto(current?.image ?? null, user.id);
    await db.update(users).set({ image: null, updatedAt: new Date() }).where(eq(users.id, user.id));
    if (photoId) {
      await getObjectStorage()
        .delete(profilePhotoStorageKey(user.id, photoId))
        .catch(() => undefined);
    }
    return jsonOk({ data: { image: null } });
  } catch (error) {
    return jsonError(error);
  }
}
