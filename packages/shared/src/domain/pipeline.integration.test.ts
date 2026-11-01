import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { getDb, withTransaction } from "../db/client.js";
import { getEnv } from "../platform/env.js";
import { newCorrelationId } from "../platform/ids.js";
import { money } from "../platform/money.js";
import {
  closeTestDb,
  createUser,
  hasTestDatabase,
  resetDatabase,
} from "../testing/index.js";
import type { Actor } from "./identity/authorize.js";
import { createTask } from "./tasks/service.js";
import {
  agentPlanAndDraftContract,
  agentSelectProviderAndNegotiate,
  ensureAgent,
} from "./agent/orchestrator.js";

if (process.env.RUN_DB_TESTS === "1") getEnv();

const describeDb = hasTestDatabase() ? describe : describe.skip;

describeDb("retired autonomous pipeline (integration)", () => {
  beforeEach(async () => {
    await resetDatabase();
  });

  afterAll(async () => {
    await closeTestDb();
  });

  it("blocks autonomous planning and provider selection", async () => {
    const db = getDb();
    const correlationId = newCorrelationId();
    const buyerRow = await createUser(db, { role: "buyer", name: "Buyer" });
    const buyer: Actor = { kind: "USER", id: buyerRow.id, role: "buyer" };
    const { task } = await withTransaction((tx) =>
      createTask(tx, {
        actor: buyer,
        title: "Prepare a customer report",
        rawRequest: "Please prepare a customer report.",
        budget: money(15_000, "USD"),
        correlationId,
      }),
    );

    const { actor: agentActor } = await ensureAgent({ taskId: task.id, userId: buyerRow.id });
    const drafted = await agentPlanAndDraftContract({
      taskId: task.id,
      actor: agentActor,
      correlationId,
    });
    expect(drafted.ok).toBe(false);
    if (drafted.ok) throw new Error("legacy autonomous planning must remain disabled");
    expect(drafted.reasonCode).toBe("agent.explicit_authority_required");

    const selection = await agentSelectProviderAndNegotiate({
      taskId: task.id,
      actor: agentActor,
      correlationId,
    });
    expect(selection.ok).toBe(false);
    if (selection.ok) throw new Error("legacy autonomous selection must remain disabled");
    expect(selection.reasonCode).toBe("agent.user_selection_required");
  });
});
