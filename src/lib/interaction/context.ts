import type { CaseState } from "./reducer";
import { calibration } from "./reducer";

/**
 * Compact the case into something worth spending tokens on.
 *
 * The raw log is the source of truth and must never go into a prompt — it
 * grows without bound and most of it is noise by the third turn. This produces
 * a bounded summary of what the model actually needs to not repeat itself and
 * not contradict what the user already did.
 *
 * Hard budget: nothing here should exceed roughly 600 tokens even on a long
 * case. Everything is capped by count, not by hope.
 */

const MAX_EVIDENCE = 8;
const MAX_ANSWERS = 6;
const ANSWER_CHARS = 200;

export function buildInteractionContext(state: CaseState): string {
  const parts: string[] = [];

  const live = state.evidence.filter((e) => !e.dismissed).slice(-MAX_EVIDENCE);
  if (live.length) {
    parts.push(
      `Evidence they have pinned:\n${live.map((e) => `- ${e.excerpt.slice(0, 160)}`).join("\n")}`
    );
  }

  const dismissed = state.evidence.filter((e) => e.dismissed).length;
  if (dismissed) {
    // Worth one line: something they considered and set aside is different
    // from something they never saw, and re-raising it reads as not listening.
    parts.push(`They have set aside ${dismissed} piece(s) of evidence as unhelpful.`);
  }

  const currentHypothesis = state.hypotheses.find((h) => !h.supersededBy);
  if (currentHypothesis) {
    parts.push(
      `Their current read: ${currentHypothesis.claim}` +
        (currentHypothesis.wouldChangeMind
          ? `\nThey said this would change their mind: ${currentHypothesis.wouldChangeMind}`
          : "")
    );
  }
  const superseded = state.hypotheses.filter((h) => h.supersededBy);
  if (superseded.length) {
    parts.push(
      `Earlier reads they have already moved past: ${superseded
        .map((h) => h.claim.slice(0, 80))
        .join("; ")}`
    );
  }

  const open = state.predictions.filter((p) => !p.outcome);
  if (open.length) {
    parts.push(
      `Unresolved predictions — do NOT ask for another prediction while these are open:\n${open
        .map((p) => `- ${p.claim} (they were ${p.confidence}% sure)`)
        .join("\n")}`
    );
  }

  const cal = calibration(state);
  if (cal.resolved > 0) {
    parts.push(`${cal.resolved} prediction(s) resolved, ${cal.pending} still open.`);
  }

  // Completed actions are the whole point of this layer: without them the
  // model asks someone to do a thing they already did, which is the fastest
  // way to make it feel like it is not listening.
  //
  // KNOWN LIMITATION — the model gets a COUNT, not the content. `ticked` builds
  // blockId#index references and only .length is used below, so the model is
  // told "they completed 2 actions" and cannot tell item A from item B. The
  // payload carries no item text and the server cannot resolve blockId back to
  // text, because no message is stored server-side. Audit §3.2.
  const ticked = Object.entries(state.checklists).flatMap(([blockId, items]) =>
    Object.entries(items)
      .filter(([, checked]) => checked)
      .map(([i]) => `${blockId}#${i}`)
  );
  if (ticked.length) {
    parts.push(
      `They have completed ${ticked.length} assigned action(s). Do not re-assign work they have already done; ask how it went instead.`
    );
  }

  const answers = Object.values(state.answers)
    .flatMap((byIndex) => Object.values(byIndex))
    .filter(Boolean)
    .slice(-MAX_ANSWERS);
  if (answers.length) {
    parts.push(
      `Answers they typed into earlier questions:\n${answers
        .map((a) => `- ${a.slice(0, ANSWER_CHARS)}`)
        .join("\n")}`
    );
  }

  const confidences = Object.values(state.confidence);
  if (confidences.length) {
    parts.push(
      `They have recorded their own confidence ${confidences.length} time(s); most recent ${confidences[confidences.length - 1]}%.`
    );
  }

  if (state.status !== "open") {
    parts.push(`Case status: ${state.status}.`);
  }

  if (parts.length === 0) return "";

  return `## What they have actually done in this case

This is recorded fact about their interactions, not something to infer. Refer to it naturally; never recite it back as a list.

${parts.join("\n\n")}`;
}
