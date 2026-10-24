/**
 * The Universal 4-Dimensional Task Matrix.
 *
 * Replaces primitive categorical guessing with a universal task ontology:
 * 1. Substance & Medium (What is being manipulated?)
 * 2. Structural Scale (How much of it is there?)
 * 3. System Inertia (What is the starting state: Greenfield vs Brownfield?)
 * 4. Compliance & Criticality (What happens if it fails?)
 */

export type TaskSubstanceType =
  | "code_data"
  | "prose_text"
  | "static_visuals"
  | "time_presence"
  | "physical_assets";

export type TaskVerificationProofType =
  | "API_CHECK"
  | "STRUCTURAL_ASSET_CHECK"
  | "ORIGINALITY_AUDIT"
  | "MUTUAL_ATTESTATION"
  | "PHYSICAL_PROOF";

export type TaskInertiaType = "greenfield" | "brownfield";

export type TaskCriticalityLevel = "low" | "medium" | "high";

export interface SubstanceDimension {
  type: TaskSubstanceType;
  label: string;
  targetArtifactDescription: string;
  verificationProofType: TaskVerificationProofType;
  recommendedProofMechanism: string;
}

export interface StructuralScaleDimension {
  unitOfMeasurement: string;
  unitLabel: string;
  estimatedVolume?: string;
  scalingMultiplier: number;
  isDefined: boolean;
  strategicScaleQuestion: string;
}

export interface SystemInertiaDimension {
  type: TaskInertiaType;
  label: string;
  discoveryRisk: "low" | "medium" | "high";
  requiresAccessAudit: boolean;
  brownfieldDiscoveryQuestions: string[];
}

export interface ComplianceCriticalityDimension {
  level: TaskCriticalityLevel;
  label: string;
  verificationWindowHours: number;
  requiresHumanReviewGate: boolean;
  liabilityRationale: string;
}

export interface Universal4DMatrix {
  substance: SubstanceDimension;
  structuralScale: StructuralScaleDimension;
  systemInertia: SystemInertiaDimension;
  complianceCriticality: ComplianceCriticalityDimension;
}

/**
 * Analyzes raw user goal and context against the Universal 4-Dimensional Task Matrix.
 */
export function analyzeUniversal4DMatrix(rawGoal: string, fullContext?: string): Universal4DMatrix {
  const combined = `${rawGoal} ${fullContext || ""}`.toLowerCase();

  // =========================================================================
  // DIMENSION 1: SUBSTANCE & MEDIUM
  // =========================================================================
  let substance: SubstanceDimension;

  const codeKeywords = [
    "code", "api", "backend", "frontend", "react", "nextjs", "python", "script",
    "database", "algorithm", "server", "sql", "cloud", "docker", "rust", "golang",
    "flutter", "pipeline", "endpoint", "webhook", "postgres", "bug", "crash",
    "deploy", "repository", "git", "web app", "software",
  ];
  const proseKeywords = [
    "article", "blog", "write", "copywriting", "translation", "essay",
    "documentation", "document", "draft", "prd", "whitepaper", "proofread",
    "editing", "speech", "content", "press release", "newsletter", "copy",
    "report", "words", "text", "summary", "guide", "manuscript",
  ];
  const visualKeywords = [
    "logo", "design", "figma", "banner", "illustration", "3d", "animation",
    "video", "flyer", "branding", "mockup", "render", "ui/ux", "graphics",
    "artwork", "icon",
  ];
  const timeKeywords = [
    "consult", "coaching", "tutor", "pair programming", "interview", "advisory",
    "meeting", "session", "live demo", "walkthrough", "mentorship", "guidance",
  ];
  const physicalKeywords = [
    "hardware", "repair", "3d print", "deliver", "package", "install switch",
    "device", "shipment", "equipment", "cabling", "rack",
  ];

  const scoreCode = codeKeywords.filter((k) => combined.includes(k)).length * 2;
  const scoreProse = proseKeywords.filter((k) => combined.includes(k)).length * 2;
  const scoreVisual = visualKeywords.filter((k) => combined.includes(k)).length * 2;
  const scoreTime = timeKeywords.filter((k) => combined.includes(k)).length * 2;
  const scorePhysical = physicalKeywords.filter((k) => combined.includes(k)).length * 2;

  const maxScore = Math.max(scoreCode, scoreProse, scoreVisual, scoreTime, scorePhysical);

  if (maxScore === scorePhysical && scorePhysical > 0) {
    substance = {
      type: "physical_assets",
      label: "Physical Assets & Hardware",
      targetArtifactDescription: "Physical equipment configuration, localized setup, or tangible delivery package.",
      verificationProofType: "PHYSICAL_PROOF",
      recommendedProofMechanism: "Geofenced photo verification with timestamp and signed proof-of-delivery note.",
    };
  } else if (maxScore === scoreTime && scoreTime > 0) {
    substance = {
      type: "time_presence",
      label: "Live Time & Presence",
      targetArtifactDescription: "Synchronous expert advisory, pair programming session, or live technical review.",
      verificationProofType: "MUTUAL_ATTESTATION",
      recommendedProofMechanism: "Calendar timestamped attendance log and recorded session walkthrough transcript.",
    };
  } else if (maxScore === scoreVisual && scoreVisual > 0) {
    substance = {
      type: "static_visuals",
      label: "Design & Visual Media",
      targetArtifactDescription: "Production-ready visual assets, vector source files, and brand-consistent design components.",
      verificationProofType: "STRUCTURAL_ASSET_CHECK",
      recommendedProofMechanism: "Delivery of master source files (.fig, .svg) with verified asset resolution checklist.",
    };
  } else if (maxScore === scoreProse && scoreProse > 0) {
    substance = {
      type: "prose_text",
      label: "Prose & Textual Analysis",
      targetArtifactDescription: "Polished editorial copy, structured documentation, or research report.",
      verificationProofType: "ORIGINALITY_AUDIT",
      recommendedProofMechanism: "Verified word count assertion, structural tone check, and originality audit (0% plagiarism).",
    };
  } else {
    // Default to Code & Data (Software execution)
    substance = {
      type: "code_data",
      label: "Code & Digital Systems",
      targetArtifactDescription: "Executable source code, automated test suite, and deployed software infrastructure.",
      verificationProofType: "API_CHECK",
      recommendedProofMechanism: "Automated test harness passing with code 0 and verified staging healthcheck status 200.",
    };
  }

  // =========================================================================
  // DIMENSION 2: STRUCTURAL SCALE
  // =========================================================================
  let structuralScale: StructuralScaleDimension;

  if (substance.type === "code_data") {
    // Extract endpoint/screen count if mentioned
    const endpointMatch = combined.match(/(\d+)\s*(?:api|endpoint|route)s?/i);
    const screenMatch = combined.match(/(\d+)\s*(?:screen|page|view)s?/i);
    const estimated = endpointMatch ? `${endpointMatch[1]} API endpoints` : screenMatch ? `${screenMatch[1]} UI screens` : undefined;

    structuralScale = {
      unitOfMeasurement: "endpoints_or_screens",
      unitLabel: "API Endpoints / Application Screens",
      estimatedVolume: estimated,
      scalingMultiplier: endpointMatch && parseInt(endpointMatch[1]!) > 10 ? 1.8 : 1.0,
      isDefined: Boolean(estimated),
      strategicScaleQuestion: "How many endpoints, user screens, or database entities are in scope for this milestone?",
    };
  } else if (substance.type === "prose_text") {
    const wordMatch = combined.match(/(\d[\d,]*)\s*(?:word|page)s?/i);
    const estimated = wordMatch ? `${wordMatch[1]} words` : undefined;

    structuralScale = {
      unitOfMeasurement: "word_count",
      unitLabel: "Words / Document Length",
      estimatedVolume: estimated,
      scalingMultiplier: wordMatch && parseInt(wordMatch[1]!.replace(/,/g, "")) > 2500 ? 1.7 : 1.0,
      isDefined: Boolean(estimated),
      strategicScaleQuestion: "What is your target word count, page length, or depth of research for this piece?",
    };
  } else if (substance.type === "static_visuals") {
    const assetMatch = combined.match(/(\d+)\s*(?:logo|screen|banner|slide|asset|illustration)s?/i);
    const estimated = assetMatch ? `${assetMatch[1]} creative assets` : undefined;

    structuralScale = {
      unitOfMeasurement: "asset_count",
      unitLabel: "Creative Assets / Screens",
      estimatedVolume: estimated,
      scalingMultiplier: assetMatch && parseInt(assetMatch[1]!) > 5 ? 1.6 : 1.0,
      isDefined: Boolean(estimated),
      strategicScaleQuestion: "How many design variations, screens, or asset resolutions need to be delivered?",
    };
  } else if (substance.type === "time_presence") {
    const hourMatch = combined.match(/(\d+)\s*(?:hour|session)s?/i);
    const estimated = hourMatch ? `${hourMatch[1]} hours` : undefined;

    structuralScale = {
      unitOfMeasurement: "session_hours",
      unitLabel: "Advisory Hours / Sessions",
      estimatedVolume: estimated,
      scalingMultiplier: hourMatch && parseInt(hourMatch[1]!) > 4 ? 1.5 : 1.0,
      isDefined: Boolean(estimated),
      strategicScaleQuestion: "How many hours of live session time or structured consultation are required?",
    };
  } else {
    structuralScale = {
      unitOfMeasurement: "units_or_locations",
      unitLabel: "Hardware Units / Locations",
      estimatedVolume: undefined,
      scalingMultiplier: 1.0,
      isDefined: false,
      strategicScaleQuestion: "How many hardware devices, equipment racks, or locations are involved?",
    };
  }

  // =========================================================================
  // DIMENSION 3: SYSTEM INERTIA (Greenfield vs Brownfield)
  // =========================================================================
  const brownfieldKeywords = [
    "fix", "bug", "existing", "update", "refactor", "legacy", "migration",
    "upgrade", "integrate into", "modify", "debug", "slow", "crashing",
    "investigate", "audit", "patch", "troubleshoot", "failing", "broken",
  ];

  const hasBrownfield = brownfieldKeywords.some((k) => combined.includes(k));
  const systemInertia: SystemInertiaDimension = hasBrownfield
    ? {
        type: "brownfield",
        label: "Brownfield (Existing Live System)",
        discoveryRisk: "high",
        requiresAccessAudit: true,
        brownfieldDiscoveryQuestions: [
          "Do you have repository or server credentials ready for the specialist?",
          "Is there existing technical documentation, logs, or an active test environment?",
          "Are there live users or production databases that must remain zero-downtime during changes?",
        ],
      }
    : {
        type: "greenfield",
        label: "Greenfield (New Blank Canvas)",
        discoveryRisk: "low",
        requiresAccessAudit: false,
        brownfieldDiscoveryQuestions: [],
      };

  // =========================================================================
  // DIMENSION 4: COMPLIANCE & CRITICALITY
  // =========================================================================
  const highCriticalityKeywords = [
    "payment", "financial", "stripe", "paypal", "banking", "hipaa", "medical",
    "patient", "security", "pentest", "vulnerability", "soc2", "compliance",
    "legal", "contract", "production migration", "patient data", "pci",
  ];
  const lowCriticalityKeywords = [
    "internal", "draft", "personal", "demo", "prototype", "hobby", "mockup",
    "rough", "temporary", "sandbox",
  ];

  let complianceCriticality: ComplianceCriticalityDimension;

  if (highCriticalityKeywords.some((k) => combined.includes(k))) {
    complianceCriticality = {
      level: "high",
      label: "High Criticality (Financial / Regulated / Live Production)",
      verificationWindowHours: 120, // 5 days (scaled from 72h)
      requiresHumanReviewGate: true,
      liabilityRationale: "Involves sensitive data, financial flow, or security liabilities. Mandates deep inspection and multi-party review before authorization release.",
    };
  } else if (lowCriticalityKeywords.some((k) => combined.includes(k))) {
    complianceCriticality = {
      level: "low",
      label: "Low Criticality (Internal / Non-Production)",
      verificationWindowHours: 48,
      requiresHumanReviewGate: false,
      liabilityRationale: "Non-critical internal asset. Standard automated checklist is sufficient for release.",
    };
  } else {
    complianceCriticality = {
      level: "medium",
      label: "Standard Business Criticality",
      verificationWindowHours: 72,
      requiresHumanReviewGate: false,
      liabilityRationale: "Production business deliverable. Standard 72-hour verification window applies.",
    };
  }

  return {
    substance,
    structuralScale,
    systemInertia,
    complianceCriticality,
  };
}
