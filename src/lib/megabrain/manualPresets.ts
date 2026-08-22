import type { CaseInput } from "./engine";

export type ManualPresetId = "A" | "B" | "C" | "D" | "E";
export type ClarificationMode = "normal" | "off" | "fixed";
export type KnowledgeMode = "off" | "core" | "research";
export type MemoryMode = "off" | "case" | "saved";

export interface ManualPreset {
  id: ManualPresetId;
  label: string;
  purpose: string;
  execution: NonNullable<CaseInput["execution"]>;
  /** Server-owned experimental envelope. A client cannot override it. */
  capUsd: number;
  /** Extra multiplier for providers whose reasoning is not bounded by max_tokens. */
  reasoningReserveMultiplier: number;
  limitation?: string;
}

/**
 * Frozen from the blind Arena mapping, not inferred from brand reputation.
 * A/B preserve the original Grok control; C/D/E use the blind results.
 */
export const MANUAL_PRESETS: Record<ManualPresetId, ManualPreset> = {
  A: {
    id: "A",
    label: "Baseline",
    purpose: "Production-equivalent Standard stack from the first smoke.",
    execution: { analysisConfigurationId: "grok-two-call", finalModelKey: "grok-4.3", maxJsonRetries: 0 },
    capUsd: 0.05,
    reasoningReserveMultiplier: 1,
    limitation: "Grok reasoning is provider default: enabled, low; no explicit effort is sent.",
  },
  B: {
    id: "B",
    label: "High Reasoning Control",
    purpose: "The same stack with explicit high reasoning on strategy and final prose.",
    execution: {
      analysisConfigurationId: "grok-two-call",
      finalModelKey: "grok-4.3",
      maxJsonRetries: 0,
      reasoning: {
        strategise: { effort: "high", exclude: true },
        final: { effort: "high", exclude: true },
      },
    },
    capUsd: 0.08,
    reasoningReserveMultiplier: 1.5,
  },
  C: {
    id: "C",
    label: "Cheap",
    purpose: "Blind runner-up GLM performs hidden strategy and final prose.",
    execution: {
      analysisConfigurationId: "manual-cheap",
      finalModelKey: "glm-5.2",
      maxJsonRetries: 0,
      reasoning: {
        strategise: { effort: "xhigh", exclude: true },
        final: { effort: "xhigh", exclude: true },
      },
    },
    capUsd: 0.06,
    reasoningReserveMultiplier: 2,
  },
  D: {
    id: "D",
    label: "Premium",
    purpose: "Blind winner Qwen performs hidden strategy and final prose.",
    execution: {
      analysisConfigurationId: "manual-premium",
      finalModelKey: "qwen-3.6-max-preview",
      maxJsonRetries: 0,
      reasoning: {
        strategise: { enabled: true, exclude: true },
        final: { enabled: true, exclude: true },
      },
    },
    capUsd: 0.12,
    reasoningReserveMultiplier: 2.5,
    limitation: "The endpoint can bill reasoning beyond max_tokens; the external per-key limit remains the final hard stop.",
  },
  E: {
    id: "E",
    label: "Hybrid",
    purpose: "Blind winner Qwen thinks; runner-up GLM edits the final answer.",
    execution: {
      analysisConfigurationId: "manual-premium",
      finalModelKey: "glm-5.2",
      maxJsonRetries: 0,
      reasoning: {
        strategise: { enabled: true, exclude: true },
        final: { effort: "xhigh", exclude: true },
      },
    },
    capUsd: 0.1,
    reasoningReserveMultiplier: 2.25,
    limitation: "Qwen reasoning is not a strict max_tokens-bounded cost surface.",
  },
};

export function resolveManualPreset(raw: unknown): ManualPreset {
  const id = typeof raw === "string" ? raw : "";
  const preset = (MANUAL_PRESETS as Record<string, ManualPreset>)[id];
  if (!preset) throw new Error("INVALID_MANUAL_PRESET");
  return preset;
}

export function parseClarificationMode(raw: unknown): ClarificationMode {
  if (raw === "normal" || raw === "off" || raw === "fixed") return raw;
  throw new Error("INVALID_CLARIFICATION_MODE");
}

export function parseKnowledgeMode(raw: unknown): KnowledgeMode {
  if (raw === "off" || raw === "core" || raw === "research") return raw;
  throw new Error("INVALID_KNOWLEDGE_MODE");
}

export function parseMemoryMode(raw: unknown): MemoryMode {
  if (raw === "off" || raw === "case" || raw === "saved") return raw;
  throw new Error("INVALID_MEMORY_MODE");
}
