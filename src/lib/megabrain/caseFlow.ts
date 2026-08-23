import { randomUUID } from "node:crypto";
import type { AnalysisMode } from "./analysisMode";
import { capFor } from "./analysisMode";
import type { ClarifyQuestion } from "./clarify";
import type { FollowUpAction } from "./followUp";
import type { ClarificationMode, KnowledgeMode, ManualPresetId, MemoryMode } from "./manualPresets";

export type CaseFlowPhase =
  | "intake"
  | "awaiting_answers"
  | "analysing"
  | "completed"
  | "failed";

export type CaseFlowAction = "answer" | "skip" | "resume";

export interface PublicQuestion {
  id: string;
  question: string;
  options: string[];
}

export interface FollowUpTurn {
  action: FollowUpAction;
  answer: string;
}

export interface CaseFlow {
  id: string;
  ownerId: string;
  conversationId: string;
  phase: CaseFlowPhase;
  mode: Exclude<AnalysisMode, "deep">;
  capUsd: number;
  budgetedSpendUsd: number;
  account: string;
  responseLanguage: string;
  jurisdiction: { country: string; region?: string };
  questions: ClarifyQuestion[];
  answers: Record<string, string>;
  answer: string | null;
  followUps: FollowUpTurn[];
  activeRequestId: string | null;
  completedRequestIds: Set<string>;
  safeError: string | null;
  createdAt: number;
  updatedAt: number;
  expiresAt: number;
  manual: {
    preset: ManualPresetId;
    clarification: ClarificationMode;
    knowledge: KnowledgeMode;
    memory: MemoryMode;
    savedCaseId: string | null;
    fixedAnswers: Record<string, string>;
    memoryContext: string;
    retrieval: {
      cards: { id: string; name: string; type: string; sourceIds: string[]; sourceNames: string[]; evidenceStrength: string; relevanceScore: number }[];
      families: string[];
      informationPlan: { unknown: string; safeWayToObtain: string; risk: string }[];
      latencyMs: number;
      tokenEstimate: number;
      limitation: string | null;
      truncated: boolean;
    } | null;
    snapshot: {
      actors: string[];
      documentedFacts: string[];
      reportedFacts: string[];
      hypotheses: string[];
      unresolvedQuestions: string[];
      recommendation: string;
    } | null;
    telemetry: {
      reportedSpendUsd: number;
      conservativeSpendUsd: number;
      latencyMs: number;
      calls: { stage: string; model: string; reasoningTokens: number; inputTokens: number; outputTokens: number; cost: number | null }[];
    } | null;
  } | null;
}

export type PublicCaseFlow = Pick<
  CaseFlow,
  "id" | "conversationId" | "phase" | "mode" | "capUsd" | "answer" | "followUps" | "safeError"
> & {
  questions: PublicQuestion[];
  allowedActions: CaseFlowAction[];
  budgetedSpendUsd: number;
  remainingUsd: number;
  manual: null | Pick<NonNullable<CaseFlow["manual"]>, "preset" | "clarification" | "knowledge" | "memory" | "savedCaseId" | "retrieval" | "telemetry">;
};

const TTL_MS = 30 * 60 * 1000;
const MAX_FLOWS_PER_OWNER = 10;
const MAX_FLOWS_TOTAL = 1_000;
const flows = new Map<string, CaseFlow>();

export class FlowError extends Error {
  constructor(readonly code: string, readonly status: number) {
    super(code);
    this.name = "FlowError";
  }
}

function touch(flow: CaseFlow, now = Date.now()): void {
  flow.updatedAt = now;
  flow.expiresAt = now + TTL_MS;
}

function purgeExpired(now = Date.now()): void {
  for (const [id, flow] of flows) {
    if (flow.expiresAt <= now) flows.delete(id);
  }
}

export function createCaseFlow(input: {
  ownerId: string;
  conversationId: string;
  mode: Exclude<AnalysisMode, "deep">;
  account: string;
  responseLanguage: string;
  jurisdiction: { country: string; region?: string };
  requestId: string;
  capUsd?: number;
  manual?: CaseFlow["manual"];
}): CaseFlow {
  purgeExpired();
  const ownerFlows = [...flows.values()].filter((f) => f.ownerId === input.ownerId);
  if (ownerFlows.some((f) => f.conversationId === input.conversationId && ["intake", "awaiting_answers", "analysing"].includes(f.phase))) {
    throw new FlowError("ACTIVE_FLOW_EXISTS", 409);
  }
  if (ownerFlows.length >= MAX_FLOWS_PER_OWNER || flows.size >= MAX_FLOWS_TOTAL) {
    throw new FlowError("FLOW_LIMIT_REACHED", 429);
  }
  const now = Date.now();
  const flow: CaseFlow = {
    id: randomUUID(),
    ownerId: input.ownerId,
    conversationId: input.conversationId,
    phase: "intake",
    mode: input.mode,
    capUsd: input.capUsd ?? capFor(input.mode),
    budgetedSpendUsd: 0,
    account: input.account,
    responseLanguage: input.responseLanguage,
    jurisdiction: input.jurisdiction,
    questions: [],
    answers: {},
    answer: null,
    followUps: [],
    activeRequestId: input.requestId,
    completedRequestIds: new Set(),
    safeError: null,
    createdAt: now,
    updatedAt: now,
    expiresAt: now + TTL_MS,
    manual: input.manual ?? null,
  };
  flows.set(flow.id, flow);
  return flow;
}

export function ownedFlow(id: string, ownerId: string): CaseFlow {
  purgeExpired();
  const flow = flows.get(id);
  if (!flow) throw new FlowError("FLOW_NOT_FOUND", 404);
  if (flow.ownerId !== ownerId) throw new FlowError("FLOW_FORBIDDEN", 403);
  touch(flow);
  return flow;
}

export function flowForRequest(ownerId: string, requestId: string): CaseFlow | null {
  purgeExpired();
  for (const flow of flows.values()) {
    if (
      flow.ownerId === ownerId &&
      (flow.activeRequestId === requestId || flow.completedRequestIds.has(requestId))
    ) {
      touch(flow);
      return flow;
    }
  }
  return null;
}

export function beginTransition(
  flow: CaseFlow,
  requestId: string,
  allowed: CaseFlowPhase[],
  next: CaseFlowPhase
): "started" | "duplicate" {
  if (flow.completedRequestIds.has(requestId) || flow.activeRequestId === requestId) return "duplicate";
  if (flow.activeRequestId) throw new FlowError("FLOW_BUSY", 409);
  if (!allowed.includes(flow.phase)) throw new FlowError("INVALID_FLOW_TRANSITION", 409);
  flow.activeRequestId = requestId;
  flow.phase = next;
  flow.safeError = null;
  touch(flow);
  return "started";
}

export function setQuestions(flow: CaseFlow, questions: ClarifyQuestion[], requestId: string): void {
  if (flow.activeRequestId !== requestId) throw new FlowError("STALE_FLOW_REQUEST", 409);
  flow.questions = structuredClone(questions);
  flow.phase = "awaiting_answers";
  flow.activeRequestId = null;
  flow.completedRequestIds.add(requestId);
  touch(flow);
}

export function acceptAnswers(flow: CaseFlow, answers: Record<string, unknown>): Record<string, string> {
  if (flow.phase !== "awaiting_answers" || flow.activeRequestId) {
    throw new FlowError("INVALID_FLOW_TRANSITION", 409);
  }
  const known = new Set(flow.questions.map((q) => q.id));
  const normalised: Record<string, string> = {};
  for (const [id, raw] of Object.entries(answers)) {
    if (!known.has(id)) throw new FlowError("UNKNOWN_QUESTION", 400);
    if (typeof raw !== "string") throw new FlowError("INVALID_ANSWER", 400);
    const answer = raw.trim().slice(0, 1_000);
    if (answer) normalised[id] = answer;
  }
  if (flow.questions.some((q) => !normalised[q.id])) {
    throw new FlowError("ANSWERS_INCOMPLETE", 400);
  }
  flow.answers = normalised;
  return normalised;
}

export function validatedExcerpt(answer: string, raw: unknown): string | undefined {
  const excerpt = typeof raw === "string" ? raw.trim().slice(0, 4_000) : "";
  if (!excerpt) return undefined;
  if (!answer.includes(excerpt)) throw new FlowError("INVALID_EXCERPT", 400);
  return excerpt;
}

export function completeFlow(flow: CaseFlow, answer: string, requestId: string): void {
  if (flow.activeRequestId !== requestId) throw new FlowError("STALE_FLOW_REQUEST", 409);
  flow.answer = answer;
  flow.phase = "completed";
  flow.activeRequestId = null;
  flow.completedRequestIds.add(requestId);
  flow.safeError = null;
  touch(flow);
}

export function addSpend(flow: CaseFlow, amount: number): void {
  if (!Number.isFinite(amount) || amount < 0) throw new FlowError("INVALID_FLOW_SPEND", 500);
  flow.budgetedSpendUsd += amount;
  touch(flow);
}

export function failFlow(flow: CaseFlow, requestId: string, safeError: string): void {
  if (flow.activeRequestId === requestId) {
    flow.activeRequestId = null;
    flow.completedRequestIds.add(requestId);
  }
  flow.phase = "failed";
  flow.safeError = safeError;
  touch(flow);
}

export function appendFollowUp(flow: CaseFlow, action: FollowUpAction, answer: string, requestId: string): void {
  if (flow.activeRequestId !== requestId) throw new FlowError("STALE_FLOW_REQUEST", 409);
  flow.followUps.push({ action, answer });
  flow.phase = "completed";
  flow.activeRequestId = null;
  flow.completedRequestIds.add(requestId);
  touch(flow);
}

export function restoreCompletedFlow(flow: CaseFlow, requestId: string, safeError: string): void {
  if (flow.activeRequestId === requestId) {
    flow.activeRequestId = null;
    flow.completedRequestIds.add(requestId);
  }
  flow.phase = "completed";
  flow.safeError = safeError;
  touch(flow);
}

export function publicFlow(flow: CaseFlow): PublicCaseFlow {
  const hasCompleteAnswers = flow.questions.length > 0 && flow.questions.every((question) => Boolean(flow.answers[question.id]));
  const retryableFailure = flow.safeError === "PROVIDER_TIMEOUT" || flow.safeError === "PROVIDER_UNAVAILABLE" || flow.safeError === "CASE_FAILED";
  const allowedActions: CaseFlowAction[] = flow.phase === "awaiting_answers"
    ? ["answer", "skip"]
    : flow.phase === "failed" && hasCompleteAnswers && retryableFailure
      ? ["resume"]
      : [];
  return {
    id: flow.id,
    conversationId: flow.conversationId,
    phase: flow.phase,
    mode: flow.mode,
    capUsd: flow.capUsd,
    budgetedSpendUsd: flow.budgetedSpendUsd,
    remainingUsd: Math.max(0, flow.capUsd - flow.budgetedSpendUsd),
    questions: flow.questions.map((q) => ({
      id: q.id,
      question: q.question,
      options: q.options.map((o) => o.label),
    })),
    allowedActions,
    answer: flow.answer,
    followUps: [...flow.followUps],
    safeError: flow.safeError,
    manual: flow.manual ? {
      preset: flow.manual.preset,
      clarification: flow.manual.clarification,
      knowledge: flow.manual.knowledge,
      memory: flow.manual.memory,
      savedCaseId: flow.manual.savedCaseId,
      retrieval: flow.manual.retrieval ? structuredClone(flow.manual.retrieval) : null,
      telemetry: flow.manual.telemetry ? structuredClone(flow.manual.telemetry) : null,
    } : null,
  };
}

/** Tests only. Never expose this through a route. */
export function clearCaseFlowsForTest(): void {
  flows.clear();
}
