import { describe, expect, it } from "vitest";
import { assertDestructiveResetAllowed } from "./reset.js";

describe("destructive reset guard", () => {
  it("requires an exact confirmation in either production mode", () => {
    expect(() =>
      assertDestructiveResetAllowed({ nodeEnv: "production", workpayMode: "demo" }),
    ).toThrow("ERASE_ALL_TENFO_DATA");
    expect(() =>
      assertDestructiveResetAllowed({
        nodeEnv: "development",
        workpayMode: "production",
        confirmation: "yes",
      }),
    ).toThrow("ERASE_ALL_TENFO_DATA");
  });

  it("allows explicit production confirmation and unconfirmed local resets", () => {
    expect(() =>
      assertDestructiveResetAllowed({
        nodeEnv: "production",
        workpayMode: "production",
        confirmation: "ERASE_ALL_TENFO_DATA",
      }),
    ).not.toThrow();
    expect(() =>
      assertDestructiveResetAllowed({ nodeEnv: "development", workpayMode: "demo" }),
    ).not.toThrow();
  });
});
