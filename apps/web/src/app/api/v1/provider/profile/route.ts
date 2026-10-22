import { eq } from "drizzle-orm";
import { z } from "zod";
import { getDb, jsonError, jsonOk, resolveActorAsync, withTransaction } from "@/lib/server/api";
import { providers, capabilities } from "@workpay/shared/db/schema/providers";
import { newId } from "@workpay/shared/platform";

const updateProfileSchema = z.object({
  displayName: z.string().trim().min(2).max(100),
  bio: z.string().trim().max(500).optional().nullable(),
  hourlyRateMinor: z.number().int().nonnegative().optional().nullable(),
  currency: z.literal("USD").default("USD"),
  payoutEmail: z.string().trim().email(),
  status: z.enum(["ACTIVE", "INACTIVE"]).default("ACTIVE"),
  capabilities: z
    .array(
      z.object({
        tag: z.string().trim().min(1).max(50),
        proficiency: z.number().int().min(1).max(5).default(4),
      }),
    )
    .default([]),
});

export async function GET(req: Request) {
  try {
    const actor = await resolveActorAsync(req, "provider");
    const db = getDb();

    const [provider] = await db
      .select()
      .from(providers)
      .where(eq(providers.userId, actor.id as string))
      .limit(1);

    if (!provider) {
      return jsonOk({ isListed: false, provider: null });
    }

    const caps = await db
      .select({
        tag: capabilities.tag,
        proficiency: capabilities.proficiency,
      })
      .from(capabilities)
      .where(eq(capabilities.providerId, provider.id));

    return jsonOk({
      isListed: true,
      provider: {
        id: provider.id,
        userId: provider.userId,
        displayName: provider.displayName,
        bio: provider.bio,
        hourlyRateMinor: provider.hourlyRateMinor,
        currency: provider.currency,
        payoutEmail: provider.payoutEmail,
        status: provider.status,
        capabilities: caps,
      },
    });
  } catch (err) {
    return jsonError(err);
  }
}

export async function PUT(req: Request) {
  try {
    const actor = await resolveActorAsync(req, "provider");
    const body = await req.json();
    const parsed = updateProfileSchema.parse(body);

    const result = await withTransaction(async (tx) => {
      const [existing] = await tx
        .select()
        .from(providers)
        .where(eq(providers.userId, actor.id as string))
        .limit(1);

      let providerId: string;

      if (existing) {
        providerId = existing.id;
        await tx
          .update(providers)
          .set({
            displayName: parsed.displayName,
            bio: parsed.bio ?? null,
            hourlyRateMinor: parsed.hourlyRateMinor ?? null,
            currency: parsed.currency,
            payoutEmail: parsed.payoutEmail,
            status: parsed.status,
            updatedAt: new Date(),
          })
          .where(eq(providers.id, providerId));
      } else {
        providerId = newId("provider");
        await tx.insert(providers).values({
          id: providerId,
          userId: actor.id as string,
          displayName: parsed.displayName,
          type: "HUMAN",
          status: parsed.status,
          bio: parsed.bio ?? null,
          hourlyRateMinor: parsed.hourlyRateMinor ?? null,
          currency: parsed.currency,
          payoutEmail: parsed.payoutEmail,
        });
      }

      await tx
        .delete(capabilities)
        .where(eq(capabilities.providerId, providerId));

      if (parsed.capabilities.length > 0) {
        await tx.insert(capabilities).values(
          parsed.capabilities.map((c) => ({
            id: newId("cap"),
            providerId,
            tag: c.tag.toLowerCase(),
            proficiency: c.proficiency,
          })),
        );
      }

      return {
        id: providerId,
        userId: actor.id as string,
        displayName: parsed.displayName,
        bio: parsed.bio ?? null,
        hourlyRateMinor: parsed.hourlyRateMinor ?? null,
        currency: parsed.currency,
        payoutEmail: parsed.payoutEmail,
        status: parsed.status,
        capabilities: parsed.capabilities,
      };
    });

    return jsonOk({ isListed: true, provider: result });
  } catch (err) {
    return jsonError(err);
  }
}
