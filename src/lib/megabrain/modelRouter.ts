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
  /**
   * Largest completion the provider will produce, from OpenRouter's own
   * catalogue rather than from memory.
   *
   * "unpublished" is a real answer and a different one from "we never looked":
   * some providers publish no completion cap at all. A model MISSING from this
   * table has no entry, and modelFor refuses it — a ceiling we cannot check is
   * a ceiling we must not send, which is the whole lesson of the extract
   * truncation.
   */
  maxCompletionTokens: number | "unpublished";
}

/**
 * Refuse to send a ceiling the model is not known to accept.
 *
 * Fail-closed on an unknown model: the cost of stopping is a refused run, the
 * cost of guessing is a paid call that comes back 400 or, worse, silently
 * truncated.
 */
export class CeilingUnsupported extends Error {
  readonly code = "OUTPUT_LIMIT_UNSUPPORTED";
  constructor(
    readonly slug: string,
    readonly requested: number,
    readonly capability: number | "unpublished" | "unknown"
  ) {
    super(`Model ${slug} cannot be asked for ${requested} output tokens (capability: ${capability}).`);
    this.name = "CeilingUnsupported";
  }
}

export function assertCeilingSupported(spec: ModelSpec, maxOutputTokens: number): void {
  const cap = spec.maxCompletionTokens;
  if (cap === undefined) throw new CeilingUnsupported(spec.slug, maxOutputTokens, "unknown");
  if (cap === "unpublished") return;
  if (maxOutputTokens > cap) throw new CeilingUnsupported(spec.slug, maxOutputTokens, cap);
}

export const MODELS: Record<string, ModelSpec> = {
  "gemini-3.1-flash-lite": {
    slug: "google/gemini-3.1-flash-lite",
    provider: "openrouter",
    inputPerMTok: 0.25,
    outputPerMTok: 1.5,
    contextTokens: 1_048_576,
    structuredOutputs: true,
    // From OpenRouter's catalogue, read 2026-08-22. Not from memory.
    maxCompletionTokens: 65_536,
  },
  "claude-sonnet-5": {
    slug: "anthropic/claude-sonnet-5",
    provider: "openrouter",
    inputPerMTok: 2,
    outputPerMTok: 10,
    contextTokens: 1_000_000,
    structuredOutputs: true,
    // From OpenRouter's catalogue, read 2026-08-22. Not from memory.
    maxCompletionTokens: 128_000,
  },
  "claude-haiku-4.5": {
    slug: "anthropic/claude-haiku-4.5",
    provider: "openrouter",
    inputPerMTok: 1,
    outputPerMTok: 5,
    contextTokens: 200_000,
    structuredOutputs: true,
    // From OpenRouter's catalogue, read 2026-08-22. Not from memory.
    maxCompletionTokens: 64_000,
  },
  "grok-4.3": {
    slug: "x-ai/grok-4.3",
    provider: "openrouter",
    inputPerMTok: 1.25,
    outputPerMTok: 2.5,
    contextTokens: 1_000_000,
    structuredOutputs: true,
    // From OpenRouter's catalogue, read 2026-08-22. Not from memory.
    maxCompletionTokens: "unpublished",
  },
  "qwen-3.6-max-preview": {
    slug: "qwen/qwen3.6-max-preview",
    provider: "openrouter",
    inputPerMTok: 1.027,
    outputPerMTok: 6.162,
    contextTokens: 262_144,
    structuredOutputs: true,
    maxCompletionTokens: 65_536,
  },
  "glm-5.2": {
    slug: "z-ai/glm-5.2",
    provider: "openrouter",
    // OpenRouter /models metadata, verified 2026-08-24.
    inputPerMTok: 0.966,
    outputPerMTok: 3.036,
    contextTokens: 1_024_000,
    structuredOutputs: true,
    maxCompletionTokens: 128_000,
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
  /** Model for the matched-contract baseline. */
  baselineModel: string;
  /** Model for the blind judge. */
  judgeModel: string;
  /**
   * Whether this configuration has been shown to work against the live route.
   *
   * "unverified" is not a guess: anthropic/claude-sonnet-5 returned HTTP 404 on
   * this exact parameter combination in two separate runs, on two different
   * keys, while grok and gemini-flash-lite succeeded on the same combination.
   * The cause is not diagnosed and is deliberately not being chased here; the
   * status exists so nobody spends money rediscovering it.
   */
  status: "verified" | "unverified";
  note?: string;
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
    baselineModel: "claude-sonnet-5",
    judgeModel: "grok-4.3",
    status: "unverified",
    note: "Sonnet returned 404 on this parameter combination twice. Not the default; do not run.",
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
    baselineModel: "claude-sonnet-5",
    judgeModel: "grok-4.3",
    status: "unverified",
    note: "Engine models verified live; the Sonnet baseline is not. Use grok-matched instead.",
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
    baselineModel: "gemini-3.1-flash-lite",
    judgeModel: "gemini-3.1-flash-lite",
    status: "verified",
  },
  /**
   * The scientific control, and the one to benchmark with.
   *
   * Engine and matched baseline run on the SAME Grok model, so the comparison
   * isolates STRUCTURE as the variable rather than measuring one model against
   * another. Both were verified live on 2026-08-22.
   *
   * The judge sits on the cheap Gemini model — a different family from the
   * systems it judges, and one that has answered on this route. It is an
   * auxiliary signal: on a small sample the real call is a human reading both
   * answers blind.
   */
  "grok-matched": {
    id: "grok-matched",
    description:
      "Engine and matched baseline both on Grok 4.3; extraction on the cheap model; Gemini judge. Structure is the only variable.",
    roles: {
      extract: "gemini-3.1-flash-lite",
      analyse: "grok-4.3",
      strategise: "grok-4.3",
    },
    pipeline: "three-stage",
    baselineModel: "grok-4.3",
    judgeModel: "gemini-3.1-flash-lite",
    status: "verified",
  },

  /**
   * What Standard runs: extraction on the cheap model, then analysis and
   * strategy merged into one strong call.
   *
   * Merged because Standard now spends two of its four calls on the
   * clarification gate and the final strategist, and three separate internal
   * stages plus those two do not fit $0.05. The merge is the cheapest thing to
   * give up: it costs some separation between "what is going on" and "what to
   * do about it", which the final stage re-does anyway.
   */
  "grok-two-call": {
    id: "grok-two-call",
    description: "Extraction on the cheap model; analysis and strategy merged into one Grok call.",
    roles: {
      extract: "gemini-3.1-flash-lite",
      analyse: "grok-4.3",
      strategise: "grok-4.3",
    },
    pipeline: "two-stage",
    baselineModel: "grok-4.3",
    judgeModel: "grok-4.3",
    status: "verified",
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
    baselineModel: "claude-sonnet-5",
    judgeModel: "grok-4.3",
    status: "unverified",
  },
  "manual-premium": {
    id: "manual-premium",
    description: "Manual Alpha: Gemini extraction, Qwen hidden strategy.",
    roles: {
      extract: "gemini-3.1-flash-lite",
      analyse: "qwen-3.6-max-preview",
      strategise: "qwen-3.6-max-preview",
    },
    pipeline: "two-stage",
    baselineModel: "qwen-3.6-max-preview",
    judgeModel: "qwen-3.6-max-preview",
    status: "verified",
  },
  "manual-cheap": {
    id: "manual-cheap",
    description: "Manual Alpha: Gemini extraction, GLM hidden strategy.",
    roles: {
      extract: "gemini-3.1-flash-lite",
      analyse: "glm-5.2",
      strategise: "glm-5.2",
    },
    pipeline: "two-stage",
    baselineModel: "glm-5.2",
    judgeModel: "glm-5.2",
    status: "verified",
  },
};

export const DEFAULT_CONFIGURATION = "grok-matched";

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
