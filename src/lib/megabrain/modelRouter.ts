/**
 * Provider-agnostic model routing, deliberately small.
 *
 * Three ROLES, not a provider abstraction layer. Everything currently runs over
 * OpenRouter's OpenAI-compatible endpoint, so an interface spanning a dozen
 * providers would be scaffolding for a building nobody has asked for. What the
 * benchmark actually needs is the ability to say "run strategy on a different
 * model" without touching the engine, and that is one lookup table.
 *
 * Prices are per MILLION tokens and were read from OpenRouter's live catalogue
 * on 2026-08-21, not recalled. They are the input to the cost guard, so a wrong
 * number here silently breaks the one control that stops a runaway bill —
 * `scripts/megabrain-bench.ts --verify-prices` re-checks them against the live
 * catalogue without spending anything.
 */

export type ModelRole = "extract" | "analyse" | "strategise";

export interface ModelSpec {
  /** Provider-qualified slug, exactly as the provider expects it. */
  slug: string;
  provider: string;
  inputPerMTok: number;
  outputPerMTok: number;
  contextTokens: number;
  /** Does this slug accept response_format json_schema? Affects the fallback. */
  structuredOutputs: boolean;
}

export const MODELS: Record<string, ModelSpec> = {
  "gemini-3.1-flash-lite": {
    slug: "google/gemini-3.1-flash-lite",
    provider: "openrouter",
    inputPerMTok: 0.25,
    outputPerMTok: 1.5,
    contextTokens: 1_048_576,
    structuredOutputs: true,
  },
  "claude-sonnet-5": {
    slug: "anthropic/claude-sonnet-5",
    provider: "openrouter",
    inputPerMTok: 2,
    outputPerMTok: 10,
    contextTokens: 1_000_000,
    structuredOutputs: true,
  },
  "claude-haiku-4.5": {
    slug: "anthropic/claude-haiku-4.5",
    provider: "openrouter",
    inputPerMTok: 1,
    outputPerMTok: 5,
    contextTokens: 200_000,
    structuredOutputs: true,
  },
  "grok-4.3": {
    slug: "x-ai/grok-4.3",
    provider: "openrouter",
    inputPerMTok: 1.25,
    outputPerMTok: 2.5,
    contextTokens: 1_000_000,
    structuredOutputs: true,
  },
};

/**
 * Named end-to-end configurations, so a benchmark run is one flag rather than
 * three env vars that can disagree with each other.
 *
 * NOTE ON NAMING: the brief referred to model tiers as Luna / Terra / Sol.
 * Those codenames are defined nowhere in this repository and no architecture
 * report carrying them was committed, so they are NOT used here — guessing a
 * mapping would put an unverifiable name on a real cost decision. These are the
 * verified slugs; map the codenames onto them when the mapping is written down.
 */
/**
 * `three-stage` is the shipped pipeline. `two-stage` merges analyse into
 * strategise and exists ONLY so a later benchmark can answer whether the
 * separate analysis call earns its cost. It is defined, wired and tested; it is
 * not run live in V0, and analyse has not been removed to make room for it.
 */
export type PipelineShape = "three-stage" | "two-stage";

export interface Configuration {
  id: string;
  description: string;
  roles: Record<ModelRole, string>;
  pipeline: PipelineShape;
}

/**
 * The two controls the benchmark can compare against, named so they are never
 * confused in a report.
 *
 * `matched-contract` is asked for the same deliverables as the engine in a
 * single free-text call: it isolates STRUCTURE as the variable.
 * `current-production` is the prompt the live product ships today: it measures
 * the improvement a user would actually feel.
 *
 * They answer different questions and the first live smoke uses only
 * matched-contract — running both doubles cost for a comparison nobody has
 * asked for yet.
 */
export type BaselineKind = "matched-contract" | "current-production";
export const SMOKE_BASELINE: BaselineKind = "matched-contract";

export const CONFIGURATIONS: Record<string, Configuration> = {
  "cheap-extract-sonnet": {
    id: "cheap-extract-sonnet",
    description:
      "Extraction on the cheapest capable model, analysis and strategy on the same model the live product already uses.",
    roles: {
      extract: "gemini-3.1-flash-lite",
      analyse: "claude-sonnet-5",
      strategise: "claude-sonnet-5",
    },
    pipeline: "three-stage",
  },
  "cheap-extract-grok": {
    id: "cheap-extract-grok",
    description: "Same shape, strategy on Grok — roughly a third of the cost, quality unproven.",
    roles: {
      extract: "gemini-3.1-flash-lite",
      analyse: "grok-4.3",
      strategise: "grok-4.3",
    },
    pipeline: "three-stage",
  },
  "all-cheap": {
    id: "all-cheap",
    description: "Floor configuration. Exists to show what the structure alone is worth.",
    roles: {
      extract: "gemini-3.1-flash-lite",
      analyse: "gemini-3.1-flash-lite",
      strategise: "gemini-3.1-flash-lite",
    },
    pipeline: "three-stage",
  },
  "ablation-two-call": {
    id: "ablation-two-call",
    description:
      "Extraction, then one merged strategy call. Exists to test whether the separate analyse stage is worth its cost. Not run live in V0.",
    roles: {
      extract: "gemini-3.1-flash-lite",
      analyse: "claude-sonnet-5",
      strategise: "claude-sonnet-5",
    },
    pipeline: "two-stage",
  },
};

export const DEFAULT_CONFIGURATION = "cheap-extract-sonnet";

export function resolveConfiguration(id: string = DEFAULT_CONFIGURATION): Configuration {
  const cfg = CONFIGURATIONS[id];
  if (!cfg) {
    throw new Error(
      `Unknown configuration "${id}". Known: ${Object.keys(CONFIGURATIONS).join(", ")}`
    );
  }
  return cfg;
}

export function modelFor(cfg: Configuration, role: ModelRole): ModelSpec {
  const key = cfg.roles[role];
  const spec = MODELS[key];
  if (!spec) throw new Error(`Configuration "${cfg.id}" names unknown model "${key}" for ${role}.`);
  return spec;
}

/**
 * Cost of one call, in dollars.
 *
 * Cached input is billed at a discount by every provider here, but the
 * discount differs per provider and OpenRouter does not report it uniformly.
 * Charging cached tokens at FULL price is deliberate: the guard must never
 * under-estimate, because an under-estimate is what lets a run exceed its cap.
 */
export function costOf(spec: ModelSpec, inputTokens: number, outputTokens: number): number {
  return (inputTokens * spec.inputPerMTok + outputTokens * spec.outputPerMTok) / 1_000_000;
}

/**
 * Rough token count. Four characters per token is the usual English
 * approximation; Russian runs closer to three, and the case corpus is bilingual,
 * so this uses three and over-counts on English. Over-counting is the safe
 * direction for a budget guard, and the ledger records ACTUAL usage from the
 * provider afterwards — this is only ever used before a call, never instead of
 * the real number.
 */
export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 3);
}
