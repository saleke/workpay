import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { getDb, withTransaction } from "../../db/client.js";
import { workContracts } from "../../db/schema/contracts.js";
import { workExecutions } from "../../db/schema/execution.js";
import { commercialAgreements } from "../../db/schema/negotiation.js";
import { payments } from "../../db/schema/payments.js";
import { providers } from "../../db/schema/providers.js";
import { tasks } from "../../db/schema/tasks.js";
import { FakePayPal, setPaymentGateway } from "../../integrations/payments/index.js";
import { newCorrelationId, newId } from "../../platform/ids.js";
import { money } from "../../platform/money.js";
import {
  closeTestDb,
  createProvider,
  createUser,
  hasTestDatabase,
  resetDatabase,
} from "../../testing/index.js";
import type { Actor } from "../identity/authorize.js";
import { createTask } from "../tasks/service.js";
import { simulateAuthorizationAndAssign } from "../payments/service.js";
import { approveContract } from "../contracts/service.js";
import { acceptAssignment } from "./service.js";

if (process.env.RUN_DB_TESTS === "1") {
  const { getEnv } = await import("../../platform/env.js");
  getEnv();
}

const describeDb = hasTestDatabase() ? describe : describe.skip;

describeDb("provider execution authorization (integration)", () => {
  beforeEach(async () => {
    await resetDatabase();
    setPaymentGateway(new FakePayPal());
  });

  afterAll(async () => {
    setPaymentGateway(null);
    await closeTestDb();
  });

  it("does not let one professional accept another professional's assignment", async () => {
    const db = getDb();
    const correlationId = newCorrelationId();
    const buyerUser = await createUser(db, { role: "buyer", name: "Buyer" });
    const assignedUser = await createUser(db, { role: "provider", name: "Assigned" });
    const otherUser = await createUser(db, { role: "provider", name: "Other" });
    const assignedProvider = await createProvider(db, { displayName: "Assigned professional" });
    const otherProvider = await createProvider(db, { displayName: "Other professional" });
    await db
      .update(providers)
      .set({ userId: assignedUser.id })
      .where(eq(providers.id, assignedProvider.id));
    await db
      .update(providers)
      .set({ userId: otherUser.id })
      .where(eq(providers.id, otherProvider.id));

    const buyer: Actor = { kind: "USER", id: buyerUser.id, role: "buyer" };
    const { task } = await withTransaction((tx) =>
      createTask(tx, {
        actor: buyer,
        title: "Prepare a report",
        rawRequest: "Prepare the agreed report.",
        budget: money(10_000, "USD"),
        correlationId,
      }),
    );
    const contractId = newId("contract");
    const contractHash = "a".repeat(64);
    await db.insert(workContracts).values({
      id: contractId,
      taskId: task.id,
      version: 1,
      status: "ACTIVE",
      title: "Report",
      summary: "Prepare the report.",
      contractHash,
      budgetMinor: 10_000,
      currency: "USD",
      approvedBy: buyerUser.id,
      approvedAt: new Date(),
    });
    const agreementId = newId("agreement");
    await db.insert(commercialAgreements).values({
      id: agreementId,
      taskId: task.id,
      contractId,
      providerId: assignedProvider.id,
      contractVersion: 1,
      status: "AUTHORIZED",
      agreedPriceMinor: 9_000,
      currency: "USD",
      agreementHash: "b".repeat(64),
    });
    const executionId = newId("exec");
    await db.insert(workExecutions).values({
      id: executionId,
      taskId: task.id,
      contractId,
      agreementId,
      providerId: assignedProvider.id,
      status: "ASSIGNED",
      contractVersion: 1,
      contractHash,
    });

    const otherActor: Actor = { kind: "USER", id: otherUser.id, role: "provider" };
    await expect(
      withTransaction((tx) =>
        acceptAssignment(tx, {
          executionId,
          providerId: assignedProvider.id,
          actor: otherActor,
          correlationId,
        }),
      ),
    ).rejects.toMatchObject({ code: "AUTHORIZATION_ERROR" });

    const [unchanged] = await db
      .select({ status: workExecutions.status })
      .from(workExecutions)
      .where(eq(workExecutions.id, executionId));
    expect(unchanged?.status).toBe("ASSIGNED");

    const assignedActor: Actor = {
      kind: "USER",
      id: assignedUser.id,
      role: "provider",
    };
    const accepted = await withTransaction((tx) =>
      acceptAssignment(tx, {
        executionId,
        providerId: assignedProvider.id,
        actor: assignedActor,
        correlationId,
      }),
    );
    expect(accepted.status).toBe("ACCEPTED");
  });

  it("creates an assignment only after the owner explicitly runs the payment simulation", async () => {
    const db = getDb();
    const correlationId = newCorrelationId();
    const buyerUser = await createUser(db, { role: "buyer", name: "Buyer" });
    const providerUser = await createUser(db, { role: "provider", name: "Professional" });
    const provider = await createProvider(db, { displayName: "Professional" });
    await db
      .update(providers)
      .set({ userId: providerUser.id })
      .where(eq(providers.id, provider.id));
    const buyer: Actor = { kind: "USER", id: buyerUser.id, role: "buyer" };
    const { task } = await withTransaction((tx) =>
      createTask(tx, {
        actor: buyer,
        title: "Prepare a report",
        rawRequest: "Prepare the agreed report.",
        budget: money(10_000, "USD"),
        correlationId,
      }),
    );
    const contractId = newId("contract");
    const contractHash = "c".repeat(64);
    await db.insert(workContracts).values({
      id: contractId,
      taskId: task.id,
      version: 1,
      status: "ACTIVE",
      title: "Report",
      summary: "Prepare the report.",
      contractHash,
      budgetMinor: 10_000,
      currency: "USD",
      approvedBy: buyerUser.id,
      approvedAt: new Date(),
    });
    const agreementId = newId("agreement");
    await db.insert(commercialAgreements).values({
      id: agreementId,
      taskId: task.id,
      contractId,
      providerId: provider.id,
      contractVersion: 1,
      status: "PENDING_AUTHORIZATION",
      agreedPriceMinor: 9_000,
      currency: "USD",
      agreementHash: "d".repeat(64),
    });
    await db
      .update(tasks)
      .set({ status: "AGREEMENT_READY" })
      .where(eq(tasks.id, task.id));

    const otherBuyer = await createUser(db, { role: "buyer", name: "Other buyer" });
    await expect(
      simulateAuthorizationAndAssign({
        taskId: task.id,
        actor: { kind: "USER", id: otherBuyer.id, role: "buyer" },
        correlationId,
      }),
    ).rejects.toMatchObject({ code: "AUTHORIZATION_ERROR" });

    const result = await simulateAuthorizationAndAssign({
      taskId: task.id,
      actor: buyer,
      correlationId,
    });
    expect(result.alreadyPrepared).toBe(false);

    const [payment] = await db
      .select()
      .from(payments)
      .where(eq(payments.id, result.paymentId));
    const [execution] = await db
      .select()
      .from(workExecutions)
      .where(eq(workExecutions.id, result.executionId));
    const [updatedTask] = await db
      .select({ status: tasks.status })
      .from(tasks)
      .where(eq(tasks.id, task.id));
    expect(payment?.status).toBe("AUTHORIZED");
    expect(execution?.status).toBe("ASSIGNED");
    expect(updatedTask?.status).toBe("PAYMENT_AUTHORIZATION");

    const repeated = await simulateAuthorizationAndAssign({
      taskId: task.id,
      actor: buyer,
      correlationId,
    });
    expect(repeated).toMatchObject({
      paymentId: result.paymentId,
      executionId: result.executionId,
      alreadyPrepared: true,
    });
  });

  it("does not let one buyer approve another buyer's contract", async () => {
    const db = getDb();
    const correlationId = newCorrelationId();
    const owner = await createUser(db, { role: "buyer", name: "Owner" });
    const other = await createUser(db, { role: "buyer", name: "Other buyer" });
    const ownerActor: Actor = { kind: "USER", id: owner.id, role: "buyer" };
    const { task } = await withTransaction((tx) =>
      createTask(tx, {
        actor: ownerActor,
        title: "Private task",
        rawRequest: "Prepare a private deliverable.",
        budget: money(5_000, "USD"),
        correlationId,
      }),
    );
    const contractId = newId("contract");
    const contractHash = "e".repeat(64);
    await db.insert(workContracts).values({
      id: contractId,
      taskId: task.id,
      version: 1,
      status: "AWAITING_APPROVAL",
      title: "Private task",
      summary: "Private terms",
      contractHash,
      budgetMinor: 5_000,
      currency: "USD",
    });

    await expect(
      withTransaction((tx) =>
        approveContract(tx, {
          contractId,
          expectedHash: contractHash,
          actor: { kind: "USER", id: other.id, role: "buyer" },
          correlationId,
        }),
      ),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });

    const approved = await withTransaction((tx) =>
      approveContract(tx, {
        contractId,
        expectedHash: contractHash,
        actor: ownerActor,
        correlationId,
      }),
    );
    expect(approved.status).toBe("ACTIVE");
    expect(approved.approvedBy).toBe(owner.id);
  });
});
