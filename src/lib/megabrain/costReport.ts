import { costOf, modelFor, resolveConfiguration, MODELS, type ModelSpec } from "./modelRouter";
import { MAX_OUTPUT_TOKENS } from "./engine";
import { MODE_CAPS, RESERVATION_SAFETY_MARGIN } from "./costLedger";
import { MODES, type AnalysisMode } from "./analysisMode";

/**
 * The single canonical cost calculation.
 *
 * There is exactly one of these because there were previously several, quoted
 * from different messages, and they disagreed: baseline appeared as $0.0167 and
 * later as $0.033, a benchmark case as $0.09 and later as $0.17. Both pairs
 * were arithmetically fine and described different things — one before the
 * baseline's output ceiling was raised to match the engine's, one counting
 * retries and one not. Numbers that drift like that are worse than no numbers,
 * so every figure now comes from here, derived from the live configuration.
 *
 * THREE BOUNDS, and conflating them is what caused the confusion:
 *   expected  — typical output, roughly 55% of ceiling, no retry;
 *   reserved  — every stage once at its full output ceiling. This is what the
 *               budget guard actually reserves against before each call;
 *   absolute  — every stage additionally consuming its one permitted retry.
 * Only `reserved` is a promise. `expected` is a forecast and `absolute` is a
 * planning bound that requires an unlikely conjunction.
 */

/** Prompt sizes in CHARACTERS, measured from the real prompt assembly. */
export const PROMPT_CHARS = {
  extract: 3200 + 4500, // stage prompt + a fenced account of typical length
  analyse: 4300 + 4200, // stage prompt + serialised frame and actors
  strategise: 5200 + 7000, // stage prompt + serialised state so far
  baseline: 2400 + 4500,
  judge: 1200 + 13000, // judge instructions + two full answers
  light: 2200 + 4500, // short prompt + the account
  critic: 3400 + 6000, // critic instructions + the compact plan and facts
  clarify: 2000 + 4500, // triage instructions + the account
  final: 3600 + 4500 + 4000, // adviser instructions + the account + the brief
} as const;

/** Typical output as a fraction of the ceiling. Forecast only, never reserved. */
const EXPECTED_OUTPUT_RATIO = 0.55;

export interface Bound {
  expectedUsd: number;
  reservedUsd: number;
  absoluteUsd: number;
}

const chars = (n: number) => Math.ceil(n / 3);

function call(spec: ModelSpec, promptChars: number, maxOut: number, retryable: boolean): Bound {
  const input = chars(promptChars);
  // Same margin the guard applies, or the report would describe a reservation
  // the guard does not actually make.
  const reserved = costOf(spec, input, maxOut) * RESERVATION_SAFETY_MARGIN;
  return {
    expectedUsd: costOf(spec, input, Math.ceil(maxOut * EXPECTED_OUTPUT_RATIO)),
    reservedUsd: reserved,
    absoluteUsd: retryable ? reserved * 2 : reserved,
  };
}

const sum = (bounds: Bound[]): Bound => ({
  expectedUsd: bounds.reduce((n, b) => n + b.expectedUsd, 0),
  reservedUsd: bounds.reduce((n, b) => n + b.reservedUsd, 0),
  absoluteUsd: bounds.reduce((n, b) => n + b.absoluteUsd, 0),
});

/** A. Product runtime: what one Standard case costs the product. Engine only. */
export function engineCost(configId?: string): Bound {
  const cfg = resolveConfiguration(configId);
  if (cfg.pipeline === "two-stage") {
    return sum([
      call(modelFor(cfg, "extract"), PROMPT_CHARS.extract, MAX_OUTPUT_TOKENS.extract, true),
      /**
       * ONE ceiling, not two summed.
       *
       * The merged call runs through stage("strategise", …) and is therefore
       * bounded by MAX_OUTPUT_TOKENS.strategise alone. Adding the analyse
       * ceiling on top priced a call that cannot happen, and it was the
       * difference between Standard fitting its cap and appearing not to.
       */
      call(modelFor(cfg, "strategise"), PROMPT_CHARS.analyse + PROMPT_CHARS.strategise, MAX_OUTPUT_TOKENS.strategise, true),
    ]);
  }
  return sum([
    call(modelFor(cfg, "extract"), PROMPT_CHARS.extract, MAX_OUTPUT_TOKENS.extract, true),
    call(modelFor(cfg, "analyse"), PROMPT_CHARS.analyse, MAX_OUTPUT_TOKENS.analyse, true),
    call(modelFor(cfg, "strategise"), PROMPT_CHARS.strategise, MAX_OUTPUT_TOKENS.strategise, true),
  ]);
}

/** The matched-contract baseline. Single call, free text, no retry. */
export function baselineCost(configId?: string, modelKey?: string): Bound {
  const key = modelKey ?? resolveConfiguration(configId).baselineModel;
  return call(MODELS[key], PROMPT_CHARS.baseline, MAX_OUTPUT_TOKENS.baseline, false);
}

/** The blind judge. One short structured verdict, no retry. */
export function judgeCost(configId?: string, modelKey?: string): Bound {
  const key = modelKey ?? resolveConfiguration(configId).judgeModel;
  return call(MODELS[key], PROMPT_CHARS.judge, 200, false);
}

export interface BenchmarkCost {
  engine: Bound;
  baseline: Bound;
  judge: Bound;
  total: Bound;
}

/** B. Benchmark: engine + baseline + judge for one case. */
export function benchmarkCost(configId?: string): BenchmarkCost {
  const engine = engineCost(configId);
  const baseline = baselineCost(configId);
  const judge = judgeCost(configId);
  return { engine, baseline, judge, total: sum([engine, baseline, judge]) };
}

export const scale = (b: Bound, n: number): Bound => ({
  expectedUsd: b.expectedUsd * n,
  reservedUsd: b.reservedUsd * n,
  absoluteUsd: b.absoluteUsd * n,
});

/**
 * Does a Standard case fit its cap?
 *
 * Measured against `reserved`, because that is what the guard checks before
 * each call. `absolute` may exceed the cap without the cap ever being breached:
 * the guard reserves against actual accumulated spend, so a retry is refused
 * rather than allowed to overrun. Retries are therefore best-effort, not
 * guaranteed — that is stated here and in the docs rather than implied.
 */
/**
 * Per-mode projection, for the dry run and for the lab's pre-flight display.
 *
 * Light is one call and is priced as one call, not as a discounted pipeline.
 * Deep is priced so the interface can show a number, and is flagged unavailable
 * so nobody reads that number as an offer.
 */
export function modeCost(mode: AnalysisMode, configId?: string): Bound & { available: boolean; capUsd: number; maxModelCalls: number } {
  const cfg = resolveConfiguration(configId);
  const spec = modelFor(cfg, "strategise");
  /**
   * Every mode now pays for the two stages the user actually experiences — the
   * clarification gate and the final adviser — and differs only in how much
   * private analysis sits between them.
   */
  const gate = call(modelFor(cfg, "extract"), PROMPT_CHARS.clarify, MAX_OUTPUT_TOKENS.clarify, true);
  const adviser = call(spec, PROMPT_CHARS.final, MAX_OUTPUT_TOKENS.final, false);
  const shape =
    mode === "light"
      ? sum([gate, adviser])
      : mode === "strong"
        ? sum([gate, engineCost(configId), adviser])
        : sum([gate, engineCost("grok-two-call"), adviser]);
  const m = MODES[mode];
  return { ...shape, available: m.available, capUsd: m.capUsd, maxModelCalls: m.maxModelCalls };
}

export function fitsStandardCap(configId?: string): { fits: boolean; reservedUsd: number; capUsd: number } {
  const { reservedUsd } = engineCost(configId);
  return { fits: reservedUsd <= MODE_CAPS.standard, reservedUsd, capUsd: MODE_CAPS.standard };
}
