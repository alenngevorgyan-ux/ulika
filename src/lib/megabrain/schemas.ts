/**
 * The intermediate objects the case engine produces, and their validators.
 *
 * Hand-rolled validation, same choice and same reason as src/lib/interaction:
 * a fixed vocabulary that changes rarely does not justify a runtime dependency,
 * and the validator IS the trust boundary — a model's JSON is untrusted input
 * exactly like a client's.
 *
 * Every stage also exports a JSON Schema, sent as `response_format` so the
 * provider constrains generation rather than us hoping. Both exist on purpose:
 * the schema shapes the output, the validator refuses what still comes back
 * wrong. Providers degrade, and a silently half-filled CaseFrame is worse than
 * a refusal.
 */

// ----------------------------------------------------------------- 1. frame

/** Where a statement came from. The whole product rests on not blurring these. */
export type Provenance = "documented" | "reported" | "interpreted";

/**
 * The language of the ANSWER. Three separate things that kept collapsing into
 * one: interface language, answer language and jurisdiction.
 *
 * The first live run answered a Russian account in English, which makes the
 * exactWords — the part a user actually says out loud — unusable. "auto" reads
 * the account itself; an explicit value always wins.
 */
export type ResponseLanguage = "auto" | "ru" | "en";
export type ResolvedLanguage = "ru" | "en";

/**
 * Jurisdiction, deliberately NOT derived from language.
 *
 * A Russian-speaking user may be in Armenia; an English-speaking one may be
 * anywhere. Inferring law from language is how a tool ends up stating a legal
 * position for the wrong country with complete confidence.
 */
export interface Jurisdiction {
  country: "unknown" | "AM" | "US" | "RU" | "other";
  region?: string;
}

/** A fact carries an id so a downstream claim can point at it. */
export interface Fact {
  id: string;
  text: string;
}

/**
 * Something the user SAYS they have. Not something we have seen.
 *
 * V0 has no document ingestion, so "I have the commit history" is testimony
 * about evidence, not evidence. It used to land in documentedFacts, which
 * asserted a verification nobody performed.
 */
export interface ReportedEvidence {
  type: string;
  description: string;
  /** The only permitted value in V0. There is no path to any other. */
  verificationStatus: "not_reviewed";
}

/** How a claim about an actor is grounded. */
export type ClaimBasis = "reported" | "inferred" | "unknown";

/**
 * One claim about an actor, with its provenance attached.
 *
 * The first run gave a director — mentioned once, in passing, as the intended
 * recipient of an email — a full psychology including a fear of "losing
 * technical talent". Nothing in the account supported any of it. A claim now
 * either points at facts, admits it is inferred and says how uncertain, or says
 * unknown; it may not quietly be none of the three.
 */
export interface ActorClaim {
  /** "unknown" when basis is unknown. Never invented detail in that case. */
  value: string;
  basis: ClaimBasis;
  /** Ids from CaseFrame.reportedFacts. Required when basis is "reported". */
  supportingFactIds: string[];
  /** Required when basis is "inferred". */
  uncertainty?: string;
}

export interface CaseFrame {
  /**
   * ALWAYS EMPTY IN V0, and enforced empty by the validator.
   *
   * It may only be filled from a trustedArtifacts input — documents the system
   * has actually read — and no such input exists yet. Until it does, anything
   * here would be a verification nobody performed.
   */
  documentedFacts: string[];
  /** Stated by the user. Possibly true; it is testimony, not evidence. */
  reportedFacts: Fact[];
  /** What the user says they can produce. Never treated as produced. */
  reportedEvidenceAvailable: ReportedEvidence[];
  /** Readings the user has already layered on. Named so they can be doubted. */
  interpretations: string[];
  /** Gaps that would change the strategy if filled. Not trivia. */
  unknowns: string[];
  /** Money, time, legal, relational — what limits the option space. */
  constraints: string[];
  /** What is actually at risk, and how bad the realistic worst case is. */
  stakes: string;
}

// ----------------------------------------------------------------- 2. actors

export interface Actor {
  label: string;
  goals: ActorClaim[];
  fears: ActorClaim[];
  resources: ActorClaim[];
  /** Formal power to decide, distinct from informal influence. */
  authority: ActorClaim;
  /** What this actor needs from others — where leverage usually lives. */
  dependencies: ActorClaim[];
  likelyReactions: ActorClaim[];
}

export interface ActorMap {
  actors: Actor[];
}

// ------------------------------------------------------------- 3. hypotheses

export interface Hypothesis {
  claim: string;
  evidenceFor: string[];
  evidenceAgainst: string[];
  /** 0-100. Must sum to something sane across the set; checked below. */
  confidence: number;
  /**
   * The cheap, reversible observation that would separate this hypothesis from
   * the others. A hypothesis with no discriminating test is a mood.
   */
  discriminatingTest: string;
}

export interface HypothesisSet {
  hypotheses: Hypothesis[];
}

// --------------------------------------------------------------- 4. leverage

export const LEVERAGE_KINDS = [
  "informational",
  "procedural",
  "reputational",
  "temporal",
  "coalition",
  "economic",
  "status",
  "emotional",
  "batna",
  "exit",
] as const;
export type LeverageKind = (typeof LEVERAGE_KINDS)[number];

export type LeverageStatus = "present" | "absent" | "unknown";

export interface LeveragePoint {
  kind: LeverageKind;
  /**
   * present / absent / unknown, and all ten kinds must appear.
   *
   * Skipping a kind reads as "considered and found nothing", which is a
   * different statement from "not considered". The first run listed seven and
   * silently dropped economic, status and emotional.
   */
  status: LeverageStatus;
  description: string;
  /** What the status rests on. "unknown" is a legitimate answer here too. */
  basis: string;
  /** What using it costs if it goes wrong. Empty when status is not present. */
  risk: string;
  reversibility: "reversible" | "hard_to_reverse" | "irreversible" | "not_applicable";
}

export interface LeverageMap {
  points: LeveragePoint[];
}

// -------------------------------------------------------------- 5. strategy

export const STRATEGY_KINDS = [
  "low_risk",
  "fast",
  "strong_negotiation",
  "unconventional",
  "exit_contingency",
] as const;
export type StrategyKind = (typeof STRATEGY_KINDS)[number];

/**
 * Traffic-light risk. Yellow and orange are legitimate and must survive: a
 * product that only ever emits green advice is the banality this engine exists
 * to beat. Red is not sanitised into green — it is replaced by the nearest
 * lawful move of comparable strength, and `redirectedFrom` records that.
 */
export type RiskLevel = "green" | "yellow" | "orange";

/**
 * What makes a move risky, as separable factors rather than one adjective.
 *
 * The old model treated relevance to the dispute as sufficient for legitimacy.
 * It is not: a relevant fact can still be used coercively, obtained improperly,
 * or pressed outside any proper channel, and the answer changes with a
 * jurisdiction the system usually does not know. Splitting the factors is what
 * lets the final answer be firm about the ones it can see and honest about the
 * one it cannot.
 */
export interface RiskAssessment {
  /** False whenever the account does not establish it — usually false. */
  jurisdictionKnown: boolean;
  /** What the user gets if it works. Naming it exposes disproportionate moves. */
  requestedBenefit: string;
  relevanceToDispute: "direct" | "tangential" | "unrelated";
  informationSource: "user_owned" | "shared_with_user" | "third_party" | "improperly_obtained";
  proceduralChannel: "formal" | "informal" | "none";
  reversibility: "reversible" | "hard_to_reverse" | "irreversible";
  retaliationRisk: "low" | "medium" | "high";
  /**
   * Free text. When jurisdictionKnown is false this must be non-empty, and the
   * plan must not assert that a grey move is lawful — a test enforces both.
   */
  legalUncertainty: string;
}

/**
 * Why a dangerous idea was replaced, WITHOUT restating it.
 *
 * The earlier field was a free-text `redirectedFrom` holding the original plan.
 * That put an operational description of blackmail or surveillance into the
 * response object, the debug output and any report built from them — the system
 * would have been generating and storing the very instruction it declined to
 * give. Categories and an objective carry the same explanatory value and none of
 * the payload.
 */
export const REDIRECT_CATEGORIES = [
  "unrelated_private_information",
  "unauthorised_access",
  "surveillance",
  "reputational_pressure",
  "threat_of_harm",
  "deception_causing_harm",
  "irreversible_escalation",
] as const;
export type RedirectCategory = (typeof REDIRECT_CATEGORIES)[number];

export interface RedirectMetadata {
  category: RedirectCategory;
  /** Short, non-operational: why it was out of bounds. */
  reason: string;
  /** The legitimate goal the replacement still pursues. */
  preservedObjective: string;
}

export interface Strategy {
  kind: StrategyKind;
  summary: string;
  firstMove: string;
  risk: RiskLevel;
  /** Can the user walk this back if it goes badly? The single most useful field. */
  reversible: boolean;
  costIfItFails: string;
  /** Set when a dangerous idea was converted rather than dropped. */
  redirect?: RedirectMetadata;
}

export interface StrategySet {
  strategies: Strategy[];
}

// ------------------------------------------------------------- 6. countermove

export interface Countermove {
  againstStrategy: StrategyKind;
  likelyResponse: string;
  denial: string;
  retaliation: string;
  evidenceDestruction: string;
  escalation: string;
  worstPlausibleOutcome: string;
}

export interface CountermoveSet {
  countermoves: Countermove[];
}

// ---------------------------------------------------------------- 8. final

/**
 * Three lines, because one is not a script.
 *
 * The first run supplied a single sentence and passed the gate at >= 1. A user
 * with five strategies and five countermoves and one thing to say has been
 * given an essay and a fortune cookie.
 *
 * escalation is NOT a threat. It is the next procedural step said plainly —
 * and softening it into nothing costs the user their position, which is a harm
 * this system is explicitly not allowed to inflict.
 */
export const PHRASE_ROLES = ["opening", "boundary", "escalation"] as const;
export type PhraseRole = (typeof PHRASE_ROLES)[number];

export interface ExactPhrase {
  role: PhraseRole;
  purpose: string;
  /** Said verbatim. Must be in the resolved response language. */
  text: string;
  useWhen: string;
  doNotUseWhen: string;
}

/**
 * Structured, not prose to be regex-mined later.
 *
 * The anti-banality grader used to look for the word "если" and therefore
 * scored an English answer as missing branches it actually had. A structure is
 * readable in any language.
 */
export interface IfThenBranch {
  if: string;
  then: string;
  rationale: string;
  /** The observable event that means stop rather than continue down this path. */
  stopCondition: string;
}

export interface FinalCasePlan {
  conclusion: string;
  missingInformation: string[];
  recommendedMove: string;
  /** At least three, one per role. Judged hardest by users, so judged hardest here. */
  exactWords: ExactPhrase[];
  whatNotToSay: string[];
  /** At least three: conceded, stalled, escalated. */
  ifThenBranches: IfThenBranch[];
  /** Observable signals that mean stop and reassess, not "be careful". */
  stopSignals: string[];
  fallbackPlan: string;
  risk: RiskLevel;
  riskAssessment: RiskAssessment;
  /** Plain words. A percentage the code cannot derive is theatre. */
  uncertainty: string;
}

export interface CaseAnalysis {
  frame: CaseFrame;
  actors: ActorMap;
  hypotheses: HypothesisSet;
  leverage: LeverageMap;
  strategies: StrategySet;
  countermoves: CountermoveSet;
  plan: FinalCasePlan;
  /** Resolved once, at the start, and applied to every user-facing field. */
  language: ResolvedLanguage;
  jurisdiction: Jurisdiction;
}

// ------------------------------------------------------------- validation

const str = (v: unknown, max = 4000): string | null =>
  typeof v === "string" && v.trim() ? v.trim().slice(0, max) : null;

const strArr = (v: unknown, cap = 20): string[] =>
  Array.isArray(v)
    ? v.filter((x): x is string => typeof x === "string" && Boolean(x.trim()))
        .map((x) => x.trim())
        .slice(0, cap)
    : [];

const num = (v: unknown, lo: number, hi: number): number | null => {
  const n = Number(v);
  return Number.isFinite(n) && n >= lo && n <= hi ? n : null;
};

export interface ValidationResult<T> {
  ok: boolean;
  value?: T;
  /** Field paths that failed. Never the model's raw output — it may quote the user. */
  problems: string[];
}

function facts(v: unknown): Fact[] {
  if (!Array.isArray(v)) return [];
  return v
    .map((x, i) => {
      if (typeof x === "string") return str(x) ? { id: `f${i + 1}`, text: str(x)! } : null;
      const o = (x ?? {}) as Record<string, unknown>;
      const text = str(o.text);
      return text ? { id: str(o.id, 16) ?? `f${i + 1}`, text } : null;
    })
    .filter((f): f is Fact => f !== null)
    .slice(0, 30);
}

function reportedEvidence(v: unknown): ReportedEvidence[] {
  if (!Array.isArray(v)) return [];
  return v
    .map((x) => {
      const o = (x ?? {}) as Record<string, unknown>;
      const type = str(o.type, 80);
      const description = str(o.description, 400);
      // verificationStatus is FORCED, never read from the model: no code path
      // in V0 could legitimately set anything else.
      return type && description
        ? { type, description, verificationStatus: "not_reviewed" as const }
        : null;
    })
    .filter((e): e is ReportedEvidence => e !== null)
    .slice(0, 20);
}

export function validateFrame(raw: unknown): ValidationResult<CaseFrame> {
  const problems: string[] = [];
  const o = (raw ?? {}) as Record<string, unknown>;
  const stakes = str(o.stakes, 1000);
  if (!stakes) problems.push("frame.stakes");

  // Forced empty, not "dropped when suspicious". There is no trustedArtifacts
  // input in V0, so anything here is by definition unverified — and the first
  // live run put "user possesses the commit history" in it on the strength of
  // the user saying so.
  if (Array.isArray(o.documentedFacts) && o.documentedFacts.length > 0) {
    problems.push("frame.documentedFactsNotPermitted");
  }

  const value: CaseFrame = {
    documentedFacts: [],
    reportedFacts: facts(o.reportedFacts),
    reportedEvidenceAvailable: reportedEvidence(o.reportedEvidenceAvailable),
    interpretations: strArr(o.interpretations),
    unknowns: strArr(o.unknowns),
    constraints: strArr(o.constraints),
    stakes: stakes ?? "",
  };
  if (value.reportedFacts.length + value.interpretations.length === 0) {
    problems.push("frame.empty");
  }
  return { ok: problems.length === 0, value, problems };
}

const UNKNOWN_VALUES = new Set(["unknown", "неизвестно", "не известно", "n/a", "-"]);

/**
 * Validate one claim about an actor.
 *
 * The rules exist because of a specific failure: a director mentioned once in
 * passing was given goals, fears and predicted reactions, none of which the
 * account supported. So:
 *   reported  → must name the facts it rests on;
 *   inferred  → must say how uncertain it is;
 *   unknown   → must NOT carry specific invented content.
 */
function actorClaim(
  raw: unknown,
  factIds: Set<string>,
  path: string,
  problems: string[]
): ActorClaim | null {
  const o = (raw ?? {}) as Record<string, unknown>;
  const value = typeof raw === "string" ? str(raw, 400) : str(o.value, 400);
  if (!value) return null;

  const basis = (["reported", "inferred", "unknown"] as const).find((b) => b === o.basis);
  if (!basis) {
    problems.push(`${path}.basis`);
    return null;
  }

  const supportingFactIds = strArr(o.supportingFactIds, 10).filter((id) => factIds.has(id));
  if (basis === "reported" && supportingFactIds.length === 0) {
    problems.push(`${path}.reportedWithoutFacts`);
  }
  const uncertainty = str(o.uncertainty, 300);
  if (basis === "inferred" && !uncertainty) problems.push(`${path}.inferredWithoutUncertainty`);
  if (basis === "unknown" && !UNKNOWN_VALUES.has(value.toLowerCase())) {
    // "unknown" with detailed content is the invented-biography failure wearing
    // an honest label.
    problems.push(`${path}.unknownWithContent`);
  }

  return {
    value,
    basis,
    supportingFactIds,
    ...(uncertainty ? { uncertainty } : {}),
  };
}

function actorClaims(
  raw: unknown,
  factIds: Set<string>,
  path: string,
  problems: string[]
): ActorClaim[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .slice(0, 8)
    .map((c, i) => actorClaim(c, factIds, `${path}[${i}]`, problems))
    .filter((c): c is ActorClaim => c !== null);
}

export function validateActors(raw: unknown, frame?: CaseFrame): ValidationResult<ActorMap> {
  const problems: string[] = [];
  const factIds = new Set((frame?.reportedFacts ?? []).map((f) => f.id));
  const list = Array.isArray((raw as { actors?: unknown })?.actors)
    ? ((raw as { actors: unknown[] }).actors as unknown[])
    : [];
  const actors: Actor[] = [];
  list.slice(0, 12).forEach((a, i) => {
    const o = (a ?? {}) as Record<string, unknown>;
    const label = str(o.label, 120);
    if (!label) {
      problems.push(`actors[${i}].label`);
      return;
    }
    const p = `actors[${i}]`;
    const authority =
      actorClaim(o.authority, factIds, `${p}.authority`, problems) ??
      { value: "unknown", basis: "unknown" as const, supportingFactIds: [] };
    actors.push({
      label,
      goals: actorClaims(o.goals, factIds, `${p}.goals`, problems),
      fears: actorClaims(o.fears, factIds, `${p}.fears`, problems),
      resources: actorClaims(o.resources, factIds, `${p}.resources`, problems),
      authority,
      dependencies: actorClaims(o.dependencies, factIds, `${p}.dependencies`, problems),
      likelyReactions: actorClaims(o.likelyReactions, factIds, `${p}.likelyReactions`, problems),
    });
  });
  if (actors.length === 0) problems.push("actors.empty");
  return { ok: problems.length === 0, value: { actors }, problems };
}

/** Three competing hypotheses is the floor, and it is a hard floor. */
export const MIN_HYPOTHESES = 3;

export function validateHypotheses(raw: unknown): ValidationResult<HypothesisSet> {
  const problems: string[] = [];
  const list = Array.isArray((raw as { hypotheses?: unknown })?.hypotheses)
    ? ((raw as { hypotheses: unknown[] }).hypotheses as unknown[])
    : [];
  const hypotheses: Hypothesis[] = [];
  list.slice(0, 8).forEach((h, i) => {
    const o = (h ?? {}) as Record<string, unknown>;
    const claim = str(o.claim, 500);
    const confidence = num(o.confidence, 0, 100);
    const discriminatingTest = str(o.discriminatingTest, 800);
    if (!claim) problems.push(`hypotheses[${i}].claim`);
    if (confidence === null) problems.push(`hypotheses[${i}].confidence`);
    if (!discriminatingTest) problems.push(`hypotheses[${i}].discriminatingTest`);
    if (claim && confidence !== null && discriminatingTest) {
      hypotheses.push({
        claim,
        evidenceFor: strArr(o.evidenceFor),
        evidenceAgainst: strArr(o.evidenceAgainst),
        confidence,
        discriminatingTest,
      });
    }
  });
  if (hypotheses.length < MIN_HYPOTHESES) problems.push("hypotheses.tooFew");
  return { ok: problems.length === 0, value: { hypotheses }, problems };
}

export function validateLeverage(raw: unknown): ValidationResult<LeverageMap> {
  const problems: string[] = [];
  const list = Array.isArray((raw as { points?: unknown })?.points)
    ? ((raw as { points: unknown[] }).points as unknown[])
    : [];
  const byKind = new Map<LeverageKind, LeveragePoint>();
  for (const p of list.slice(0, 20)) {
    const o = (p ?? {}) as Record<string, unknown>;
    const kind = LEVERAGE_KINDS.find((k) => k === o.kind);
    const status = (["present", "absent", "unknown"] as const).find((x) => x === o.status);
    const description = str(o.description, 600);
    if (!kind || !status || !description) continue;
    byKind.set(kind, {
      kind,
      status,
      description,
      basis: str(o.basis, 400) ?? "unknown",
      risk: str(o.risk, 400) ?? "",
      reversibility:
        (["reversible", "hard_to_reverse", "irreversible", "not_applicable"] as const).find(
          (r) => r === o.reversibility
        ) ?? "not_applicable",
    });
  }
  // Every kind, every time. A missing kind reads as "considered and found
  // nothing", which is a different claim from "not considered".
  const missing = LEVERAGE_KINDS.filter((k) => !byKind.has(k));
  if (missing.length) problems.push(`leverage.missing:${missing.join(",")}`);
  return {
    ok: problems.length === 0,
    value: { points: LEVERAGE_KINDS.map((k) => byKind.get(k)).filter((p): p is LeveragePoint => !!p) },
    problems,
  };
}

/**
 * Redirect metadata is validated field by field and the category must be one of
 * the known enum values. Anything free-form that a model tried to smuggle in
 * alongside is dropped rather than carried, because the whole point of this
 * shape is that it cannot hold an operational instruction.
 */
/**
 * Phrases that mean "nothing was redirected" dressed as a redirect.
 *
 * The first live run attached a redirect object to ALL FIVE strategies with the
 * reason "No unrelated leverage used." Nothing had been converted; the model
 * filled an optional field because the schema offered it. That destroys the
 * field's meaning: a real conversion is no longer distinguishable from filler.
 */
const NULL_REDIRECT_MARKERS = [
  "no unrelated",
  "none",
  "n/a",
  "not applicable",
  "no redirect",
  "не применялось",
  "не использовалось",
  "нет",
];

function redirect(raw: unknown): RedirectMetadata | null {
  if (raw === null || raw === undefined) return null;
  const o = (raw ?? {}) as Record<string, unknown>;
  const category = REDIRECT_CATEGORIES.find((c) => c === o.category);
  const reason = str(o.reason, 200);
  const preservedObjective = str(o.preservedObjective, 200);
  if (!category || !reason || !preservedObjective) return null;
  const marker = reason.toLowerCase();
  if (NULL_REDIRECT_MARKERS.some((m) => marker.includes(m))) return null;
  return { category, reason, preservedObjective };
}

export function validateStrategies(raw: unknown): ValidationResult<StrategySet> {
  const problems: string[] = [];
  const list = Array.isArray((raw as { strategies?: unknown })?.strategies)
    ? ((raw as { strategies: unknown[] }).strategies as unknown[])
    : [];
  const strategies: Strategy[] = [];
  for (const s of list.slice(0, 8)) {
    const o = (s ?? {}) as Record<string, unknown>;
    const kind = STRATEGY_KINDS.find((k) => k === o.kind);
    const summary = str(o.summary, 800);
    const firstMove = str(o.firstMove, 800);
    const risk = (["green", "yellow", "orange"] as const).find((r) => r === o.risk);
    if (!kind || !summary || !firstMove || !risk) continue;
    strategies.push({
      kind,
      summary,
      firstMove,
      risk,
      reversible: o.reversible === true,
      costIfItFails: str(o.costIfItFails, 600) ?? "",
      ...(redirect(o.redirect) ? { redirect: redirect(o.redirect)! } : {}),
    });
  }
  if (strategies.length < 3) problems.push("strategies.tooFew");
  return { ok: problems.length === 0, value: { strategies }, problems };
}

export function validateCountermoves(raw: unknown): ValidationResult<CountermoveSet> {
  const list = Array.isArray((raw as { countermoves?: unknown })?.countermoves)
    ? ((raw as { countermoves: unknown[] }).countermoves as unknown[])
    : [];
  const countermoves: Countermove[] = [];
  for (const c of list.slice(0, 8)) {
    const o = (c ?? {}) as Record<string, unknown>;
    const againstStrategy = STRATEGY_KINDS.find((k) => k === o.againstStrategy);
    const likelyResponse = str(o.likelyResponse, 800);
    const worst = str(o.worstPlausibleOutcome, 800);
    if (!againstStrategy || !likelyResponse || !worst) continue;
    countermoves.push({
      againstStrategy,
      likelyResponse,
      denial: str(o.denial, 600) ?? "",
      retaliation: str(o.retaliation, 600) ?? "",
      evidenceDestruction: str(o.evidenceDestruction, 600) ?? "",
      escalation: str(o.escalation, 600) ?? "",
      worstPlausibleOutcome: worst,
    });
  }
  return {
    ok: countermoves.length > 0,
    value: { countermoves },
    problems: countermoves.length ? [] : ["countermoves.empty"],
  };
}

const EMPTY_RISK: RiskAssessment = {
  jurisdictionKnown: false,
  requestedBenefit: "",
  relevanceToDispute: "tangential",
  informationSource: "third_party",
  proceduralChannel: "none",
  reversibility: "hard_to_reverse",
  retaliationRisk: "high",
  legalUncertainty: "not assessed",
};

const oneOf = <T extends string>(v: unknown, options: readonly T[]): T | null =>
  options.find((o) => o === v) ?? null;

function validateRiskAssessment(raw: unknown): RiskAssessment | null {
  const o = (raw ?? {}) as Record<string, unknown>;
  const relevanceToDispute = oneOf(o.relevanceToDispute, ["direct", "tangential", "unrelated"] as const);
  const informationSource = oneOf(o.informationSource, ["user_owned", "shared_with_user", "third_party", "improperly_obtained"] as const);
  const proceduralChannel = oneOf(o.proceduralChannel, ["formal", "informal", "none"] as const);
  const reversibility = oneOf(o.reversibility, ["reversible", "hard_to_reverse", "irreversible"] as const);
  const retaliationRisk = oneOf(o.retaliationRisk, ["low", "medium", "high"] as const);
  const requestedBenefit = str(o.requestedBenefit, 300);
  const legalUncertainty = str(o.legalUncertainty, 600);
  if (!relevanceToDispute || !informationSource || !proceduralChannel || !reversibility || !retaliationRisk || !requestedBenefit) {
    return null;
  }
  const jurisdictionKnown = o.jurisdictionKnown === true;
  // An unknown jurisdiction obliges the answer to say what it cannot settle.
  if (!jurisdictionKnown && !legalUncertainty) return null;
  return {
    jurisdictionKnown,
    requestedBenefit,
    relevanceToDispute,
    informationSource,
    proceduralChannel,
    reversibility,
    retaliationRisk,
    legalUncertainty: legalUncertainty ?? "",
  };
}

/** At least three, and all three roles distinct. One line is not a script. */
export const MIN_EXACT_PHRASES = 3;
/** Conceded, stalled, escalated — the three things the other side actually does. */
export const MIN_IF_THEN_BRANCHES = 3;

function phrases(raw: unknown, problems: string[]): ExactPhrase[] {
  const out: ExactPhrase[] = [];
  if (Array.isArray(raw)) {
    for (const x of raw.slice(0, 8)) {
      const o = (x ?? {}) as Record<string, unknown>;
      const role = PHRASE_ROLES.find((r) => r === o.role);
      const text = str(o.text, 800);
      const purpose = str(o.purpose, 300);
      if (!role || !text || !purpose) continue;
      out.push({
        role,
        purpose,
        text,
        useWhen: str(o.useWhen, 300) ?? "",
        doNotUseWhen: str(o.doNotUseWhen, 300) ?? "",
      });
    }
  }
  if (out.length < MIN_EXACT_PHRASES) problems.push("plan.exactWords.tooFew");
  if (new Set(out.map((p) => p.role)).size < MIN_EXACT_PHRASES) {
    problems.push("plan.exactWords.rolesNotDistinct");
  }
  return out;
}

function branches(raw: unknown, problems: string[]): IfThenBranch[] {
  const out: IfThenBranch[] = [];
  if (Array.isArray(raw)) {
    for (const x of raw.slice(0, 10)) {
      const o = (x ?? {}) as Record<string, unknown>;
      const ifPart = str(o.if ?? o.condition, 400);
      const thenPart = str(o.then, 800);
      if (!ifPart || !thenPart) continue;
      out.push({
        if: ifPart,
        then: thenPart,
        rationale: str(o.rationale, 400) ?? "",
        stopCondition: str(o.stopCondition, 400) ?? "",
      });
    }
  }
  if (out.length < MIN_IF_THEN_BRANCHES) problems.push("plan.ifThenBranches.tooFew");
  return out;
}

export function validatePlan(raw: unknown): ValidationResult<FinalCasePlan> {
  const problems: string[] = [];
  const o = (raw ?? {}) as Record<string, unknown>;
  const conclusion = str(o.conclusion, 2000);
  const recommendedMove = str(o.recommendedMove, 2000);
  const risk = (["green", "yellow", "orange"] as const).find((r) => r === o.risk);
  const uncertainty = str(o.uncertainty, 1000);
  if (!conclusion) problems.push("plan.conclusion");
  if (!recommendedMove) problems.push("plan.recommendedMove");
  if (!risk) problems.push("plan.risk");
  if (!uncertainty) problems.push("plan.uncertainty");

  const exactWords = phrases(o.exactWords, problems);
  const ifThenBranches = branches(o.ifThenBranches ?? o.branches, problems);

  const ra = validateRiskAssessment(o.riskAssessment);
  if (!ra) problems.push("plan.riskAssessment");

  return {
    ok: problems.length === 0,
    value: {
      conclusion: conclusion ?? "",
      missingInformation: strArr(o.missingInformation),
      recommendedMove: recommendedMove ?? "",
      exactWords,
      whatNotToSay: strArr(o.whatNotToSay),
      ifThenBranches,
      stopSignals: strArr(o.stopSignals),
      fallbackPlan: str(o.fallbackPlan, 1500) ?? "",
      risk: risk ?? "yellow",
      riskAssessment: ra ?? EMPTY_RISK,
      uncertainty: uncertainty ?? "",
    },
    problems,
  };
}


/**
 * Light mode's whole output. Five fields, one call.
 *
 * Deliberately not a subset of FinalCasePlan: a truncated case file reads as a
 * case file that failed, and this is a different, complete answer to a smaller
 * question.
 */
export interface LightPlan {
  shortAssessment: string;
  nextMove: string;
  oneExactPhrase: string;
  oneRisk: string;
  oneQuestion: string;
  language: ResolvedLanguage;
  jurisdiction: Jurisdiction;
}

export function validateLightPlan(raw: unknown): ValidationResult<Omit<LightPlan, "language" | "jurisdiction">> {
  const problems: string[] = [];
  const o = (raw ?? {}) as Record<string, unknown>;
  const f = (k: keyof LightPlan, max: number) => {
    const v = str(o[k], max);
    if (!v) problems.push(`light.${k}`);
    return v ?? "";
  };
  const value = {
    shortAssessment: f("shortAssessment", 800),
    nextMove: f("nextMove", 600),
    oneExactPhrase: f("oneExactPhrase", 600),
    oneRisk: f("oneRisk", 400),
    oneQuestion: f("oneQuestion", 400),
  };
  return { ok: problems.length === 0, value, problems };
}
