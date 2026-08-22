import { MODE_CAPS } from "./costLedger";

/**
 * How much analysis to buy, as a product choice rather than a model choice.
 *
 * A user picks how hard the situation is; they do not pick a model slug. Slugs
 * change, get deprecated, and mean nothing to the person with a problem at
 * work. The mapping from mode to models is a server decision.
 */
export type AnalysisMode = "light" | "standard" | "strong" | "deep";

export interface ModeSpec {
  id: AnalysisMode;
  /** What the user is offered, per language. Not a model name. */
  label: { ru: string; en: string };
  /** Hard cap. Never raised by anything the client sends. */
  capUsd: number;
  /** Upper bound on model calls. Not a target; the engine may use fewer. */
  maxModelCalls: number;
  available: boolean;
  /** Why not, when not available. Shown to the user rather than a silent fallback. */
  unavailableReason?: string;
}

export const MODES: Record<AnalysisMode, ModeSpec> = {
  light: {
    id: "light",
    label: { ru: "Быстро", en: "Quick" },
    capUsd: 0.02,
    // One call. Not a shrunken pipeline — a different, smaller job.
    // Safety + clarification (one JSON retry) + final prose.
    maxModelCalls: 4,
    available: true,
  },
  standard: {
    id: "standard",
    label: { ru: "Разобрать", en: "Analyse" },
    capUsd: 0.05,
    // Safety + clarify + extract + merged analysis (one retry each) + final.
    maxModelCalls: 8,
    available: true,
  },
  strong: {
    id: "strong",
    label: { ru: "Сильный ход", en: "Strong move" },
    capUsd: 0.1,
    // Safety + clarify + three private stages (one retry each) + critic + final.
    maxModelCalls: 11,
    available: true,
  },
  deep: {
    id: "deep",
    label: { ru: "Глубокое дело", en: "Deep case" },
    capUsd: 0.15,
    maxModelCalls: 8,
    available: false,
    unavailableReason:
      "MODE_NOT_AVAILABLE — the deep pipeline is an interface only. It must never silently run Standard and report the result as Deep.",
  },
};

export class ModeNotAvailable extends Error {
  readonly code = "MODE_NOT_AVAILABLE";
  constructor(readonly mode: AnalysisMode) {
    super(MODES[mode].unavailableReason ?? `Mode "${mode}" is not available.`);
    this.name = "ModeNotAvailable";
  }
}

/**
 * The cap for a mode, and nothing a caller sends can raise it.
 *
 * A requested budget can only ever LOWER the ceiling. The Standard cap is also
 * clamped to the product-wide Standard limit, so a mode table edit cannot
 * quietly grant a case more than the product allows.
 */
export function capFor(mode: AnalysisMode, requestedUsd?: number): number {
  const modeCap = Math.min(MODES[mode].capUsd, MODE_CAPS.deep);
  return requestedUsd !== undefined && requestedUsd > 0
    ? Math.min(modeCap, requestedUsd)
    : modeCap;
}

export interface ModeRecommendation {
  recommended: AnalysisMode;
  reason: string;
  /** Never applied automatically. Upgrading to a paid tier is the user's call. */
  factors: string[];
}

/**
 * Suggest a mode. SUGGEST.
 *
 * Deliberately incapable of switching anything: a system that silently upgrades
 * a user to a more expensive tier because it judged their problem hard is
 * spending their money on its own opinion.
 */
export function recommendMode(input: {
  account: string;
  actorCountHint?: number;
  unknownsHint?: number;
  irreversibleHint?: boolean;
  retaliationHint?: boolean;
  legalUncertaintyHint?: boolean;
  wantsMultipleStrategies?: boolean;
}): ModeRecommendation {
  const factors: string[] = [];
  const len = input.account.trim().length;

  if (len > 900) factors.push("long account");
  if ((input.actorCountHint ?? 0) >= 3) factors.push("three or more people involved");
  if ((input.unknownsHint ?? 0) >= 4) factors.push("many unknowns");
  if (input.irreversibleHint) factors.push("a move that cannot be undone");
  if (input.retaliationHint) factors.push("risk of retaliation");
  if (input.legalUncertaintyHint) factors.push("legal uncertainty");
  if (input.wantsMultipleStrategies) factors.push("several strategies requested");

  if (factors.length >= 3) {
    return {
      recommended: "strong",
      reason: "Several things here reward a second pass over the plan.",
      factors,
    };
  }
  if (len < 220 && factors.length === 0) {
    return {
      recommended: "light",
      reason: "Short and self-contained — one good next move is probably enough.",
      factors,
    };
  }
  return { recommended: "standard", reason: "A full case frame is worth the cost here.", factors };
}
