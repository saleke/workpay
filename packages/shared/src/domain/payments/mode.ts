import { eq } from "drizzle-orm";
import type { Database } from "../../db/client.js";
import { users } from "../../db/schema/identity.js";
import { commercialAgreements } from "../../db/schema/negotiation.js";
import { providers } from "../../db/schema/providers.js";
import { tasks } from "../../db/schema/tasks.js";
import {
  getConfiguredNewPaymentMode,
  type PaymentMode,
} from "../../integrations/payments/config.js";
import { conflict, notFound } from "../../platform/errors.js";
import { getEnv } from "../../platform/env.js";
import { requiresSimulatedPayment } from "../identity/account-class.js";

export interface PaymentParticipants {
  task: typeof tasks.$inferSelect;
  agreement: typeof commercialAgreements.$inferSelect;
  buyer: typeof users.$inferSelect;
  provider: typeof providers.$inferSelect;
  providerUser: typeof users.$inferSelect;
  mode: PaymentMode;
}

export async function resolvePaymentParticipants(
  db: Database,
  taskId: string,
  agreementId: string,
): Promise<PaymentParticipants> {
  const [task] = await db.select().from(tasks).where(eq(tasks.id, taskId)).limit(1);
  if (!task) throw notFound("Task");
  const [agreement] = await db
    .select()
    .from(commercialAgreements)
    .where(eq(commercialAgreements.id, agreementId))
    .limit(1);
  if (!agreement || agreement.taskId !== task.id) throw notFound("Agreement");
  const [buyer] = await db.select().from(users).where(eq(users.id, task.userId)).limit(1);
  if (!buyer) throw notFound("Buyer account");
  const [provider] = await db
    .select()
    .from(providers)
    .where(eq(providers.id, agreement.providerId))
    .limit(1);
  if (!provider?.userId)
    throw conflict("The selected professional is not linked to a user account.");
  const [providerUser] = await db
    .select()
    .from(users)
    .where(eq(users.id, provider.userId))
    .limit(1);
  if (!providerUser) throw notFound("Professional account");

  const buyerClass = buyer.accountClass;
  const providerClass = providerUser.accountClass;
  let mode: PaymentMode;
  if (
    requiresSimulatedPayment({
      buyerClass,
      providerClass,
      evaluationMode: getEnv().EVALUATION_MODE,
    })
  ) {
    mode = "FAKE";
  } else if (buyerClass === "MEMBER" && providerClass === "MEMBER") {
    mode = getConfiguredNewPaymentMode();
  } else {
    throw conflict("Demo and member accounts cannot share a payment workflow.", {
      buyerAccountClass: buyerClass,
      providerAccountClass: providerClass,
    });
  }
  return { task, agreement, buyer, provider, providerUser, mode };
}
