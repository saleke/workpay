import { getDb, jsonError, jsonOk } from "@/lib/server/api";
import { getConversationForParticipant, listProviderConversations } from "@workpay/shared/domain";
import { requireProviderActor } from "@/lib/server/conversation-auth";
import { providers } from "@workpay/shared/db/schema/providers";
import { eq } from "drizzle-orm";
import type { TaskConversationDto } from "@/lib/api/types";

export async function GET(req: Request) {
  try {
    const actor = await requireProviderActor(req);
    const db = getDb();
    const conversations = await listProviderConversations(db, actor.id);
    const data = await Promise.all(
      conversations.map(async (conversation) => {
        const [detail, provider] = await Promise.all([
          getConversationForParticipant(db, {
            conversationId: conversation.id,
            userId: actor.id,
          }),
          db
            .select({ displayName: providers.displayName })
            .from(providers)
            .where(eq(providers.id, conversation.providerId))
            .limit(1),
        ]);
        return {
          ...detail,
          providerDisplayName: provider[0]?.displayName ?? "Professional",
          contactApprovedAt: detail.contactApprovedAt.toISOString(),
          providerRespondedAt: detail.providerRespondedAt?.toISOString() ?? null,
          createdAt: detail.createdAt.toISOString(),
          updatedAt: detail.updatedAt.toISOString(),
          messages: detail.messages.map((message): TaskConversationDto["messages"][number] => ({
            ...message,
            createdAt: message.createdAt.toISOString(),
          })),
        };
      }),
    );
    return jsonOk(data);
  } catch (error) {
    return jsonError(error);
  }
}
