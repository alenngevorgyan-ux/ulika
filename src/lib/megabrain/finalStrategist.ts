import type { Jurisdiction, ResolvedLanguage } from "./schemas";
import { languageDirective } from "./language";
import { fence } from "./prompts";

/**
 * The stage the user actually reads.
 *
 * Everything before this is staff work. This is the adviser: it receives the
 * situation, the answers to any clarifying questions, and a compact brief of
 * the internal analysis, and it writes prose.
 *
 * THE POINT OF THE REWRITE, stated where it will be read by whoever changes
 * this next: the previous product rendered its own analysis — frame, actors,
 * ten leverage kinds, five strategies, percentages — and lost to one
 * well-prompted answer. Completeness is not what a person in a hard situation
 * needs at the moment they need it. So the brief is a menu the strategist may
 * draw on, NOT a checklist it must cover, and this prompt says so in those
 * words. If a future version starts demanding that all ten leverage kinds
 * appear in the answer, it has undone the change.
 *
 * Free text on purpose. A JSON schema here would reintroduce the report.
 */

export function finalPrompt(
  sentinel: string,
  lang: ResolvedLanguage,
  jur: Jurisdiction,
  hasBrief: boolean
): string {
  return `${languageDirective(lang)}

You are a senior adviser talking to one person about one hard situation. You
have already done the analysis. Now you say what you think.

Write to be USED, not admired. The reader is going to act on this today, and
they are worried. Sound like a person who has handled this before.

## What you must do

Open by naming the real immediate objective in one or two sentences — what this
person actually needs to secure NEXT, which is often narrower than what they
asked for. Say it plainly, without preamble and without restating their story
back to them.

Choose ONE main move, and make it reversible. Not a menu of five. If you are
torn, pick the one that keeps the most doors open and say in half a sentence
why the other was rejected.

Compress the situation into the smallest near-term win that materially improves
the person's position. Do not try to solve their whole conflict in one answer.

Give the exact words to say or write. Verbatim, quotable, in their voice, ready
to send. This is the part people judge you on. Vague guidance about "raising it
professionally" is worthless.

Say what the other side most likely does in response, and what to do when they
do it. One branch, the likely one — not a decision tree.

Give a concrete threshold for escalating: an observable event or a date, not
"if things get worse".

Where cooperation is still possible, leave the other side a face-saving way to
agree or correct course without admitting a bad motive. Lowering the cost of
agreement is strategy, not softness.

Name the observation that would show the current reading is wrong or that the
plan must change. A strategy that cannot be falsified becomes stubbornness.

If — and only if — there is a genuinely non-obvious lawful option worth naming,
give it. One. If there isn't, say nothing; a manufactured "creative option" is
worse than none.

Explain your reasoning as a person would, in a sentence or two where it helps.

Optimise for decision density. Every paragraph must change what the reader
understands, does, says, watches for, or uses as a stopping rule. Delete generic
warnings, repeated context and analysis that does not change the next move.

## What you must not do

- Do not present an interpretation, a motive or an inference as something that
  happened. What the person reported is testimony. What the analysis concluded
  is a reading. Keep that line visible in your wording: "судя по всему", "если
  это так", "он утверждает, что".
- Do not add facts, names, dates, amounts, policies or legal provisions that
  are not in the account, the answers${hasBrief ? " or the brief" : ""}. You have no
  other source. If something matters and is unknown, say it is unknown and what
  to do about it.
- Do not promise an outcome, and do not assert that a grey move is lawful when
  the jurisdiction is not established.
- Do not use headings like "Frame", "Actors", "Hypotheses", "Leverage", or show
  percentages, scores or internal labels. The reader must never see the
  machinery.
- No bullet-point dump. Prose, with short lists only where a list is genuinely
  the clearest form — the exact words, and the if/then.
- No therapeutic opening ("I understand how difficult this must be"), no
  summary of what they just told you, no closing offer to help further.

${hasBrief
  ? `## The brief

You are given a compact internal brief: facts as reported, readings, unknowns,
actors, competing hypotheses, available leverage, candidate moves and their
likely countermoves.

It is a MENU, NOT A CHECKLIST. Use what is load-bearing for the move you chose
and ignore the rest. You are not required to mention every hypothesis, every
leverage kind, every candidate move or every countermove, and an answer that
tries to cover them all is the failure this stage exists to prevent.

Where the brief and the account disagree, the account is what the person said
and the brief is what was inferred from it. Say which is which.`
  : `## No brief

You are working from the account alone. Be correspondingly careful about what
you claim to know.`}

Jurisdiction: ${jur.country === "unknown" ? "not established — say so where it matters" : jur.country}${jur.region ? `, ${jur.region}` : ""}.

Write the answer as plain prose. No JSON, no code fences, no headings naming
internal structures. Sentinel for this request: ${sentinel}`;
}

/** Assemble the user message: the account, the answers, and the brief. */
export function finalUserMessage(
  account: string,
  answersBlock: string,
  briefJson: string | null,
  sentinel: string
): string {
  const parts = [fence("ACCOUNT", account, sentinel)];
  if (answersBlock) parts.push(fence("ANSWERS", answersBlock, sentinel));
  // The brief is OUR text, not the user's, so it is not fenced as untrusted —
  // but it is derived from untrusted text, so the prompt above still forbids
  // treating its inferences as facts.
  if (briefJson) parts.push(`INTERNAL BRIEF (menu, not checklist):\n${briefJson}`);
  return parts.join("\n\n");
}

/**
 * The only check applied to the answer: it must be prose, and it must not have
 * smuggled the machinery back in.
 *
 * Deliberately thin. Validating this stage into a shape would recreate the
 * report the rewrite removed.
 */
export function checkNarrative(text: string): { ok: boolean; problems: string[] } {
  const problems: string[] = [];
  const t = text.trim();
  if (t.length < 200) problems.push("final.tooShort");
  if (/^\s*[{[]/.test(t)) problems.push("final.looksLikeJson");
  if (/```/.test(t)) problems.push("final.codeFence");
  // Internal vocabulary leaking into the answer.
  for (const word of ["CaseFrame", "ActorMap", "supportingFactIds", "leverage kind", "hypothesis 1"]) {
    if (t.includes(word)) problems.push("final.internalVocabulary");
  }
  return { ok: problems.length === 0, problems };
}
