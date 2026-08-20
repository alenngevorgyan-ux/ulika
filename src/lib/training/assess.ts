import { chatComplete } from "../ai/provider";
import type { DepthLayer } from "../knowledge/router";

export type Grasp = "struggling" | "partial" | "solid";

export interface ResponseRecord {
  skill_id: string;
  prompt: string | null;
  response: string;
  created_at: string;
}

export interface Assessment {
  grasp: Grasp;
  /** What to do next, decided from grasp — not from elapsed time. */
  action: "repeat_core_differently" | "advance_depth" | "increase_pace" | "hold";
  nextDepth: DepthLayer | null;
  reason: string;
}

/**
 * Cheap structural signals, computed before any model call.
 *
 * Exported and pure so the review logic can be checked against fixture data
 * without a model or a database, which is what the brief asked for.
 */
export function structuralSignals(responses: ResponseRecord[]) {
  if (responses.length === 0) {
    return { count: 0, medianWords: 0, allShort: false, anySubstantive: false };
  }
  const wordCounts = responses.map((r) => r.response.trim().split(/\s+/).filter(Boolean).length);
  const sorted = [...wordCounts].sort((a, b) => a - b);
  const medianWords = sorted[Math.floor(sorted.length / 2)];

  return {
    count: responses.length,
    medianWords,
    // "ok", "yes", "done", "got it" — engagement theatre rather than retrieval.
    allShort: wordCounts.every((w) => w <= 4),
    anySubstantive: wordCounts.some((w) => w >= 25),
  };
}

const ASSESS_PROMPT = `You judge whether someone has actually grasped what they just practised. You output JSON only. You are not encouraging and not harsh — you are accurate.

Read their written answers to training prompts.

Return exactly:
{"grasp": "struggling" | "partial" | "solid", "reason": "<one sentence, concrete>"}

struggling - evasive, restates the question, describes what they were told rather than what they did, says it did not work without detail, or answers something adjacent to what was asked.
partial - engaged and honest but thin, or shows the idea half-applied, or reports doing it without reporting what happened.
solid - specific, gives their own example or their own material, notices something the prompt did not hand them, or reports a concrete result including a concrete failure.

A short answer is not automatically struggling. "The image with the piano fell apart, the others held" is short and solid. Length is not the signal; specificity is.
A long answer is not automatically solid. Restating the lesson at length is struggling.
Reporting a genuine failure with detail is solid, not struggling. Noticing what went wrong IS the learning.`;

/**
 * Decide what a track should do next, from what the learner actually wrote.
 *
 * Replaces the old rule, which advanced or nagged based on days elapsed. Time
 * says nothing about whether anything landed; a fortnight of silence after a
 * solid answer and after a blank one mean opposite things.
 */
export async function assessResponses(
  responses: ResponseRecord[],
  currentDepth: DepthLayer = "core"
): Promise<Assessment> {
  const signals = structuralSignals(responses);

  if (signals.count === 0) {
    return {
      grasp: "partial",
      action: "hold",
      nextDepth: null,
      reason: "Nothing written back yet, so there is nothing to judge.",
    };
  }

  // One-word answers across the board need no model call to interpret.
  if (signals.allShort && !signals.anySubstantive) {
    return {
      grasp: "struggling",
      action: "repeat_core_differently",
      nextDepth: "core",
      reason: "Every answer is a couple of words, which is acknowledgement rather than recall.",
    };
  }

  let grasp: Grasp = "partial";
  let reason = "Engaged, but not enough to move on confidently.";

  try {
    const { message } = await chatComplete(
      [
        { role: "system", content: ASSESS_PROMPT },
        {
          role: "user",
          content: responses
            .slice(-5)
            .map((r) => `PROMPT: ${r.prompt ?? "(none)"}\nANSWER: ${r.response}`)
            .join("\n\n"),
        },
      ],
      { temperature: 0, model: "google/gemini-3.1-flash-lite" }
    );

    const raw = (message.content ?? "").trim();
    const start = raw.indexOf("{");
    const end = raw.lastIndexOf("}");
    if (start !== -1) {
      const parsed = JSON.parse(raw.slice(start, end + 1));
      if (["struggling", "partial", "solid"].includes(parsed?.grasp)) grasp = parsed.grasp;
      if (typeof parsed?.reason === "string") reason = parsed.reason;
    }
  } catch {
    // Classifier unavailable: hold rather than guess. Advancing someone who
    // has not understood the layer below is the expensive mistake here.
  }

  return { grasp, ...decide(grasp, currentDepth), reason };
}

/** Pure decision table, separated so it can be checked on its own. */
export function decide(
  grasp: Grasp,
  currentDepth: DepthLayer
): { action: Assessment["action"]; nextDepth: DepthLayer | null } {
  if (grasp === "struggling") {
    return { action: "repeat_core_differently", nextDepth: "core" };
  }
  if (grasp === "partial") {
    return { action: "hold", nextDepth: currentDepth };
  }
  // solid
  if (currentDepth === "core") return { action: "advance_depth", nextDepth: "deepening" };
  if (currentDepth === "deepening") return { action: "advance_depth", nextDepth: "mastery" };
  return { action: "increase_pace", nextDepth: "mastery" };
}
