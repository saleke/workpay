/**
 * The Dynamic Commodity Filter (The Value Screen) & Strategic Macro-Differentiator Matrix.
 *
 * Implements:
 * 1. The Value Screen: Discards trivia and scaffolding details that do not impact
 *    the price/hours or the criteria required to release the PayPal payment authorization hold.
 * 2. Strategic Macro-Differentiators: Programmatically extracts only the 2 to 3
 *    high-impact operational variables that truly define the unique incoming objective.
 */

import type { Universal4DMatrix } from "./matrix.js";
import type { ScopingOption } from "./types.js";

export interface ValueScreenResult {
  passesValueScreen: boolean;
  impactsPriceOrHours: boolean;
  impactsVerificationProof: boolean;
  rationale: string;
}

export interface MacroDifferentiatorSlot {
  slotKey: string;
  dimension: "substance" | "scale" | "inertia" | "criticality";
  label: string;
  question: string;
  helperContext: string;
  options: ScopingOption[];
}

/**
 * The Dynamic Commodity Filter (The Value Screen).
 * Evaluates candidate details against dual programmatic criteria:
 * 1. Does this detail directly impact the overall price or execution hours?
 * 2. Does this detail change the verification criteria needed to release the PayPal payment authorization hold?
 */
export function evaluateCommodityFilter(detailText: string): ValueScreenResult {
  const lower = detailText.toLowerCase();

  // Price & Hours Impact Markers
  const priceImpactKeywords = [
    "scale", "endpoint", "screen", "database", "migration", "architecture",
    "hours", "volume", "records", "real-time", "offline", "integration",
    "third-party", "multi-tenant", "auth", "security", "framework",
    "topology", "infrastructure", "hardware", "network", "scope", "layer",
    "platform", "environment", "pipeline", "stack", "gateway", "service",
    "workflow", "storage", "cloud",
  ];

  // Verification & Hold Release Impact Markers
  const verificationImpactKeywords = [
    "test", "verify", "proof", "benchmark", "pass", "criteria", "audit",
    "plagiarism", "staging", "coverage", "attestation", "reproduction",
    "deliverable", "resolution", "source file", "format", "acceptance",
  ];

  // Trivia / Commodity Noise Markers (Details that do not change price or verification)
  const triviaKeywords = [
    "font color", "button color", "repo name", "nice looking", "simple",
    "cool name", "blue background", "friendly tone", "clean vibes",
  ];

  const hasTrivia = triviaKeywords.some((k) => lower.includes(k));
  const impactsPriceOrHours = priceImpactKeywords.some((k) => lower.includes(k));
  const impactsVerificationProof = verificationImpactKeywords.some((k) => lower.includes(k));

  const passes = (impactsPriceOrHours || impactsVerificationProof) && !hasTrivia;

  let rationale = "Detail passes the Value Screen.";
  if (!passes) {
    rationale = "Detail classified as commodity trivia. It does not impact engineering hours or payment hold verification criteria.";
  } else if (impactsPriceOrHours && impactsVerificationProof) {
    rationale = "High-impact variable: changes both execution scope and settlement release criteria.";
  } else if (impactsPriceOrHours) {
    rationale = "Direct price driver: directly impacts project execution hours.";
  } else {
    rationale = "Settlement driver: changes the objective verification mechanism for payment release.";
  }

  return {
    passesValueScreen: passes,
    impactsPriceOrHours,
    impactsVerificationProof,
    rationale,
  };
}

/**
 * Generates the 2 to 3 Strategic Macro-Differentiators for an objective
 * based on its Universal 4D Task Matrix profile.
 */
export function generateStrategicMacroDifferentiators(
  matrix: Universal4DMatrix,
  rawGoal: string,
  alreadyFilled: Record<string, string>,
): MacroDifferentiatorSlot[] {
  const slots: MacroDifferentiatorSlot[] = [];

  // 1. MACRO-DIFFERENTIATOR 1: Structural Scale (The direct price/hour driver)
  if (!matrix.structuralScale.isDefined && !alreadyFilled["structuralScale"]) {
    let scaleOptions: ScopingOption[] = [];

    if (matrix.substance.type === "code_data") {
      scaleOptions = [
        {
          id: "scale_code_compact",
          title: "Focused Scope (1 to 3 Core Endpoints / Screens)",
          bestIf: "A streamlined utility, single workflow, or minimal prototype.",
          developerBuilds: "Concise codebase with tight test boundaries.",
          tradeOff: "Fastest turnaround with lowest budget ceiling.",
          value: "1 to 3 Core Endpoints or Screens",
          badge: "MVP Scope",
        },
        {
          id: "scale_code_standard",
          title: "Full Feature Scope (4 to 8 Endpoints / Screens)",
          bestIf: "A complete user journey with authentication, data storage, and edge cases.",
          developerBuilds: "Modular architecture, migrations, and complete test suites.",
          tradeOff: "Comprehensive implementation across primary business workflows.",
          value: "4 to 8 Endpoints or Screens",
          badge: "Full System",
        },
        {
          id: "scale_code_enterprise",
          title: "Complex / Multi-Service Scale (9+ Endpoints / Screens)",
          bestIf: "Extensive multi-entity platform, high throughput, or compound integrations.",
          developerBuilds: "Distributed services, background workers, and scalable schema.",
          tradeOff: "Enterprise-grade execution with robust telemetry.",
          value: "9+ Endpoints or Screens",
          badge: "High Scale",
        },
      ];
    } else if (matrix.substance.type === "prose_text") {
      scaleOptions = [
        {
          id: "scale_prose_short",
          title: "Standard Length (500 to 1,200 Words)",
          bestIf: "Blog post, concise executive summary, or landing page copy.",
          developerBuilds: "Tight, high-conversion editorial copy with zero fluff.",
          tradeOff: "High impact per word with fast turnaround.",
          value: "500 to 1,200 Words",
          badge: "Concise Copy",
        },
        {
          id: "scale_prose_deep",
          title: "In-Depth Research / Whitepaper (2,500+ Words)",
          bestIf: "Comprehensive technical guide, PRD, or research analysis.",
          developerBuilds: "Deep analytical synthesis with cited references and diagrams.",
          tradeOff: "Authoritative publication with exhaustive depth.",
          value: "2,500+ Words Deep Synthesis",
          badge: "Exhaustive Depth",
        },
      ];
    } else if (matrix.substance.type === "static_visuals") {
      scaleOptions = [
        {
          id: "scale_vis_focused",
          title: "Single Core Deliverable + Formats",
          bestIf: "Single primary visual asset (e.g. 1 logo suite or 1 key UI view).",
          developerBuilds: "High-fidelity vector master with export package.",
          tradeOff: "Maximum polish on one essential brand asset.",
          value: "Single Core Visual Asset + Multi-Format Export",
          badge: "Focused Asset",
        },
        {
          id: "scale_vis_suite",
          title: "Full Brand / UI Component System (Multiple Screens/Assets)",
          bestIf: "Multi-screen application flow, slide deck, or complete identity system.",
          developerBuilds: "Figma design system with reusable component library.",
          tradeOff: "Comprehensive asset suite across all viewports.",
          value: "Full Component & Screen System",
          badge: "Complete System",
        },
      ];
    } else {
      scaleOptions = [
        {
          id: "scale_gen_compact",
          title: "Single Milestone Delivery",
          bestIf: "A discrete, bounded technical or operational request.",
          developerBuilds: "Execution focused on primary deliverable.",
          tradeOff: "Rapid completion with clear bounds.",
          value: "Single Discrete Milestone",
          badge: "Standard",
        },
        {
          id: "scale_gen_expanded",
          title: "Multi-Phase Comprehensive Engagement",
          bestIf: "An engagement requiring discovery, execution, and extensive verification.",
          developerBuilds: "Full end-to-end delivery package.",
          tradeOff: "Thorough verification with multi-stage sign-offs.",
          value: "Multi-Phase Engagement",
          badge: "Extended",
        },
      ];
    }

    slots.push({
      slotKey: "structuralScale",
      dimension: "scale",
      label: "Structural Scale & Volume",
      question: matrix.structuralScale.strategicScaleQuestion,
      helperContext: "Scale directly drives engineering hours and milestone allocations.",
      options: scaleOptions,
    });
  }

  // 2. MACRO-DIFFERENTIATOR 2: System Inertia & Environment Access (Brownfield vs Greenfield)
  if (matrix.systemInertia.type === "brownfield" && !alreadyFilled["systemInertiaAccess"]) {
    slots.push({
      slotKey: "systemInertiaAccess",
      dimension: "inertia",
      label: "System State & Access Credentials",
      question: "What is the current state of the existing system and how will the specialist access it?",
      helperContext: "Brownfield tasks require credential access, environment boundaries, and diagnostic context.",
      options: [
        {
          id: "opt_inertia_sandbox",
          title: "Dedicated Staging / Sandbox Environment with Repository Access",
          bestIf: "You have a staging server or GitHub repo ready for the freelancer to branch and test.",
          developerBuilds: "Code changes tested in staging before production deployment.",
          tradeOff: "Safest engineering pattern with zero production risk.",
          value: "Staging sandbox with dedicated repository branch access",
          badge: "Zero Production Risk",
        },
        {
          id: "opt_inertia_repo_only",
          title: "Source Code Repository Access Only (Local Simulation)",
          bestIf: "Freelancer can run the project locally via Docker or npm without touching live servers.",
          developerBuilds: "Isolated local development with automated test coverage.",
          tradeOff: "Requires minimal credential sharing.",
          value: "Isolated repository access with local development simulation",
          badge: "Isolated Code",
        },
        {
          id: "opt_inertia_assisted",
          title: "Live Production Screen-Share / Assisted Remote Session",
          bestIf: "Sensitive production infrastructure where team members oversee execution live.",
          developerBuilds: "Supervised configuration changes executed during scheduled maintenance.",
          tradeOff: "Maximum client security oversight.",
          value: "Supervised session with client oversight",
          badge: "Supervised Access",
        },
      ],
    });
  }

  // 3. MACRO-DIFFERENTIATOR 3: Objective Verification Proof (The settlement driver)
  if (!alreadyFilled["validationProof"]) {
    let proofOptions: ScopingOption[] = [];

    if (matrix.substance.type === "code_data") {
      proofOptions = [
        {
          id: "proof_auto_suite",
          title: "Automated Test Suite Execution (Code Coverage >= 85%)",
          bestIf: "Software engineering quality and zero regressions are top priority.",
          developerBuilds: "Automated test harness exiting cleanly with code 0 on CI or local runner.",
          tradeOff: "Deterministic, mathematical proof of working logic.",
          value: "Automated test suite passing with exit code 0",
          badge: "Deterministic Proof",
        },
        {
          id: "proof_staging_healthcheck",
          title: "Live Staging Deployment with Healthcheck Status 200",
          bestIf: "You want a live URL to click through and verify user workflows directly.",
          developerBuilds: "Deployed preview URL with responsive endpoints and clean console telemetry.",
          tradeOff: "Visible, observable proof on real cloud infrastructure.",
          value: "Live staging deployment passing functional healthcheck status 200",
          badge: "Observable Deployment",
        },
      ];
    } else if (matrix.substance.type === "prose_text") {
      proofOptions = [
        {
          id: "proof_prose_originality",
          title: "Verified Originality & Word Count Audit (Plagiarism < 3%)",
          bestIf: "Publication-ready articles, research papers, or customer documentation.",
          developerBuilds: "Structured markdown/doc delivery passing plagiarism and readability audit.",
          tradeOff: "Guaranteed unique, high-authority prose.",
          value: "Original text passing plagiarism audit (< 3%) and target word count",
          badge: "Originality Verified",
        },
      ];
    } else if (matrix.substance.type === "static_visuals") {
      proofOptions = [
        {
          id: "proof_vis_source",
          title: "Master Vector Source (.fig / .svg) + Multi-Resolution Export Package",
          bestIf: "You need fully editable graphic or design files for development and marketing.",
          developerBuilds: "Figma or vector source file with organized layers and web export assets.",
          tradeOff: "Production-ready creative package with complete ownership.",
          value: "Master vector source files with organized layers and export package",
          badge: "Source File Delivery",
        },
      ];
    } else {
      proofOptions = [
        {
          id: "proof_gen_attestation",
          title: "Demonstration Walkthrough & Specification Acceptance Checklist",
          bestIf: "You want to inspect deliverables against a mutually agreed checklist.",
          developerBuilds: "Structured delivery package meeting 100% of agreed criteria.",
          tradeOff: "Clear audit trail with formal verification.",
          value: "Documented delivery package meeting 100% of agreed criteria",
          badge: "Verified Checklist",
        },
      ];
    }

    slots.push({
      slotKey: "validationProof",
      dimension: "criticality",
      label: "Observable Verification Proof",
      question: `How should completion be proven before releasing the PayPal payment authorization hold?`,
      helperContext: `Based on ${matrix.substance.label}, select the objective verification proof method.`,
      options: proofOptions,
    });
  }

  return slots.slice(0, 3); // Capped strictly to the top 2-3 high-impact macro-differentiators
}
