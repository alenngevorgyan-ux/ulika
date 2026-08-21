import { costOf, modelFor, resolveConfiguration, MODELS, type ModelSpec } from "./modelRouter";
import { MAX_OUTPUT_TOKENS } from "./engine";
import { MODE_CAPS } from "./costLedger";

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
  const reserved = costOf(spec, input, maxOut);
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
export function engineCost(configId: string): Bound {
  const cfg = resolveConfiguration(configId);
  if (cfg.pipeline === "two-stage") {
    return sum([
      call(modelFor(cfg, "extract"), PROMPT_CHARS.extract, MAX_OUTPUT_TOKENS.extract, true),
      call(modelFor(cfg, "strategise"), PROMPT_CHARS.analyse + PROMPT_CHARS.strategise, MAX_OUTPUT_TOKENS.analyse + MAX_OUTPUT_TOKENS.strategise, true),
    ]);
  }
  return sum([
    call(modelFor(cfg, "extract"), PROMPT_CHARS.extract, MAX_OUTPUT_TOKENS.extract, true),
    call(modelFor(cfg, "analyse"), PROMPT_CHARS.analyse, MAX_OUTPUT_TOKENS.analyse, true),
    call(modelFor(cfg, "strategise"), PROMPT_CHARS.strategise, MAX_OUTPUT_TOKENS.strategise, true),
  ]);
}

/** The matched-contract baseline. Single call, free text, no retry. */
export function baselineCost(modelKey = "claude-sonnet-5"): Bound {
  return call(MODELS[modelKey], PROMPT_CHARS.baseline, MAX_OUTPUT_TOKENS.baseline, false);
}

/** The blind judge. One short structured verdict, no retry. */
export function judgeCost(modelKey = "grok-4.3"): Bound {
  return call(MODELS[modelKey], PROMPT_CHARS.judge, 200, false);
}

export interface BenchmarkCost {
  engine: Bound;
  baseline: Bound;
  judge: Bound;
  total: Bound;
}

/** B. Benchmark: engine + baseline + judge for one case. */
export function benchmarkCost(configId: string): BenchmarkCost {
  const engine = engineCost(configId);
  const baseline = baselineCost();
  const judge = judgeCost();
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
export function fitsStandardCap(configId: string): { fits: boolean; reservedUsd: number; capUsd: number } {
  const { reservedUsd } = engineCost(configId);
  return { fits: reservedUsd <= MODE_CAPS.standard, reservedUsd, capUsd: MODE_CAPS.standard };
}
