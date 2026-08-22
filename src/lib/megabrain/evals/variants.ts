import type { Transport } from "../transport";
import { CostLedger } from "../costLedger";
import { runAdvice, runBaseline } from "../engine";
import { capFor } from "../analysisMode";

/**
 * The three things being compared, and the rule for reading the comparison.
 *
 * A. strong one-shot — the same quality prompt, one call, no analysis.
 * B. the old Megabrain — three stages, structured report rendered to the user.
 * C. the new pipeline — clarification gate, private analysis, final strategist.
 *
 * WHAT COUNTS AS WINNING, stated here because the previous benchmark got this
 * wrong: not the presence of structural fields. B scores perfectly on structure
 * and lost to A anyway. The judged qualities are practical usability, the
 * quality of the exact words, factual discipline, the countermove, whether it
 * is non-obvious, whether it avoids banality, and whether it reads like a person
 * — plus cost and latency reported alongside, never folded into the score.
 */

export type VariantId = "A" | "B" | "C";

export interface VariantAnswer {
  variant: VariantId;
  /** The prose a reader would judge. For B this is the rendered report. */
  text: string;
  costUsd: number;
  latencyMs: number;
  calls: number;
  /** Set when the variant could not produce an answer at all. */
  failure?: string;
}

/**
 * Run one variant on one account.
 *
 * Each gets its OWN ledger at the mode cap, so a comparison cannot be won on
 * budget: whichever spends less does so because it needed less, not because it
 * was given less.
 */
export async function runVariant(
  variant: VariantId,
  account: string,
  deps: {
    transport: Transport;
    renderAnalysis: (a: never) => string;
    runCase: (input: never, t: Transport) => Promise<{ analysis: never; ledger: CostLedger }>;
  }
): Promise<VariantAnswer> {
  const cap = capFor("standard");
  const ledger = new CostLedger("standard", cap);
  const started = Date.now();

  try {
    if (variant === "A") {
      const base = await runBaseline({ account, ledger }, deps.transport);
      return finish("A", base.answer, ledger, started);
    }
    if (variant === "B") {
      const engine = await deps.runCase({ account, ledger } as never, deps.transport);
      return finish("B", deps.renderAnalysis(engine.analysis), ledger, started);
    }
    // C skips the gate on purpose: the comparison is of ANSWERS, and a variant
    // that returns questions instead of an answer cannot be judged against two
    // that answered. The gate is measured separately, on whether it fires.
    const out = await runAdvice(
      { account, analysisMode: "standard", ledger, skipClarify: true },
      deps.transport
    );
    if (out.kind !== "answer") return finish("C", "", ledger, started, "gate asked instead of answering");
    return finish("C", out.answer, ledger, started);
  } catch (e) {
    return finish(variant, "", ledger, started, e instanceof Error ? e.name : "Error");
  }
}

function finish(
  variant: VariantId,
  text: string,
  ledger: CostLedger,
  started: number,
  failure?: string
): VariantAnswer {
  return {
    variant,
    text,
    costUsd: ledger.reportedSpendUsd,
    latencyMs: Date.now() - started,
    calls: ledger.allDeep().filter((e) => !e.stoppedByBudgetGuard).length,
    ...(failure ? { failure } : {}),
  };
}

/**
 * Assign display labels so the reader cannot tell which variant is which.
 *
 * Deterministic from the case id, so a rerun shows the same arrangement and a
 * judgement can be checked afterwards — but not ordered A, B, C, which would
 * make the mapping obvious after the first case.
 */
export function blindOrder(caseId: string, variants: VariantId[]): VariantId[] {
  let h = 2166136261;
  for (let i = 0; i < caseId.length; i++) {
    h ^= caseId.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  const out = [...variants];
  // Fisher-Yates driven by the hash: no clock, no Math.random.
  for (let i = out.length - 1; i > 0; i--) {
    h = Math.imul(h ^ (h >>> 13), 16777619);
    const j = Math.abs(h) % (i + 1);
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/** The criteria a human reader is asked to apply, in order of weight. */
export const JUDGING_CRITERIA = [
  "практическая применимость: можно ли действовать по этому завтра",
  "качество точных слов: можно ли отправить их как есть",
  "фактическая дисциплина: не выдано ли толкование за факт, нет ли выдуманных деталей",
  "контрход: назван ли правдоподобный ответ другой стороны и что с ним делать",
  "нестандартность: есть ли ход, который человек сам бы не придумал",
  "отсутствие банальности",
  "естественность текста: читается ли как советник, а не как отчёт",
] as const;
