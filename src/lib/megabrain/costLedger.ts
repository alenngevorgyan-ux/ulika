import { costOf, estimateTokens, type ModelSpec } from "./modelRouter";

/**
 * Cost accounting and the hard guard that stops a run.
 *
 * TWO SEPARATE JOBS, kept separate on purpose:
 *   - the LEDGER records what a call actually cost, after the fact;
 *   - the RESERVATION refuses to start a call whose worst case would breach the
 *     cap, before the fact.
 * A ledger alone tells you afterwards that you overspent.
 *
 * WHAT IS NEVER RECORDED. No prompt, no user message, no retrieved document, no
 * chain of thought, no API key. A cost ledger that quietly becomes a second
 * copy of the conversation is a worse privacy problem than the one it solves,
 * and this product's conversations are about people's jobs and relationships.
 * The entries below are numbers, model identifiers and stage names — a test
 * asserts the shape carries nothing else.
 */

export type CaseMode = "quick" | "standard" | "deep";

/** Hard caps in dollars, per case. Not advisory. */
export const MODE_CAPS: Record<CaseMode, number> = {
  quick: 0.02,
  standard: 0.1,
  deep: 0.25,
};

export interface LedgerEntry {
  provider: string;
  model: string;
  /** Pipeline stage, e.g. "extract". Never the content of that stage. */
  stage: string;
  inputTokens: number;
  cachedTokens: number;
  /** Providers that expose it; 0 when not reported rather than a guess. */
  reasoningTokens: number;
  outputTokens: number;
  latencyMs: number;
  estimatedCostUsd: number;
  /** Dollars still available to the whole request when this call was made. */
  requestBudgetUsd: number;
  /** True when the guard refused, and the call never went out. */
  stoppedByBudgetGuard: boolean;
}

/** Fields permitted in an entry. Anything else is a leak; the test enforces it. */
export const LEDGER_FIELDS: readonly (keyof LedgerEntry)[] = [
  "provider",
  "model",
  "stage",
  "inputTokens",
  "cachedTokens",
  "reasoningTokens",
  "outputTokens",
  "latencyMs",
  "estimatedCostUsd",
  "requestBudgetUsd",
  "stoppedByBudgetGuard",
];

export class BudgetExceededError extends Error {
  constructor(
    readonly stage: string,
    readonly projectedUsd: number,
    readonly capUsd: number
  ) {
    super(
      `Budget guard stopped stage "${stage}": projected $${projectedUsd.toFixed(
        4
      )} would exceed the $${capUsd.toFixed(2)} cap for this case.`
    );
    this.name = "BudgetExceededError";
  }
}

export class CostLedger {
  private readonly entries: LedgerEntry[] = [];

  constructor(readonly mode: CaseMode, readonly capUsd: number = MODE_CAPS[mode]) {}

  get spentUsd(): number {
    return this.entries.reduce((sum, e) => sum + (e.stoppedByBudgetGuard ? 0 : e.estimatedCostUsd), 0);
  }

  get remainingUsd(): number {
    return Math.max(0, this.capUsd - this.spentUsd);
  }

  all(): readonly LedgerEntry[] {
    return this.entries;
  }

  /**
   * Preflight reservation. Called BEFORE a request goes out; throws rather than
   * returning false so a caller cannot forget to check the result.
   *
   * `maxOutputTokens` is the ceiling actually sent to the provider, not a hope
   * about typical length — reserving against the typical case is how a long
   * generation walks through the cap.
   */
  reserve(
    stage: string,
    spec: ModelSpec,
    promptText: string,
    maxOutputTokens: number
  ): { inputTokens: number; projectedUsd: number } {
    const inputTokens = estimateTokens(promptText);
    const projectedUsd = costOf(spec, inputTokens, maxOutputTokens);
    if (this.spentUsd + projectedUsd > this.capUsd) {
      this.entries.push({
        provider: spec.provider,
        model: spec.slug,
        stage,
        inputTokens,
        cachedTokens: 0,
        reasoningTokens: 0,
        outputTokens: 0,
        latencyMs: 0,
        estimatedCostUsd: projectedUsd,
        requestBudgetUsd: this.remainingUsd,
        stoppedByBudgetGuard: true,
      });
      throw new BudgetExceededError(stage, this.spentUsd + projectedUsd, this.capUsd);
    }
    return { inputTokens, projectedUsd };
  }

  /** Record a completed call from the provider's own usage numbers. */
  record(args: {
    stage: string;
    spec: ModelSpec;
    usage: ProviderUsage;
    latencyMs: number;
  }): LedgerEntry {
    const { stage, spec, usage, latencyMs } = args;
    const entry: LedgerEntry = {
      provider: spec.provider,
      model: spec.slug,
      stage,
      inputTokens: usage.inputTokens,
      cachedTokens: usage.cachedTokens,
      reasoningTokens: usage.reasoningTokens,
      outputTokens: usage.outputTokens,
      latencyMs,
      estimatedCostUsd: costOf(spec, usage.inputTokens, usage.outputTokens),
      requestBudgetUsd: this.remainingUsd,
      stoppedByBudgetGuard: false,
    };
    this.entries.push(entry);
    return entry;
  }
}

export interface ProviderUsage {
  inputTokens: number;
  cachedTokens: number;
  reasoningTokens: number;
  outputTokens: number;
}

/**
 * Read usage off an OpenAI-compatible response.
 *
 * Missing fields become 0, never a guess. A zero here is visible in the ledger
 * as "the provider did not report this"; an invented number would be
 * indistinguishable from a real one and would corrupt every cost conclusion
 * drawn from the benchmark.
 */
export function readUsage(raw: unknown): ProviderUsage {
  const u = ((raw as { usage?: unknown })?.usage ?? {}) as Record<string, unknown>;
  const n = (v: unknown): number => (typeof v === "number" && Number.isFinite(v) && v >= 0 ? v : 0);
  const details = (u.prompt_tokens_details ?? {}) as Record<string, unknown>;
  const outDetails = (u.completion_tokens_details ?? {}) as Record<string, unknown>;
  return {
    inputTokens: n(u.prompt_tokens),
    cachedTokens: n(details.cached_tokens),
    reasoningTokens: n(outDetails.reasoning_tokens),
    outputTokens: n(u.completion_tokens),
  };
}

/** Whole-pipeline projection, used by the dry-run simulator and by preflight. */
export function projectPipelineCost(
  stages: { stage: string; spec: ModelSpec; promptChars: number; maxOutputTokens: number }[]
): { perStage: { stage: string; usd: number }[]; totalUsd: number } {
  const perStage = stages.map((s) => ({
    stage: s.stage,
    usd: costOf(s.spec, Math.ceil(s.promptChars / 3), s.maxOutputTokens),
  }));
  return { perStage, totalUsd: perStage.reduce((a, b) => a + b.usd, 0) };
}
