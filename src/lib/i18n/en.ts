/**
 * English is canonical. This file is the source of truth for what keys exist —
 * every other locale is typed against it, so a missing Russian key is a
 * compile error rather than a string that quietly appears in English.
 *
 * WHAT BELONGS HERE: deterministic UI chrome only. Buttons, statuses, labels,
 * empty states, errors, accessibility text.
 *
 * WHAT DOES NOT: anything THE MENTALIST says. Observations, hypotheses,
 * questions, explanations and lessons are generated per conversation in the
 * user's own language. Putting them here would mean maintaining a dictionary
 * for text the model rewrites every time.
 */
export const EN = {
  // interaction controls
  "action.continue": "Continue",
  "action.back": "Back",
  "action.finish": "Finish",
  "action.send": "Send",
  "action.skip": "Skip",
  "action.dismiss": "Dismiss",
  "action.retry": "Try again",
  "action.open": "Open",
  "action.reveal": "Reveal",
  "action.commit": "Commit",
  "action.challenge": "Argue against this",
  "action.thatsWrong": "That's wrong",

  // evidence
  "evidence.pin": "Pin this",
  "evidence.remove": "Unpin",
  "evidence.tray": "Evidence",
  "evidence.empty": "Nothing pinned yet.",
  "evidence.grade": "Evidence grade {grade}",
  "evidence.source": "Where this came from",
  "evidence.fact": "Observed",
  "evidence.inference": "Concluded",

  // hypotheses
  "hypothesis.title": "What might be going on",
  "hypothesis.commit": "Commit to this one",
  "hypothesis.supports": "Supported by",
  "hypothesis.contradicts": "Contradicted by",
  "hypothesis.wouldChangeMind": "What would change your mind?",
  "hypothesis.superseded": "Replaced by a later read",

  // confidence
  "confidence.question": "How sure are you?",
  "confidence.commit": "Lock it in",
  "confidence.yours": "Your confidence",
  "confidence.locked": "Recorded before the answer",

  // case
  "case.open": "Open",
  "case.inquiry": "Inquiry",
  "case.reassessment": "Reassessment",
  "case.closed": "Closed",
  "case.unresolved": "{count} unresolved",

  // retrospective
  "retrospective.title": "Looking back",
  "retrospective.initialModel": "What you thought at the start",
  "retrospective.finalModel": "What you thought by the end",
  "retrospective.outcome": "What was actually observed",
  "retrospective.biggestUpdate": "The biggest change",
  "retrospective.missedEvidence": "What you didn't have",
  "retrospective.calibration": "How close your confidence was",

  // chat blocks
  "block.noticed": "What I noticed",
  "block.needToKnow": "What I need to know",
  "block.awayFromScreen": "Away from this screen",
  "block.drill": "Drill",
  "block.patternBefore": "This has come up before",
  "block.inDossier": "{subject} in your dossier",
  "block.sealedHint": "Open it when you're ready to do it.",
  "block.recorded": "Recorded.",
  "block.unknown": "This part didn't load.",

  // thinking
  "thinking.facts": "Looking at the facts",
  "thinking.questions": "Working out what's missing",
  "thinking.weighing": "Weighing it",
  "thinking.crisis": "One moment.",

  // states
  "state.loading": "Loading",
  "state.empty": "Nothing here yet.",
  "state.error": "Something went wrong.",
  "state.stale": "The case moved on since you opened this. Reload to catch up.",
  "state.offline": "Couldn't reach the server.",

  // feedback
  "feedback.question": "Was that any use?",
  "feedback.placeholder": "What was wrong with it? That's more useful than what was right.",
  "feedback.send": "Send it",
  "feedback.later": "Not now",
  "feedback.thanks": "Noted. That is genuinely useful.",

  // accessibility
  "a11y.checkbox": "Mark as done",
  "a11y.confidenceSlider": "Confidence from 0 to 100",
  "a11y.deleteItem": "Remove this",
  "a11y.openMenu": "Open menu",
  "a11y.closeMenu": "Close menu",
  "a11y.practiceRecord": "Practice record",
} as const;

export type TranslationKey = keyof typeof EN;
