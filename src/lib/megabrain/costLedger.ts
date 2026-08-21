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
  /** "provider" when the provider reported the charge; "table" when derived. */
  costSource: "provider" | "table";
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
  "costSource",
  "requestBudgetUsd",
  "stoppedByBudgetGuard",
];

/**
 * Accounting refused to continue. Distinct from BudgetExceededError: that one
 * fires BEFORE a request and prevents a charge; this one fires AFTER a charge
 * that has already happened and stops everything downstream.
 *
 * Carries no provider body and no user text — a provider error can quote the
 * request, and the request contains the account.
 */
export class AccountingError extends Error {
  constructor(readonly stage: string, readonly code: AccountingFailure, detail = "") {
    super(`Accounting refused after "${stage}": ${code}${detail ? ` (${detail})` : ""}`);
    this.name = "AccountingError";
  }
}

export type AccountingFailure =
  | "COST_MISSING"
  | "COST_NOT_FINITE"
  | "COST_NEGATIVE"
  | "COST_NOT_A_NUMBER"
  | "COST_ABOVE_RESERVED"
  | "MODEL_MISMATCH"
  | "UNKNOWN_MODEL";

/**
 * Applied on top of every reservation.
 *
 * `max_tokens` bounds the completion, but whether it bounds every BILLED output
 * token — reasoning included — is not something this repository can prove about
 * a provider it does not control. Rather than assert a hard dollar ceiling we
 * cannot demonstrate, reservations are inflated so that a moderate
 * under-estimate still lands inside the cap, and the residual risk of the ONE
 * request already in flight is documented rather than denied.
 */
export const RESERVATION_SAFETY_MARGIN = 1.35;

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
  private readonly children: CostLedger[] = [];

  /**
   * A ledger may have a PARENT. Spend on a child counts against the parent too,
   * and a reservation must fit BOTH.
   *
   * This is the fix for a real hole: the benchmark handed one $0.15 ledger to
   * the engine, so a Standard case — capped at $0.10 by product policy — could
   * spend up to $0.15 simply because it was being benchmarked. A larger outer
   * budget must never relax an inner one, and separate envelopes for engine,
   * baseline and judge additionally stop any of them consuming another's
   * remainder.
   */
  constructor(
    readonly mode: CaseMode,
    readonly capUsd: number = MODE_CAPS[mode],
    readonly parent?: CostLedger
  ) {
    parent?.children.push(this);
  }

  /**
   * Carve a sub-budget. The child's cap is the smaller of what was asked for
   * and what the parent still has, so an envelope can never promise money the
   * parent cannot cover.
   */
  envelope(cap: number, mode: CaseMode = this.mode): CostLedger {
    return new CostLedger(mode, Math.min(cap, this.remainingUsd), this);
  }

  /** Own spend plus everything spent by envelopes carved from this ledger. */
  get spentUsd(): number {
    const own = this.entries.reduce(
      (sum, e) => sum + (e.stoppedByBudgetGuard ? 0 : e.estimatedCostUsd),
      0
    );
    return own + this.children.reduce((sum, c) => sum + c.spentUsd, 0);
  }

  get remainingUsd(): number {
    return Math.max(0, this.capUsd - this.spentUsd);
  }

  /** This ledger's own entries. Excludes envelopes carved from it. */
  all(): readonly LedgerEntry[] {
    return this.entries;
  }

  /**
   * Every entry, this ledger's and its envelopes', in the order they happened.
   *
   * Needed because spend moved into child envelopes: a report reading only
   * `all()` on the command budget would show an empty ledger and a real bill.
   */
  allDeep(): LedgerEntry[] {
    return [...this.entries, ...this.children.flatMap((c) => c.allDeep())].sort((a, b) =>
      a.stage.localeCompare(b.stage)
    );
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
    const projectedUsd = costOf(spec, inputTokens, maxOutputTokens) * RESERVATION_SAFETY_MARGIN;
    // Must fit this budget AND every budget above it. Checking only the nearest
    // one is how a child envelope silently overruns its parent.
    const blocked =
      this.spentUsd + projectedUsd > this.capUsd ||
      this.ancestors().some((a) => a.spentUsd + projectedUsd > a.capUsd);
    if (blocked) {
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
        costSource: "table",
        requestBudgetUsd: this.remainingUsd,
        stoppedByBudgetGuard: true,
      });
      throw new BudgetExceededError(stage, this.spentUsd + projectedUsd, this.capUsd);
    }
    return { inputTokens, projectedUsd };
  }

  private ancestors(): CostLedger[] {
    const out: CostLedger[] = [];
    for (let p = this.parent; p; p = p.parent) out.push(p);
    return out;
  }

  /**
   * Record a completed call from the provider's own usage numbers.
   *
   * FAIL-CLOSED, and honest about what that can and cannot do. Everything here
   * runs AFTER the provider has already charged, so it cannot prevent the first
   * overcharge — it can only stop the pipeline before the next one. Saying
   * otherwise would be the false guarantee this system keeps being audited for.
   */
  record(args: {
    stage: string;
    spec: ModelSpec;
    usage: ProviderUsage;
    latencyMs: number;
    /** Model the provider says it served. A mismatch means routing changed. */
    reportedModel?: string;
    /** The reservation this call was made under, for the overcharge check. */
    reservedUsd?: number;
  }): LedgerEntry {
    const { stage, spec, usage, latencyMs } = args;

    if (args.reportedModel && args.reportedModel !== spec.slug) {
      // A silent fallback to another model invalidates every price we reserved
      // against, so continuing would be accounting against fiction.
      throw new AccountingError(stage, "MODEL_MISMATCH");
    }
    assertUsableCost(stage, usage.rawCost);
    if (args.reservedUsd !== undefined && (usage.actualCostUsd ?? 0) > args.reservedUsd) {
      throw new AccountingError(stage, "COST_ABOVE_RESERVED");
    }
    // Always the provider's figure: assertUsableCost above has already refused
    // anything else, so the "table" branch is unreachable for a recorded call.
    // The field stays because it documents provenance in the report and because
    // a future provider without cost reporting would need it back deliberately,
    // not silently.
    const fromProvider = usage.actualCostUsd !== null;
    const entry: LedgerEntry = {
      provider: spec.provider,
      model: spec.slug,
      stage,
      inputTokens: usage.inputTokens,
      cachedTokens: usage.cachedTokens,
      reasoningTokens: usage.reasoningTokens,
      outputTokens: usage.outputTokens,
      latencyMs,
      estimatedCostUsd: fromProvider
        ? usage.actualCostUsd!
        : costOf(spec, usage.inputTokens, usage.outputTokens),
      costSource: fromProvider ? "provider" : "table",
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
  /** The unvalidated value, kept so the validator can classify how it is wrong. */
  rawCost: unknown;
  /**
   * What the provider says it actually charged, when it says so.
   *
   * OpenRouter returns this on `usage.cost` and it is the authoritative number:
   * it already accounts for cache discounts and provider-specific pricing,
   * neither of which a static table can reproduce. Null when absent, never a
   * substitute value — a fabricated charge is indistinguishable from a real one
   * and would corrupt every cost conclusion drawn from a benchmark.
   */
  actualCostUsd: number | null;
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
  // Validated, non-negative, finite. Anything else is treated as absent rather
  // than coerced, so a malformed field cannot become a zero charge.
  const cost =
    typeof u.cost === "number" && Number.isFinite(u.cost) && u.cost >= 0 ? u.cost : null;
  const rawCost = "cost" in u ? u.cost : undefined;
  return {
    inputTokens: n(u.prompt_tokens),
    cachedTokens: n(details.cached_tokens),
    // Reasoning tokens are already inside completion_tokens; recorded separately
    // for visibility, never added again.
    reasoningTokens: n(outDetails.reasoning_tokens),
    outputTokens: n(u.completion_tokens),
    actualCostUsd: cost,
    rawCost,
  };
}

/**
 * Classify a provider cost figure, or refuse.
 *
 * Every rejected shape gets its own code so the report can say WHICH way the
 * provider surprised us. "Something was wrong with the cost" is not actionable
 * at the moment a run stops.
 */
export function assertUsableCost(stage: string, raw: unknown): number {
  if (raw === undefined || raw === null) throw new AccountingError(stage, "COST_MISSING");
  if (typeof raw !== "number") throw new AccountingError(stage, "COST_NOT_A_NUMBER");
  if (Number.isNaN(raw) || !Number.isFinite(raw)) throw new AccountingError(stage, "COST_NOT_FINITE");
  if (raw < 0) throw new AccountingError(stage, "COST_NEGATIVE");
  return raw;
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
