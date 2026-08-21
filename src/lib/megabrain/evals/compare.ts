import { createHash } from "node:crypto";
import type { Transport } from "../transport";
import { CostLedger, type CaseMode } from "../costLedger";
import { MODELS } from "../modelRouter";

/**
 * Blind pairwise comparison.
 *
 * The only place a model is asked for an opinion, and the only grader that costs
 * money. Everything measurable is measured deterministically in graders.ts;
 * "which of these two is more useful" genuinely is not, so it is done here,
 * carefully, and kept separate so it can be inspected and switched off.
 *
 * BLIND MEANS BLIND, and it takes three things, not one:
 *   1. the judge never learns which system produced which answer;
 *   2. the side each answer appears on is decided by a hash of the case id, so
 *      it is stable across runs but not always the same side — position bias in
 *      LLM judges is large and consistent, and always putting the new system
 *      second would quietly manufacture a result;
 *   3. structural giveaways are stripped. The engine's rendered output has
 *      headed sections and the baseline's does not, so a judge could identify
 *      it by shape alone and reward format rather than substance.
 */

export type Side = "A" | "B";

export interface ComparisonRequest {
  caseId: string;
  account: string;
  engineAnswer: string;
  baselineAnswer: string;
}

export interface ComparisonResult {
  caseId: string;
  /** Which system the judge preferred, after unblinding. */
  winner: "engine" | "baseline" | "tie";
  reason: string;
  engineSide: Side;
}

/**
 * Stable but varying assignment. A hash of the case id, so a rerun of the same
 * case puts the same system on the same side — otherwise a difference between
 * two runs could be position noise rather than a real change.
 */
export function sideForEngine(caseId: string): Side {
  const h = createHash("sha256").update(caseId).digest();
  return h[0] % 2 === 0 ? "A" : "B";
}

/**
 * Section headings and machine labels the renderer emits and free prose never
 * would. Stripping bullets alone was not enough: an earlier version left
 * "Конкурирующие версии:", "Рычаги:" and "[strong_negotiation]" in the text, so
 * the judge could identify the engine by shape and reward format instead of
 * substance — which is exactly what a blind comparison exists to prevent.
 */
const ENGINE_HEADINGS = [
  "Конкурирующие версии:",
  "Рычаги:",
  "Точные слова:",
  "Чего не говорить:",
  "Если/то:",
  "Что сделает другая сторона:",
  "Сигналы остановиться:",
  "Рекомендуемый ход:",
  "Запасной план:",
  "Что ещё неизвестно и меняет вывод:",
];

/** `[informational]`, `[strong_negotiation]` — enum values leaking into prose. */
const KIND_LABEL = /\[(?:informational|procedural|reputational|temporal|coalition|economic|status|emotional|batna|exit|low_risk|fast|strong_negotiation|unconventional|exit_contingency)\]\s*/g;

/**
 * Remove format tells. Not content — only the scaffolding that identifies the
 * producer. Headings become sentences, machine labels are dropped, bullets and
 * blank-line runs are normalised; the words themselves are left as written.
 */
export function stripFormatTells(text: string): string {
  let out = text.replace(KIND_LABEL, "");
  for (const h of ENGINE_HEADINGS) out = out.split(h).join("");
  return out
    .split("\n")
    .map((l) => l.replace(/^\s*[-*•]\s+/, "").replace(/^\s*#+\s*/, "").trimEnd())
    .filter((l, i, arr) => !(l === "" && arr[i - 1] === ""))
    .join("\n")
    .trim();
}

/** Exported so a test can assert the judge prompt carries none of them. */
export const STRUCTURAL_TELLS = [...ENGINE_HEADINGS, "[informational]", "[strong_negotiation]"];

const JUDGE_SYSTEM = `Ты оцениваешь два ответа на одну и ту же реальную трудную
ситуацию. Не знаешь и не пытайся угадать, кто их написал.

Критерий один: какой ответ реально полезнее человеку, который завтра пойдёт и
будет это делать. Полезнее — значит:
- отделяет проверенное от предположений и не выдумывает фактов;
- предлагает конкретный первый ход, а не тему для размышления;
- даёт слова, которые можно произнести;
- предвидит, что сделает другая сторона;
- честен насчёт риска и необратимости;
- не сводится к «поговорите спокойно и обратитесь к специалисту».

Длина сама по себе не достоинство. Структура сама по себе не достоинство.
Если один ответ длиннее, но не даёт ничего, что можно сделать, он хуже.

Ответь строго JSON: {"winner":"A"|"B"|"tie","reason":"одно предложение"}`;

export interface JudgeDeps {
  transport: Transport;
  /** Judge model key from MODELS. A different family from the systems judged. */
  modelKey?: string;
  ledger?: CostLedger;
  mode?: CaseMode;
}

export async function compareBlind(
  req: ComparisonRequest,
  deps: JudgeDeps
): Promise<ComparisonResult> {
  const engineSide = sideForEngine(req.caseId);
  const engine = stripFormatTells(req.engineAnswer);
  const baseline = stripFormatTells(req.baselineAnswer);
  const a = engineSide === "A" ? engine : baseline;
  const b = engineSide === "A" ? baseline : engine;

  const modelKey = deps.modelKey ?? "grok-4.3";
  const spec = MODELS[modelKey];
  if (!spec) throw new Error(`Unknown judge model "${modelKey}".`);

  const user = [
    "СИТУАЦИЯ:",
    req.account,
    "",
    "ОТВЕТ A:",
    a,
    "",
    "ОТВЕТ B:",
    b,
  ].join("\n");

  const ledger = deps.ledger ?? new CostLedger(deps.mode ?? "standard");
  const { projectedUsd } = ledger.reserve("judge", spec, JUDGE_SYSTEM + user, 200);
  const result = await deps.transport({
    modelSlug: spec.slug,
    system: JUDGE_SYSTEM,
    user,
    maxOutputTokens: 200,
    temperature: 0,
    maxPrice: { promptPerMTok: spec.inputPerMTok, completionPerMTok: spec.outputPerMTok },
  });
  ledger.record({
    stage: "judge",
    spec,
    usage: result.usage,
    latencyMs: result.latencyMs,
    telemetry: result.telemetry,
    reservedUsd: projectedUsd,
  });

  let verdict: { winner?: string; reason?: string } = {};
  try {
    const m = /\{[\s\S]*\}/.exec(result.content);
    verdict = m ? JSON.parse(m[0]) : {};
  } catch {
    /* an unparseable judgement is a tie, not a win for anyone */
  }

  const picked = verdict.winner === "A" || verdict.winner === "B" ? verdict.winner : "tie";
  const winner =
    picked === "tie" ? "tie" : picked === engineSide ? "engine" : "baseline";

  return {
    caseId: req.caseId,
    winner,
    reason: typeof verdict.reason === "string" ? verdict.reason.slice(0, 300) : "",
    engineSide,
  };
}

export interface ComparisonSummary {
  total: number;
  engineWins: number;
  baselineWins: number;
  ties: number;
  /** Ties count as half, so a judge that hedges cannot inflate the win rate. */
  engineWinRate: number;
  passesThreshold: boolean;
  /** Sanity check: if every win landed on one side, suspect position bias. */
  enginePositionSplit: { A: number; B: number };
}

export const WIN_RATE_THRESHOLD = 0.65;

export function summariseComparisons(results: ComparisonResult[]): ComparisonSummary {
  const engineWins = results.filter((r) => r.winner === "engine").length;
  const baselineWins = results.filter((r) => r.winner === "baseline").length;
  const ties = results.filter((r) => r.winner === "tie").length;
  const total = results.length;
  const engineWinRate = total ? (engineWins + ties * 0.5) / total : 0;
  return {
    total,
    engineWins,
    baselineWins,
    ties,
    engineWinRate,
    passesThreshold: engineWinRate >= WIN_RATE_THRESHOLD,
    enginePositionSplit: {
      A: results.filter((r) => r.engineSide === "A").length,
      B: results.filter((r) => r.engineSide === "B").length,
    },
  };
}
