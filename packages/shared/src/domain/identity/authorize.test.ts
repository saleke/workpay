import { describe, expect, it } from "vitest";
import { ACTIONS, authorize, requireAuthorized, type Actor } from "./authorize.js";

const buyer: Actor = { kind: "USER", id: "user_buyer", role: "buyer" };
const otherBuyer: Actor = { kind: "USER", id: "user_other", role: "buyer" };
const provider: Actor = { kind: "PROVIDER", id: "provider_1", role: "provider" };
const reviewer: Actor = { kind: "USER", id: "user_reviewer", role: "admin_reviewer" };
const system: Actor = { kind: "SYSTEM", id: null };
const agent: Actor = {
  kind: "AGENT",
  id: "agent_run_1",
  onBehalfOfUserId: "user_buyer",
};

const task = { type: "task", id: "task_1", ownerUserId: "user_buyer" };

describe("authorize (Component 13)", () => {
  it("lets a buyer create a task", () => {
    expect(authorize(buyer, ACTIONS.taskCreate, { type: "task", id: "new" }).allowed).toBe(true);
  });

  it("denies an unauthenticated actor creating a task", () => {
    expect(authorize(system, ACTIONS.taskCreate, { type: "task", id: "new" }).allowed).toBe(false);
  });

  it("allows the owner to view the task and denies another buyer", () => {
    expect(authorize(buyer, ACTIONS.taskView, task).allowed).toBe(true);
    expect(authorize(otherBuyer, ACTIONS.taskView, task).allowed).toBe(false);
  });

  it("lets a reviewer view any task", () => {
    expect(authorize(reviewer, ACTIONS.taskView, task).allowed).toBe(true);
  });

  it("only lets the owner approve a pending contract", () => {
    const contract = {
      type: "contract",
      id: "c1",
      ownerUserId: "user_buyer",
      status: "AWAITING_APPROVAL",
    };
    expect(authorize(buyer, ACTIONS.contractApprove, contract).allowed).toBe(true);
    expect(authorize(otherBuyer, ACTIONS.contractApprove, contract).allowed).toBe(false);
  });

  it("refuses to approve a contract that is not awaiting approval", () => {
    const contract = { type: "contract", id: "c1", ownerUserId: "user_buyer", status: "ACTIVE" };
    expect(authorize(buyer, ACTIONS.contractApprove, contract).allowed).toBe(false);
  });

  it("never allows a user to capture payment", () => {
    const resource = { type: "payment", id: "p1", ownerUserId: "user_buyer" };
    expect(authorize(buyer, ACTIONS.paymentCapture, resource).allowed).toBe(false);
    expect(authorize(provider, ACTIONS.paymentCapture, resource).allowed).toBe(false);
    // Only the system, after policy ALLOW, may capture.
    expect(authorize(system, ACTIONS.paymentCapture, resource).allowed).toBe(true);
  });

  it("lets the assigned provider submit work, but only in progress", () => {
    const execution = {
      type: "execution",
      id: "e1",
      ownerUserId: "user_buyer",
      providerId: "provider_1",
      status: "ACCEPTED",
    };
    expect(authorize(provider, ACTIONS.submissionCreate, execution).allowed).toBe(true);

    const notStarted = { ...execution, status: "ASSIGNED" };
    expect(authorize(provider, ACTIONS.submissionCreate, notStarted).allowed).toBe(false);

    const wrongProvider: Actor = { kind: "PROVIDER", id: "provider_2", role: "provider" };
    expect(authorize(wrongProvider, ACTIONS.submissionCreate, execution).allowed).toBe(false);
  });

  it("lets an agent borrow its user's authority for viewing", () => {
    expect(authorize(agent, ACTIONS.taskView, task).allowed).toBe(true);
  });

  it("lets an agent act for its user but not for another user", () => {
    const otherTask = { type: "task", id: "task_2", ownerUserId: "user_other" };
    expect(authorize(agent, ACTIONS.taskView, otherTask).allowed).toBe(false);
  });

  it("only reviewers may resolve cases", () => {
    const c = { type: "case", id: "case_1", ownerUserId: "user_buyer" };
    expect(authorize(reviewer, ACTIONS.caseResolve, c).allowed).toBe(true);
    expect(authorize(buyer, ACTIONS.caseResolve, c).allowed).toBe(false);
  });

  it("fails closed for an unknown action", () => {
    const decision = authorize(buyer, "task:do-something-new" as never, task);
    expect(decision.allowed).toBe(false);
  });

  it("throws a 403-mapped error from requireAuthorized", () => {
    expect(() => requireAuthorized(otherBuyer, ACTIONS.taskView, task)).toThrowError();
  });
});
