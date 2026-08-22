import { randomBytes } from "node:crypto";
import { BudgetExceededError, CostLedger, MODE_CAPS, RESERVATION_SAFETY_MARGIN, type CaseMode } from "./costLedger";
import { assertCeilingSupported, costOf, estimateTokens, modelFor, resolveConfiguration, type Configuration } from "./modelRouter";
import { EXTRACT_SCHEMA, ANALYSE_SCHEMA, STRATEGISE_SCHEMA, COMBINED_SCHEMA, LIGHT_SCHEMA } from "./jsonSchemas";
import { analysePrompt, baselinePrompt, combinedPrompt, criticPrompt, extractPrompt, fence, lightPrompt, strategisePrompt } from "./prompts";
import { isTruncatedFinish, OutputTruncatedError, parseJsonReply, type Transport } from "./transport";
import { checkLanguage, resolveLanguage } from "./language";
import { sanitizeExtract, type SanitationWarning } from "./sanitize";
import { capFor, ModeNotAvailable, MODES, type AnalysisMode } from "./analysisMode";
import {
  validateActors,
  validateCountermoves,
  validateFrame,
  validateHypotheses,
  validateLeverage,
  validatePlan,
  validateStrategies,
  validateLightPlan,
  type CaseAnalysis,
  type LightPlan,
  type Jurisdiction,
  type ResponseLanguage,
} from "./schemas";

/**
 * Case engine orchestration: three calls, a budget guard around each, and a
 * compact state object carried between them.
 *
 * WHAT IS CARRIED FORWARD is deliberately the structured state, never the
 * transcript. Stage three sees a frame, an actor map, hypotheses and leverage —
 * a few hundred tokens of decided facts — instead of everything said so far.
 * That is what keeps a Standard case inside its cap, and it is the difference
 * between a pipeline and a conversation that grows until it is unaffordable.
 *
 * There is no tool loop and no agent loop. Every stage runs exactly once, in a
 * fixed order, with a fixed output ceiling. A stage that returns unusable JSON
 * fails the run rather than being retried indefinitely.
 */

export interface CaseInput {
  /** The user's account, verbatim. Treated as untrusted data throughout. */
  account: string;
  mode?: CaseMode;
  configurationId?: string;
  /** Explicit wins; "auto" reads the account. Never the interface language. */
  responseLanguage?: ResponseLanguage;
  /** Independent of language. Unknown is the honest default and the common one. */
  jurisdiction?: Jurisdiction;
  /** How much analysis to buy. See analysisMode.ts. */
  analysisMode?: AnalysisMode;
  /**
   * The cap the COMPLEXITY preflight measures against. Defaults to the engine's
   * own allowance for the mode.
   *
   * Separate from the ledger's cap on purpose, because the two answer different
   * questions and must not be allowed to impersonate each other:
   *
   *   "this case does not fit Standard"     — a fact about the case and the
   *                                           product tier, worth refusing over
   *                                           before anything is spent;
   *   "this envelope has $0.01 left"        — a fact about a shared budget part
   *                                           way through a benchmark run.
   *
   * Telling somebody their situation is too complex when the truth is that a
   * benchmark command is nearly out of money would be a false statement about
   * their case. So a squeezed envelope stays the per-stage guard's business,
   * and only a caller that knows the real product cap — the Lab passes
   * capFor(mode) — arms the preflight with it.
   */
  preflightCapUsd?: number;
  /**
   * Shared ledger. When a caller passes one — the benchmark always does — every
   * call in this case reserves against the SAME budget as every other case and
   * every judge call.
   *
   * An earlier version gave each case its own ledger and folded the totals into
   * a run ledger afterwards. That enforced nothing: the fold happened after the
   * money was spent, and the judge reserved without knowing what the case it was
   * judging had just cost. A cap checked after the fact is a report, not a cap.
   */
  ledger?: CostLedger;
}

export interface EngineResult {
  analysis: CaseAnalysis;
  ledger: CostLedger;
  configuration: Configuration;
  /** Non-fatal validator complaints, kept for the benchmark's quality report. */
  problems: string[];
  /**
   * What deterministic sanitation removed or normalised before validation.
   *
   * Codes and schema paths only. A run that finished with warnings finished —
   * the warnings say what was dropped, not that the answer is unsafe.
   */
  warnings: SanitationWarning[];
}

/** Output ceilings per stage. Reserved against, not hoped for. */
export const MAX_OUTPUT_TOKENS = {
  /**
   * 3000, raised from 1600 after a proven truncation.
   *
   * The evidence, not a guess: a real complex case came back with
   * finish_reason "length" at exactly 1600 output tokens, and the frozen SIMPLE
   * case already used 1387 of them — 87% of the old ceiling before anything
   * hard was asked of it.
   *
   * Why 3000 and not more. The compaction rules in extractPrompt plus the
   * maxItems in EXTRACT_SCHEMA bound a maximal CaseFrame at roughly 2550 output
   * tokens (12 facts, 6 evidence, 6+6+6 lists, 4 actors x 3 claims per field).
   * 3000 clears that structural worst case by ~18% and clears the expected
   * output for a long case, around 2200, by ~36%.
   *
   * Why not more than that: this ceiling is reserved BEFORE the call and it is
   * charged against the same $0.05 Standard cap as the two stages after it,
   * whose inputs grow with whatever this stage emits. See projectCasePipeline —
   * the worst case for all three now lands at $0.0417.
   */
  extract: 3000,
  analyse: 2000,
  strategise: 3000,
  /**
   * Matched to the strategise ceiling, not to a short reply. The baseline is
   * now asked for the same deliverables, so capping it lower would cut off the
   * answer and win the comparison on budget rather than on quality.
   */
  baseline: 3000,
  /** One short answer. Light is not a compressed case file. */
  light: 700,
  /** The critic returns a whole revised plan, so it needs the same room. */
  critic: 3000,
} as const;

/**
 * The whole pipeline cannot fit the mode's cap, established BEFORE any request.
 *
 * Distinct from BudgetExceededError, which fires mid-run when the next stage
 * would breach the cap — by then extract has been paid for and the user has a
 * charge and no answer. This one refuses at the door: no partial pipeline, no
 * spend, and a named mode that would fit instead.
 */
export class CaseTooComplexError extends Error {
  readonly code = "CASE_TOO_COMPLEX_FOR_STANDARD";
  constructor(
    readonly mode: string,
    readonly projectedUsd: number,
    readonly capUsd: number,
    readonly suggestedMode: string | null
  ) {
    super(
      `A case this size projects to $${projectedUsd.toFixed(4)}, over the ` +
        `$${capUsd.toFixed(2)} cap for ${mode}.`
    );
    this.name = "CaseTooComplexError";
  }
}

export class StageRejectedError extends Error {
  constructor(readonly stage: string, readonly problems: string[]) {
    super(`Stage "${stage}" produced structurally invalid output: ${problems.join(", ")}`);
    this.name = "StageRejectedError";
  }
}

/**
 * Emit the schema-validation outcome for a stage.
 *
 * The attempt id is not threaded here on purpose: validation is a property of
 * the STAGE's assembled output, not of one HTTP attempt, and pretending
 * otherwise would attach it to whichever attempt happened to be last.
 */
function reportValidation(
  ledger: CostLedger,
  stage: string,
  results: { ok: boolean }[]
): void {
  ledger.onValidation?.({
    attemptId: "",
    stage,
    result: results.every((r) => r.ok) ? "ok" : "invalid",
  });
}

/** Stop the case when any validator refused. Reporting is not accepting. */
function requireOk(stage: string, results: { ok: boolean; problems: string[] }[]): void {
  const problems = results.filter((r) => !r.ok).flatMap((r) => r.problems);
  if (problems.length) throw new StageRejectedError(stage, problems);
}

/**
 * What the whole case would cost in the worst case, computed BEFORE anything is
 * sent.
 *
 * Uses the same arithmetic as CostLedger.reserve — the model's price table, the
 * ceiling actually sent, and the same safety margin — so the preflight and the
 * per-stage guard cannot disagree. A projection that used a friendlier formula
 * would wave through cases the first reservation then refuses, after extract
 * has already been paid for.
 *
 * The downstream inputs are modelled from the CEILINGS, not from a hope about
 * typical length: everything extract emits is read again by analyse, and both
 * are read again by strategise. That coupling is why raising one ceiling is a
 * budget decision for all three stages rather than a local change.
 */
export function projectCasePipeline(p: {
  account: string;
  systems: { extract: string; analyse: string; strategise: string };
  specs: {
    extract: ReturnType<typeof modelFor>;
    analyse: ReturnType<typeof modelFor>;
    strategise: ReturnType<typeof modelFor>;
  };
  /** Project the pipeline that will actually run, not the one usually shipped. */
  pipeline?: "three-stage" | "two-stage";
}): { perStage: { stage: string; inputTokens: number; maxOutputTokens: number; usd: number }[]; totalUsd: number } {
  const t = estimateTokens;
  const reserved = (spec: ReturnType<typeof modelFor>, inputTokens: number, maxOut: number) =>
    costOf(spec, inputTokens, maxOut) * RESERVATION_SAFETY_MARGIN;

  const extractIn = t(p.systems.extract + p.account);
  // The frame and actor map arrive as JSON on the next prompt; their worst case
  // is exactly what extract was allowed to write.
  const analyseIn = t(p.systems.analyse) + MAX_OUTPUT_TOKENS.extract;
  const strategiseIn = t(p.systems.strategise) + MAX_OUTPUT_TOKENS.extract + MAX_OUTPUT_TOKENS.analyse;

  const extract = {
    stage: "extract",
    inputTokens: extractIn,
    maxOutputTokens: MAX_OUTPUT_TOKENS.extract,
    usd: reserved(p.specs.extract, extractIn, MAX_OUTPUT_TOKENS.extract),
  };

  // The ablation merges analyse and strategise into one call, so projecting
  // three would refuse cases it can in fact afford.
  const perStage =
    p.pipeline === "two-stage"
      ? [
          extract,
          {
            stage: "strategise",
            inputTokens: t(p.systems.strategise) + MAX_OUTPUT_TOKENS.extract,
            maxOutputTokens: MAX_OUTPUT_TOKENS.strategise,
            usd: reserved(p.specs.strategise, t(p.systems.strategise) + MAX_OUTPUT_TOKENS.extract, MAX_OUTPUT_TOKENS.strategise),
          },
        ]
      : [
          extract,
          { stage: "analyse", inputTokens: analyseIn, maxOutputTokens: MAX_OUTPUT_TOKENS.analyse, usd: reserved(p.specs.analyse, analyseIn, MAX_OUTPUT_TOKENS.analyse) },
          { stage: "strategise", inputTokens: strategiseIn, maxOutputTokens: MAX_OUTPUT_TOKENS.strategise, usd: reserved(p.specs.strategise, strategiseIn, MAX_OUTPUT_TOKENS.strategise) },
        ];
  return { perStage, totalUsd: perStage.reduce((n, x) => n + x.usd, 0) };
}

/** The cheapest available mode whose cap covers this projection, if any. */
function modeThatWouldFit(projectedUsd: number, current: string): string | null {
  const fits = (Object.values(MODES) as { id: string; capUsd: number; available: boolean }[])
    .filter((m) => m.available && m.id !== current && m.capUsd >= projectedUsd)
    .sort((a, b) => a.capUsd - b.capUsd);
  return fits[0]?.id ?? null;
}

/** One retry, and only for unparseable JSON. Never for a refusal or a timeout. */
const MAX_JSON_RETRIES = 1;

async function stage(
  transport: Transport,
  ledger: CostLedger,
  name: keyof typeof MAX_OUTPUT_TOKENS,
  spec: ReturnType<typeof modelFor>,
  system: string,
  user: string,
  jsonSchema: { name: string; schema: Record<string, unknown> }
): Promise<unknown> {
  const maxOutputTokens = MAX_OUTPUT_TOKENS[name];
  /**
   * Checked before the reservation, so an unsendable ceiling costs nothing.
   *
   * Fail-closed by design: a model with no recorded capability is refused
   * rather than tried. The alternative is what already happened once — a
   * ceiling nobody had checked, a paid call, and a 400 that named nothing.
   */
  assertCeilingSupported(spec, maxOutputTokens);

  for (let attempt = 0; attempt <= MAX_JSON_RETRIES; attempt++) {
    // Local id, minted before the request. Ties an attempt line to its outcome
    // without depending on the provider returning anything.
    const attemptId = randomBytes(6).toString("hex");
    // Reservation happens per attempt: a retry costs real money and must be
    // charged against the same cap, or the guard is trivially defeated by one.
    const { projectedUsd } = ledger.reserve(name, spec, system + user, maxOutputTokens, {
      attemptId,
      retryNumber: attempt,
    });

    const result = await transport({
      modelSlug: spec.slug,
      system,
      user,
      maxOutputTokens,
      jsonSchema,
      temperature: 0.6,
      maxPrice: { promptPerMTok: spec.inputPerMTok, completionPerMTok: spec.outputPerMTok },
    });
    // Throws AccountingError on a malformed cost, an overcharge or a routing
    // change. That stops the pipeline before the NEXT call; it cannot undo this
    // one, and nothing here pretends otherwise.
    ledger.record({
      stage: name,
      spec,
      usage: result.usage,
      latencyMs: result.latencyMs,
      telemetry: result.telemetry,
      attemptId,
      retryNumber: attempt,
      reservedUsd: projectedUsd,
    });

    /**
     * Truncation is decided BEFORE parsing, and it ends the stage.
     *
     * Parsing a fragment can only produce two outcomes, and both are bad: null,
     * which is indistinguishable from a model that wrote nonsense, or — because
     * parseJsonReply falls back to the outermost braces — a SHORTER object that
     * happens to close, which would then be validated and possibly accepted as
     * a complete answer built from a cut-off one. Neither is worth finding out.
     *
     * The call above has already been recorded, so the charge for this attempt
     * is accounted for. What does not happen is a second attempt: the prompt and
     * the ceiling would be identical, so the overflow would be identical, and
     * the only certain outcome is a second charge.
     */
    if (isTruncatedFinish(result.telemetry)) {
      ledger.onValidation?.({ attemptId, stage: name, result: "truncated" });
      throw new OutputTruncatedError(
        name,
        result.usage.outputTokens,
        maxOutputTokens,
        result.telemetry.finishReason ?? result.telemetry.nativeFinishReason
      );
    }

    const parsed = parseJsonReply(result.content);
    ledger.onValidation?.({ attemptId, stage: name, result: parsed !== null ? "ok" : "unparseable" });
    if (parsed !== null) return parsed;
  }
  throw new Error(`Stage "${name}" returned no parseable JSON after ${MAX_JSON_RETRIES + 1} attempts.`);
}

/**
 * Light mode: one call, one next move, its own $0.02 ceiling.
 *
 * Separate function rather than a branch inside runCase, so "Light must never
 * make more than one model call" is a property of the code shape rather than a
 * condition somebody has to keep true.
 */
export async function runLight(
  input: CaseInput,
  transport: Transport
): Promise<{ plan: LightPlan; ledger: CostLedger }> {
  const language = resolveLanguage(input.responseLanguage ?? "auto", input.account);
  const jurisdiction = input.jurisdiction ?? { country: "unknown" as const };
  const cap = capFor("light", input.ledger ? undefined : undefined);
  const ledger = input.ledger ? input.ledger.envelope(cap) : new CostLedger("quick", cap);
  const cfg = resolveConfiguration(input.configurationId);
  const spec = modelFor(cfg, "strategise");
  const sentinel = randomBytes(4).toString("hex");
  const attemptId = randomBytes(6).toString("hex");
  const user = fence("ACCOUNT", input.account, sentinel);
  const system = lightPrompt(sentinel, language, jurisdiction);

  const { projectedUsd } = ledger.reserve("light", spec, system + user, MAX_OUTPUT_TOKENS.light, {
    attemptId,
    retryNumber: 0,
  });
  const result = await transport({
    modelSlug: spec.slug,
    system,
    user,
    maxOutputTokens: MAX_OUTPUT_TOKENS.light,
    jsonSchema: LIGHT_SCHEMA as unknown as { name: string; schema: Record<string, unknown> },
    temperature: 0.6,
    maxPrice: { promptPerMTok: spec.inputPerMTok, completionPerMTok: spec.outputPerMTok },
  });
  ledger.record({
    stage: "light", spec, usage: result.usage, latencyMs: result.latencyMs,
    telemetry: result.telemetry, attemptId, retryNumber: 0, reservedUsd: projectedUsd,
  });

  // No retry here, deliberately: a second call would double the cost of the
  // cheapest mode, and Light exists precisely to be cheap and fast.
  const parsed = parseJsonReply(result.content);
  ledger.onValidation?.({ attemptId, stage: "light", result: parsed !== null ? "ok" : "unparseable" });
  if (parsed === null) throw new StageRejectedError("light", ["light.unparseable"]);
  const v = validateLightPlan(parsed);
  if (!v.ok) throw new StageRejectedError("light", v.problems);
  return { plan: { ...v.value!, language, jurisdiction }, ledger };
}

export async function runCase(
  input: CaseInput,
  transport: Transport
): Promise<EngineResult> {
  const mode: CaseMode = input.mode ?? "standard";
  if (mode === "deep") {
    // The interface exists; the escalation path does not. Failing loudly beats
    // silently running a Standard pipeline under a Deep budget and reporting it
    // as a Deep result.
    throw new Error("Deep mode is an interface only in V0 — no deep pipeline is implemented.");
  }

  const configuration = resolveConfiguration(input.configurationId);
  // The engine ALWAYS runs inside its own envelope capped at the mode's limit,
  // even when a caller hands it a larger budget. A benchmark running at $0.15
  // must not turn a Standard case into a $0.15 case: the outer number is a
  // limit on the whole command, never a licence for one component.
  const ledger = input.ledger
    ? input.ledger.envelope(MODE_CAPS[mode], mode)
    : new CostLedger(mode, MODE_CAPS[mode]);
  const problems: string[] = [];
  const warnings: SanitationWarning[] = [];
  const sentinel = randomBytes(4).toString("hex");
  const account = fence("ACCOUNT", input.account, sentinel);
  const language = resolveLanguage(input.responseLanguage ?? "auto", input.account);
  const jurisdiction = input.jurisdiction ?? { country: "unknown" as const };

  // ---- stage 1: extraction, on the cheap model
  const extractSpec = modelFor(configuration, "extract");

  /**
   * Refuse an oversized case at the door rather than halfway through it.
   *
   * The per-stage reservation already stops a breach, but it stops it AFTER
   * extract has been sent and billed — the user ends up with a charge, no
   * answer, and a budget error that names a stage they never saw. Projecting
   * all three stages first turns that into a refusal that costs nothing and
   * names a mode that would actually fit.
   *
   * Only for the real pipeline: Light has its own single call and its own
   * $0.02 ceiling, and must not be priced against a three-stage projection.
   */
  const projection = projectCasePipeline({
    account: input.account,
    systems: {
      extract: extractPrompt(sentinel, language, jurisdiction),
      analyse: analysePrompt(sentinel, language, jurisdiction),
      strategise: strategisePrompt(sentinel, language, jurisdiction),
    },
    specs: {
      extract: extractSpec,
      analyse: modelFor(configuration, "analyse"),
      strategise: modelFor(configuration, "strategise"),
    },
    pipeline: configuration.pipeline === "two-stage" ? "two-stage" : "three-stage",
  });
  const preflightCap = input.preflightCapUsd ?? MODE_CAPS[mode];
  if (projection.totalUsd > preflightCap) {
    throw new CaseTooComplexError(
      mode,
      projection.totalUsd,
      preflightCap,
      modeThatWouldFit(projection.totalUsd, mode)
    );
  }

  const rawExtract = (await stage(
    transport,
    ledger,
    "extract",
    extractSpec,
    extractPrompt(sentinel, language, jurisdiction),
    account,
    EXTRACT_SCHEMA
  )) as Record<string, unknown>;

  /**
   * Deterministic sanitation, between parsing and validation.
   *
   * Runs on every reply, costs nothing, and calls no model. Its job is to stop
   * a complete, already-paid-for case file being destroyed by a couple of
   * optional claims the model could not support — while leaving the validators
   * exactly as strict as they were about everything that matters.
   */
  const cleaned = sanitizeExtract(rawExtract);
  warnings.push(...cleaned.warnings);
  const extracted = cleaned.value as Record<string, unknown>;

  const frame = validateFrame(extracted.frame);
  const actors = validateActors(extracted.actors, frame.value);
  problems.push(...frame.problems, ...actors.problems);
  // ok, not value. Validators always return a value — that is what makes them
  // useful for reporting — so checking the value was a check that could never
  // fail, and put us back to "we got JSON and hoped".
  reportValidation(ledger, "extract", [frame, actors]);
  requireOk("extract", [frame, actors]);

  // ---- two-call ablation: analysis and strategy merged into one call.
  // Defined so a later benchmark can ask whether the separate analyse stage
  // earns its cost. Not run live in V0.
  if (configuration.pipeline === "two-stage") {
    const spec = modelFor(configuration, "strategise");
    const raw = (await stage(
      transport,
      ledger,
      "strategise",
      spec,
      combinedPrompt(sentinel, language, jurisdiction),
      JSON.stringify({ frame: frame.value, actors: actors.value }),
      COMBINED_SCHEMA as unknown as { name: string; schema: Record<string, unknown> }
    )) as Record<string, unknown>;

    const h = validateHypotheses(raw.hypotheses);
    const l = validateLeverage(raw.leverage);
    const st = validateStrategies(raw.strategies);
    const cm = validateCountermoves(raw.countermoves);
    const pl = validatePlan(raw.plan);
    problems.push(...h.problems, ...l.problems, ...st.problems, ...cm.problems, ...pl.problems);
    requireOk("strategise", [h, l, st, cm, pl]);
    return {
      analysis: {
        frame: frame.value!, actors: actors.value!, hypotheses: h.value!, leverage: l.value!,
        strategies: st.value!, countermoves: cm.value!, plan: pl.value!,
        language, jurisdiction,
      },
      ledger,
      configuration,
      problems,
      warnings,
    };
  }

  // ---- stage 2: hypotheses and leverage, on the strong model
  const analyseSpec = modelFor(configuration, "analyse");
  const analyseInput = JSON.stringify({ frame: frame.value, actors: actors.value });
  const rawAnalyse = (await stage(
    transport,
    ledger,
    "analyse",
    analyseSpec,
    analysePrompt(sentinel, language, jurisdiction),
    analyseInput,
    ANALYSE_SCHEMA
  )) as Record<string, unknown>;

  const hypotheses = validateHypotheses(rawAnalyse.hypotheses);
  const leverage = validateLeverage(rawAnalyse.leverage);
  problems.push(...hypotheses.problems, ...leverage.problems);
  reportValidation(ledger, "analyse", [hypotheses, leverage]);
  requireOk("analyse", [hypotheses, leverage]);

  // ---- stage 3: strategy, countermoves and the final plan
  const strategiseSpec = modelFor(configuration, "strategise");
  const strategiseInput = JSON.stringify({
    frame: frame.value,
    actors: actors.value,
    hypotheses: hypotheses.value,
    leverage: leverage.value,
  });
  const rawPlan = (await stage(
    transport,
    ledger,
    "strategise",
    strategiseSpec,
    strategisePrompt(sentinel, language, jurisdiction),
    strategiseInput,
    STRATEGISE_SCHEMA
  )) as Record<string, unknown>;

  const strategies = validateStrategies(rawPlan.strategies);
  const countermoves = validateCountermoves(rawPlan.countermoves);
  const plan = validatePlan(rawPlan.plan);
  problems.push(...strategies.problems, ...countermoves.problems, ...plan.problems);
  reportValidation(ledger, "strategise", [strategies, countermoves, plan]);
  requireOk("strategise", [strategies, countermoves, plan]);

  // The answer must be in the language the user reads. A plan whose exactWords
  // are in the wrong language is not a degraded plan, it is an unusable one.
  const langCheck = checkLanguage(
    {
      frame: frame.value!, actors: actors.value!, hypotheses: hypotheses.value!,
      leverage: leverage.value!, strategies: strategies.value!,
      countermoves: countermoves.value!, plan: plan.value!, language, jurisdiction,
    },
    language
  );
  problems.push(...langCheck.problems);
  if (!langCheck.ok) throw new StageRejectedError("language", langCheck.problems);

  return {
    // Non-null after requireOk: a validator that reports ok always carries a
    // value, and requireOk has already thrown for anything that did not.
    analysis: {
      frame: frame.value!,
      actors: actors.value!,
      hypotheses: hypotheses.value!,
      leverage: leverage.value!,
      strategies: strategies.value!,
      countermoves: countermoves.value!,
      plan: plan.value!,
      language,
      jurisdiction,
    },
    ledger,
    configuration,
    problems,
    warnings,
  };
}

/**
 * Baseline adapter: the current product shape — one call, free text, no
 * structure. Deliberately given the SAME situation and a fair, well-written
 * system prompt. A benchmark that beats a strawman proves nothing.
 */
export async function runBaseline(
  input: CaseInput,
  transport: Transport,
  modelKey = "claude-sonnet-5"
): Promise<{ answer: string; ledger: CostLedger }> {
  const mode: CaseMode = input.mode ?? "standard";
  const ledger = input.ledger ?? new CostLedger(mode, MODE_CAPS[mode]);
  const spec = modelFor(
    {
      id: "baseline",
      description: "",
      pipeline: "three-stage",
      roles: { extract: modelKey, analyse: modelKey, strategise: modelKey },
      baselineModel: modelKey,
      judgeModel: modelKey,
      status: "verified",
    },
    "strategise"
  );
  const system = baselinePrompt(
    resolveLanguage(input.responseLanguage ?? "auto", input.account),
    input.jurisdiction ?? { country: "unknown" }
  );

  const attemptId = randomBytes(6).toString("hex");
  const { projectedUsd } = ledger.reserve(
    "baseline", spec, system + input.account, MAX_OUTPUT_TOKENS.baseline,
    { attemptId, retryNumber: 0 }
  );
  const result = await transport({
    modelSlug: spec.slug,
    system,
    user: input.account,
    maxOutputTokens: MAX_OUTPUT_TOKENS.baseline,
    temperature: 0.7,
    maxPrice: { promptPerMTok: spec.inputPerMTok, completionPerMTok: spec.outputPerMTok },
  });
  ledger.record({
    stage: "baseline",
    spec,
    usage: result.usage,
    latencyMs: result.latencyMs,
    telemetry: result.telemetry,
    attemptId,
    reservedUsd: projectedUsd,
  });
  return { answer: result.content, ledger };
}

/**
 * Strong: Standard, then ONE bounded revision pass.
 *
 * The critic sees the finished plan, the facts and the constraints — never the
 * raw account and never the earlier reasoning. It returns a revised plan rather
 * than a review, and the user is never shown a second voice: two personas
 * arguing reads as theatre by the third message and halves the information
 * density of every answer.
 *
 * Exactly one pass. Not a loop, not "until it stops improving" — that is how a
 * bounded cost becomes an unbounded one.
 */
export async function runStrong(
  input: CaseInput,
  transport: Transport
): Promise<EngineResult> {
  const cap = capFor("strong");
  const ledger = input.ledger ? input.ledger.envelope(cap) : new CostLedger("standard", cap);
  const base = await runCase({ ...input, ledger }, transport);

  const configuration = base.configuration;
  const spec = modelFor(configuration, "strategise");
  const sentinel = randomBytes(4).toString("hex");
  const attemptId = randomBytes(6).toString("hex");
  const system = criticPrompt(sentinel, base.analysis.language, base.analysis.jurisdiction);
  // Compact input on purpose: the plan, the facts, the constraints. Sending the
  // account again would re-open every door the extraction stage closed.
  const user = JSON.stringify({
    plan: base.analysis.plan,
    strategies: base.analysis.strategies,
    countermoves: base.analysis.countermoves,
    facts: base.analysis.frame.reportedFacts,
    unknowns: base.analysis.frame.unknowns,
    constraints: base.analysis.frame.constraints,
  });

  let revised = base.analysis.plan;
  const problems = [...base.problems];
  try {
    const { projectedUsd } = ledger.reserve("critic", spec, system + user, MAX_OUTPUT_TOKENS.critic, {
      attemptId,
      retryNumber: 0,
    });
    const result = await transport({
      modelSlug: spec.slug,
      system,
      user,
      maxOutputTokens: MAX_OUTPUT_TOKENS.critic,
      jsonSchema: STRATEGISE_SCHEMA as unknown as { name: string; schema: Record<string, unknown> },
      temperature: 0.4,
      maxPrice: { promptPerMTok: spec.inputPerMTok, completionPerMTok: spec.outputPerMTok },
    });
    ledger.record({
      stage: "critic", spec, usage: result.usage, latencyMs: result.latencyMs,
      telemetry: result.telemetry, attemptId, retryNumber: 0, reservedUsd: projectedUsd,
    });
    const parsed = parseJsonReply(result.content) as Record<string, unknown> | null;
    const check = parsed ? validatePlan(parsed.plan ?? parsed) : { ok: false, problems: ["critic.unparseable"], value: undefined };
    ledger.onValidation?.({ attemptId, stage: "critic", result: check.ok ? "ok" : "invalid" });
    if (check.ok && check.value) {
      revised = check.value;
    } else {
      // A failed revision is not a failed case. The Standard plan was already
      // valid; keeping it is strictly better than discarding it.
      problems.push(...check.problems.map((p) => `critic.rejected:${p}`));
    }
  } catch (e) {
    if (e instanceof BudgetExceededError) {
      problems.push("critic.skipped:budget");
    } else {
      throw e;
    }
  }

  return { ...base, analysis: { ...base.analysis, plan: revised }, ledger, problems };
}

/**
 * Dispatch by product mode.
 *
 * Deep throws rather than running Standard. Reporting a Standard result as Deep
 * would be a lie about what the user paid for, and a silent fallback is the
 * kind that nobody notices until it matters.
 */
export async function runAnalysis(
  input: CaseInput & { analysisMode: AnalysisMode },
  transport: Transport
): Promise<{ mode: AnalysisMode; light?: LightPlan; full?: EngineResult; ledger: CostLedger }> {
  const mode = input.analysisMode;
  if (!MODES[mode].available) throw new ModeNotAvailable(mode);

  if (mode === "light") {
    const { plan, ledger } = await runLight(input, transport);
    return { mode, light: plan, ledger };
  }
  if (mode === "strong") {
    const full = await runStrong(input, transport);
    return { mode, full, ledger: full.ledger };
  }
  const full = await runCase({ ...input, ledger: input.ledger }, transport);
  return { mode, full, ledger: full.ledger };
}

/** Render an analysis as the prose a reader would judge, for blind comparison. */
export function renderAnalysis(a: CaseAnalysis): string {
  const ru = a.language === "ru";
  const L = {
    unknown: ru ? "Что ещё неизвестно и меняет вывод:" : "What is still unknown and would change this:",
    versions: ru ? "Конкурирующие версии:" : "Competing readings:",
    check: ru ? "Как проверить" : "How to test",
    leverage: ru ? "Рычаги:" : "Leverage:",
    move: ru ? "Рекомендуемый ход:" : "Recommended move:",
    words: ru ? "Точные слова:" : "Exact words:",
    dont: ru ? "Чего не говорить:" : "What not to say:",
    branches: ru ? "Если/то:" : "If/then:",
    counter: ru ? "Что сделает другая сторона:" : "What the other side does:",
    stop: ru ? "Сигналы остановиться:" : "Stop signals:",
    fallback: ru ? "Запасной план:" : "Fallback:",
    risk: ru ? "Риск" : "Risk",
    uncertainty: ru ? "Неопределённость" : "Uncertainty",
  };
  const lines: string[] = [a.plan.conclusion, ""];
  if (a.plan.missingInformation.length) {
    lines.push(L.unknown, ...a.plan.missingInformation.map((m) => `- ${m}`), "");
  }
  lines.push(L.versions);
  for (const h of a.hypotheses.hypotheses) {
    lines.push(`- ${h.claim} (${h.confidence}%). ${L.check}: ${h.discriminatingTest}`);
  }
  lines.push("", L.leverage);
  for (const p of a.leverage.points.filter((x) => x.status === "present")) {
    lines.push(`- [${p.kind}] ${p.description}`);
  }
  lines.push("", `${L.move} ${a.plan.recommendedMove}`, "", L.words);
  for (const p of a.plan.exactWords) lines.push(`- (${p.role}) «${p.text}»`);
  if (a.plan.whatNotToSay.length) lines.push("", L.dont, ...a.plan.whatNotToSay.map((w) => `- ${w}`));
  if (a.plan.ifThenBranches.length) {
    lines.push("", L.branches, ...a.plan.ifThenBranches.map((b) => `- ${b.if} → ${b.then}`));
  }
  lines.push("", L.counter);
  for (const c of a.countermoves.countermoves) {
    lines.push(`- [${c.againstStrategy}] ${c.likelyResponse} ${c.worstPlausibleOutcome}`);
  }
  if (a.plan.stopSignals.length) lines.push("", L.stop, ...a.plan.stopSignals.map((x) => `- ${x}`));
  lines.push("", `${L.fallback} ${a.plan.fallbackPlan}`);
  lines.push(`${L.risk}: ${a.plan.risk}. ${L.uncertainty}: ${a.plan.uncertainty}`);
  return lines.join("\n");
}
