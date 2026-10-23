import { describe, expect, it } from "vitest";
import { selectProvider, type ProviderCandidate } from "./selection.js";

function candidate(overrides: Partial<ProviderCandidate>): ProviderCandidate {
  return {
    providerId: "provider_1",
    displayName: "Provider One",
    status: "ACTIVE",
    capabilities: [{ tag: "data_cleaning", proficiency: 4 }],
    available: true,
    capacity: 3,
    activeAssignments: 0,
    hourlyRateMinor: 5000,
    reputation: { completedTasks: 10, onTimeRatePct: 90, firstPassAcceptancePct: 80 },
    ...overrides,
  };
}

describe("provider selection", () => {
  it("selects an eligible provider", () => {
    const result = selectProvider({
      requiredTags: ["data_cleaning"],
      budgetMinor: 10000,
      candidates: [candidate({})],
    });
    expect(result.selected?.providerId).toBe("provider_1");
  });

  it("filters out providers missing a required capability", () => {
    const result = selectProvider({
      requiredTags: ["data_cleaning", "spreadsheet"],
      budgetMinor: 10000,
      candidates: [candidate({})],
    });
    expect(result.selected).toBeNull();
  });

  it("filters out providers at capacity or unavailable", () => {
    const atCapacity = selectProvider({
      requiredTags: ["data_cleaning"],
      budgetMinor: 10000,
      candidates: [candidate({ activeAssignments: 3 })],
    });
    expect(atCapacity.selected).toBeNull();

    const unavailable = selectProvider({
      requiredTags: ["data_cleaning"],
      budgetMinor: 10000,
      candidates: [candidate({ available: false })],
    });
    expect(unavailable.selected).toBeNull();
  });

  it("ranks higher reputation ahead, all else equal", () => {
    const result = selectProvider({
      requiredTags: ["data_cleaning"],
      budgetMinor: 10000,
      candidates: [
        candidate({
          providerId: "provider_low",
          reputation: { completedTasks: 1, onTimeRatePct: 50, firstPassAcceptancePct: 40 },
        }),
        candidate({
          providerId: "provider_high",
          reputation: { completedTasks: 20, onTimeRatePct: 99, firstPassAcceptancePct: 95 },
        }),
      ],
    });
    expect(result.selected?.providerId).toBe("provider_high");
  });

  it("is deterministic, breaking ties by provider id", () => {
    const make = () => [
      candidate({ providerId: "provider_b" }),
      candidate({ providerId: "provider_a" }),
    ];
    const a = selectProvider({
      requiredTags: ["data_cleaning"],
      budgetMinor: 10000,
      candidates: make(),
    });
    const b = selectProvider({
      requiredTags: ["data_cleaning"],
      budgetMinor: 10000,
      candidates: make(),
    });
    expect(a.selected?.providerId).toBe(b.selected?.providerId);
    expect(a.selected?.providerId).toBe("provider_a");
  });

  it("returns a ranked list for audit", () => {
    const result = selectProvider({
      requiredTags: ["data_cleaning"],
      budgetMinor: 10000,
      candidates: [candidate({ providerId: "p1" }), candidate({ providerId: "p2" })],
    });
    expect(result.ranked).toHaveLength(2);
  });

  it("filters out providers whose minimum compensation exceeds the budget", () => {
    const result = selectProvider({
      requiredTags: ["data_cleaning"],
      budgetMinor: 8000, // $80 budget
      candidates: [
        candidate({
          providerId: "p_expensive",
          minCompensationMinor: 15000, // $150 minimum rule
        }),
      ],
    });
    expect(result.selected).toBeNull();
    expect(result.ranked[0]?.eligible).toBe(false);
    expect(result.ranked[0]?.reason).toContain("budget below provider minimum acceptable compensation");
  });
});
