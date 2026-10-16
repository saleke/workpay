import { describe, expect, it } from "vitest";
import { parseCsv, runDeterministicCheck } from "./checks.js";

const cleanCsv = [
  "email,name,joined_at,amount",
  "a@example.com,Ada,2026-01-02,10",
  "b@example.com,Bob,2026-02-03,20",
].join("\n");

describe("CSV parsing", () => {
  it("parses a header and rows", () => {
    const dataset = parseCsv(cleanCsv);
    expect(dataset.columns).toEqual(["email", "name", "joined_at", "amount"]);
    expect(dataset.rows).toHaveLength(2);
    expect(dataset.rows[0]?.email).toBe("a@example.com");
  });

  it("handles quoted fields and escaped quotes", () => {
    const dataset = parseCsv('name,note\n"Doe, Jane","said ""hi"""');
    expect(dataset.rows[0]?.name).toBe("Doe, Jane");
    expect(dataset.rows[0]?.note).toBe('said "hi"');
  });
});

describe("deterministic checks", () => {
  it("unique_column fails on duplicates", () => {
    const dataset = parseCsv("email\na@example.com\na@example.com\n");
    const result = runDeterministicCheck("unique_column", { column: "email" }, dataset);
    expect(result.outcome).toBe("FAIL");
    expect(result.confidence).toBe(0);
  });

  it("unique_column passes when values are unique", () => {
    const dataset = parseCsv(cleanCsv);
    expect(runDeterministicCheck("unique_column", { column: "email" }, dataset).outcome).toBe(
      "PASS",
    );
  });

  it("iso8601_dates flags malformed dates", () => {
    const dataset = parseCsv("joined_at\n2026-01-02\n01/02/2026\n");
    const result = runDeterministicCheck("iso8601_dates", { columns: ["joined_at"] }, dataset);
    expect(result.outcome).toBe("FAIL");
  });

  it("email_format flags invalid addresses", () => {
    const dataset = parseCsv("email\ngood@example.com\nnot-an-email\n");
    expect(runDeterministicCheck("email_format", { column: "email" }, dataset).outcome).toBe(
      "FAIL",
    );
  });

  it("required_columns reports missing columns", () => {
    const dataset = parseCsv(cleanCsv);
    const result = runDeterministicCheck(
      "required_columns",
      { columns: ["email", "age"] },
      dataset,
    );
    expect(result.outcome).toBe("FAIL");
    expect((result.detail as { missing: string[] }).missing).toEqual(["age"]);
  });

  it("row_count_min enforces a floor", () => {
    const dataset = parseCsv(cleanCsv);
    expect(runDeterministicCheck("row_count_min", { min: 2 }, dataset).outcome).toBe("PASS");
    expect(runDeterministicCheck("row_count_min", { min: 5 }, dataset).outcome).toBe("FAIL");
  });

  it("no_null_column detects blanks", () => {
    const dataset = parseCsv("email,name\na@example.com,Ada\nb@example.com,\n");
    expect(runDeterministicCheck("no_null_column", { column: "name" }, dataset).outcome).toBe(
      "FAIL",
    );
  });

  it("returns UNCERTAIN for a missing column rather than passing", () => {
    const dataset = parseCsv(cleanCsv);
    expect(runDeterministicCheck("unique_column", { column: "nope" }, dataset).outcome).toBe(
      "UNCERTAIN",
    );
  });

  it("returns UNCERTAIN for an unknown check name", () => {
    const dataset = parseCsv(cleanCsv);
    expect(runDeterministicCheck("does_not_exist", {}, dataset).outcome).toBe("UNCERTAIN");
  });
});
