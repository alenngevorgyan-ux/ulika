import { costOf, estimateTokens, type ModelSpec } from "./modelRouter";
import type { ResponseTelemetry } from "./transport";

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
  /** Ours, minted before the request. Ties an attempt to its outcome locally. */
  attemptId: string;
  provider: string;
  /** The slug we ASKED for. Compare with reportedModel. */
  model: string;
  /** Pipeline stage, e.g. "extract". Never the content of that stage. */
  stage: string;
  inputTokens: number;
  cachedTokens: number;
  /** Providers that expose it; 0 when not reported rather than a guess. */
  reasoningTokens: number;
  outputTokens: number;
  latencyMs: number;
  /**
   * What the provider said it charged. NULL when it said nothing.
   *
   * Null is the honest value and must stay null. Substituting the reservation
   * here would turn a number we chose into a number we were billed.
   */
  actualCostUsd: number | null;
  /**
   * Our own conservative figure for this call, kept SEPARATELY.
   *
   * Used for budgeting when the real charge is unknown. It is NOT a guaranteed
   * upper bound: it comes from a price table and a token estimate, and a
   * provider is obliged to respect neither. Calling it a ceiling would be a
   * promise this code cannot keep.
   */
  conservativeEstimateUsd: number;
  /** Monotonic across the whole tree, so allDeep() can order truthfully. */
  seq: number;
  /** 0 for a first attempt, 1 for its one permitted retry. */
  retryNumber: number;
  /** Provider's id for the generation; what /generations?id= accepts. */
  responseId: string | null;
  /** Model the provider says it served. */
  reportedModel: string | null;
  /** The endpoint that actually served it, e.g. "Google Vertex", "SpaceXAI". */
  selectedProvider: string | null;
  serviceTier: string | null;
  /** Provider + short status per routing attempt. Nothing else from routing. */
  routingAttempts: { provider: string; status: string }[];
  /** Schema validation outcome for this stage's output, once it is known. */
  validationResult: "ok" | "invalid" | "unparseable" | null;
  /**
   * Where the figure came from.
   *   provider   — the provider reported a charge.
   *   unreported — a call completed and was presumably billed, amount unknown.
   *   table      — never billed; a preflight refusal.
   */
  costSource: "provider" | "unreported" | "table";
  /**
   * Set when this call was charged but failed accounting.
   *
   * The entry exists ANYWAY, which is the point: an overcharge that is detected
   * and then thrown away leaves a bill with no matching record. Detecting it is
   * only useful if the evidence survives.
   */
  accountingFailure: AccountingFailure | null;
  /** Dollars still available to the whole request when this call was made. */
  requestBudgetUsd: number;
  /** True when the guard refused, and the call never went out. */
  stoppedByBudgetGuard: boolean;
}

/** Fields permitted in an entry. Anything else is a leak; the test enforces it. */
export const LEDGER_FIELDS: readonly (keyof LedgerEntry)[] = [
  "attemptId",
  "retryNumber",
  "responseId",
  "reportedModel",
  "selectedProvider",
  "serviceTier",
  "routingAttempts",
  "validationResult",
  "provider",
  "model",
  "stage",
  "inputTokens",
  "cachedTokens",
  "reasoningTokens",
  "outputTokens",
  "latencyMs",
  "actualCostUsd",
  "conservativeEstimateUsd",
  "seq",
  "costSource",
  "accountingFailure",
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
  constructor(
    readonly stage: string,
    readonly code: AccountingFailure,
    detail = "",
    /** Whether the provider reported a usable charge for the failing call. */
    readonly chargeReported: boolean = false
  ) {
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

/** Shared across a whole ledger tree, so ordering survives nesting. */
let SEQ = 0;

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
  /**
   * Called the moment an entry is recorded, including a budget refusal.
   *
   * Exists so accounting can be written to disk AS IT HAPPENS. The previous
   * design held everything in memory and serialised once at the end of the run;
   * a mid-run failure therefore discarded every per-call record while the money
   * had already been spent.
   */
  onRecord?: (entry: LedgerEntry) => void;

  /**
   * Called after a reservation passes and IMMEDIATELY BEFORE the request goes
   * out.
   *
   * Without it, a request that fails never appears anywhere: only successful
   * calls produce a ledger entry, so a 404 left the journal showing what had
   * worked and nothing about what died. The attempt line is what makes the
   * failing stage and slug identifiable at all.
   */
  onAttempt?: (attempt: {
    attemptId: string;
    retryNumber: number;
    stage: string;
    model: string;
    provider: string;
    reservedUsd: number;
  }) => void;

  /**
   * Schema validation outcome, known only after the entry is written.
   *
   * Reported as its own event rather than mutating a recorded entry: a journal
   * line that changes after being written is not a journal line.
   */
  onValidation?: (v: { attemptId: string; stage: string; result: "ok" | "invalid" | "unparseable" }) => void;

  constructor(
    readonly mode: CaseMode,
    readonly capUsd: number = MODE_CAPS[mode],
    readonly parent?: CostLedger
  ) {
    parent?.children.push(this);
    this.onRecord = parent?.onRecord;
    this.onAttempt = parent?.onAttempt;
    this.onValidation = parent?.onValidation;
  }

  /**
   * Carve a sub-budget. The child's cap is the smaller of what was asked for
   * and what the parent still has, so an envelope can never promise money the
   * parent cannot cover.
   */
  envelope(cap: number, mode: CaseMode = this.mode): CostLedger {
    return new CostLedger(mode, Math.min(cap, this.remainingUsd), this);
  }

  /**
   * What the budget is measured against: real charges where known, our own
   * conservative figure where not.
   *
   * NOT a statement about the bill. It mixes reported amounts with estimates,
   * and `hasUnknownCharges` says whether it does. Presenting this as actual
   * spend is exactly the conflation this split exists to stop.
   */
  get budgetedSpendUsd(): number {
    const own = this.entries.reduce(
      (sum, e) =>
        sum + (e.stoppedByBudgetGuard ? 0 : e.actualCostUsd ?? e.conservativeEstimateUsd),
      0
    );
    return own + this.children.reduce((sum, c) => sum + c.budgetedSpendUsd, 0);
  }

  /** Only what the provider actually reported. A figure a bill can be checked against. */
  get reportedSpendUsd(): number {
    const own = this.entries.reduce(
      (sum, e) => sum + (e.stoppedByBudgetGuard ? 0 : e.actualCostUsd ?? 0),
      0
    );
    return own + this.children.reduce((sum, c) => sum + c.reportedSpendUsd, 0);
  }

  /** True when at least one completed call was never priced by the provider. */
  get hasUnknownCharges(): boolean {
    return (
      this.entries.some((e) => !e.stoppedByBudgetGuard && e.actualCostUsd === null) ||
      this.children.some((c) => c.hasUnknownCharges)
    );
  }

  get remainingUsd(): number {
    return Math.max(0, this.capUsd - this.budgetedSpendUsd);
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
    // Sorted by sequence, which is what "chronological" has to mean once spend
    // is spread across nested envelopes. An earlier version sorted by stage
    // NAME while the comment claimed chronological order — the two agree only
    // by accident, and here they did not.
    return [...this.entries, ...this.children.flatMap((c) => c.allDeep())].sort(
      (a, b) => a.seq - b.seq
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
    maxOutputTokens: number,
    meta: { attemptId: string; retryNumber: number } = { attemptId: "unknown", retryNumber: 0 }
  ): { inputTokens: number; projectedUsd: number } {
    const inputTokens = estimateTokens(promptText);
    const projectedUsd = costOf(spec, inputTokens, maxOutputTokens) * RESERVATION_SAFETY_MARGIN;
    // Must fit this budget AND every budget above it. Checking only the nearest
    // one is how a child envelope silently overruns its parent.
    const blocked =
      this.budgetedSpendUsd + projectedUsd > this.capUsd ||
      this.ancestors().some((a) => a.budgetedSpendUsd + projectedUsd > a.capUsd);
    if (blocked) {
      this.entries.push({
        attemptId: meta.attemptId,
        retryNumber: meta.retryNumber,
        responseId: null,
        reportedModel: null,
        selectedProvider: null,
        serviceTier: null,
        routingAttempts: [],
        validationResult: null,
        provider: spec.provider,
        model: spec.slug,
        stage,
        inputTokens,
        cachedTokens: 0,
        reasoningTokens: 0,
        outputTokens: 0,
        latencyMs: 0,
        actualCostUsd: null,
        conservativeEstimateUsd: projectedUsd,
        costSource: "table",
        accountingFailure: null,
        seq: SEQ++,
        requestBudgetUsd: this.remainingUsd,
        stoppedByBudgetGuard: true,
      });
      this.onRecord?.(this.entries[this.entries.length - 1]);
      throw new BudgetExceededError(stage, this.budgetedSpendUsd + projectedUsd, this.capUsd);
    }
    this.onAttempt?.({
      attemptId: meta.attemptId,
      retryNumber: meta.retryNumber,
      stage,
      model: spec.slug,
      provider: spec.provider,
      reservedUsd: projectedUsd,
    });
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
    telemetry?: ResponseTelemetry;
    attemptId?: string;
    retryNumber?: number;
    /** The reservation this call was made under, for the overcharge check. */
    reservedUsd?: number;
  }): LedgerEntry {
    const { stage, spec, usage, latencyMs } = args;

    // Classify BEFORE deciding what to write, but write before throwing. The
    // provider has already charged for this call; refusing to record it because
    // the figure is wrong leaves a bill with no matching entry, which is worse
    // than an entry marked as unreliable.
    const t = args.telemetry;
    const failure = classify(spec, usage, t?.reportedModel ?? undefined, args.reservedUsd);
    // Always the provider's figure: assertUsableCost above has already refused
    // anything else, so the "table" branch is unreachable for a recorded call.
    // The field stays because it documents provenance in the report and because
    // a future provider without cost reporting would need it back deliberately,
    // not silently.
    const fromProvider = usage.actualCostUsd !== null;
    const entry: LedgerEntry = {
      attemptId: args.attemptId ?? "unknown",
      retryNumber: args.retryNumber ?? 0,
      responseId: t?.responseId ?? null,
      reportedModel: t?.reportedModel ?? null,
      selectedProvider: t?.selectedProvider ?? null,
      serviceTier: t?.serviceTier ?? null,
      routingAttempts: t?.routingAttempts ?? [],
      validationResult: null,
      provider: spec.provider,
      model: spec.slug,
      stage,
      inputTokens: usage.inputTokens,
      cachedTokens: usage.cachedTokens,
      reasoningTokens: usage.reasoningTokens,
      outputTokens: usage.outputTokens,
      latencyMs,
      actualCostUsd: usage.actualCostUsd,
      // Kept apart from the reported figure on purpose. Budgeting needs a
      // number; the bill needs the truth; they are not the same number.
      conservativeEstimateUsd:
        args.reservedUsd ?? costOf(spec, usage.inputTokens, usage.outputTokens),
      costSource: fromProvider ? "provider" : "unreported",
      accountingFailure: failure,
      seq: SEQ++,
      requestBudgetUsd: this.remainingUsd,
      stoppedByBudgetGuard: false,
    };
    this.entries.push(entry);
    this.onRecord?.(entry);
    // Only now. The evidence is on disk; the pipeline stops.
    if (failure) throw new AccountingError(stage, failure, "", fromProvider);
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
/**
 * Decide whether this call's accounting is trustworthy, without throwing.
 *
 * Separated from the throw so the caller can record the entry first. Order
 * matters: a model mismatch invalidates the price we reserved against, so it
 * outranks a cost figure that may itself be priced at the wrong model.
 */
function classify(
  spec: ModelSpec,
  usage: ProviderUsage,
  reportedModel: string | undefined,
  reservedUsd: number | undefined
): AccountingFailure | null {
  if (reportedModel && reportedModel !== spec.slug) return "MODEL_MISMATCH";
  const raw = usage.rawCost;
  if (raw === undefined || raw === null) return "COST_MISSING";
  if (typeof raw !== "number") return "COST_NOT_A_NUMBER";
  if (Number.isNaN(raw) || !Number.isFinite(raw)) return "COST_NOT_FINITE";
  if (raw < 0) return "COST_NEGATIVE";
  if (reservedUsd !== undefined && raw > reservedUsd) return "COST_ABOVE_RESERVED";
  return null;
}

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
