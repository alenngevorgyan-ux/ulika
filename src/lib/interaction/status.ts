import type { InteractionEventType } from "./events";

/**
 * What is actually true about each interaction event, as data.
 *
 * This file exists because the same claim was made three times in prose and was
 * wrong all three times: a header comment said the vocabulary had nine shapes
 * when it had ten, another said block IDs were verified server-side when no
 * such code existed, and a migration comment said stale events were rejected
 * when no 409 path was ever written. Prose about state rots silently. A table
 * with a test behind it does not.
 *
 * Two independent axes, because collapsing them is how the overstatement
 * happened in the first place. "It is in the whitelist" and "a user can do it"
 * and "a test proves it works" are three different facts.
 *
 * `wiring` — can the shipped UI produce this event at all?
 *   wired    — some component calls onEvent with this type.
 *   reserved — the validator and reducer handle it, but nothing emits it.
 *              Reserved is not dead: the shape is fixed, stored events of this
 *              type would fold into CaseState correctly today. It only means
 *              no user can currently cause one.
 *
 * `coverage` — what the automated suite actually proves.
 *   round-trip — UI or HTTP call → database → reload → restored state.
 *   unit       — pure functions only (validator / reducer / context builder).
 *                Says nothing about the Route Handler, Supabase, RLS or dedupe.
 *   none       — not exercised by any test.
 *
 * NOTHING IS "round-trip" TODAY. The whole suite is pure-function unit tests;
 * there is no test that touches src/app/api/interaction/route.ts, a database,
 * or a rendered component. This part is provable from the repository.
 *
 * Reported separately, and NOT verifiable from this repository: a manual
 * CHECKLIST_TOGGLED round-trip was run against a hosted database on 2026-08-21
 * (commit 40ffa1a's message refers to it). No artifact of it was committed, so
 * it cannot be re-run or confirmed here. Treat it as an external report, not as
 * coverage — every row below is unverified end-to-end either way.
 *
 * Full reasoning: docs/interaction-engine-readiness-audit.md.
 */

export type EventWiring = "wired" | "reserved";
export type EventCoverage = "round-trip" | "unit" | "none";

export interface EventStatus {
  wiring: EventWiring;
  coverage: EventCoverage;
  /** What is genuinely proven, and by what. Not what it is meant to become. */
  note: string;
}

export const EVENT_STATUS: Record<InteractionEventType, EventStatus> = {
  CHECKLIST_TOGGLED: {
    wiring: "wired",
    coverage: "unit",
    note:
      "The only event any component emits (ReplyBlocks.tsx, Checklist). Unit-covered " +
      "across validator, dedupeKey, reducer and context builder. The context builder " +
      "reports only how MANY items were ticked, never which — see context.ts.",
  },
  EVIDENCE_PINNED: {
    wiring: "reserved",
    coverage: "unit",
    note:
      "First pin covered (as the setup for the dismiss test); context builder proven " +
      "bounded at 60 pins. The re-pin branch in reducer.ts — pinning an evidenceId " +
      "that already exists, which un-dismisses it and replaces the excerpt — is NOT " +
      "exercised by any test. No emitter. excerpt is client-supplied and unverifiable " +
      "against any message.",
  },
  EVIDENCE_DISMISSED: {
    wiring: "reserved",
    coverage: "unit",
    note: "Reducer marks rather than deletes; covered. No emitter.",
  },
  HYPOTHESIS_COMMITTED: {
    wiring: "reserved",
    coverage: "unit",
    note: "Reducer supersede chain covered. No emitter.",
  },
  PREDICTION_MADE: {
    wiring: "reserved",
    coverage: "unit",
    note:
      "dedupeKey returns null (appends) and the context builder blocks a second " +
      "prediction while one is open; both covered. No emitter.",
  },
  CASE_CLOSED: {
    wiring: "reserved",
    coverage: "unit",
    note: "Covered only via deriveCaseAt prefix replay. No emitter.",
  },
  CONFIDENCE_SUBMITTED: {
    wiring: "reserved",
    coverage: "unit",
    note:
      "Validator range rejection (0-100) is covered. The reducer branch is NOT " +
      "exercised by any test. No emitter.",
  },
  QUESTION_ANSWERED: {
    wiring: "reserved",
    coverage: "none",
    note:
      "Not referenced by any test. The Questions block keeps typed answers in local " +
      "useState and emits nothing, so answers are lost on reload and never reach the model.",
  },
  CHOICE_SELECTED: {
    wiring: "reserved",
    coverage: "none",
    note: "Not referenced by any test. No block type produces a choice yet.",
  },
  OUTCOME_RECORDED: {
    wiring: "reserved",
    coverage: "none",
    note:
      "Not referenced by any test. Also the only event keyed on predictionId rather " +
      "than blockId, so it has no dedupe key and would append on every submit.",
  },
};

/** Event types the shipped UI can actually produce. */
export const WIRED_EVENTS = (Object.keys(EVENT_STATUS) as InteractionEventType[])
  .filter((t) => EVENT_STATUS[t].wiring === "wired")
  .sort();
