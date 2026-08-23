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
        // maxTokens/timeoutMs are evidence-based, not guessed: a live D run
        // produced 3233 reasoning tokens on strategise and (separately) timed
        // out once at the old 120s ceiling. strategise's budget carries ~1.85x
        // margin over that one sample; final has no live sample yet (both live
        // attempts failed before reaching it) so its numbers are a documented
        // estimate, proportioned to its smaller visible-output ceiling (2200
        // vs strategise's 3000), pending real data from the next run.
        strategise: { enabled: true, exclude: true, maxTokens: 6_000, timeoutMs: 170_000 },
        final: { enabled: true, exclude: true, maxTokens: 4_000, timeoutMs: 90_000 },
      },
      // Visible-output ceiling, separate from the reasoning budget above.
      // MAX_OUTPUT_TOKENS.strategise (3000, shared by every preset) was hit on
      // BOTH live D runs (~3004 visible tokens each time) and caused a real
      // OUTPUT_TRUNCATED on one of them — Qwen's structured strategise output
      // genuinely needs more room under this schema, independent of reasoning
      // depth. Raised for D only; every other preset still uses the shared
      // 3000. final is left at its shared 2200 — no live evidence yet that it
      // needs more (both live runs failed before reaching it).
      maxOutputTokens: { strategise: 4_000 },
    },
    // Raised from 0.12: that cap was set before any live reasoning-token data
    // existed. It was never actually the failure mode (total actual spend
    // across a full attempt was ~$0.047), but the PER-STAGE reservation was:
    // 3000 visible-only tokens reserved against a real 6237-token bill. With
    // the reasoning budgets above folded into reservationCeiling(), a full
    // two-call D pipeline now reserves roughly $0.14 in the worst case
    // (strategise ~$0.08 + final ~$0.06); 0.20 leaves real margin without
    // pretending reasoning is unbounded (an unbounded run against this
    // model's true 65,536-token completion ceiling would be ~$0.4-0.5 — this
    // cap still means something).
    capUsd: 0.2,
    reasoningReserveMultiplier: 2.5,
    limitation: "The endpoint bills reasoning as completion tokens beyond max_tokens; reasoning.max_tokens is now sent as an explicit budget, but whether this Alibaba endpoint honors it as a hard limit is unverified — reservations assume it might not. The external per-key limit remains the final hard stop.",
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

/**
 * Keep the server software envelope and the provider-specific reasoning buffer
 * separate. The normal projection is what CostLedger can enforce before each
 * call. The larger figure is only for checking the external key: providers may
 * bill native reasoning outside the ordinary visible-output ceiling.
 *
 * Multiplying the software projection itself made every Premium request
 * impossible ($0.17 reserved against a $0.12 envelope) before any stage ran.
 */
export function manualPreflightReservations(
  projectedBaseUsd: number,
  preset: ManualPreset
): { softwareUsd: number; externalUsd: number } {
  return {
    softwareUsd: projectedBaseUsd,
    externalUsd: projectedBaseUsd * preset.reasoningReserveMultiplier,
  };
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
