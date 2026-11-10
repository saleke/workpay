import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { getDb, withTransaction } from "../../db/client.js";
import { workContracts } from "../../db/schema/contracts.js";
import { providers } from "../../db/schema/providers.js";
import { payments } from "../../db/schema/payments.js";
import { tasks } from "../../db/schema/tasks.js";
import {
  FakePayPal,
  resetPaymentGateways,
  setPaymentGateway,
} from "../../integrations/payments/index.js";
import { resetEnvCache } from "../../platform/env.js";
import { newCorrelationId, newId } from "../../platform/ids.js";
import { money } from "../../platform/money.js";
import {
  closeTestDb,
  createProvider,
  createUser,
  hasTestDatabase,
  resetDatabase,
} from "../../testing/index.js";
import { createTask } from "../tasks/service.js";
import { respondToTaskConversation, startTaskConversation } from "../conversations/service.js";
import {
  confirmWorkCommitment,
  proposeWorkCommitment,
  respondToWorkCommitment,
} from "../commitments/service.js";
import { simulateAuthorizationAndAssign } from "../payments/service.js";
import { discoverProviders } from "./discovery-service.js";

if (process.env.RUN_DB_TESTS === "1") {
  const { getEnv } = await import("../../platform/env.js");
  getEnv();
}

const describeDb = hasTestDatabase() ? describe : describe.skip;
const previousEvaluationMode = process.env.EVALUATION_MODE;

describeDb("professional discovery (integration)", () => {
  beforeEach(async () => {
    process.env.EVALUATION_MODE = "true";
    resetEnvCache();
    await resetDatabase();
    setPaymentGateway(new FakePayPal());
  });

  afterAll(async () => {
    if (previousEvaluationMode === undefined) delete process.env.EVALUATION_MODE;
    else process.env.EVALUATION_MODE = previousEvaluationMode;
    resetEnvCache();
    resetPaymentGateways();
    await closeTestDb();
  });

  it("offers fixture professionals to members only as evaluation profiles", async () => {
    const db = getDb();
    const buyerUser = await createUser(db, { accountClass: "MEMBER", name: "Member Client" });
    const providerUser = await createUser(db, {
      accountClass: "DEMO_FIXTURE",
      role: "provider",
      name: "Evaluation Professional",
    });
    const provider = await createProvider(db, { displayName: "Evaluation Professional" });
    await db
      .update(providers)
      .set({ userId: providerUser.id, bio: "Evaluation profile for the public test environment." })
      .where(eq(providers.id, provider.id));

    const actor = { kind: "USER", id: buyerUser.id, role: "buyer" } as const;
    const correlationId = newCorrelationId();
    const { task } = await withTransaction((tx) =>
      createTask(tx, {
        actor,
        title: "Evaluation discovery task",
        rawRequest: "Find an evaluation professional.",
        budget: money(10_000, "USD"),
        correlationId,
      }),
    );
    const contractId = newId("contract");
    await db.insert(workContracts).values({
      id: contractId,
      taskId: task.id,
      version: 1,
      status: "ACTIVE",
      title: "Evaluation discovery task",
      summary: "Find an evaluation professional.",
      contractHash: "d".repeat(64),
      budgetMinor: 10_000,
      currency: "USD",
      approvedBy: buyerUser.id,
      approvedAt: new Date(),
    });
    await db.update(tasks).set({ status: "APPROVED" }).where(eq(tasks.id, task.id));

    const selection = await withTransaction((tx) =>
      discoverProviders(tx, {
        taskId: task.id,
        buyerUserId: buyerUser.id,
        actor,
        correlationId,
      }),
    );
    const candidates = selection.candidates as Array<{
      providerId: string;
      evaluationProfile?: boolean;
    }>;
    expect(selection.status).toBe("CANDIDATES_AVAILABLE");
    expect(candidates).toEqual([
      expect.objectContaining({ providerId: provider.id, evaluationProfile: true }),
    ]);

    const conversation = await withTransaction((tx) =>
      startTaskConversation(tx, {
        taskId: task.id,
        buyerUserId: buyerUser.id,
        providerId: provider.id,
        expectedContractVersion: 1,
        expectedContractHash: "d".repeat(64),
        initialMessage: "Would you consider this evaluation task?",
        clientMessageId: newId("cmsg"),
        actor,
        correlationId,
      }),
    );
    await withTransaction((tx) =>
      respondToTaskConversation(tx, {
        conversationId: conversation.conversationId,
        providerUserId: providerUser.id,
        response: "accept",
        actor: { kind: "USER", id: providerUser.id, role: "provider" },
        correlationId,
      }),
    );
    const proposal = await withTransaction((tx) =>
      proposeWorkCommitment(tx, {
        conversationId: conversation.conversationId,
        buyerUserId: buyerUser.id,
        amountMinor: 8_000,
        currency: "USD",
        deliveryDeadline: null,
        actor,
        correlationId,
      }),
    );
    await withTransaction((tx) =>
      respondToWorkCommitment(tx, {
        commitmentId: proposal.id,
        providerUserId: providerUser.id,
        response: "ACCEPT",
        actor: { kind: "USER", id: providerUser.id, role: "provider" },
        correlationId,
      }),
    );
    await withTransaction((tx) =>
      confirmWorkCommitment(tx, {
        commitmentId: proposal.id,
        buyerUserId: buyerUser.id,
        actor,
        correlationId,
      }),
    );
    const assignment = await simulateAuthorizationAndAssign({
      taskId: task.id,
      actor,
      correlationId,
    });
    const [payment] = await db
      .select({ mode: payments.mode })
      .from(payments)
      .where(eq(payments.id, assignment.paymentId));
    expect(payment?.mode).toBe("FAKE");
  });
});
