import type { Jurisdiction, ResolvedLanguage } from "./schemas";
import { languageDirective } from "./language";
import { fence } from "./prompts";

/**
 * The five things people actually ask after reading advice, plus one for a
 * highlighted passage.
 *
 * A FIXED ALLOWLIST, not free text from the client. The action id selects a
 * server-held instruction; nothing the browser sends becomes part of the
 * prompt except the user's own account, their answers and the excerpt they
 * highlighted — all of which are fenced as untrusted.
 */
export const FOLLOW_UP_ACTIONS = {
  why: {
    label: { ru: "Почему именно так?", en: "Why this?" },
    instruction:
      "Explain the reasoning behind the move you recommended. What you weighed, what you rejected and why. Do not repeat the advice; explain it.",
  },
  stronger: {
    label: { ru: "Дай более сильный ход", en: "A stronger move" },
    instruction:
      "Give a more forceful version of the plan. Say plainly what it costs: what becomes harder to reverse, and what the other side can do that they could not before. Do not pretend the stronger move is free.",
  },
  other_side: {
    label: { ru: "Что ответит другая сторона?", en: "What will they do?" },
    instruction:
      "Take the other side's position seriously and in good faith. What do they most likely say and do, what would they consider unfair here, and where is their strongest point?",
  },
  draft_message: {
    label: { ru: "Составь сообщение", en: "Draft the message" },
    instruction:
      "Write the message itself, ready to send. Their voice, no throat-clearing, no legal theatre. Nothing in it that is not established by the account.",
  },
  what_we_got_wrong: {
    label: { ru: "Что мы могли понять неправильно?", en: "What might we have wrong?" },
    instruction:
      "Argue against your own advice. Which assumption is doing the most work, what would the situation look like if it were false, and what cheap observation would tell them which world they are in?",
  },
  explain_excerpt: {
    label: { ru: "Разобрать подробнее", en: "Go deeper on this" },
    instruction:
      "The user highlighted one passage of your answer. Go deeper on exactly that: what it means in practice, how to do it, and what to watch for. Do not restate the rest of the answer.",
  },
} as const;

export type FollowUpAction = keyof typeof FOLLOW_UP_ACTIONS;

export function isFollowUpAction(v: unknown): v is FollowUpAction {
  return typeof v === "string" && Object.prototype.hasOwnProperty.call(FOLLOW_UP_ACTIONS, v);
}

export function followUpPrompt(
  action: FollowUpAction,
  sentinel: string,
  lang: ResolvedLanguage,
  jur: Jurisdiction
): string {
  return `${languageDirective(lang)}

You are the same adviser, continuing the same conversation. You already gave
this person your advice; it is below. They have asked one follow-up.

${FOLLOW_UP_ACTIONS[action].instruction}

Same rules as before, and they still bind:
- No new facts, names, dates, amounts or provisions beyond the account, the
  answers and your own previous answer.
- An interpretation is not an event. Keep the wording that marks the difference.
- No internal structures, labels, scores or percentages.
- Prose, short and usable. No preamble, no offer to help further.
- Do not promise an outcome, and do not assert that a grey move is lawful when
  the jurisdiction is not established.

Jurisdiction: ${jur.country === "unknown" ? "not established" : jur.country}${jur.region ? `, ${jur.region}` : ""}.
Sentinel for this request: ${sentinel}`;
}

export function followUpUserMessage(
  account: string,
  previousAnswer: string,
  excerpt: string | null,
  sentinel: string
): string {
  const parts = [
    fence("ACCOUNT", account, sentinel),
    // Our own previous output. Fenced anyway: it was written from the user's
    // text and a fence costs nothing.
    fence("PREVIOUS_ANSWER", previousAnswer, sentinel),
  ];
  if (excerpt) parts.push(fence("HIGHLIGHTED", excerpt, sentinel));
  return parts.join("\n\n");
}
