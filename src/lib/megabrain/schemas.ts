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

export interface CaseFrame {
  /**
   * Backed by an artefact the user actually has: a contract clause, a dated
   * message, a commit, a written policy.
   *
   * NAMED CAREFULLY. This used to be called `verifiedFacts` and was populated
   * from the user's own account, which asserted a verification nobody performed
   * — the exact false certainty the product exists to argue against. V0 has no
   * mechanism to inspect a document, so this bucket will often and legitimately
   * be EMPTY, and an empty bucket is the honest output rather than a failure.
   */
  documentedFacts: string[];
  /** Stated by the user. Possibly true; it is testimony, not evidence. */
  reportedFacts: string[];
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
  goals: string[];
  fears: string[];
  resources: string[];
  /** Formal power to decide, distinct from informal influence. */
  authority: string;
  /** What this actor needs from others — where leverage usually lives. */
  dependencies: string[];
  likelyReactions: string[];
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

export interface LeveragePoint {
  kind: LeverageKind;
  description: string;
  /** Blank when the user genuinely has none of this kind. Honesty beats filler. */
  availableToUser: boolean;
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

export interface Branch {
  condition: string;
  then: string;
}

export interface FinalCasePlan {
  conclusion: string;
  missingInformation: string[];
  recommendedMove: string;
  /** Sentences to actually say. Judged hardest by users, so judged hardest here. */
  exactWords: string[];
  whatNotToSay: string[];
  branches: Branch[];
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

export function validateFrame(raw: unknown): ValidationResult<CaseFrame> {
  const problems: string[] = [];
  const o = (raw ?? {}) as Record<string, unknown>;
  const stakes = str(o.stakes, 1000);
  if (!stakes) problems.push("frame.stakes");
  const value: CaseFrame = {
    documentedFacts: strArr(o.documentedFacts),
    reportedFacts: strArr(o.reportedFacts),
    interpretations: strArr(o.interpretations),
    unknowns: strArr(o.unknowns),
    constraints: strArr(o.constraints),
    stakes: stakes ?? "",
  };
  // A frame with nothing in any bucket means extraction failed, not that the
  // situation is simple.
  // documentedFacts may legitimately be empty — nothing here can inspect a
  // document. Reported facts and interpretations may not both be empty: that
  // means extraction failed, not that the situation is simple.
  if (value.reportedFacts.length + value.interpretations.length === 0) {
    problems.push("frame.empty");
  }
  return { ok: problems.length === 0, value, problems };
}

export function validateActors(raw: unknown): ValidationResult<ActorMap> {
  const problems: string[] = [];
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
    actors.push({
      label,
      goals: strArr(o.goals),
      fears: strArr(o.fears),
      resources: strArr(o.resources),
      authority: str(o.authority, 500) ?? "",
      dependencies: strArr(o.dependencies),
      likelyReactions: strArr(o.likelyReactions),
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
  const list = Array.isArray((raw as { points?: unknown })?.points)
    ? ((raw as { points: unknown[] }).points as unknown[])
    : [];
  const points: LeveragePoint[] = [];
  for (const p of list.slice(0, 20)) {
    const o = (p ?? {}) as Record<string, unknown>;
    const kind = LEVERAGE_KINDS.find((k) => k === o.kind);
    const description = str(o.description, 600);
    if (kind && description) {
      points.push({ kind, description, availableToUser: o.availableToUser === true });
    }
  }
  return {
    ok: points.length > 0,
    value: { points },
    problems: points.length ? [] : ["leverage.empty"],
  };
}

/**
 * Redirect metadata is validated field by field and the category must be one of
 * the known enum values. Anything free-form that a model tried to smuggle in
 * alongside is dropped rather than carried, because the whole point of this
 * shape is that it cannot hold an operational instruction.
 */
function redirect(raw: unknown): RedirectMetadata | null {
  const o = (raw ?? {}) as Record<string, unknown>;
  const category = REDIRECT_CATEGORIES.find((c) => c === o.category);
  const reason = str(o.reason, 200);
  const preservedObjective = str(o.preservedObjective, 200);
  return category && reason && preservedObjective
    ? { category, reason, preservedObjective }
    : null;
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

  const branchesRaw = Array.isArray(o.branches) ? (o.branches as unknown[]) : [];
  const branches: Branch[] = [];
  for (const b of branchesRaw.slice(0, 10)) {
    const bo = (b ?? {}) as Record<string, unknown>;
    const condition = str(bo.condition, 400);
    const then = str(bo.then, 800);
    if (condition && then) branches.push({ condition, then });
  }

  const exactWords = strArr(o.exactWords, 12);
  if (exactWords.length === 0) problems.push("plan.exactWords");

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
      branches,
      stopSignals: strArr(o.stopSignals),
      fallbackPlan: str(o.fallbackPlan, 1500) ?? "",
      risk: risk ?? "yellow",
      riskAssessment: ra ?? EMPTY_RISK,
      uncertainty: uncertainty ?? "",
    },
    problems,
  };
}
