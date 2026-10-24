import { z } from "zod";
import type { Universal4DMatrix } from "./matrix.js";

export type ScopingDimensionKey =
  | "coreObjective"
  | "technicalConstraints"
  | "validationProof"
  | "boundaryConstraints";

export type DimensionStatus = "missing" | "partial" | "satisfied";

export interface ScopingDimensionState {
  key: ScopingDimensionKey;
  label: string;
  status: DimensionStatus;
  score: number; // 0 to 100
  summary: string;
  details: string[];
}

export interface ScopingOption {
  id: string;
  title: string;
  icon?: string;
  bestIf: string;
  developerBuilds: string;
  tradeOff: string;
  value: string;
  badge?: string;
}

export interface ScopingDialogueTurn {
  id: string;
  role: "user" | "assistant";
  content: string;
  selectedOptionId?: string;
  selectedOptionLabel?: string;
  timestamp: string;
}

export interface CognitiveScopeCanvas {
  title: string;
  domain: string;
  whatWeAreBuilding: string;
  howItDelivers: string;
  howSuccessIsProven: string;
  boundariesAndLimits: string;
  estimatedBudgetMinor: number;
  currency: string;
  targetTimelineDays: number;
  feasibilityRating?: "healthy" | "tight" | "underfunded";
  scopeTrimmingAdvisory?: string;
  taskMatrix?: Universal4DMatrix;
  verificationWindowHours?: number;
  requiresHumanReviewGate?: boolean;
  deliverables: string[];
  acceptanceCriteria: Array<{
    key: string;
    statement: string;
    verificationMethod: "DETERMINISTIC" | "SEMANTIC" | "HUMAN_REVIEW";
    proofMechanism: string;
  }>;
  suggestedMilestones: Array<{
    title: string;
    description: string;
    percentage: number;
    amountMinor: number;
    deliverableCheck: string;
  }>;
}

export interface ScopingSessionState {
  sessionId: string;
  rawGoal: string;
  detectedDomain: string;
  domainLabel: string;
  technicalLiteracyLevel: number; // 1 (layman) to 5 (engineer)
  understandingGauge: number; // 0 to 100
  thresholdMet: boolean;
  activeMissingDimension: ScopingDimensionKey | null;
  dimensions: Record<ScopingDimensionKey, ScopingDimensionState>;
  filledSlots: Record<string, string>;
  dialogue: ScopingDialogueTurn[];
  currentQuestion: string | null;
  currentSlotKey?: string | null;
  currentHelperContext?: string;
  currentOptions: ScopingOption[];
  recommendedOptionId?: string | null;
  advisoryNotice?: string | null;
  feasibilityRating?: "healthy" | "tight" | "underfunded";
  scopeTrimmingAdvisory?: string | null;
  detectedResources?: { repo?: boolean; schema?: boolean; logs?: boolean };
  allowCustomInput: boolean;
  reversePitchCanvas: CognitiveScopeCanvas | null;
  taskMatrix?: Universal4DMatrix;
  baselineFrozenAt?: string;
}

export const scopingResourceInputSchema = z.object({
  repoUrl: z.string().optional(),
  repoTechSummary: z.string().optional(),
  schemaSpec: z.string().optional(),
  errorLogs: z.string().optional(),
});
export type ScopingResourceInput = z.infer<typeof scopingResourceInputSchema>;

export const scopingRequestSchema = z.object({
  sessionId: z.string().optional(),
  message: z.string().trim().min(1, "Please enter a message or objective"),
  selectedOptionId: z.string().optional(),
  activeSlotKey: z.string().optional(),
  customBudgetMinor: z.number().int().positive().optional(),
  resources: scopingResourceInputSchema.optional(),
  slots: z.record(z.string()).optional(),
  history: z
    .array(
      z.object({
        role: z.enum(["user", "assistant"]),
        content: z.string(),
        selectedOptionId: z.string().optional(),
      }),
    )
    .optional(),
  literacyLevel: z.number().int().min(1).max(5).optional(),
});
export type ScopingRequest = z.infer<typeof scopingRequestSchema>;

export const finalizeScopeSchema = z.object({
  sessionId: z.string().min(1),
  canvas: z.object({
    title: z.string().min(1),
    domain: z.string(),
    whatWeAreBuilding: z.string().min(1),
    howItDelivers: z.string().min(1),
    howSuccessIsProven: z.string().min(1),
    boundariesAndLimits: z.string().min(1),
    estimatedBudgetMinor: z.number().int().positive(),
    currency: z.string().default("USD"),
    targetTimelineDays: z.number().int().positive(),
    verificationWindowHours: z.number().int().positive().optional(),
    requiresHumanReviewGate: z.boolean().optional(),
    taskMatrix: z.any().optional(),
    deliverables: z.array(z.string()),
    acceptanceCriteria: z.array(
      z.object({
        key: z.string(),
        statement: z.string(),
        verificationMethod: z.enum(["DETERMINISTIC", "SEMANTIC", "HUMAN_REVIEW"]),
        proofMechanism: z.string(),
      }),
    ),
    suggestedMilestones: z.array(
      z.object({
        title: z.string(),
        description: z.string(),
        percentage: z.number(),
        amountMinor: z.number(),
        deliverableCheck: z.string(),
      }),
    ),
  }),
});
export type FinalizeScopeRequest = z.infer<typeof finalizeScopeSchema>;
