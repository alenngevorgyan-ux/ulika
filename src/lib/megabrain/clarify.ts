import type { Jurisdiction, ResolvedLanguage } from "./schemas";
import { languageDirective } from "./language";

/**
 * The clarification gate: decide whether a question is worth asking BEFORE
 * spending on analysis.
 *
 * The bar is deliberately high and stated as a filter rather than an
 * encouragement: a question earns its place only if a different answer would
 * lead to a different first move. "Tell me more about the background" fails
 * that test, costs the user a turn, and buys nothing — which is exactly the
 * kind of question a model produces when asked politely for questions.
 *
 * The gate runs on the cheap model. It is a triage decision, not the analysis.
 */

export const MAX_QUESTIONS = 5;

export interface ClarifyOption {
  /** Short, tappable. Not a sentence. */
  label: string;
}

export interface ClarifyQuestion {
  id: string;
  question: string;
  /** 2-4 quick options. "Other" is added by the UI, never by the model. */
  options: ClarifyOption[];
  /** Why this changes the decision. Shown to nobody; used to police the bar. */
  decisionImpact: string;
}

export interface ClarifyResult {
  /** True when the next practical move can be chosen without asking anything. */
  ready: boolean;
  questions: ClarifyQuestion[];
}

export const CLARIFY_SCHEMA = {
  name: "clarification_gate",
  schema: {
    type: "object",
    additionalProperties: false,
    required: ["ready", "questions"],
    properties: {
      ready: {
        type: "boolean",
        description: "True when a sound next move can be chosen from what is already known.",
      },
      questions: {
        type: "array",
        description: `At most ${MAX_QUESTIONS}. Empty when ready is true.`,
        items: {
          type: "object",
          additionalProperties: false,
          required: ["question", "options", "decisionImpact"],
          properties: {
            question: { type: "string" },
            options: {
              type: "array",
              description: "Two to four short, tappable answers. No 'Other' — the interface adds it.",
              items: { type: "string" },
            },
            decisionImpact: {
              type: "string",
              description: "Name the two different moves the two different answers would lead to.",
            },
          },
        },
      },
    },
  },
} as const;

export function clarifyPrompt(sentinel: string, lang: ResolvedLanguage, jur: Jurisdiction): string {
  return `${languageDirective(lang)}

You are the intake stage of a strategy service. You do not analyse and you do
not advise here. You decide ONE thing: can a sound next move be chosen from what
this person has already told us, or is something genuinely missing?

Default to READY. Asking costs the user a turn, and most situations contain
enough to act on. Ask only when an answer would change WHAT WE WOULD TELL THEM
TO DO — not when it would merely make the picture fuller.

A question qualifies only if you can name two different answers leading to two
different first moves. If you cannot, drop it. Write that pair into
decisionImpact; it is the test, not decoration.

Never ask for:
- background, history or "more detail" in general
- how the person feels
- anything they have already said
- anything you could reasonably assume and flag as an assumption instead
- more than ${MAX_QUESTIONS} questions, ever

Each question gets two to four SHORT options someone can tap. Do not offer
"Other" — the interface adds it. Do not number them.

Jurisdiction context: ${jur.country === "unknown" ? "not stated" : jur.country}${jur.region ? `, ${jur.region}` : ""}.
Do not ask which country they are in unless the move genuinely turns on it.

Respond with JSON only, matching the requested schema.
Sentinel for this request: ${sentinel}`;
}

/** Validate a clarification reply. Refuses padding rather than trimming silently. */
export function validateClarify(raw: unknown): ClarifyResult {
  const o = (raw ?? {}) as Record<string, unknown>;
  const list = Array.isArray(o.questions) ? o.questions : [];

  const questions: ClarifyQuestion[] = [];
  list.slice(0, MAX_QUESTIONS).forEach((q, i) => {
    const c = (q ?? {}) as Record<string, unknown>;
    const question = typeof c.question === "string" ? c.question.trim() : "";
    const decisionImpact = typeof c.decisionImpact === "string" ? c.decisionImpact.trim() : "";
    const options = (Array.isArray(c.options) ? c.options : [])
      .filter((x): x is string => typeof x === "string")
      .map((x) => x.trim())
      .filter((x) => x.length > 0 && x.length <= 60)
      .slice(0, 4);

    // A question with no stated decision impact did not pass the bar the prompt
    // set, whatever it says about itself. Dropped rather than shown.
    if (!question || !decisionImpact || options.length < 2) return;
    questions.push({ id: `q${i + 1}`, question, options: options.map((label) => ({ label })), decisionImpact });
  });

  // `ready` is derived, not trusted: a reply claiming ready:false with no usable
  // question is ready, and one claiming ready:true while asking is asking.
  return { ready: questions.length === 0, questions };
}

/** Fold answers into a block the later stages read as part of the account. */
export function formatAnswers(
  questions: ClarifyQuestion[],
  answers: Record<string, string>
): string {
  const lines = questions
    .map((q) => {
      const a = (answers[q.id] ?? "").trim();
      return a ? `— ${q.question}\n  ${a}` : null;
    })
    .filter((l): l is string => l !== null);
  return lines.length ? lines.join("\n") : "";
}
