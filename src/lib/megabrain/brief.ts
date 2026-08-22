import type { CaseAnalysis } from "./schemas";

/**
 * Compact the internal analysis into a brief the final stage can read.
 *
 * WHAT CHANGED AND WHY. The old product handed the user the analysis itself:
 * a CaseFrame, an ActorMap, ten leverage kinds, three hypotheses with invented
 * percentages, five strategies with countermoves. It was complete, honest and
 * lost to a single well-prompted one-shot answer, because completeness is not
 * what someone in a hard situation needs at the moment they need it.
 *
 * So the analysis stops being the deliverable and becomes the STAFF WORK. This
 * function is the seam: everything the strategist may draw on, nothing it must
 * mention. Pure, deterministic, no model call.
 *
 * Two rules it enforces on the way out:
 *   - facts stay separated from readings, because the final answer must not
 *     present an interpretation as something that happened;
 *   - leverage and strategies that were found ABSENT or UNKNOWN are dropped
 *     rather than listed, since a candidate nobody can use is noise in a brief
 *     whose whole purpose is to let the strategist choose.
 */

export interface AnalysisBrief {
  /** Verbatim from the user, still labelled as testimony. */
  reportedFacts: string[];
  /** Readings the user or the analysis layered on. Never stated as fact. */
  interpretations: string[];
  /** Gaps that would change the move. */
  unknowns: string[];
  constraints: string[];
  stakes: string;
  /** Only actors we know something supported about. */
  actors: { label: string; notes: string[] }[];
  /** Competing readings worth holding, most-supported first. Bands, not numbers. */
  hypotheses: { claim: string; confidence?: string; test: string }[];
  /** Only what is actually available. */
  leverage: { kind: string; description: string; risk: string; reversibility: string }[];
  /** Candidate moves, with what the other side is expected to do. */
  moves: { kind: string; summary: string; risk: string; reversible: boolean; countermove?: string }[];
  /** The staff's recommendation. The final strategist may edit, not ignore, it. */
  recommendation: {
    conclusion: string;
    move: string;
    exactWords: { role: string; text: string; useWhen: string; doNotUseWhen: string }[];
    branches: { if: string; then: string; stopCondition: string }[];
    stopSignals: string[];
    fallback: string;
    uncertainty: string;
  };
  riskNotes: string[];
}

const AVAILABLE = new Set(["present"]);

export function buildBrief(a: CaseAnalysis): AnalysisBrief {
  const counterFor = (strategyKind: string): string | undefined =>
    a.countermoves.countermoves.find((c) => c.againstStrategy === strategyKind)?.likelyResponse;

  return {
    reportedFacts: a.frame.reportedFacts.map((f) => f.text),
    interpretations: a.frame.interpretations,
    unknowns: a.frame.unknowns,
    constraints: a.frame.constraints,
    stakes: a.frame.stakes,
    actors: a.actors.actors.map((actor) => ({
      label: actor.label,
      // Only supported claims travel. An "unknown" claim says nothing a
      // strategist can use, and repeating it invites the model to fill it in.
      notes: [...actor.goals, ...actor.fears, ...actor.dependencies, ...actor.likelyReactions]
        .filter((c) => c.basis !== "unknown")
        .map((c) => `${c.value}${c.basis === "inferred" ? " (вывод, не факт)" : ""}`),
    })),
    hypotheses: a.hypotheses.hypotheses.map((h) => ({
      claim: h.claim,
      ...(h.confidence ? { confidence: h.confidence } : {}),
      test: h.discriminatingTest,
    })),
    leverage: a.leverage.points
      .filter((p) => AVAILABLE.has(p.status))
      .map((p) => ({
        kind: p.kind,
        description: p.description,
        risk: p.risk,
        reversibility: p.reversibility,
      })),
    moves: a.strategies.strategies.map((s) => ({
      kind: s.kind,
      summary: s.summary,
      risk: s.risk,
      reversible: s.reversible,
      ...(counterFor(s.kind) ? { countermove: counterFor(s.kind) } : {}),
    })),
    recommendation: {
      conclusion: a.plan.conclusion,
      move: a.plan.recommendedMove,
      exactWords: a.plan.exactWords.map((p) => ({
        role: p.role,
        text: p.text,
        useWhen: p.useWhen,
        doNotUseWhen: p.doNotUseWhen,
      })),
      branches: a.plan.ifThenBranches.map((b) => ({
        if: b.if,
        then: b.then,
        stopCondition: b.stopCondition,
      })),
      stopSignals: a.plan.stopSignals,
      fallback: a.plan.fallbackPlan,
      uncertainty: a.plan.uncertainty,
    },
    riskNotes: [
      a.plan.riskAssessment.legalUncertainty,
      `Канал: ${a.plan.riskAssessment.proceduralChannel}`,
      `Риск ответного удара: ${a.plan.riskAssessment.retaliationRisk}`,
      a.plan.riskAssessment.jurisdictionKnown ? "" : "Юрисдикция не установлена.",
    ].filter((x) => typeof x === "string" && x.trim().length > 0),
  };
}

/** Serialise for the prompt. Compact on purpose: the brief is read, not admired. */
export function renderBrief(b: AnalysisBrief): string {
  return JSON.stringify(b);
}
