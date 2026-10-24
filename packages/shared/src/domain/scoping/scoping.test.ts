import { describe, expect, it } from "vitest";
import {
  detectTechnicalLiteracy,
  evaluateInformationThreshold,
  processScopingTurn,
} from "./engine.js";
import { matchDomain } from "./capability-tree.js";

describe("Consultative Scoping & Information Threshold Model", () => {
  describe("Layer 1: Domain & Mental Model Classifier", () => {
    it("classifies layman ambiguity markers into literacy score 1 or 2", () => {
      const laymanText = "I want a simple website something like uber for homemade pastries, keep it easy and cheap";
      const score = detectTechnicalLiteracy(laymanText);
      expect(score).toBeLessThanOrEqual(2);
    });

    it("classifies technical vocabulary into literacy score 4 or 5", () => {
      const techText = "Build a Next.js REST API with PostgreSQL schema, webhook idempotency, and OAuth authentication";
      const score = detectTechnicalLiteracy(techText);
      expect(score).toBeGreaterThanOrEqual(4);
    });

    it("correctly identifies project domains from vague user goals", () => {
      expect(matchDomain("I want an online store to sell pastries").domainId).toBe("ecommerce");
      expect(matchDomain("I need an API built to sync my inventory with eBay").domainId).toBe("api_integration");
      expect(matchDomain("Clean 5,000 customer records in this CSV and remove duplicates").domainId).toBe("data_pipeline");
      expect(matchDomain("I need a mobile app for customers on iPhone and Android").domainId).toBe("mobile_app");
      expect(matchDomain("Build a modern web portal and client dashboard").domainId).toBe("web_platform");
    });
  });

  describe("Layer 2: Capability Tree & 4-Dimension Threshold Model", () => {
    it("evaluates the 4 core dimensions and calculates understanding gauge", () => {
      const domain = matchDomain("I want an e-commerce website to sell apparel");
      const emptySlots = {};

      const initialEval = evaluateInformationThreshold(
        "I want an e-commerce website to sell apparel",
        domain,
        emptySlots,
      );

      expect(initialEval.thresholdMet).toBe(false);
      expect(initialEval.gauge).toBeGreaterThanOrEqual(25);
      expect(initialEval.gauge).toBeLessThan(70);
      expect(initialEval.dimensions.coreObjective.status).toBe("satisfied");
      expect(initialEval.dimensions.technicalConstraints.status).toBe("missing");
      expect(initialEval.dimensions.validationProof.status).toBe("missing");
      expect(initialEval.dimensions.boundaryConstraints.status).toBe("missing");
    });

    it("satisfies threshold when slots and validation proof are provided", () => {
      const domain = matchDomain("I want an e-commerce website to sell apparel");
      const filledSlots = {
        inventorySource: "Shopify Storefront API",
        fulfillmentModel: "Nationwide Shipping with Live Carrier Rates",
        validationProof: "Successful test order in sandbox with customer receipt and admin notification",
      };

      const resolvedEval = evaluateInformationThreshold(
        "I want an e-commerce website to sell apparel",
        domain,
        filledSlots,
      );

      expect(resolvedEval.gauge).toBeGreaterThanOrEqual(85);
      expect(resolvedEval.thresholdMet).toBe(true);
      expect(resolvedEval.dimensions.technicalConstraints.status).toBe("satisfied");
      expect(resolvedEval.dimensions.validationProof.status).toBe("satisfied");
      expect(resolvedEval.dimensions.boundaryConstraints.status).toBe("satisfied");
    });
  });

  describe("Layer 3: Multi-Turn Consultative Extraction Loop", () => {
    it("generates structured option choices with business trade-offs on turn 1", async () => {
      const result = await processScopingTurn({
        message: "I need an API built to sync my inventory with eBay",
      });

      expect(result.detectedDomain).toBe("api_integration");
      expect(result.thresholdMet).toBe(false);
      expect(result.currentQuestion).toBeTruthy();
      expect(result.currentOptions.length).toBeGreaterThanOrEqual(2);

      // Check that options have concrete real-world trade-offs
      const firstOpt = result.currentOptions[0]!;
      expect(firstOpt.bestIf).toBeTruthy();
      expect(firstOpt.developerBuilds).toBeTruthy();
      expect(firstOpt.tradeOff).toBeTruthy();
      expect(firstOpt.badge).toBeTruthy();
    });

    it("progresses to next slot when an option is selected", async () => {
      const turn1 = await processScopingTurn({
        message: "I want an online store for my bakery",
      });

      const selectedOption = turn1.currentOptions[0]!;

      const turn2 = await processScopingTurn({
        sessionId: turn1.sessionId,
        message: selectedOption.title,
        selectedOptionId: selectedOption.id,
        slots: turn1.filledSlots,
        history: turn1.dialogue.map((d) => ({
          role: d.role,
          content: d.content,
          selectedOptionId: d.selectedOptionId,
        })),
        literacyLevel: turn1.technicalLiteracyLevel,
      });

      expect(turn2.understandingGauge).toBeGreaterThan(turn1.understandingGauge);
      expect(Object.keys(turn2.filledSlots).length).toBeGreaterThanOrEqual(1);
    });

    it("triggers the Reverse Pitch Protocol and builds Cognitive Scope Canvas upon completion", async () => {
      // Simulate final turn with all required slots
      const result = await processScopingTurn({
        message: "I want an online store to sell handmade cookies",
        slots: {
          inventorySource: "Shopify Storefront API",
          fulfillmentModel: "Storefront Pickup with Time Slot Booking",
          validationProof: "Successful test order in sandbox with customer receipt and admin notification",
        },
      });

      expect(result.thresholdMet).toBe(true);
      expect(result.understandingGauge).toBeGreaterThanOrEqual(85);
      expect(result.reversePitchCanvas).toBeTruthy();

      const canvas = result.reversePitchCanvas!;
      expect(canvas.whatWeAreBuilding).toContain("cookies");
      expect(canvas.howItDelivers).toBeTruthy();
      expect(canvas.howSuccessIsProven).toBeTruthy();
      expect(canvas.boundariesAndLimits).toBeTruthy();
      expect(canvas.estimatedBudgetMinor).toBeGreaterThan(0);
      expect(canvas.suggestedMilestones.length).toBeGreaterThanOrEqual(2);
      expect(canvas.acceptanceCriteria.length).toBeGreaterThanOrEqual(3);
    });
  });

  describe("Engineering Integrity & Guardrails", () => {
    it("ensures zero em dashes in generated canvas and copy", async () => {
      const result = await processScopingTurn({
        message: "I need an automated inventory sync with eBay",
        slots: {
          syncFrequency: "Instant Webhook-Driven Synchronization",
          errorHandling: "Exponential Backoff Retries with Failure Alerts",
          validationProof: "10-item synthetic mutation test verifying zero field discrepancies",
        },
      });

      const serialized = JSON.stringify(result);
      expect(serialized).not.toContain("\u2014");
      expect(serialized).not.toContain("—");
    });

    it("strictly avoids mentioning escrow or custodial balances", async () => {
      const result = await processScopingTurn({
        message: "I need an online store for homemade pastries",
        slots: {
          inventorySource: "Shopify Storefront API",
          fulfillmentModel: "Storefront Pickup",
          validationProof: "Sandbox purchase test",
        },
      });

      const serialized = JSON.stringify(result).toLowerCase();
      expect(serialized).not.toContain("escrow");
      expect(serialized).not.toContain("custodial");
    });
  });

  describe("Universal Multi-Domain Coverage (Non-E-Commerce & Open-Ended)", () => {
    it("scopes IT networking requests without any e-commerce or web platform bias", async () => {
      const result = await processScopingTurn({
        message: "My computer network is slow",
      });

      expect(result.detectedDomain).toBe("network_infrastructure");
      expect(result.domainLabel).toBe("IT, Networking & Systems Infrastructure");
      expect(result.currentQuestion).toContain("Where is the slowdown or connection issue occurring?");
      expect(result.currentOptions.some((o) => o.id === "opt_net_wifi")).toBe(true);

      // Now complete the turn for networking
      const completed = await processScopingTurn({
        message: "Local Wi-Fi and Gateway Optimization",
        history: [{ role: "user", content: "My computer network is slow" }],
        slots: {
          networkScope: "Local Wi-Fi Channel Tuning & Access Point Optimization",
          validationProof: "Documented iperf3 benchmark proving >= 300 Mbps sustained throughput and zero packet drop",
        },
      });

      expect(completed.thresholdMet).toBe(true);
      expect(completed.reversePitchCanvas).toBeTruthy();
      const canvas = completed.reversePitchCanvas!;
      expect(canvas.whatWeAreBuilding).toContain("network infrastructure diagnostics");
      expect(canvas.howSuccessIsProven).toContain("iperf3");
      expect(canvas.whatWeAreBuilding).not.toContain("e-commerce");
      expect(canvas.whatWeAreBuilding).not.toContain("web application");
    });

    it("scopes Cloud & DevOps pipelines with automated CI/CD and healthcheck validation", async () => {
      const match = matchDomain("Deploy our Docker containers to AWS with CI/CD pipeline and SSL");
      expect(match.domainId).toBe("cloud_devops");

      const completed = await processScopingTurn({
        message: "Deploy our Docker containers to AWS",
        slots: {
          cloudEnvironment: "AWS Infrastructure with Terraform Automation",
          validationProof: "Automated GitHub Actions CI/CD pipeline deploying live with passing health check",
        },
      });

      expect(completed.thresholdMet).toBe(true);
      const canvas = completed.reversePitchCanvas!;
      expect(canvas.whatWeAreBuilding).toContain("Cloud infrastructure");
      expect(canvas.howItDelivers).toContain("AWS Infrastructure");
      expect(canvas.howSuccessIsProven).toContain("CI/CD pipeline");
    });

    it("scopes Cybersecurity penetration testing and vulnerability assessments", async () => {
      const match = matchDomain("Audit our web application and API for security vulnerabilities and penetration test");
      expect(match.domainId).toBe("cybersecurity");

      const completed = await processScopingTurn({
        message: "Audit our web application and API for security vulnerabilities",
        slots: {
          securityTarget: "Web Application & API Penetration Audit",
          validationProof: "Formal vulnerability report with zero unresolved critical or high severity findings upon re-test",
        },
      });

      expect(completed.thresholdMet).toBe(true);
      const canvas = completed.reversePitchCanvas!;
      expect(canvas.whatWeAreBuilding).toContain("Cybersecurity audit");
      expect(canvas.howSuccessIsProven).toContain("vulnerability report");
    });

    it("scopes Automation and Web Scraping scripts", async () => {
      const match = matchDomain("Build a Python Playwright script to automate market data scraping");
      expect(match.domainId).toBe("automation_scripts");

      const completed = await processScopingTurn({
        message: "Build a Python Playwright script to automate market data scraping",
        slots: {
          automationArchitecture: "Playwright Headless Automation with Proxy Rotation",
          validationProof: "Live sample execution run producing valid output artifact with exit code 0",
        },
      });

      expect(completed.thresholdMet).toBe(true);
      const canvas = completed.reversePitchCanvas!;
      expect(canvas.whatWeAreBuilding).toContain("automated workflow script");
      expect(canvas.howSuccessIsProven).toContain("valid output artifact");
    });

    it("gracefully scopes open-ended custom projects using general_project fallback", async () => {
      const match = matchDomain("Draft a comprehensive implementation specification for a smart IoT warehouse rollout");
      expect(match.domainId).toBe("general_project");

      const completed = await processScopingTurn({
        message: "Draft an implementation specification for IoT warehouse rollout",
        slots: {
          deliverableFormat: "Source Code Repository with Implementation Documentation",
          validationProof: "Live demonstration walkthrough verifying 100% of agreed acceptance checklist items",
        },
      });

      expect(completed.thresholdMet).toBe(true);
      const canvas = completed.reversePitchCanvas!;
      expect(canvas.whatWeAreBuilding).toContain("Professional technical execution");
      expect(canvas.whatWeAreBuilding).not.toContain("web application and client portal");
      expect(canvas.whatWeAreBuilding).not.toContain("e-commerce");
    });

    it("accepts custom user replies and advances without repeating the same question", async () => {
      // Turn 1: user initiates slow network diagnosis
      const turn1 = await processScopingTurn({
        message: "My computer network is slow",
      });
      expect(turn1.currentSlotKey).toBe("networkScope");
      expect(turn1.currentQuestion).toContain("Where is the slowdown or connection issue occurring?");

      // Turn 2: user types custom reply instead of clicking an option
      const turn2 = await processScopingTurn({
        sessionId: turn1.sessionId,
        message: "We have 15 workstations on a Netgear switch and Wi-Fi drops on the second floor during calls",
        activeSlotKey: turn1.currentSlotKey || undefined,
        slots: turn1.filledSlots,
        history: turn1.dialogue.map((d) => ({
          role: d.role,
          content: d.content,
        })),
      });

      // The slot must now be filled with the custom reply
      expect(turn2.filledSlots.networkScope).toContain("Netgear switch");
      // The gauge must advance
      expect(turn2.understandingGauge).toBeGreaterThan(turn1.understandingGauge);
      // The system must NOT repeat the first question; it must advance to validationProof!
      expect(turn2.currentSlotKey).toBe("validationProof");
      expect(turn2.currentQuestion).toContain("How should we verify");
      expect(turn2.currentQuestion).not.toContain("Where is the slowdown");
    });

    it("respects user-declared budgets and uses dynamic domain market pricing instead of settling for $200", async () => {
      // 1. Explicit user budget
      const explicitBudgetTurn = await processScopingTurn({
        message: "I need an API built to sync inventory with eBay. My budget is $850.",
        slots: {
          syncFrequency: "Instant Webhook-Driven Synchronization",
          errorHandling: "Exponential Backoff Retries with Failure Alerts",
          validationProof: "10-item synthetic mutation test verifying zero field discrepancies",
        },
      });

      expect(explicitBudgetTurn.thresholdMet).toBe(true);
      expect(explicitBudgetTurn.reversePitchCanvas?.estimatedBudgetMinor).toBe(85000); // $850.00, not $200!

      // 2. Dynamic market pricing for Cybersecurity Pentest without hardcoded $200
      const secTurn = await processScopingTurn({
        message: "Conduct an enterprise web application penetration test",
        slots: {
          securityTarget: "Web Application & API Penetration Audit",
          validationProof: "Formal vulnerability report with zero unresolved critical findings",
        },
      });

      expect(secTurn.thresholdMet).toBe(true);
      // Enterprise security audit should be estimated realistically ($650 to $975), never flat $200
      expect(secTurn.reversePitchCanvas?.estimatedBudgetMinor).toBeGreaterThanOrEqual(65000);
      expect(secTurn.reversePitchCanvas?.estimatedBudgetMinor).not.toBe(20000);
    });

    it("ingests technical resources (repo, schema, error logs) to pre-populate slots upfront", async () => {
      const turnWithResources = await processScopingTurn({
        message: "Fix our failing production API endpoints",
        resources: {
          repoUrl: "https://github.com/acme/backend-service",
          repoTechSummary: "FastAPI Python backend with PostgreSQL and Pytest suite",
          errorLogs: "FastAPI Error: sqlalchemy.exc.OperationalError: server closed the connection unexpectedly at /app/routes/orders.py:42",
        },
      });

      expect(turnWithResources.detectedResources?.repo).toBe(true);
      expect(turnWithResources.detectedResources?.logs).toBe(true);
      expect(turnWithResources.rawGoal).toContain("FastAPI Python backend");
      expect(turnWithResources.rawGoal).toContain("OperationalError");
      expect(turnWithResources.filledSlots.databaseAndState || turnWithResources.filledSlots.validationProof).toBeDefined();
    });

    it("detects user clarification queries and provides consultative guidance with recommended option instead of saving query as answer", async () => {
      const consultativeTurn = await processScopingTurn({
        message: "What do you recommend and which is cheaper?",
        activeSlotKey: "authAndAccess",
        slots: {},
        history: [
          { role: "user", content: "Build a client portal for our design agency" },
          { role: "assistant", content: "How should users sign in to their accounts?" },
        ],
      });

      // Crucial: The question itself must NOT be saved as the slot answer!
      expect(consultativeTurn.filledSlots.authAndAccess).toBeUndefined();
      // An advisory recommendation must be generated
      expect(consultativeTurn.advisoryNotice).toBeDefined();
      expect(consultativeTurn.recommendedOptionId).toBeDefined();
      // The assistant dialogue response must advise the user rather than blindly asking the next question
      const lastReply = consultativeTurn.dialogue[consultativeTurn.dialogue.length - 1]!;
      expect(lastReply.role).toBe("assistant");
      expect(lastReply.content).toContain("recommend");
    });

    it("evaluates project feasibility and provides scope-trimming advisory for lean budgets", async () => {
      const underfundedTurn = await processScopingTurn({
        message: "Build a cross-platform mobile ride sharing application with real-time GPS tracking. My budget is $150.",
        slots: {
          platformTarget: "React Native / Expo Cross-Platform",
          validationProof: "Interactive TestFlight preview build",
        },
      });

      expect(underfundedTurn.thresholdMet).toBe(true);
      expect(underfundedTurn.feasibilityRating).toBe("underfunded");
      expect(underfundedTurn.scopeTrimmingAdvisory).toContain("Scope-Trimming Advisory");
      expect(underfundedTurn.scopeTrimmingAdvisory).toContain("Phase 1");
    });
  });
});

