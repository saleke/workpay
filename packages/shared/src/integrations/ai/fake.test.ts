import { describe, expect, it } from "vitest";
import { FakeAI } from "./fake.js";

const ai = new FakeAI();

describe("FakeAI", () => {
  it("is deterministic for the same input", async () => {
    const input = {
      taskId: "task_1",
      title: "Clean the customer dataset",
      rawRequest: "Please clean this CSV of duplicate and test rows.",
      budgetMinor: 10000,
      currency: "USD",
      fileSummaries: [],
    };
    const a = await ai.planTask(input);
    const b = await ai.planTask(input);
    expect(a).toEqual(b);
  });

  it("produces deterministic acceptance rules for a cleaning task", async () => {
    const plan = await ai.planTask({
      taskId: "task_1",
      title: "Clean the customer dataset",
      rawRequest: "please dedupe and remove test rows from this csv",
      budgetMinor: 20000,
      currency: "USD",
      fileSummaries: [],
    });
    const methods = plan.acceptanceRules.map((r) => r.method);
    expect(plan.requirements.length).toBeGreaterThan(0);
    expect(methods).toContain("DETERMINISTIC");
    expect(plan.estimatedBudgetMinor).toBeLessThanOrEqual(20000);
  });

  it("asks for clarification when the request is too thin", async () => {
    const plan = await ai.planTask({
      taskId: "task_2",
      title: "Do the thing",
      rawRequest: "hi",
      budgetMinor: 1000,
      currency: "USD",
      fileSummaries: [],
    });
    expect(plan.clarifications.length).toBeGreaterThan(0);
  });

  it("never drafts an offer above the buyer ceiling", async () => {
    const offer = await ai.draftOffer({
      taskId: "task_1",
      contractSummary: "Clean a dataset",
      budgetMinor: 5000,
      currency: "USD",
      round: 0,
      providerAskingMinor: 90000,
      desiredDeadline: new Date().toISOString(),
    });
    expect(offer.priceMinor).toBeLessThanOrEqual(5000);
  });
});
