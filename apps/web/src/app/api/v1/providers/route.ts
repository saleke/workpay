import { desc, eq } from "drizzle-orm";
import { getDb, jsonError, jsonOk } from "@/lib/server/api";
import { providers, capabilities, reputation } from "@workpay/shared/db/schema/providers";

export async function GET() {
  try {
    const db = getDb();

    const activeProviders = await db
      .select({
        id: providers.id,
        userId: providers.userId,
        displayName: providers.displayName,
        bio: providers.bio,
        hourlyRateMinor: providers.hourlyRateMinor,
        currency: providers.currency,
        status: providers.status,
        type: providers.type,
      })
      .from(providers)
      .where(eq(providers.status, "ACTIVE"))
      .orderBy(desc(providers.createdAt))
      .limit(50);

    const providerIds = activeProviders.map((p) => p.id);

    const allCaps = providerIds.length > 0
      ? await db
          .select({
            providerId: capabilities.providerId,
            tag: capabilities.tag,
            proficiency: capabilities.proficiency,
          })
          .from(capabilities)
      : [];

    const capsByProvider = new Map<string, Array<{ tag: string; proficiency: number }>>();
    for (const c of allCaps) {
      const list = capsByProvider.get(c.providerId) ?? [];
      list.push({ tag: c.tag, proficiency: c.proficiency });
      capsByProvider.set(c.providerId, list);
    }

    const data = activeProviders.map((p) => ({
      ...p,
      capabilities: capsByProvider.get(p.id) ?? [],
    }));

    return jsonOk(data);
  } catch (err) {
    return jsonError(err);
  }
}
