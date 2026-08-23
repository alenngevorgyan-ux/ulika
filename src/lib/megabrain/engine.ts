import { randomBytes } from "node:crypto";
import { BudgetExceededError, CostLedger, MODE_CAPS, RESERVATION_SAFETY_MARGIN, type CaseMode } from "./costLedger";
import { assertCeilingSupported, costOf, DEFAULT_CONFIGURATION, estimateTokens, modelFor, resolveConfiguration, type Configuration } from "./modelRouter";
import { EXTRACT_SCHEMA, ANALYSE_SCHEMA, STRATEGISE_SCHEMA, COMBINED_SCHEMA, LIGHT_SCHEMA } from "./jsonSchemas";
import { analysePrompt, baselinePrompt, combinedPrompt, criticPrompt, extractPrompt, fence, lightPrompt, strategisePrompt } from "./prompts";
import {
  isTruncatedFinish,
  OutputTruncatedError,
  parseJsonReply,
  ProviderTimeoutError,
  timeoutForReasoning,
  type ReasoningConfig,
  type Transport,
} from "./transport";
import { checkLanguage, resolveLanguage } from "./language";
import { sanitizeExtract, type SanitationWarning } from "./sanitize";
import { CLARIFY_SCHEMA, clarifyPrompt, formatAnswers, validateClarify, type ClarifyQuestion } from "./clarify";
import { buildBrief, renderBrief, type AnalysisBrief } from "./brief";
import { checkNarrative, finalPrompt, finalUserMessage } from "./finalStrategist";
import { followUpPrompt, followUpUserMessage, type FollowUpAction } from "./followUp";
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
  /** Admin-only experiment profile. Production callers leave this absent. */
  execution?: {
    analysisConfigurationId: string;
    finalModelKey: string;
    reasoning?: Partial<Record<"clarify" | "extract" | "analyse" | "strategise" | "critic" | "final", ReasoningConfig>>;
    maxJsonRetries?: 0 | 1;
    /**
     * Per-stage override for the VISIBLE output ceiling (MAX_OUTPUT_TOKENS is
     * shared across every preset otherwise). Live evidence: D Premium's
     * strategise call hit MAX_OUTPUT_TOKENS.strategise's 3000-token ceiling on
     * BOTH live runs (~3004 visible tokens each time) and truncated on one of
     * them — the schema's natural size for this stage under Qwen genuinely
     * needs more room, not less reasoning. Unset for every other stage/preset,
     * so their behavior is unchanged.
     */
    maxOutputTokens?: Partial<Record<"clarify" | "extract" | "analyse" | "strategise" | "critic" | "final", number>>;
  };
  /** Compact, retrieved data. It is never promoted to instructions. */
  knowledgeBlock?: string;
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
  /** A triage decision and at most five short questions. Not an analysis. */
  clarify: 800,
  /** The answer the user reads. Prose, so it needs room to breathe. */
  final: 2200,
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
  /** Same reasoning config the strategise call will actually run under, so this projection and stage()'s own reserve() cannot disagree. */
  strategiseReasoning?: ReasoningConfig;
  /** Same visible-output override the strategise call will actually run under. */
  strategiseVisibleCeiling?: number;
}): { perStage: { stage: string; inputTokens: number; maxOutputTokens: number; usd: number }[]; totalUsd: number } {
  const t = estimateTokens;
  const reserved = (spec: ReturnType<typeof modelFor>, inputTokens: number, maxOut: number) =>
    costOf(spec, inputTokens, maxOut) * RESERVATION_SAFETY_MARGIN;
  const strategiseVisible = p.strategiseVisibleCeiling ?? MAX_OUTPUT_TOKENS.strategise;
  const strategiseCeiling = reservationCeiling(strategiseVisible, p.strategiseReasoning);

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
            maxOutputTokens: strategiseCeiling,
            usd: reserved(p.specs.strategise, t(p.systems.strategise) + MAX_OUTPUT_TOKENS.extract, strategiseCeiling),
          },
        ]
      : [
          extract,
          { stage: "analyse", inputTokens: analyseIn, maxOutputTokens: MAX_OUTPUT_TOKENS.analyse, usd: reserved(p.specs.analyse, analyseIn, MAX_OUTPUT_TOKENS.analyse) },
          { stage: "strategise", inputTokens: strategiseIn, maxOutputTokens: strategiseCeiling, usd: reserved(p.specs.strategise, strategiseIn, strategiseCeiling) },
        ];
  return { perStage, totalUsd: perStage.reduce((n, x) => n + x.usd, 0) };
}

/**
 * Conservative preflight for the whole user-visible advice turn.
 *
 * Unlike projectCasePipeline this includes the intake gate and the prose the
 * user actually receives. Callers continuing an existing flow set
 * includeClarify=false and pass only the budget that remains after intake.
 */
export function projectAdvicePipeline(input: {
  account: string;
  mode: AnalysisMode;
  responseLanguage?: ResponseLanguage;
  jurisdiction?: Jurisdiction;
  includeClarify: boolean;
  execution?: CaseInput["execution"];
}): number {
  const sentinel = "preflight";
  const language = resolveLanguage(input.responseLanguage ?? "auto", input.account);
  const jurisdiction = input.jurisdiction ?? { country: "unknown" as const };
  const defaultConfig = resolveConfiguration(DEFAULT_CONFIGURATION);
  const analysisConfig = resolveConfiguration(input.execution?.analysisConfigurationId ?? ANALYSIS_CONFIG[input.mode] ?? DEFAULT_CONFIGURATION);
  const reserve = (spec: ReturnType<typeof modelFor>, text: string, out: number) =>
    costOf(spec, estimateTokens(text), out) * RESERVATION_SAFETY_MARGIN;

  let total = 0;
  if (input.includeClarify) {
    total += reserve(
      modelFor(defaultConfig, "extract"),
      clarifyPrompt(sentinel, language, jurisdiction) + fence("ACCOUNT", input.account, sentinel),
      MAX_OUTPUT_TOKENS.clarify
    );
  }

  if (input.mode !== "light") {
    const config = analysisConfig;
    total += projectCasePipeline({
      account: input.account,
      systems: {
        extract: extractPrompt(sentinel, language, jurisdiction),
        analyse: analysePrompt(sentinel, language, jurisdiction),
        strategise:
          config.pipeline === "two-stage"
            ? combinedPrompt(sentinel, language, jurisdiction)
            : strategisePrompt(sentinel, language, jurisdiction),
      },
      specs: {
        extract: modelFor(config, "extract"),
        analyse: modelFor(config, "analyse"),
        strategise: modelFor(config, "strategise"),
      },
      pipeline: config.pipeline === "two-stage" ? "two-stage" : "three-stage",
      strategiseReasoning: input.execution?.reasoning?.strategise,
      strategiseVisibleCeiling: input.execution?.maxOutputTokens?.strategise,
    }).totalUsd;

    if (input.mode === "strong") {
      // The critic sees compact structured staff work, not the raw transcript.
      // Six thousand tokens is deliberately above the measured prompt used by
      // the existing critic cost report.
      const criticSpec = modelFor(config, "strategise");
      total += costOf(criticSpec, 6_000, MAX_OUTPUT_TOKENS.critic) * RESERVATION_SAFETY_MARGIN;
    }
  }

  // The brief is a deterministic projection of selected fields, not a copy of
  // every upstream token. Use a deliberately padded measured bound: Standard
  // briefs are ~4k characters, Strong may carry the separate analysis pass.
  const briefChars = input.mode === "light" ? 0 : input.mode === "strong" ? 9_000 : 6_000;
  const finalText =
    finalPrompt(sentinel, language, jurisdiction, input.mode !== "light") +
    finalUserMessage(input.account, "", "x".repeat(briefChars), sentinel);
  const finalKey = input.execution?.finalModelKey;
  const finalConfig = finalKey
    ? { ...defaultConfig, id: "manual-final", roles: { ...defaultConfig.roles, strategise: finalKey } }
    : defaultConfig;
  total += reserve(
    modelFor(finalConfig, "strategise"),
    finalText,
    reservationCeiling(input.execution?.maxOutputTokens?.final ?? MAX_OUTPUT_TOKENS.final, input.execution?.reasoning?.final)
  );
  return total;
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

/**
 * What a stage's completion can actually cost, for reservation purposes.
 *
 * `maxOutputTokens` is what we ask the provider to cap the VISIBLE output at,
 * and is sent to the provider unchanged — this function does not touch it.
 * But reasoning tokens are billed as completion tokens too, and live evidence
 * (qwen/qwen3.6-max-preview, D Premium) showed max_tokens=3000 bounding the
 * visible output as expected while reasoning ran unbounded on top: 3233
 * reasoning tokens + ~3004 visible = 6237 total billed, against a reservation
 * that only knew about 3000. A stage's `reasoning.maxTokens`, when set, is
 * added here so the reservation reflects what could actually be billed, not
 * just what the visible-output ceiling promises — whether or not the
 * provider actually honors that reasoning budget as a hard limit.
 */
export function reservationCeiling(maxOutputTokens: number, reasoning?: ReasoningConfig): number {
  return maxOutputTokens + (reasoning?.maxTokens ?? 0);
}

async function stage(
  transport: Transport,
  ledger: CostLedger,
  name: keyof typeof MAX_OUTPUT_TOKENS,
  spec: ReturnType<typeof modelFor>,
  system: string,
  user: string,
  jsonSchema: { name: string; schema: Record<string, unknown> },
  reasoning?: ReasoningConfig,
  maxJsonRetries = MAX_JSON_RETRIES,
  visibleCeilingOverride?: number
): Promise<unknown> {
  const maxOutputTokens = visibleCeilingOverride ?? MAX_OUTPUT_TOKENS[name];
  const reservedCeiling = reservationCeiling(maxOutputTokens, reasoning);
  /**
   * Checked before the reservation, so an unsendable ceiling costs nothing.
   *
   * Fail-closed by design: a model with no recorded capability is refused
   * rather than tried. The alternative is what already happened once — a
   * ceiling nobody had checked, a paid call, and a 400 that named nothing.
   *
   * Checked against the RESERVATION ceiling (visible + reasoning budget), not
   * just the visible one — a stage whose reasoning budget alone would exceed
   * what the model can produce must be refused here, not discovered live.
   */
  assertCeilingSupported(spec, reservedCeiling);

  for (let attempt = 0; attempt <= maxJsonRetries; attempt++) {
    // Local id, minted before the request. Ties an attempt line to its outcome
    // without depending on the provider returning anything.
    const attemptId = randomBytes(6).toString("hex");
    // Reservation happens per attempt: a retry costs real money and must be
    // charged against the same cap, or the guard is trivially defeated by one.
    // Reserved against reservedCeiling (may exceed maxOutputTokens when this
    // stage reasons) — the request below still asks for maxOutputTokens only.
    const { inputTokens, projectedUsd } = ledger.reserve(name, spec, system + user, reservedCeiling, {
      attemptId,
      retryNumber: attempt,
    });

    let result;
    try {
      result = await transport({
        stage: name,
        modelSlug: spec.slug,
        system,
        user,
        maxOutputTokens,
        jsonSchema,
        temperature: 0.6,
        timeoutMs: timeoutForReasoning(reasoning),
        maxPrice: { promptPerMTok: spec.inputPerMTok, completionPerMTok: spec.outputPerMTok },
        reasoning,
      });
    } catch (error) {
      if (error instanceof ProviderTimeoutError) {
        ledger.recordUnreportedAttempt({
          stage: name, spec, inputTokens, latencyMs: error.elapsedMs,
          attemptId, retryNumber: attempt, reservedUsd: projectedUsd,
        });
      }
      throw error;
    }
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
  throw new Error(`Stage "${name}" returned no parseable JSON after ${maxJsonRetries + 1} attempts.`);
}

/**
 * A stage whose output is prose, not JSON.
 *
 * Separate from stage() rather than a flag on it, because almost everything
 * stage() does — schema, parse, retry-on-unparseable — is meaningless here, and
 * a shared function with half its body switched off invites someone to switch
 * the wrong half back on. Truncation and accounting still apply identically.
 */
async function textStage(
  transport: Transport,
  ledger: CostLedger,
  name: keyof typeof MAX_OUTPUT_TOKENS,
  spec: ReturnType<typeof modelFor>,
  system: string,
  user: string,
  reasoning?: ReasoningConfig,
  visibleCeilingOverride?: number
): Promise<string> {
  const maxOutputTokens = visibleCeilingOverride ?? MAX_OUTPUT_TOKENS[name];
  const reservedCeiling = reservationCeiling(maxOutputTokens, reasoning);
  assertCeilingSupported(spec, reservedCeiling);
  const attemptId = randomBytes(6).toString("hex");
  const { inputTokens, projectedUsd } = ledger.reserve(name, spec, system + user, reservedCeiling, {
    attemptId,
    retryNumber: 0,
  });
  let result;
  try {
    result = await transport({
      stage: name,
      modelSlug: spec.slug,
      system,
      user,
      maxOutputTokens,
      temperature: 0.7,
      timeoutMs: timeoutForReasoning(reasoning),
      maxPrice: { promptPerMTok: spec.inputPerMTok, completionPerMTok: spec.outputPerMTok },
      reasoning,
    });
  } catch (error) {
    if (error instanceof ProviderTimeoutError) {
      ledger.recordUnreportedAttempt({
        stage: name, spec, inputTokens, latencyMs: error.elapsedMs,
        attemptId, retryNumber: 0, reservedUsd: projectedUsd,
      });
    }
    throw error;
  }
  ledger.record({
    stage: name,
    spec,
    usage: result.usage,
    latencyMs: result.latencyMs,
    telemetry: result.telemetry,
    attemptId,
    retryNumber: 0,
    reservedUsd: projectedUsd,
  });
  if (isTruncatedFinish(result.telemetry)) {
    ledger.onValidation?.({ attemptId, stage: name, result: "truncated" });
    throw new OutputTruncatedError(
      name,
      result.usage.outputTokens,
      maxOutputTokens,
      result.telemetry.finishReason ?? result.telemetry.nativeFinishReason
    );
  }
  return result.content.trim();
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
    strategiseReasoning: input.execution?.reasoning?.strategise,
    strategiseVisibleCeiling: input.execution?.maxOutputTokens?.strategise,
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
    EXTRACT_SCHEMA,
    input.execution?.reasoning?.extract,
    input.execution?.maxJsonRetries
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
      JSON.stringify({ frame: frame.value, actors: actors.value, knowledgeCards: input.knowledgeBlock || undefined }),
      COMBINED_SCHEMA as unknown as { name: string; schema: Record<string, unknown> },
      input.execution?.reasoning?.strategise,
      input.execution?.maxJsonRetries,
      input.execution?.maxOutputTokens?.strategise
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
    ANALYSE_SCHEMA,
    input.execution?.reasoning?.analyse,
    input.execution?.maxJsonRetries
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
    knowledgeCards: input.knowledgeBlock || undefined,
  });
  const rawPlan = (await stage(
    transport,
    ledger,
    "strategise",
    strategiseSpec,
    strategisePrompt(sentinel, language, jurisdiction),
    strategiseInput,
    STRATEGISE_SCHEMA,
    input.execution?.reasoning?.strategise,
    input.execution?.maxJsonRetries
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
    // The critic is optional by contract. Its transport, accounting or schema
    // failure must not destroy the valid plan already bought above. Keep only a
    // fixed code; exception prose may contain provider-controlled text.
    const name = e instanceof Error ? e.name : "Error";
    const reason = e instanceof BudgetExceededError
      ? "budget"
      : name === "ProviderHttpError"
        ? "provider"
        : name === "AccountingError"
          ? "accounting"
          : "invalid";
    problems.push(`critic.skipped:${reason}`);
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

/**
 * The product pipeline: clarify, analyse in private, then advise.
 *
 * This replaces "run the analysis and render it" as the shape of the product.
 * The analysis still happens and is still as strict as it was; what changed is
 * that it is now STAFF WORK feeding one final adviser, instead of being the
 * thing handed to the user. See finalStrategist.ts for why.
 */
export interface AdviceInput extends CaseInput {
  analysisMode: AnalysisMode;
  /** Answers to questions asked on a previous turn, keyed by question id. */
  answers?: Record<string, string>;
  /** The questions those answers belong to, echoed back by the client. */
  askedQuestions?: ClarifyQuestion[];
  /** The user pressed "continue without clarifying". */
  skipClarify?: boolean;
}

export type AdviceOutcome =
  | { kind: "questions"; questions: ClarifyQuestion[]; ledger: CostLedger }
  | {
      kind: "answer";
      /** The prose the user reads. The only thing the product promises. */
      answer: string;
      /** Internal, for the lab and the benchmark. Never rendered to a user. */
      brief: AnalysisBrief | null;
      analysis: CaseAnalysis | null;
      problems: string[];
      warnings: SanitationWarning[];
      ledger: CostLedger;
    };

/** Which internal pipeline each mode buys. Light buys none. */
const ANALYSIS_CONFIG: Record<AnalysisMode, string | null> = {
  light: null,
  standard: "grok-two-call",
  strong: DEFAULT_CONFIGURATION,
  deep: null,
};

export async function runAdvice(input: AdviceInput, transport: Transport): Promise<AdviceOutcome> {
  const mode = input.analysisMode;
  if (!MODES[mode].available) throw new ModeNotAvailable(mode);

  const capUsd = capFor(mode);
  const ledger = input.ledger ?? new CostLedger("standard", capUsd);
  const sentinel = randomBytes(4).toString("hex");
  const language = resolveLanguage(input.responseLanguage ?? "auto", input.account);
  const jurisdiction = input.jurisdiction ?? { country: "unknown" as const };
  const answersBlock = formatAnswers(input.askedQuestions ?? [], input.answers ?? {});

  const projected = projectAdvicePipeline({
    account: answersBlock ? `${input.account}\n\nУточнения:\n${answersBlock}` : input.account,
    mode,
    responseLanguage: input.responseLanguage,
    jurisdiction,
    includeClarify: !input.skipClarify && !answersBlock,
    execution: input.execution,
  });
  const preflightCap = input.preflightCapUsd ?? capUsd;
  if (projected > preflightCap) {
    throw new CaseTooComplexError(mode, projected, preflightCap, modeThatWouldFit(projected, mode));
  }

  // ---- gate: is anything genuinely missing?
  // Skipped once answers exist: asking again after the user has answered is the
  // interrogation loop this gate is meant to prevent.
  if (!input.skipClarify && !answersBlock) {
    const clarifySpec = modelFor(resolveConfiguration(DEFAULT_CONFIGURATION), "extract");
    const raw = await stage(
      transport,
      ledger,
      "clarify",
      clarifySpec,
      clarifyPrompt(sentinel, language, jurisdiction),
      fence("ACCOUNT", input.account, sentinel),
      CLARIFY_SCHEMA as unknown as { name: string; schema: Record<string, unknown> },
      input.execution?.reasoning?.clarify,
      input.execution?.maxJsonRetries
    );
    const gate = validateClarify(raw);
    if (!gate.ready) return { kind: "questions", questions: gate.questions, ledger };
  }

  // ---- private analysis
  const configId = input.execution?.analysisConfigurationId ?? ANALYSIS_CONFIG[mode];
  let analysis: CaseAnalysis | null = null;
  let brief: AnalysisBrief | null = null;
  let problems: string[] = [];
  let warnings: SanitationWarning[] = [];

  if (configId) {
    const caseInput = {
      ...input,
      // Answers are part of the case from here on.
      account: answersBlock ? `${input.account}\n\nУточнения:\n${answersBlock}` : input.account,
      configurationId: configId,
      ledger,
      // The whole-turn preflight above owns complexity refusal, and already
      // used `input.preflightCapUsd ?? capUsd` — the nested engine must use
      // the SAME cap, not silently re-narrow it back to the base mode's
      // nominal tier. For ordinary product usage the two are numerically
      // identical (the caller's remaining budget starts as capFor(mode)
      // anyway), so this only changes behavior when a manual preset's own
      // capUsd differs from the mode's nominal cap — exactly the case a
      // Premium preset with real reasoning cost needs.
      preflightCapUsd: input.preflightCapUsd ?? capUsd,
    };
    const engine = mode === "strong"
      ? await runStrong(caseInput, transport)
      : await runCase(
      {
        ...caseInput,
      },
      transport
    );
    analysis = engine.analysis;
    brief = buildBrief(engine.analysis);
    problems = engine.problems;
    warnings = engine.warnings;
  }

  // ---- the adviser
  const defaultFinal = resolveConfiguration(DEFAULT_CONFIGURATION);
  const finalConfig = input.execution?.finalModelKey
    ? { ...defaultFinal, id: "manual-final", roles: { ...defaultFinal.roles, strategise: input.execution.finalModelKey } }
    : defaultFinal;
  const finalSpec = modelFor(finalConfig, "strategise");
  const answer = await textStage(
    transport,
    ledger,
    "final",
    finalSpec,
    finalPrompt(sentinel, language, jurisdiction, brief !== null),
    finalUserMessage(input.account, answersBlock, brief ? renderBrief(brief) : null, sentinel),
    input.execution?.reasoning?.final,
    input.execution?.maxOutputTokens?.final
  );

  const narrative = checkNarrative(answer);
  problems.push(...narrative.problems);

  return { kind: "answer", answer, brief, analysis, problems, warnings, ledger };
}

/**
 * One follow-up turn on an answer already given.
 *
 * Its own small budget: a follow-up is one call and must never be able to spend
 * a whole case's worth of money because somebody clicked twice.
 */
export async function runFollowUp(
  input: {
    account: string;
    previousAnswer: string;
    action: FollowUpAction;
    excerpt?: string;
    responseLanguage?: ResponseLanguage;
    jurisdiction?: Jurisdiction;
    ledger?: CostLedger;
  },
  transport: Transport
): Promise<{ answer: string; ledger: CostLedger }> {
  const ledger = input.ledger ?? new CostLedger("quick", MODES.light.capUsd);
  const sentinel = randomBytes(4).toString("hex");
  const language = resolveLanguage(input.responseLanguage ?? "auto", input.account);
  const jurisdiction = input.jurisdiction ?? { country: "unknown" as const };
  const spec = modelFor(resolveConfiguration(DEFAULT_CONFIGURATION), "strategise");

  const answer = await textStage(
    transport,
    ledger,
    "final",
    spec,
    followUpPrompt(input.action, sentinel, language, jurisdiction),
    followUpUserMessage(input.account, input.previousAnswer, input.excerpt ?? null, sentinel)
  );
  return { answer, ledger };
}
