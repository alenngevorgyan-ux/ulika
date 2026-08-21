import type { InteractionEvent, StoredEvent } from "./events";

/**
 * CaseState is DERIVED, never edited directly.
 *
 * The event log is the source of truth; this is a pure fold over it. That
 * choice buys the retrospective for free — replaying a prefix of the log gives
 * the state as it was at any earlier point, which is exactly what "what did
 * you think at the start" needs, without a separate snapshot mechanism or a
 * version-history feature.
 *
 * Pure and dependency-free so it can be tested without a database or a model.
 */

export interface Evidence {
  id: string;
  excerpt: string;
  pinnedAt: string;
  dismissed: boolean;
}

export interface Hypothesis {
  id: string;
  claim: string;
  supports: string[];
  contradicts: string[];
  wouldChangeMind: string;
  committedAt: string;
  /** Set when a later hypothesis replaces this one. Old versions never vanish. */
  supersededBy?: string;
}

export interface Prediction {
  id: string;
  claim: string;
  confidence: number;
  createdAt: string;
  outcome?: { description: string; recordedAt: string };
}

export interface CaseState {
  version: number;
  status: "open" | "inquiry" | "reassessment" | "closed";
  evidence: Evidence[];
  hypotheses: Hypothesis[];
  predictions: Prediction[];
  /** blockId -> itemIndex -> checked */
  checklists: Record<string, Record<number, boolean>>;
  /** blockId -> index -> answer */
  answers: Record<string, Record<number, string>>;
  /** blockId -> the user's own number, recorded before any reveal */
  confidence: Record<string, number>;
  choices: Record<string, string>;
}

export function emptyCase(): CaseState {
  return {
    version: 0,
    status: "open",
    evidence: [],
    hypotheses: [],
    predictions: [],
    checklists: {},
    answers: {},
    confidence: {},
    choices: {},
  };
}

function applyOne(state: CaseState, e: InteractionEvent, at: string): CaseState {
  const next: CaseState = { ...state, version: state.version + 1 };

  switch (e.type) {
    case "EVIDENCE_PINNED": {
      const existing = next.evidence.find((x) => x.id === e.evidenceId);
      next.evidence = existing
        ? next.evidence.map((x) =>
            x.id === e.evidenceId ? { ...x, dismissed: false, excerpt: e.excerpt } : x
          )
        : [...next.evidence, { id: e.evidenceId, excerpt: e.excerpt, pinnedAt: at, dismissed: false }];
      return next;
    }

    case "EVIDENCE_DISMISSED":
      // Marked, not deleted. A retrospective needs to be able to show that a
      // piece of evidence was considered and then set aside.
      next.evidence = next.evidence.map((x) =>
        x.id === e.evidenceId ? { ...x, dismissed: true } : x
      );
      return next;

    case "HYPOTHESIS_COMMITTED": {
      // A new hypothesis supersedes the live one rather than overwriting it.
      // This is what makes "your first read was X and you stayed near it"
      // answerable without building a separate version-history feature.
      const live = next.hypotheses.filter((h) => !h.supersededBy);
      next.hypotheses = next.hypotheses.map((h) =>
        live.includes(h) ? { ...h, supersededBy: e.hypothesisId } : h
      );
      next.hypotheses = [
        ...next.hypotheses,
        {
          id: e.hypothesisId,
          claim: e.claim,
          supports: e.supports,
          contradicts: e.contradicts,
          wouldChangeMind: e.wouldChangeMind,
          committedAt: at,
        },
      ];
      next.status = "inquiry";
      return next;
    }

    case "PREDICTION_MADE":
      next.predictions = [
        ...next.predictions,
        { id: e.predictionId, claim: e.claim, confidence: e.confidence, createdAt: at },
      ];
      return next;

    case "OUTCOME_RECORDED":
      next.predictions = next.predictions.map((p) =>
        p.id === e.predictionId
          ? { ...p, outcome: { description: e.description, recordedAt: at } }
          : p
      );
      next.status = "reassessment";
      return next;

    case "CHECKLIST_TOGGLED":
      next.checklists = {
        ...next.checklists,
        [e.blockId]: { ...(next.checklists[e.blockId] ?? {}), [e.itemIndex]: e.checked },
      };
      return next;

    case "QUESTION_ANSWERED":
      next.answers = {
        ...next.answers,
        [e.blockId]: { ...(next.answers[e.blockId] ?? {}), [e.index]: e.answer },
      };
      return next;

    case "CONFIDENCE_SUBMITTED":
      next.confidence = { ...next.confidence, [e.blockId]: e.value };
      return next;

    case "CHOICE_SELECTED":
      next.choices = { ...next.choices, [e.blockId]: e.choiceId };
      return next;

    case "CASE_CLOSED":
      next.status = "closed";
      return next;
  }
}

/** Fold the log into current state. */
export function deriveCase(events: StoredEvent[]): CaseState {
  return events
    .slice()
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
    .reduce((s, ev) => applyOne(s, ev.event, ev.createdAt), emptyCase());
}

/** State as of a point in time — the retrospective's "what you thought then". */
export function deriveCaseAt(events: StoredEvent[], isoTime: string): CaseState {
  return deriveCase(events.filter((e) => e.createdAt <= isoTime));
}

/**
 * Deterministic calibration. Code computes this, never the model.
 *
 * Mean absolute error between stated confidence and outcome, where an outcome
 * exists. Returns null below three resolved predictions rather than a number
 * from a sample too small to mean anything — showing "100% calibrated" after
 * one lucky guess would teach the opposite of the lesson.
 */
export function calibration(
  state: CaseState
): { resolved: number; pending: number; meanAbsError: number | null } {
  const resolved = state.predictions.filter((p) => p.outcome);
  const pending = state.predictions.length - resolved.length;

  // meanAbsError stays null on purpose. Scoring confidence against an outcome
  // needs the outcome to carry an explicit correct/incorrect signal, and
  // OUTCOME_RECORDED currently carries only a description. Inferring
  // correctness from that description would be the model doing arithmetic's
  // job, which is the one thing this layer exists to prevent. The field is
  // here so the shape does not change when the signal arrives.
  //
  // Three is also the floor below which a number would be theatre: "100%
  // calibrated" after one lucky guess teaches the opposite of the lesson.
  return { resolved: resolved.length, pending, meanAbsError: null };
}
