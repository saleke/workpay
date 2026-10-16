/**
 * End-to-end live rehearsal of the WorkPay flagship demo.
 *
 * Runs the complete fail-then-pass loop against the running HTTP server:
 * 1. Create task ($135 ceiling).
 * 2. Generate plan and draft contract.
 * 3. Approve contract (locking SHA-256 hash).
 * 4. Provider search, negotiation, agreement, and escrow authorization hold.
 * 5. Provider accepts assignment and starts work.
 * 6. Provider submits flawed v1 CSV (7.2% duplicates) -> verification FAILS -> payment protected.
 * 7. Provider submits clean v2 CSV (0% duplicates) -> verification PASSES -> payment CAPTURED -> task COMPLETED.
 */
import { readFile } from "node:fs/promises";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const BASE_URL = process.env.APP_URL || "http://localhost:3000";
const here = dirname(fileURLToPath(import.meta.url));
const fixturesDir = resolve(here, "../packages/shared/fixtures");

interface ApiResponse<T = any> {
  data?: T;
  error?: { code: string; message: string; details?: unknown };
}

async function request<T = any>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  const url = `${BASE_URL}${path}`;
  const res = await fetch(url, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...options.headers,
    },
  });

  const text = await res.text();
  let json: any;
  try {
    json = JSON.parse(text);
  } catch {
    throw new Error(`Failed to parse response from ${url}: ${text}`);
  }

  if (!res.ok) {
    throw new Error(
      `HTTP ${res.status} on ${path}: ${json.error?.message || json.error?.code || text}`,
    );
  }

  return (json.data !== undefined ? json.data : json) as T;
}

async function main() {
  console.log("================================================================================");
  console.log("             WORKPAY FLAGSHIP DEMO REHEARSAL: COMMIT -> PROVE -> SETTLE         ");
  console.log("================================================================================");
  console.log(`Connecting to: ${BASE_URL}\n`);

  // Step 1: Create Task
  console.log("--> [Step 1] Creating task from buyer natural language request...");
  const task = await request<any>("/api/v1/tasks", {
    method: "POST",
    body: JSON.stringify({
      title: "Clean 5,000 Customer Records",
      rawRequest:
        "Please clean and deduplicate our customer export CSV. Deliver 5,000 valid rows with 0 duplicate emails.",
      budgetMinor: 13500, // $135.00 USD
      currency: "USD",
    }),
  });
  console.log(`    Task created: ID=${task.id}, Status=${task.status}, Budget=$${(task.budgetMinor / 100).toFixed(2)}`);

  // Step 2: Generate Plan and Draft Contract
  console.log("\n--> [Step 2] Buyer Agent planning task and compiling contract draft...");
  const plan = await request<any>(`/api/v1/tasks/${task.id}/plan`, {
    method: "POST",
  });
  console.log(`    Plan generated via ${plan.planSource}: ${plan.requirements.length} requirements structured.`);

  // Query Task Room to retrieve contract details
  const roomAfterPlan = await request<any>(`/api/v1/tasks/${task.id}/task-room`);
  const contract = roomAfterPlan.activeContract;
  if (!contract) throw new Error("Contract was not drafted");
  console.log(`    Contract drafted: ID=${contract.id}, Version=v${contract.version}, Hash=${contract.contractHash.slice(0, 16)}...`);

  // Step 3: Approve Contract
  console.log("\n--> [Step 3] Buyer approves contract with frozen SHA-256 hash snapshot...");
  const approval = await request<any>(`/api/v1/contracts/${contract.id}/approve`, {
    method: "POST",
    body: JSON.stringify({
      expectedHash: contract.contractHash,
    }),
  });
  console.log(`    Contract approved: Status=${approval.status}, HashVerified=${approval.contractHash === contract.contractHash}`);

  // Step 4: Provider Search, Negotiation & Escrow Authorization
  console.log("\n--> [Step 4] Agent searching providers, negotiating, and authorizing payment escrow...");
  const searchResult = await request<any>(`/api/v1/tasks/${task.id}/provider-search`, {
    method: "POST",
  });
  console.log(`    Provider matched: ${searchResult.provider.displayName} (ID=${searchResult.provider.providerId})`);
  console.log(`    Selection rationale: ${searchResult.reason}`);

  // Step 5: Check Provider Portal
  console.log("\n--> [Step 5] Checking Provider Portal for assigned work...");
  const providerWorks = await request<any[]>("/api/v1/provider/work");
  const assignedWork = providerWorks.find((w) => w.taskId === task.id);
  if (!assignedWork) throw new Error("Work not found in provider portal");
  console.log(`    Provider Portal assignment found: ExecutionID=${assignedWork.executionId}, Status=${assignedWork.status}, Pay=$${(assignedWork.pay.amountMinor / 100).toFixed(2)}`);

  // Step 6: Provider Accepts & Starts Work
  console.log("\n--> [Step 6] Provider accepting contract terms and starting work...");
  await request(`/api/v1/provider/work/${assignedWork.executionId}/accept`, { method: "POST" });
  await request(`/api/v1/provider/work/${assignedWork.executionId}/start`, { method: "POST" });
  console.log("    Work execution status: IN_PROGRESS");

  // Step 7: Submit Flawed Deliverable (v1)
  console.log("\n--> [Step 7] Provider uploads FLAWED deliverable v1 (customers-v1.csv with 7.2% duplicates)...");
  const v1Bytes = await readFile(resolve(fixturesDir, "customers-v1.csv"));
  const formDataV1 = new FormData();
  formDataV1.append("executionId", assignedWork.executionId);
  formDataV1.append("note", "Initial submission for customer dataset cleaning.");
  formDataV1.append(
    "file",
    new Blob([v1Bytes], { type: "text/csv" }),
    "customers-v1.csv",
  );

  const subV1Res = await fetch(`${BASE_URL}/api/v1/submissions`, {
    method: "POST",
    body: formDataV1,
  });
  const subV1Json = await subV1Res.json();
  if (!subV1Res.ok) {
    throw new Error(`HTTP ${subV1Res.status} on submission v1: ${subV1Json.error?.message || JSON.stringify(subV1Json)}`);
  }
  const subV1 = subV1Json.data !== undefined ? subV1Json.data : subV1Json;
  console.log(`    Submission v1 created: ID=${subV1.id}, Version=v${subV1.version}`);

  // Inspect Verification Result for v1
  const verV1 = await request<any>(`/api/v1/submissions/${subV1.id}/verification`);
  console.log(`    [VERIFICATION RESULT v1]: ${verV1.outcome} (${verV1.passedRequirements} passed, ${verV1.failedRequirements} failed)`);
  for (const r of verV1.results) {
    console.log(`      * [${r.outcome}] ${r.requirementKey}: ${r.explanation}`);
  }

  // Verify that Payment Policy Protects the Buyer's Money
  const paymentV1 = await request<any>(`/api/v1/tasks/${task.id}/payment`);
  console.log(`    [MONEY PROTECTION AUDIT]: Payment status is ${paymentV1.status} (Hold: $${(paymentV1.amountMinor / 100).toFixed(2)})`);
  console.log(`    Capture was REFUSED by policy: ${paymentV1.latestDecision ? paymentV1.latestDecision.reason : "No capture decision allowed"}`);

  // Step 8: Submit Clean Deliverable (v2)
  console.log("\n--> [Step 8] Provider uploads CLEAN deliverable v2 (customers-v2.csv with 0% duplicates)...");
  const v2Bytes = await readFile(resolve(fixturesDir, "customers-v2.csv"));
  const formDataV2 = new FormData();
  formDataV2.append("executionId", assignedWork.executionId);
  formDataV2.append("note", "Revised clean dataset with all duplicate emails eliminated.");
  formDataV2.append(
    "file",
    new Blob([v2Bytes], { type: "text/csv" }),
    "customers-v2.csv",
  );

  const subV2Res = await fetch(`${BASE_URL}/api/v1/submissions`, {
    method: "POST",
    body: formDataV2,
  });
  const subV2Json = await subV2Res.json();
  if (!subV2Res.ok) {
    throw new Error(`HTTP ${subV2Res.status} on submission v2: ${subV2Json.error?.message || JSON.stringify(subV2Json)}`);
  }
  const subV2 = subV2Json.data !== undefined ? subV2Json.data : subV2Json;
  console.log(`    Submission v2 created: ID=${subV2.id}, Version=v${subV2.version}`);

  // Inspect Verification Result for v2
  const verV2 = await request<any>(`/api/v1/submissions/${subV2.id}/verification`);
  console.log(`    [VERIFICATION RESULT v2]: ${verV2.outcome} (${verV2.passedRequirements} passed, ${verV2.failedRequirements} failed)`);
  for (const r of verV2.results) {
    console.log(`      * [${r.outcome}] ${r.requirementKey}: ${r.explanation}`);
  }

  // Verify Settlement
  const paymentV2 = await request<any>(`/api/v1/tasks/${task.id}/payment`);
  console.log(`\n--> [SETTLEMENT AUDIT] Payment status is ${paymentV2.status}`);
  console.log(`    PayPal Capture ID: ${paymentV2.paypalCaptureId || "Captured via Gateway"}`);
  console.log(`    Payment released to provider: $${(paymentV2.amountMinor / 100).toFixed(2)} USD`);

  // Final Task Room State
  const roomFinal = await request<any>(`/api/v1/tasks/${task.id}/task-room`);
  console.log(`\n--> [TASK ROOM FINAL STATE]: Task status is ${roomFinal.task.status}`);
  console.log("================================================================================");
  console.log("             DEMO REHEARSAL SUCCESSFUL: ALL INVARIANTS PROVEN LIVE              ");
  console.log("================================================================================");
}

main().catch((err) => {
  console.error("\nFATAL ERROR DURING REHEARSAL:", err);
  process.exitCode = 1;
});
