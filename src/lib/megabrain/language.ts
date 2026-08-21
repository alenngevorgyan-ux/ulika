import type { CaseAnalysis, ResolvedLanguage, ResponseLanguage } from "./schemas";

/**
 * Which language the answer comes back in, and a check that it actually did.
 *
 * The first live run answered a Russian account entirely in English. The
 * exactWords — the lines a user says out loud to their manager — were therefore
 * unusable, which is the single most damaging way this product can fail while
 * appearing to work.
 *
 * Three things are kept apart deliberately, because they kept collapsing:
 * interface language, ANSWER language, and jurisdiction. None implies another.
 */

const CYRILLIC = /[а-яё]/gi;
const LATIN = /[a-z]/gi;

/**
 * Detect the dominant language of an account.
 *
 * Counts letters, not words, and requires a clear majority. A Russian account
 * peppered with "commit", "deadline" and "performance review" is still Russian,
 * and the threshold is what stops a handful of borrowed technical terms from
 * flipping the whole answer.
 */
export function detectLanguage(text: string): ResolvedLanguage {
  const cyr = (text.match(CYRILLIC) ?? []).length;
  const lat = (text.match(LATIN) ?? []).length;
  if (cyr === 0 && lat === 0) return "en";
  // Cyrillic wins on any meaningful presence: Latin appears inside Russian text
  // as loanwords far more often than the reverse.
  return cyr >= lat * 0.35 ? "ru" : "en";
}

/** An explicit choice always wins. "auto" reads the account, never the UI. */
export function resolveLanguage(requested: ResponseLanguage, account: string): ResolvedLanguage {
  return requested === "auto" ? detectLanguage(account) : requested;
}

export const LANGUAGE_NAME: Record<ResolvedLanguage, string> = {
  ru: "Russian",
  en: "English",
};

/**
 * Fields the user reads. Every one must be in the resolved language.
 *
 * Internal enum values — strategy kinds, leverage kinds, risk levels — stay
 * English on purpose: they are identifiers, not prose, and translating them
 * would break every comparison and every test.
 */
export function userFacingText(a: CaseAnalysis): string[] {
  const out: string[] = [
    a.plan.conclusion,
    a.plan.recommendedMove,
    a.plan.fallbackPlan,
    a.plan.uncertainty,
    a.plan.riskAssessment.legalUncertainty,
    a.plan.riskAssessment.requestedBenefit,
    ...a.plan.missingInformation,
    ...a.plan.whatNotToSay,
    ...a.plan.stopSignals,
    ...a.plan.exactWords.flatMap((p) => [p.text, p.purpose, p.useWhen, p.doNotUseWhen]),
    ...a.plan.ifThenBranches.flatMap((b) => [b.if, b.then, b.rationale, b.stopCondition]),
    ...a.strategies.strategies.flatMap((s) => [s.summary, s.firstMove, s.costIfItFails]),
    ...a.countermoves.countermoves.flatMap((c) => [
      c.likelyResponse,
      c.denial,
      c.retaliation,
      c.escalation,
      c.worstPlausibleOutcome,
    ]),
    ...a.hypotheses.hypotheses.flatMap((h) => [h.claim, h.discriminatingTest]),
    ...a.leverage.points.map((p) => p.description),
  ];
  return out.filter((t) => typeof t === "string" && t.trim().length > 0);
}

export interface LanguageCheck {
  ok: boolean;
  expected: ResolvedLanguage;
  /** Fields whose dominant script is the wrong one. Field TEXT is not returned. */
  offendingCount: number;
  totalChecked: number;
  problems: string[];
}

/**
 * Fail a plan whose user-facing fields came back in the wrong language.
 *
 * Judged per field and then in aggregate, and short fields are skipped: a proper
 * noun, a model name or a two-word quotation is not evidence of anything, and
 * failing on those would make the check unusable on any real bilingual text.
 */
export function checkLanguage(a: CaseAnalysis, expected: ResolvedLanguage): LanguageCheck {
  const fields = userFacingText(a).filter((t) => t.length >= 25);
  const offending = fields.filter((t) => detectLanguage(t) !== expected);
  // A quarter is generous on purpose. Proper nouns, organisation names and
  // short quoted material legitimately carry the other script.
  const ok = fields.length === 0 || offending.length / fields.length <= 0.25;
  return {
    ok,
    expected,
    offendingCount: offending.length,
    totalChecked: fields.length,
    problems: ok ? [] : [`language.wrongLanguage:${offending.length}/${fields.length}`],
  };
}

/** The instruction the stages carry. Blunt, because the first run ignored a polite one. */
export function languageDirective(lang: ResolvedLanguage): string {
  return `## Output language — not negotiable

Write EVERY user-facing field in ${LANGUAGE_NAME[lang]}. That includes the
conclusion, the recommended move, missing information, exactWords, whatNotToSay,
if/then branches, stop signals, the fallback plan, strategy and countermove
descriptions, hypothesis claims and tests, leverage descriptions, and
legalUncertainty.

exactWords are said out loud by the user. In any other language they are
useless, whatever else the answer contains.

Do NOT translate: enum values and field names (they are identifiers), proper
names of people and organisations, product and model names, or short verbatim
quotations from the account.

The language of the answer says nothing about jurisdiction. Do not infer one
from the other.`;
}
