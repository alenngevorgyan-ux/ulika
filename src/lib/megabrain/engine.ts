import { randomBytes } from "node:crypto";
import { CostLedger, MODE_CAPS, type CaseMode } from "./costLedger";
import { modelFor, resolveConfiguration, type Configuration } from "./modelRouter";
import { EXTRACT_SCHEMA, ANALYSE_SCHEMA, STRATEGISE_SCHEMA } from "./jsonSchemas";
import { analysePrompt, baselinePrompt, extractPrompt, fence, strategisePrompt } from "./prompts";
import { parseJsonReply, type Transport } from "./transport";
import {
  validateActors,
  validateCountermoves,
  validateFrame,
  validateHypotheses,
  validateLeverage,
  validatePlan,
  validateStrategies,
  type CaseAnalysis,
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
}

export interface EngineResult {
  analysis: CaseAnalysis;
  ledger: CostLedger;
  configuration: Configuration;
  /** Non-fatal validator complaints, kept for the benchmark's quality report. */
  problems: string[];
}

/** Output ceilings per stage. Reserved against, not hoped for. */
export const MAX_OUTPUT_TOKENS = {
  extract: 1600,
  analyse: 2000,
  strategise: 3000,
  baseline: 1400,
} as const;

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

  for (let attempt = 0; attempt <= MAX_JSON_RETRIES; attempt++) {
    // Reservation happens per attempt: a retry costs real money and must be
    // charged against the same cap, or the guard is trivially defeated by one.
    ledger.reserve(name, spec, system + user, maxOutputTokens);

    const result = await transport({
      modelSlug: spec.slug,
      system,
      user,
      maxOutputTokens,
      jsonSchema,
      temperature: 0.6,
    });
    ledger.record({ stage: name, spec, usage: result.usage, latencyMs: result.latencyMs });

    const parsed = parseJsonReply(result.content);
    if (parsed !== null) return parsed;
  }
  throw new Error(`Stage "${name}" returned no parseable JSON after ${MAX_JSON_RETRIES + 1} attempts.`);
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
  const ledger = new CostLedger(mode, MODE_CAPS[mode]);
  const problems: string[] = [];
  const sentinel = randomBytes(4).toString("hex");
  const account = fence("ACCOUNT", input.account, sentinel);

  // ---- stage 1: extraction, on the cheap model
  const extractSpec = modelFor(configuration, "extract");
  const rawExtract = (await stage(
    transport,
    ledger,
    "extract",
    extractSpec,
    extractPrompt(sentinel),
    account,
    EXTRACT_SCHEMA
  )) as Record<string, unknown>;

  const frame = validateFrame(rawExtract.frame);
  const actors = validateActors(rawExtract.actors);
  problems.push(...frame.problems, ...actors.problems);
  if (!frame.value || !actors.value) throw new Error("Extraction produced no usable frame.");

  // ---- stage 2: hypotheses and leverage, on the strong model
  const analyseSpec = modelFor(configuration, "analyse");
  const analyseInput = JSON.stringify({ frame: frame.value, actors: actors.value });
  const rawAnalyse = (await stage(
    transport,
    ledger,
    "analyse",
    analyseSpec,
    analysePrompt(sentinel),
    analyseInput,
    ANALYSE_SCHEMA
  )) as Record<string, unknown>;

  const hypotheses = validateHypotheses(rawAnalyse.hypotheses);
  const leverage = validateLeverage(rawAnalyse.leverage);
  problems.push(...hypotheses.problems, ...leverage.problems);
  if (!hypotheses.value || !leverage.value) throw new Error("Analysis produced no usable output.");

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
    strategisePrompt(sentinel),
    strategiseInput,
    STRATEGISE_SCHEMA
  )) as Record<string, unknown>;

  const strategies = validateStrategies(rawPlan.strategies);
  const countermoves = validateCountermoves(rawPlan.countermoves);
  const plan = validatePlan(rawPlan.plan);
  problems.push(...strategies.problems, ...countermoves.problems, ...plan.problems);
  if (!strategies.value || !countermoves.value || !plan.value) {
    throw new Error("Strategy stage produced no usable plan.");
  }

  return {
    analysis: {
      frame: frame.value,
      actors: actors.value,
      hypotheses: hypotheses.value,
      leverage: leverage.value,
      strategies: strategies.value,
      countermoves: countermoves.value,
      plan: plan.value,
    },
    ledger,
    configuration,
    problems,
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
  const ledger = new CostLedger(mode, MODE_CAPS[mode]);
  const spec = modelFor(
    { id: "baseline", description: "", roles: { extract: modelKey, analyse: modelKey, strategise: modelKey } },
    "strategise"
  );
  const system = baselinePrompt();

  ledger.reserve("baseline", spec, system + input.account, MAX_OUTPUT_TOKENS.baseline);
  const result = await transport({
    modelSlug: spec.slug,
    system,
    user: input.account,
    maxOutputTokens: MAX_OUTPUT_TOKENS.baseline,
    temperature: 0.7,
  });
  ledger.record({ stage: "baseline", spec, usage: result.usage, latencyMs: result.latencyMs });
  return { answer: result.content, ledger };
}

/** Render an analysis as the prose a reader would judge, for blind comparison. */
export function renderAnalysis(a: CaseAnalysis): string {
  const lines: string[] = [];
  lines.push(a.plan.conclusion, "");
  if (a.plan.missingInformation.length) {
    lines.push("Что ещё неизвестно и меняет вывод:");
    lines.push(...a.plan.missingInformation.map((m) => `- ${m}`), "");
  }
  lines.push("Конкурирующие версии:");
  for (const h of a.hypotheses.hypotheses) {
    lines.push(`- ${h.claim} (${h.confidence}%). Как проверить: ${h.discriminatingTest}`);
  }
  lines.push("", "Рычаги:");
  for (const p of a.leverage.points.filter((x) => x.availableToUser)) {
    lines.push(`- [${p.kind}] ${p.description}`);
  }
  lines.push("", `Рекомендуемый ход: ${a.plan.recommendedMove}`, "");
  lines.push("Точные слова:");
  lines.push(...a.plan.exactWords.map((w) => `- «${w}»`));
  if (a.plan.whatNotToSay.length) {
    lines.push("", "Чего не говорить:", ...a.plan.whatNotToSay.map((w) => `- ${w}`));
  }
  if (a.plan.branches.length) {
    lines.push("", "Если/то:", ...a.plan.branches.map((b) => `- Если ${b.condition} → ${b.then}`));
  }
  lines.push("", "Что сделает другая сторона:");
  for (const c of a.countermoves.countermoves) {
    lines.push(`- [${c.againstStrategy}] ${c.likelyResponse} Худший исход: ${c.worstPlausibleOutcome}`);
  }
  if (a.plan.stopSignals.length) {
    lines.push("", "Сигналы остановиться:", ...a.plan.stopSignals.map((s) => `- ${s}`));
  }
  lines.push("", `Запасной план: ${a.plan.fallbackPlan}`);
  lines.push(`Риск: ${a.plan.risk}. Неопределённость: ${a.plan.uncertainty}`);
  return lines.join("\n");
}
