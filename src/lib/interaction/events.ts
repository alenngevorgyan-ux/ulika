/**
 * Interaction events — the typed vocabulary of what a user can do to a block.
 *
 * Hand-rolled validation rather than a schema library. The vocabulary is nine
 * fixed shapes that change rarely; a library would add a runtime dependency to
 * a project that deliberately runs on five, to replace a function. Revisit if
 * this grows past ~20 event types or starts changing weekly.
 *
 * The validator is the SERVER'S whitelist. Anything not described here cannot
 * reach the reducer, which is what stops a compromised client — or a model
 * that decided to be creative — from writing arbitrary state.
 */

export type InteractionEvent =
  | { type: "EVIDENCE_PINNED"; blockId: string; evidenceId: string; excerpt: string }
  | { type: "EVIDENCE_DISMISSED"; blockId: string; evidenceId: string }
  | { type: "CONFIDENCE_SUBMITTED"; blockId: string; value: number }
  | { type: "CHOICE_SELECTED"; blockId: string; choiceId: string }
  | {
      type: "HYPOTHESIS_COMMITTED";
      blockId: string;
      hypothesisId: string;
      claim: string;
      supports: string[];
      contradicts: string[];
      wouldChangeMind: string;
    }
  | { type: "PREDICTION_MADE"; blockId: string; predictionId: string; claim: string; confidence: number }
  | { type: "OUTCOME_RECORDED"; predictionId: string; description: string }
  | { type: "QUESTION_ANSWERED"; blockId: string; index: number; answer: string }
  | { type: "CHECKLIST_TOGGLED"; blockId: string; itemIndex: number; checked: boolean }
  | { type: "CASE_CLOSED"; caseId: string };

export type InteractionEventType = InteractionEvent["type"];

/** Envelope as it travels over the wire and sits in the log. */
export interface StoredEvent {
  id: string;
  conversationId: string;
  event: InteractionEvent;
  /** The case version this was created against — see the staleness check. */
  caseVersion: number;
  createdAt: string;
}

// ---------------------------------------------------------------- validation

type Validator = (raw: Record<string, unknown>) => InteractionEvent | null;

const str = (v: unknown, max = 2000): string | null =>
  typeof v === "string" && v.trim() ? v.slice(0, max) : null;

const strArr = (v: unknown): string[] =>
  Array.isArray(v) ? v.filter((x) => typeof x === "string").slice(0, 50) : [];

const num = (v: unknown, min: number, max: number): number | null => {
  const n = Number(v);
  return Number.isFinite(n) && n >= min && n <= max ? n : null;
};

const VALIDATORS: Record<InteractionEventType, Validator> = {
  EVIDENCE_PINNED: (r) => {
    const blockId = str(r.blockId, 64);
    const evidenceId = str(r.evidenceId, 64);
    const excerpt = str(r.excerpt, 1000);
    return blockId && evidenceId && excerpt
      ? { type: "EVIDENCE_PINNED", blockId, evidenceId, excerpt }
      : null;
  },
  EVIDENCE_DISMISSED: (r) => {
    const blockId = str(r.blockId, 64);
    const evidenceId = str(r.evidenceId, 64);
    return blockId && evidenceId ? { type: "EVIDENCE_DISMISSED", blockId, evidenceId } : null;
  },
  CONFIDENCE_SUBMITTED: (r) => {
    const blockId = str(r.blockId, 64);
    const value = num(r.value, 0, 100);
    return blockId && value !== null
      ? { type: "CONFIDENCE_SUBMITTED", blockId, value }
      : null;
  },
  CHOICE_SELECTED: (r) => {
    const blockId = str(r.blockId, 64);
    const choiceId = str(r.choiceId, 64);
    return blockId && choiceId ? { type: "CHOICE_SELECTED", blockId, choiceId } : null;
  },
  HYPOTHESIS_COMMITTED: (r) => {
    const blockId = str(r.blockId, 64);
    const hypothesisId = str(r.hypothesisId, 64);
    const claim = str(r.claim, 500);
    return blockId && hypothesisId && claim
      ? {
          type: "HYPOTHESIS_COMMITTED",
          blockId,
          hypothesisId,
          claim,
          supports: strArr(r.supports),
          contradicts: strArr(r.contradicts),
          wouldChangeMind: str(r.wouldChangeMind, 500) ?? "",
        }
      : null;
  },
  PREDICTION_MADE: (r) => {
    const blockId = str(r.blockId, 64);
    const predictionId = str(r.predictionId, 64);
    const claim = str(r.claim, 500);
    const confidence = num(r.confidence, 0, 100);
    return blockId && predictionId && claim && confidence !== null
      ? { type: "PREDICTION_MADE", blockId, predictionId, claim, confidence }
      : null;
  },
  OUTCOME_RECORDED: (r) => {
    const predictionId = str(r.predictionId, 64);
    const description = str(r.description, 1000);
    return predictionId && description
      ? { type: "OUTCOME_RECORDED", predictionId, description }
      : null;
  },
  QUESTION_ANSWERED: (r) => {
    const blockId = str(r.blockId, 64);
    const index = num(r.index, 0, 50);
    const answer = str(r.answer, 4000);
    return blockId && index !== null && answer
      ? { type: "QUESTION_ANSWERED", blockId, index, answer }
      : null;
  },
  CHECKLIST_TOGGLED: (r) => {
    const blockId = str(r.blockId, 64);
    const itemIndex = num(r.itemIndex, 0, 50);
    return blockId && itemIndex !== null && typeof r.checked === "boolean"
      ? { type: "CHECKLIST_TOGGLED", blockId, itemIndex, checked: r.checked }
      : null;
  },
  CASE_CLOSED: (r) => {
    const caseId = str(r.caseId, 64);
    return caseId ? { type: "CASE_CLOSED", caseId } : null;
  },
};

/**
 * Validate an incoming event. Returns null for anything unrecognised, so the
 * caller cannot accidentally treat a rejected event as accepted by checking
 * for a thrown error that never comes.
 */
export function validateEvent(raw: unknown): InteractionEvent | null {
  if (!raw || typeof raw !== "object") return null;
  const obj = raw as Record<string, unknown>;
  const type = obj.type;
  if (typeof type !== "string" || !(type in VALIDATORS)) return null;
  return VALIDATORS[type as InteractionEventType](obj);
}

/**
 * Events that replace rather than accumulate.
 *
 * Ticking a checklist item twice should leave one row, not two, and the second
 * tick should win. Pinning evidence is likewise idempotent per evidence id.
 * Everything else appends, because a second prediction is a real second
 * prediction.
 */
export function dedupeKey(e: InteractionEvent): string | null {
  switch (e.type) {
    case "CHECKLIST_TOGGLED":
      return `${e.type}:${e.blockId}:${e.itemIndex}`;
    case "CONFIDENCE_SUBMITTED":
      return `${e.type}:${e.blockId}`;
    case "QUESTION_ANSWERED":
      return `${e.type}:${e.blockId}:${e.index}`;
    case "EVIDENCE_PINNED":
    case "EVIDENCE_DISMISSED":
      return `${e.type}:${e.blockId}:${e.evidenceId}`;
    default:
      return null;
  }
}
