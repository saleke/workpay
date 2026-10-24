import { randomUUID } from "node:crypto";
import { DOMAIN_DEFINITIONS, matchDomain, type DomainDefinition } from "./capability-tree.js";
import type {
  CognitiveScopeCanvas,
  DimensionStatus,
  ScopingDialogueTurn,
  ScopingDimensionKey,
  ScopingDimensionState,
  ScopingOption,
  ScopingRequest,
  ScopingSessionState,
} from "./types.js";

const AMBIGUITY_MARKERS = [
  "something like",
  "easy",
  "simple",
  "cheap",
  "fast",
  "just want",
  "like uber",
  "like airbnb",
  "basic",
  "pretty website",
  "make it work",
];

const TECHNICAL_MARKERS = [
  "schema",
  "idempotency",
  "webhook",
  "postgres",
  "jwt",
  "oauth",
  "endpoint",
  "ci/cd",
  "docker",
  "graphql",
  "rest api",
  "mrz",
  "csv",
  "dedup",
  "typescript",
  "next.js",
  "react",
  "tailwind",
];

/**
 * Layer 1: The Domain & Mental Model Classifier.
 * Analyzes vocabulary complexity and ambiguity markers to gauge technical literacy (1 to 5).
 */
export function detectTechnicalLiteracy(text: string): number {
  const lower = text.toLowerCase();
  let technicalHits = 0;
  let ambiguityHits = 0;

  for (const tech of TECHNICAL_MARKERS) {
    if (lower.includes(tech)) technicalHits++;
  }

  for (const amb of AMBIGUITY_MARKERS) {
    if (lower.includes(amb)) ambiguityHits++;
  }

  if (technicalHits >= 3) return 5;
  if (technicalHits >= 2) return 4;
  if (technicalHits === 1 && ambiguityHits === 0) return 3;
  if (ambiguityHits >= 2) return 1;
  return 2;
}

/**
 * Layer 2: Parameter Matrix & Information Threshold Gauge.
 * Evaluates the 4 core dimensions: Core Objective, Technical Constraints, Validation Proof, Boundary Constraints.
 */
export function evaluateInformationThreshold(
  rawGoal: string,
  domain: DomainDefinition,
  filledSlots: Record<string, string>,
): {
  gauge: number;
  dimensions: Record<ScopingDimensionKey, ScopingDimensionState>;
  thresholdMet: boolean;
  missingDimension: ScopingDimensionKey | null;
} {
  const goalLength = rawGoal.trim().length;
  const isGoalSubstantial = goalLength >= 15;

  // 1. Core Objective
  const hasCoreObjective = isGoalSubstantial;
  const coreScore = hasCoreObjective ? Math.min(100, Math.max(60, goalLength * 2)) : 30;
  const coreStatus: DimensionStatus = coreScore >= 80 ? "satisfied" : coreScore >= 50 ? "partial" : "missing";

  // 2. Technical Constraints
  const techSlots = domain.slots.filter((s) => s.dimension === "technicalConstraints");
  const techFilled = techSlots.filter((s) => Boolean(filledSlots[s.slotKey]));
  const techScore = techSlots.length === 0 ? 80 : Math.round((techFilled.length / techSlots.length) * 100);
  const techStatus: DimensionStatus = techScore >= 80 ? "satisfied" : techScore >= 40 ? "partial" : "missing";

  // 3. Validation Proof
  const valSlots = domain.slots.filter((s) => s.dimension === "validationProof");
  const valFilled = valSlots.filter((s) => Boolean(filledSlots[s.slotKey]));
  const hasValidation = valFilled.length > 0 || filledSlots.validationProof;
  const valScore = hasValidation ? 100 : 25;
  const valStatus: DimensionStatus = valScore >= 80 ? "satisfied" : "missing";

  // 4. Boundary Constraints
  const boundSlots = domain.slots.filter((s) => s.dimension === "boundaryConstraints");
  const boundFilled = boundSlots.filter((s) => Boolean(filledSlots[s.slotKey]));
  const boundScore = boundSlots.length === 0 ? 80 : Math.round((boundFilled.length / boundSlots.length) * 100);
  const boundStatus: DimensionStatus = boundScore >= 80 ? "satisfied" : boundScore >= 40 ? "partial" : "missing";

  const dimensions: Record<ScopingDimensionKey, ScopingDimensionState> = {
    coreObjective: {
      key: "coreObjective",
      label: "Core Objective",
      status: coreStatus,
      score: coreScore,
      summary: hasCoreObjective
        ? `Deliverable identified: "${rawGoal.slice(0, 60)}${rawGoal.length > 60 ? "..." : ""}"`
        : "Initial objective statement is very brief and needs clarification.",
      details: [hasCoreObjective ? "Objective scope captured" : "Awaiting detailed asset description"],
    },
    technicalConstraints: {
      key: "technicalConstraints",
      label: "Technical Constraints",
      status: techStatus,
      score: techScore,
      summary:
        techFilled.length > 0
          ? `${techFilled.length} of ${techSlots.length} technical architecture decisions confirmed.`
          : "Architecture, data sources, and platform constraints not yet selected.",
      details: techSlots.map((s) =>
        filledSlots[s.slotKey]
          ? `[Selected] ${s.slotKey}: ${filledSlots[s.slotKey]}`
          : `[Required] ${s.slotKey}: pending clarification`,
      ),
    },
    validationProof: {
      key: "validationProof",
      label: "Validation Proof",
      status: valStatus,
      score: valScore,
      summary: hasValidation
        ? `Observable proof method selected: "${filledSlots.validationProof || "Standard test run"}"`
        : "Objective test mechanism to verify completion before payout is missing.",
      details: [hasValidation ? "Third-party proof rule defined" : "Awaiting validation criteria"],
    },
    boundaryConstraints: {
      key: "boundaryConstraints",
      label: "Boundary Constraints",
      status: boundStatus,
      score: boundScore,
      summary:
        boundFilled.length > 0
          ? "Execution limits, out-of-scope boundaries, and delivery rules structured."
          : "Operational limits, turnaround timelines, and failure boundaries need specification.",
      details: boundSlots.map((s) =>
        filledSlots[s.slotKey]
          ? `[Selected] ${s.slotKey}: ${filledSlots[s.slotKey]}`
          : `[Required] ${s.slotKey}: pending clarification`,
      ),
    },
  };

  // Weighted overall understanding gauge (0 to 100)
  const totalGauge = Math.round(
    coreScore * 0.3 + techScore * 0.3 + valScore * 0.25 + boundScore * 0.15,
  );

  let missingDimension: ScopingDimensionKey | null = null;
  if (techStatus === "missing" || techStatus === "partial") missingDimension = "technicalConstraints";
  else if (boundStatus === "missing" || boundStatus === "partial") missingDimension = "boundaryConstraints";
  else if (valStatus === "missing") missingDimension = "validationProof";
  else if (coreStatus === "missing") missingDimension = "coreObjective";

  const thresholdMet = totalGauge >= 85 && valStatus === "satisfied";

  return {
    gauge: Math.min(100, Math.max(0, totalGauge)),
    dimensions,
    thresholdMet,
    missingDimension,
  };
}

/**
 * Reverse Pitch Protocol (Executive Project Intent Canvas).
 * Translates completed parameters into an executive summary pitched back to the client.
 */
export function buildCognitiveScopeCanvas(
  rawGoal: string,
  domain: DomainDefinition,
  filledSlots: Record<string, string>,
  literacyLevel: number,
): CognitiveScopeCanvas {
  const title = deriveProjectTitle(rawGoal, domain);

  let whatWeAreBuilding = "";
  let howItDelivers = "";
  let howSuccessIsProven = "";
  let boundariesAndLimits = "";
  let estimatedBudgetMinor = 15000; // $150 default
  let targetTimelineDays = 5;

  if (domain.domainId === "network_infrastructure") {
    whatWeAreBuilding = `Comprehensive network infrastructure diagnostics, hardware optimization, and latency resolution for "${rawGoal.trim()}".`;
    const scope = filledSlots.networkScope || "Local Wi-Fi and Gateway Optimization";
    howItDelivers = `Addresses bottlenecks via ${scope}, tuning channel frequencies, configuring QoS traffic priority rules, and eliminating gateway congestion.`;
    howSuccessIsProven =
      filledSlots.validationProof ||
      "Automated iperf3 benchmark proving sustained throughput >= 300 Mbps, jitter < 3ms, and zero packet drops under full load.";
    boundariesAndLimits =
      "Scope covers internal office/home network topology, routers, access points, and connected endpoints. Excludes replacing physical underground ISP fiber outside property boundary.";
    estimatedBudgetMinor = 25000;
    targetTimelineDays = 4;
  } else if (domain.domainId === "cloud_devops") {
    whatWeAreBuilding = `Cloud infrastructure architecture, automated deployment pipelines, and environment hardening for "${rawGoal.trim()}".`;
    const envChoice = filledSlots.cloudEnvironment || "Cloudflare Serverless Edge or Docker VPS";
    howItDelivers = `Provisions and orchestrates infrastructure on ${envChoice}, establishing automated SSL certificates, containerized workloads, and secure secrets management.`;
    howSuccessIsProven =
      filledSlots.validationProof ||
      "Automated GitHub Actions CI/CD pipeline deploying live with passing HTTP 200 health check and zero downtime.";
    boundariesAndLimits =
      "Scope includes Infrastructure-as-Code templates and deployment configs. Cloud hosting resource usage fees are paid directly to cloud provider by client.";
    estimatedBudgetMinor = 35000;
    targetTimelineDays = 5;
  } else if (domain.domainId === "cybersecurity") {
    whatWeAreBuilding = `Cybersecurity audit, vulnerability assessment, and remediation patching for "${rawGoal.trim()}".`;
    const secTarget = filledSlots.securityTarget || "Web Application and Cloud Infrastructure";
    howItDelivers = `Executes systematic assessment against ${secTarget}, testing OWASP Top 10 threat vectors, checking cloud IAM policies, and verifying boundary firewalls.`;
    howSuccessIsProven =
      filledSlots.validationProof ||
      "Executive vulnerability assessment report with proof-of-concept evidence and verified clean re-test pass with zero high or critical findings.";
    boundariesAndLimits =
      "Testing strictly restricted to authorized staging/production domains and IP ranges. Excludes destructive denial-of-service testing or social engineering of staff.";
    estimatedBudgetMinor = 45000;
    targetTimelineDays = 6;
  } else if (domain.domainId === "api_integration") {
    whatWeAreBuilding = `An automated, bidirectional API integration and data synchronization pipeline for "${rawGoal.trim()}".`;
    const frequency = filledSlots.syncFrequency || "Hourly Scheduled Batch";
    const errorHandling = filledSlots.errorHandling || "Automated Exponential Retries with Alerts";
    howItDelivers = `The pipeline runs on ${frequency}, executing data translation, payload schema normalization, and ${errorHandling} to prevent data collisions or duplicate entries.`;
    howSuccessIsProven =
      filledSlots.validationProof ||
      "A 10-item synthetic mutation test proving 100% field parity between source and destination systems with zero data loss and automated test coverage passing clean.";
    boundariesAndLimits =
      "Strictly bounded to specified API endpoints and documented rate limits. Scope excludes refactoring unrelated legacy databases. Access credentials provided in staging environment.";
    estimatedBudgetMinor = 25000;
    targetTimelineDays = 5;
  } else if (domain.domainId === "data_pipeline") {
    whatWeAreBuilding = `An automated data cleaning, deduplication, and schema normalization pipeline for "${rawGoal.trim()}".`;
    const rules = filledSlots.cleaningRules || "Strict Deduplication with Format Normalization";
    howItDelivers = `Applies ${rules} to normalize phone numbers, emails, and address fields, merging duplicate records while preserving relational identifier integrity.`;
    howSuccessIsProven =
      filledSlots.validationProof ||
      "An automated integrity validation report confirming duplicate rates below 0.5%, zero corrupt rows, and delivering an exportable normalized dataset.";
    boundariesAndLimits =
      "Input data volume capped at agreed row count. Scope excludes manual data entry for missing original fields. Deliverable provided in CSV / JSON.";
    estimatedBudgetMinor = 15000;
    targetTimelineDays = 3;
  } else if (domain.domainId === "automation_scripts") {
    whatWeAreBuilding = `An automated workflow script and scheduled data extraction runner for "${rawGoal.trim()}".`;
    const arch = filledSlots.automationArchitecture || "Headless Browser Automation with Playwright";
    howItDelivers = `Built with ${arch}, featuring robust element targeting, proxy rotation, rate-limit throttling, and structured export formatting.`;
    howSuccessIsProven =
      filledSlots.validationProof ||
      "Live sample execution run producing valid output artifact with exit code 0 and zero unhandled exceptions.";
    boundariesAndLimits =
      "Bounded to agreed target sites and output schemas. Excludes third-party paid proxy subscriptions or captcha solver account fees.";
    estimatedBudgetMinor = 20000;
    targetTimelineDays = 4;
  } else if (domain.domainId === "custom_software") {
    whatWeAreBuilding = `Custom software engineering implementation, modular service, or CLI tool delivering "${rawGoal.trim()}".`;
    const softArch = filledSlots.softwareArchitecture || "Modular Backend Service";
    howItDelivers = `Engineered as a ${softArch}, providing typed data structures, modular abstractions, error boundary handling, and clear operational logging.`;
    howSuccessIsProven =
      filledSlots.validationProof ||
      "Automated test suite passing with exit code 0 and code coverage >= 85% across all core functional pathways.";
    boundariesAndLimits =
      "Bounded to agreed functional specification and interface contracts. Excludes building custom proprietary UI unless specified.";
    estimatedBudgetMinor = 40000;
    targetTimelineDays = 8;
  } else if (domain.domainId === "mobile_app") {
    whatWeAreBuilding = `A polished cross-platform mobile application dedicated to "${rawGoal.trim()}".`;
    const platform = filledSlots.platformTarget || "React Native / Expo Cross-Platform";
    howItDelivers = `Constructed with ${platform}, featuring intuitive bottom-sheet navigation, offline cache resilience, and secure user account state.`;
    howSuccessIsProven =
      filledSlots.validationProof ||
      "An interactive preview build installable directly on test mobile devices via TestFlight or Expo, confirming smooth navigation and functional transactions.";
    boundariesAndLimits =
      "Scope includes design screens, state management, and API wiring. Excludes third-party app store developer account registration fees ($99 Apple fee).";
    estimatedBudgetMinor = 50000;
    targetTimelineDays = 14;
  } else if (domain.domainId === "ecommerce") {
    whatWeAreBuilding = `A functional e-commerce storefront dedicated to "${rawGoal.trim()}". Customers can browse curated items, view images, add items to a responsive shopping cart, and complete purchase checkout.`;
    const inventory = filledSlots.inventorySource || "Shopify Storefront API";
    const fulfillment = filledSlots.fulfillmentModel || "Storefront Pickup";
    howItDelivers = `Inventory is synchronized directly through ${inventory}. Orders flow through ${fulfillment}, with automated confirmation notifications sent directly to the buyer and store operator.`;
    howSuccessIsProven =
      filledSlots.validationProof ||
      "A complete test order in sandbox processing a test payment, issuing an automated digital receipt, and registering in the order queue with zero unhandled runtime errors.";
    boundariesAndLimits =
      "Budget capped at approved milestone amount. Scope excludes unapproved third-party paid plugins or unsupported multi-currency accounting. Product photography and item copy are provided by client.";
    estimatedBudgetMinor = filledSlots.fulfillmentModel?.includes("Shipping") ? 35000 : 20000;
    targetTimelineDays = 7;
  } else if (domain.domainId === "web_platform") {
    whatWeAreBuilding = `A modern, responsive web application and client portal delivering "${rawGoal.trim()}".`;
    const auth = filledSlots.authAndAccess || "Social 1-Click OAuth and Magic Links";
    howItDelivers = `Built with Next.js and Tailwind CSS, authenticated via ${auth}, with persistent database records and responsive desktop and mobile viewports.`;
    howSuccessIsProven =
      filledSlots.validationProof ||
      "A live staging deployment verifying successful user authentication, core workflow data persistence, and Google Lighthouse performance score >= 85.";
    boundariesAndLimits =
      "Scope capped to agreed core user journeys. Excludes custom enterprise single sign-on (SAML/Okta) unless specified. Copy and logo assets provided by client.";
    estimatedBudgetMinor = 30000;
    targetTimelineDays = 10;
  } else {
    // Universal general project fallback
    whatWeAreBuilding = `Professional technical execution and turnkey deliverables fulfilling: "${rawGoal.trim()}".`;
    const format = filledSlots.deliverableFormat || "Technical Implementation and Documentation Package";
    howItDelivers = `Delivered through a structured ${format}, adhering to modern engineering standards, verified configurations, and clear operational guidelines.`;
    howSuccessIsProven =
      filledSlots.validationProof ||
      "Live demonstration walkthrough and client acceptance inspection verifying 100% of agreed criteria checklist items.";
    boundariesAndLimits =
      "Scope strictly bounded to approved milestones and deliverables. Out-of-scope additions require formal mutual contract amendment before execution.";
    estimatedBudgetMinor = 25000;
    targetTimelineDays = 5;
  }

  const milestones = domain.defaultMilestones.map((m) => ({
    title: m.title,
    description: m.description,
    percentage: m.percentage,
    amountMinor: Math.round((estimatedBudgetMinor * m.percentage) / 100),
    deliverableCheck: m.deliverableCheck,
  }));

  const deliverables = [
    "Complete source code repository with clean documentation",
    "Configured deployment or runnable build package",
    "Observable verification test proof and validation report",
  ];

  const acceptanceCriteria = [
    {
      key: "functional_core_delivery",
      statement: whatWeAreBuilding,
      verificationMethod: "SEMANTIC" as const,
      proofMechanism: "Inspection against approved Cognitive Scope Canvas specification.",
    },
    {
      key: "observable_validation_proof",
      statement: howSuccessIsProven,
      verificationMethod: "DETERMINISTIC" as const,
      proofMechanism: "Automated test harness, sandbox transaction, or verifiable audit log.",
    },
    {
      key: "scope_boundary_compliance",
      statement: boundariesAndLimits,
      verificationMethod: "HUMAN_REVIEW" as const,
      proofMechanism: "Client review confirming all agreed deliverables match before authorization settlement.",
    },
  ];

  return {
    title,
    domain: domain.label,
    whatWeAreBuilding,
    howItDelivers,
    howSuccessIsProven,
    boundariesAndLimits,
    estimatedBudgetMinor,
    currency: "USD",
    targetTimelineDays,
    deliverables,
    acceptanceCriteria,
    suggestedMilestones: milestones,
  };
}

function deriveProjectTitle(rawGoal: string, domain: DomainDefinition): string {
  const trimmed = rawGoal.trim();
  const firstLine = trimmed.split("\n")[0]?.trim() || "";
  if (firstLine.length >= 10 && firstLine.length <= 70) {
    return firstLine.charAt(0).toUpperCase() + firstLine.slice(1);
  }
  return `${domain.label}: ${trimmed.slice(0, 45)}${trimmed.length > 45 ? "..." : ""}`;
}

/**
 * Main Scoping Diagnostic Engine.
 * Takes a multi-turn user message or initial prompt, detects domain & literacy,
 * evaluates the 4 core dimensions, and yields interactive option prompts or the reverse pitch canvas.
 */
export async function processScopingTurn(request: ScopingRequest): Promise<ScopingSessionState> {
  const sessionId = request.sessionId || `scope_${randomUUID()}`;
  const history = request.history || [];
  const incomingSlots: Record<string, string> = { ...(request.slots || {}) };

  // Combine conversation context to understand the user's ongoing intent
  const fullTextContext = [
    request.message,
    ...history.map((h) => h.content),
  ].join(" ");

  const domain = matchDomain(fullTextContext);
  const literacyLevel = request.literacyLevel || detectTechnicalLiteracy(fullTextContext);

  // If user selected an option from the previous turn, map it to the corresponding slot
  if (request.selectedOptionId) {
    for (const slotDef of domain.slots) {
      const match = slotDef.options.find((opt) => opt.id === request.selectedOptionId);
      if (match) {
        incomingSlots[slotDef.slotKey] = match.value;
        if (slotDef.dimension === "validationProof") {
          incomingSlots.validationProof = match.value;
        }
        break;
      }
    }
  }

  // Evaluate the 4 baseline dimensions
  const evaluation = evaluateInformationThreshold(request.message, domain, incomingSlots);

  // Determine dialogue history
  const dialogueTurn: ScopingDialogueTurn = {
    id: `turn_${randomUUID()}`,
    role: "user",
    content: request.message,
    selectedOptionId: request.selectedOptionId,
    timestamp: new Date().toISOString(),
  };

  const updatedDialogue: ScopingDialogueTurn[] = [
    ...history.map((h, i) => ({
      id: `hist_${i}`,
      role: h.role,
      content: h.content,
      selectedOptionId: h.selectedOptionId,
      timestamp: new Date().toISOString(),
    })),
    dialogueTurn,
  ];

  let currentQuestion: string | null = null;
  let currentHelperContext: string | undefined = undefined;
  let currentOptions: ScopingOption[] = [];
  let reversePitchCanvas: CognitiveScopeCanvas | null = null;

  if (evaluation.thresholdMet) {
    // Generate the Reverse Pitch Canvas using the root user objective
    const rootGoal = history.find((h) => h.role === "user")?.content || request.message;
    reversePitchCanvas = buildCognitiveScopeCanvas(
      rootGoal,
      domain,
      incomingSlots,
      literacyLevel,
    );

    const pitchMessage =
      literacyLevel <= 2
        ? "I have completely mapped out your project requirements! Before we lock in your agreement and create the PayPal payment hold, take a look at the Executive Intent Canvas below to ensure we are 100% aligned."
        : "Information threshold satisfied. The Core Objective, Technical Constraints, Validation Proof, and Boundary Limits are fully resolved into the Cognitive Scope Canvas below.";

    updatedDialogue.push({
      id: `turn_ai_${randomUUID()}`,
      role: "assistant",
      content: pitchMessage,
      timestamp: new Date().toISOString(),
    });
  } else {
    // Locate the first unfilled slot for this domain
    const unfilledSlot = domain.slots.find((s) => !incomingSlots[s.slotKey]);

    if (unfilledSlot) {
      currentQuestion =
        literacyLevel <= 2 ? unfilledSlot.questionLayman : unfilledSlot.questionTechnical;
      currentHelperContext =
        literacyLevel <= 2 ? unfilledSlot.helperContextLayman : unfilledSlot.helperContextTechnical;
      currentOptions = unfilledSlot.options;

      let introLead = "Got it! ";
      if (history.length === 0) {
        introLead = `Great objective. To structure the exact blueprints for your specialist, I need to understand a few key decisions. `;
      }

      updatedDialogue.push({
        id: `turn_ai_${randomUUID()}`,
        role: "assistant",
        content: `${introLead}${currentQuestion}`,
        timestamp: new Date().toISOString(),
      });
    } else {
      // Fallback: missing proof method
      currentQuestion = "How would you like your specialist to prove completion before payment settlement?";
      currentHelperContext = "An objective third-party check protects both you and your freelancer.";
      currentOptions = [
        {
          id: "opt_val_e2e_demo",
          title: "Interactive Sandbox Demonstration & Checklist",
          bestIf: "You want a live preview walkthrough with zero unhandled errors.",
          developerBuilds: "Live staging run-through demonstrating all core criteria.",
          tradeOff: "Direct human verifiable proof.",
          value: "Live staging demonstration passing all criteria",
          badge: "Transparent",
        },
        {
          id: "opt_val_auto_test",
          title: "Automated Verification Test Suite (Code Coverage >= 85%)",
          bestIf: "Software engineering quality and zero regressions are top priority.",
          developerBuilds: "Automated test runner exiting cleanly with 0 errors.",
          tradeOff: "Fast, mathematical proof.",
          value: "Automated test suite passing with code 0",
          badge: "Engineering Standard",
        },
      ];

      updatedDialogue.push({
        id: `turn_ai_${randomUUID()}`,
        role: "assistant",
        content: currentQuestion,
        timestamp: new Date().toISOString(),
      });
    }
  }

  return {
    sessionId,
    rawGoal: history.find((h) => h.role === "user")?.content || request.message,
    detectedDomain: domain.domainId,
    domainLabel: domain.label,
    technicalLiteracyLevel: literacyLevel,
    understandingGauge: evaluation.gauge,
    thresholdMet: evaluation.thresholdMet,
    activeMissingDimension: evaluation.missingDimension,
    dimensions: evaluation.dimensions,
    filledSlots: incomingSlots,
    dialogue: updatedDialogue,
    currentQuestion,
    currentHelperContext,
    currentOptions,
    allowCustomInput: true,
    reversePitchCanvas,
  };
}
