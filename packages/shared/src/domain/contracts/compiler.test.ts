import { describe, expect, it } from "vitest";
import { buildAcceptancePlan, compileContract, type CompileContractInput } from "./compiler.js";

function baseInput(): CompileContractInput {
  return {
    taskId: "task_1",
    title: "Clean the dataset",
    summary: "Remove duplicates and test rows.",
    requirements: [
      { key: "no_duplicate_emails", statement: "Emails are unique.", acceptanceRelevant: true },
      { key: "dates_iso8601", statement: "Dates are ISO-8601.", acceptanceRelevant: true },
    ],
    scopeIncluded: ["Deduplicate"],
    scopeExcluded: ["Adding columns"],
    acceptanceRules: [
      {
        requirementKey: "no_duplicate_emails",
        method: "DETERMINISTIC",
        params: { check: "unique_column", column: "email" },
      },
      {
        requirementKey: "dates_iso8601",
        method: "DETERMINISTIC",
        params: { check: "iso8601_dates", columns: ["joined_at"] },
      },
    ],
    budgetMinor: 10000,
    currency: "USD",
    deadline: null,
  };
}

describe("contract compiler", () => {
  it("produces a stable hash independent of input ordering", () => {
    const a = compileContract(baseInput());
    const reordered = baseInput();
    reordered.requirements = [...reordered.requirements].reverse();
    reordered.acceptanceRules = [...reordered.acceptanceRules].reverse();
    const b = compileContract(reordered);
    expect(a.contractHash).toBe(b.contractHash);
  });

  it("changes the hash when a requirement statement changes", () => {
    const a = compileContract(baseInput());
    const modified = baseInput();
    modified.requirements = modified.requirements.map((r, i) =>
      i === 0 ? { ...r, statement: "Emails are unique across all rows." } : r,
    );
    const b = compileContract(modified);
    expect(a.contractHash).not.toBe(b.contractHash);
  });

  it("changes the hash when the budget changes", () => {
    const a = compileContract(baseInput());
    const modified = baseInput();
    modified.budgetMinor = 12000;
    const b = compileContract(modified);
    expect(a.contractHash).not.toBe(b.contractHash);
  });

  it("preserves a supported non-USD task budget", () => {
    const input = baseInput();
    input.budgetMinor = 1_000_000;
    input.currency = "NGN";
    expect(compileContract(input).budget).toEqual({
      amountMinor: 1_000_000,
      currency: "NGN",
    });
  });

  it("rejects duplicate requirement keys", () => {
    const input = baseInput();
    input.requirements.push({
      key: "no_duplicate_emails",
      statement: "duplicate",
      acceptanceRelevant: true,
    });
    expect(() => compileContract(input)).toThrow(/Duplicate requirement key/);
  });

  it("rejects an acceptance rule for an unknown requirement", () => {
    const input = baseInput();
    input.acceptanceRules.push({ requirementKey: "ghost", method: "SEMANTIC" });
    expect(() => compileContract(input)).toThrow(/unknown requirement/);
  });

  it("rejects a contract with no requirements", () => {
    const input = baseInput();
    input.requirements = [];
    expect(() => compileContract(input)).toThrow(/at least one requirement/);
  });

  it("builds a sorted acceptance plan", () => {
    const plan = buildAcceptancePlan([
      { requirementKey: "b", method: "SEMANTIC" },
      { requirementKey: "a", method: "DETERMINISTIC" },
    ]);
    expect(plan.map((p) => p.requirementKey)).toEqual(["a", "b"]);
  });
});
