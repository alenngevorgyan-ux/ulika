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
    // Raised again, from 0.20 to 0.30: live evidence — a strategise timeout
    // debits its full conservative reservation (~$0.09) from the cap even
    // though the real charge is usually far smaller or unknown, because a
    // timed-out call's true cost can't be trusted. Resume then requests a
    // FRESH full-pipeline reservation (~$0.16, since Resume currently re-runs
    // the whole pipeline — extract/safety included — rather than resuming
    // from just the failed stage). 0.20 - 0.09 = 0.11 < 0.16, so a single
    // failure always made Resume itself hit CASE_TOO_COMPLEX; observed live.
    // 0.30 covers one failure plus one fresh resume with real margin.
    // KNOWN LIMITATION, not fixed here: Resume does not actually resume from
    // the failed stage — it reruns everything, including already-succeeded
    // extract. A second consecutive timeout can still exhaust this cap.
    // Fixing that properly means persisting extract's output on the case
    // flow so resume can skip it — a durable-schema change, explicitly out
    // of scope for this task ("do not touch the durable case store").
    capUsd: 0.3,
    // Lowered from 2.5. That number was calibrated for the OLD software
    // estimate, which silently ignored reasoning entirely (~$0.067 for a
    // typical case) — 2.5x was compensating, blindly, for a risk the
    // estimate itself didn't know about. Now that reservationCeiling()
    // folds D's actual reasoning budgets into the base estimate (~$0.15-0.16
    // for a typical case), that same risk is already priced in once. Keeping
    // 2.5x on top double-counted it: base * 2.5 ≈ $0.40, which live-failed
    // EXTERNAL_BUDGET_TOO_LOW against a key that had $0.39 free — comfortably
    // enough for the case itself (real spend has run $0.02-0.09 per attempt),
    // just not enough for a 2.5x margin over an already-margined estimate.
    // 1.5x keeps real headroom (base * 1.35 per-call margin * 1.5 here ≈ 2x
    // over the bare model-price arithmetic) without asking the key to carry
    // slack for a risk that's no longer unaccounted for.
    reasoningReserveMultiplier: 1.5,
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
      // Qwen's catalogue exposes reasoning but not supports_max_tokens, so an
      // invented reasoning.max_tokens would be a fake guard. Bound the paid
      // emitted artifact instead, and reserve a separate accounting allowance
      // for the observed native thinking surface without serializing it.
      compactStrategy: true,
      maxOutputTokens: { strategise: 1_500 },
      reasoningReservationTokens: { strategise: 3_500 },
    },
    capUsd: 0.1,
    reasoningReserveMultiplier: 1.25,
    limitation: "Qwen reasoning has no documented strict token-budget control for this endpoint. The hidden artifact is capped at 1,500 visible tokens and accounting reserves 3,500 additional reasoning tokens; the external key remains the only hard monetary stop.",
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
