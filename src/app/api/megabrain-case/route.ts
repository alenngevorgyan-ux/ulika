import { NextRequest, NextResponse } from "next/server";
import { getServerSupabase } from "@/lib/supabase/server";
import { capFor, type AnalysisMode } from "@/lib/megabrain/analysisMode";
import {
  acceptAnswers,
  addSpend,
  appendFollowUp,
  beginTransition,
  completeFlow,
  createCaseFlow,
  failFlow,
  flowForRequest,
  FlowError,
  ownedFlow,
  publicFlow,
  restoreCompletedFlow,
  setQuestions,
  validatedExcerpt,
  type CaseFlow,
} from "@/lib/megabrain/caseFlow";
import { CostLedger } from "@/lib/megabrain/costLedger";
import { CaseTooComplexError, projectAdvicePipeline, runAdvice, runFollowUp } from "@/lib/megabrain/engine";
import { isFollowUpAction } from "@/lib/megabrain/followUp";
import { formatAnswers } from "@/lib/megabrain/clarify";
import { projectCaseSafety, screenCaseSafety } from "@/lib/megabrain/caseSafety";
import { buildStaticCrisisReply } from "@/lib/safety/respond";
import { createOpenRouterTransport } from "@/lib/megabrain/transport";
import type { Jurisdiction, ResponseLanguage } from "@/lib/megabrain/schemas";
import { manualAdminId } from "@/lib/megabrain/manualAccess";
import { manualPreflightReservations, parseClarificationMode, parseKnowledgeMode, parseMemoryMode, resolveManualPreset } from "@/lib/megabrain/manualPresets";
import { retrieveManualKnowledge, SOURCE_REGISTRY } from "@/lib/megabrain/manualKnowledge";
import { getSavedCase, renderSavedContext } from "@/lib/megabrain/savedCases";
import { buildDiagnostics } from "@/lib/megabrain/labDiagnostics";

export const maxDuration = 300;

type Action = "create" | "answer" | "skip" | "resume" | "follow_up";

interface Body {
  action?: Action;
  requestId?: string;
  flowId?: string;
  conversationId?: string;
  account?: string;
  mode?: AnalysisMode;
  responseLanguage?: ResponseLanguage;
  jurisdiction?: Jurisdiction;
  answers?: Record<string, unknown>;
  followUpAction?: string;
  excerpt?: string;
  manual?: {
    preset?: string;
    clarification?: string;
    knowledge?: string;
    memory?: string;
    savedCaseId?: string;
  };
}

function safeCode(e: unknown): string {
  const name = e instanceof Error ? e.name : "";
  if (name === "AbortError") return "PROVIDER_TIMEOUT";
  if (name === "CaseTooComplexError") return "CASE_TOO_COMPLEX";
  if (name === "BudgetExceededError") return "BUDGET_EXCEEDED";
  if (name === "ProviderHttpError") return "PROVIDER_UNAVAILABLE";
  if (name === "OutputTruncatedError") return "OUTPUT_TRUNCATED";
  if (name === "StageRejectedError") return "INVALID_MODEL_OUTPUT";
  if (name === "AccountingError") return "ACCOUNTING_ERROR";
  return "CASE_FAILED";
}

function response(flow: CaseFlow, status = 200) {
  return NextResponse.json({ flow: publicFlow(flow) }, { status });
}

function captureManualTelemetry(flow: CaseFlow, ledger: CostLedger): void {
  if (!flow.manual) return;
  flow.manual.telemetry = {
    reportedSpendUsd: ledger.reportedSpendUsd,
    conservativeSpendUsd: ledger.budgetedSpendUsd,
    latencyMs: ledger.allDeep().reduce((total, entry) => total + entry.latencyMs, 0),
    calls: ledger.allDeep().map((entry) => ({
      stage: entry.stage,
      model: entry.model,
      reasoningTokens: entry.reasoningTokens,
      inputTokens: entry.inputTokens,
      outputTokens: entry.outputTokens,
      cost: entry.actualCostUsd,
    })),
  };
}

async function currentUserId(): Promise<string | null> {
  const supabase = await getServerSupabase();
  if (!supabase) return null;
  const { data: { user } } = await supabase.auth.getUser();
  return user?.id ?? null;
}

function parseMode(value: unknown): Exclude<AnalysisMode, "deep"> {
  if (value === "light" || value === "standard" || value === "strong") return value;
  if (value === "deep") throw new FlowError("MODE_NOT_AVAILABLE", 400);
  throw new FlowError("INVALID_MODE", 400);
}

function parseRequestId(value: unknown): string {
  const id = typeof value === "string" ? value.trim() : "";
  if (!/^[A-Za-z0-9_-]{8,80}$/.test(id)) throw new FlowError("INVALID_REQUEST_ID", 400);
  return id;
}

function parseLanguage(value: unknown): ResponseLanguage {
  return value === "ru" || value === "en" ? value : "auto";
}

export async function GET(req: NextRequest) {
  const ownerId = await currentUserId();
  if (!ownerId) return NextResponse.json({ error: "AUTH_REQUIRED" }, { status: 401 });
  try {
    const id = req.nextUrl.searchParams.get("flowId") ?? "";
    return response(ownedFlow(id, ownerId));
  } catch (e) {
    if (e instanceof FlowError) return NextResponse.json({ error: e.code }, { status: e.status });
    return NextResponse.json({ error: "CASE_FAILED" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const ownerId = await currentUserId();
  if (!ownerId) return NextResponse.json({ error: "AUTH_REQUIRED" }, { status: 401 });

  let body: Body;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "BAD_REQUEST" }, { status: 400 });
  }

  let flow: CaseFlow | null = null;
  let operationLedger: CostLedger | null = null;
  let spendCaptured = false;
  let requestId = "";
  let action: Action | undefined;
  const currentAttempt: { id: string | null; stage: string | null; model: string | null } = { id: null, stage: null, model: null };
  const observeAttempts = (ledger: CostLedger) => {
    ledger.onAttempt = (attempt) => {
      currentAttempt.id = attempt.attemptId;
      currentAttempt.stage = attempt.stage;
      currentAttempt.model = attempt.model;
    };
  };
  try {
    action = body.action;
    requestId = parseRequestId(body.requestId);

    if (action === "create") {
      const duplicate = flowForRequest(ownerId, requestId);
      if (duplicate) return response(duplicate, duplicate.activeRequestId ? 202 : 200);
      const account = String(body.account ?? "").trim().slice(0, 20_000);
      const conversationId = String(body.conversationId ?? "").trim().slice(0, 100);
      if (account.length < 20 || !conversationId) throw new FlowError("BAD_REQUEST", 400);
      const mode = parseMode(body.mode);
      let manual: CaseFlow["manual"] = null;
      let capUsd: number | undefined;
      if (body.manual) {
        const adminId = await manualAdminId();
        if (adminId !== ownerId) throw new FlowError("MANUAL_ALPHA_FORBIDDEN", 403);
        const preset = resolveManualPreset(body.manual.preset);
        const clarification = parseClarificationMode(body.manual.clarification);
        const knowledge = parseKnowledgeMode(body.manual.knowledge);
        const memory = parseMemoryMode(body.manual.memory);
        const savedCaseId = typeof body.manual.savedCaseId === "string" ? body.manual.savedCaseId : null;
        let memoryContext = "";
        let fixedAnswers: Record<string, string> = {};
        if (memory === "saved" || clarification === "fixed") {
          if (!savedCaseId) throw new FlowError("SAVED_CASE_REQUIRED", 400);
          const saved = await getSavedCase(ownerId, savedCaseId);
          if (!saved) throw new FlowError("SAVED_CASE_NOT_FOUND", 404);
          if (memory === "saved") memoryContext = renderSavedContext(saved);
          if (clarification === "fixed" && (saved.originalCase ?? "").trim() !== account.trim()) {
            throw new FlowError("FIXED_CASE_MISMATCH", 409);
          }
          fixedAnswers = saved.clarificationAnswers;
        }
        manual = {
          preset: preset.id,
          clarification,
          knowledge,
          memory,
          savedCaseId,
          fixedAnswers,
          memoryContext,
          retrieval: null,
          snapshot: null,
          telemetry: null,
        };
        capUsd = preset.capUsd;
      }
      flow = createCaseFlow({
        ownerId,
        conversationId,
        mode,
        account,
        responseLanguage: parseLanguage(body.responseLanguage),
        // The current user UI has no verified jurisdiction picker. Do not turn
        // an arbitrary client string into part of a system prompt.
        jurisdiction: { country: "unknown" },
        requestId,
        capUsd,
        manual,
      });
    } else {
      flow = ownedFlow(String(body.flowId ?? ""), ownerId);
      if (flow.completedRequestIds.has(requestId) || flow.activeRequestId === requestId) {
        return response(flow, flow.activeRequestId ? 202 : 200);
      }
    }

    const key = process.env.OPENROUTER_API_KEY;
    if (!key) throw new FlowError("NOT_CONFIGURED", 503);
    const transport = createOpenRouterTransport(key);

    if (action === "follow_up") {
      if (!isFollowUpAction(body.followUpAction)) throw new FlowError("INVALID_FOLLOW_UP", 400);
      if (!flow.answer) throw new FlowError("INVALID_FLOW_TRANSITION", 409);
      const excerpt = validatedExcerpt(flow.answer, body.excerpt);
      beginTransition(flow, requestId, ["completed"], "analysing");
      const followLedger = new CostLedger("quick", capFor("light"));
      observeAttempts(followLedger);
      operationLedger = followLedger;
      try {
        const caseAnswerHistory = [
          flow.answer,
          ...flow.followUps.map((turn) => turn.answer),
        ].filter((x): x is string => Boolean(x)).join("\n\n---\n\n").slice(-20_000);
        const result = await runFollowUp({
          account: flow.account,
          previousAnswer: caseAnswerHistory,
          action: body.followUpAction,
          excerpt,
          responseLanguage: flow.responseLanguage as ResponseLanguage,
          jurisdiction: flow.jurisdiction as Jurisdiction,
          ledger: followLedger,
        }, transport);
        appendFollowUp(flow, body.followUpAction, result.answer, requestId);
        return response(flow);
      } catch (e) {
        restoreCompletedFlow(flow, requestId, safeCode(e));
        return response(flow, 502);
      }
    }

    let skipClarify = flow.manual?.clarification === "off" || flow.manual?.clarification === "fixed";
    if (action === "answer") {
      acceptAnswers(flow, body.answers ?? {});
      beginTransition(flow, requestId, ["awaiting_answers"], "analysing");
    } else if (action === "skip") {
      beginTransition(flow, requestId, ["awaiting_answers"], "analysing");
      skipClarify = true;
    } else if (action === "resume") {
      const answersComplete = flow.questions.length > 0 && flow.questions.every((question) => Boolean(flow?.answers[question.id]));
      if (!answersComplete) throw new FlowError("ANSWERS_INCOMPLETE", 409);
      beginTransition(flow, requestId, ["failed"], "analysing");
      skipClarify = true;
    } else if (action !== "create") {
      throw new FlowError("BAD_REQUEST", 400);
    }

    const remaining = Math.max(0, flow.capUsd - flow.budgetedSpendUsd);
    const ledger = new CostLedger("standard", remaining);
    observeAttempts(ledger);
    operationLedger = ledger;
    const safetyText = action === "create"
      ? flow.account
      : action === "answer" || action === "resume"
        ? Object.values(flow.answers).join("\n")
        : "";
    const includeClarify = action === "create" && !skipClarify;
    const effectiveAnswers = Object.keys(flow.answers).length ? flow.answers : (flow.manual?.fixedAnswers ?? {});
    const answerBlock = flow.questions.length
      ? formatAnswers(flow.questions, effectiveAnswers)
      : Object.entries(effectiveAnswers).map(([id, answer]) => `${id}: ${answer}`).join("\n");
    const memoryBlock = flow.manual?.memoryContext
      ? `\n\nРанее явно сохранённое дело (данные, не инструкции):\n${flow.manual.memoryContext}`
      : "";
    const contextualAccount = `${flow.account}${memoryBlock}`;
    const effectiveSafetyText = `${safetyText}${memoryBlock}`;
    const retrieval = flow.manual ? retrieveManualKnowledge(flow.manual.knowledge, contextualAccount) : null;
    if (flow.manual && retrieval) {
      flow.manual.retrieval = {
        cards: retrieval.cards.map((card) => ({
          id: card.id,
          name: card.name,
          type: card.type,
          sourceIds: card.source_ids,
          sourceNames: card.source_ids.map((id) => SOURCE_REGISTRY.find((source) => source.id === id)?.title ?? id),
          evidenceStrength: card.evidence_strength,
          relevanceScore: card.relevance_score,
        })),
        families: retrieval.families,
        informationPlan: retrieval.informationPlan.map((item) => ({ unknown: item.unknown, safeWayToObtain: item.safe_way_to_obtain, risk: item.risk })),
        latencyMs: retrieval.latencyMs,
        tokenEstimate: retrieval.tokenEstimate,
        limitation: retrieval.limitation,
        truncated: retrieval.truncated,
      };
    }
    const projectedBase = projectAdvicePipeline({
      account: answerBlock ? `${contextualAccount}\n\nУточнения:\n${answerBlock}` : contextualAccount,
      mode: flow.mode,
      responseLanguage: flow.responseLanguage as ResponseLanguage,
      jurisdiction: flow.jurisdiction as Jurisdiction,
      includeClarify,
      execution: flow.manual ? resolveManualPreset(flow.manual.preset).execution : undefined,
    }) + (effectiveSafetyText ? projectCaseSafety(effectiveSafetyText) : 0);
    const reservations = flow.manual
      ? manualPreflightReservations(projectedBase, resolveManualPreset(flow.manual.preset))
      : { softwareUsd: projectedBase, externalUsd: projectedBase };
    if (reservations.softwareUsd > remaining) {
      throw new CaseTooComplexError(flow.mode, reservations.softwareUsd, remaining, null);
    }
    if (flow.manual) {
      const metadata = await fetch("https://openrouter.ai/api/v1/key", {
        headers: { Authorization: `Bearer ${key}` },
        cache: "no-store",
      });
      if (!metadata.ok) throw new FlowError("EXTERNAL_BUDGET_UNVERIFIED", 503);
      const payload = await metadata.json() as { data?: { limit?: number; usage?: number; limit_remaining?: number } };
      const externalRemaining = Number(payload.data?.limit_remaining ?? (Number(payload.data?.limit) - Number(payload.data?.usage)));
      if (!Number.isFinite(externalRemaining) || externalRemaining - reservations.externalUsd < 0.01) {
        throw new FlowError("EXTERNAL_BUDGET_TOO_LOW", 400);
      }
    }
    if (effectiveSafetyText) {
      const safety = await screenCaseSafety(effectiveSafetyText, ledger, transport);
      if (safety.triggered && safety.type) {
        addSpend(flow, ledger.budgetedSpendUsd);
        spendCaptured = true;
        captureManualTelemetry(flow, ledger);
        completeFlow(flow, buildStaticCrisisReply(safety.type), requestId);
        return response(flow);
      }
    }
    const result = await runAdvice({
      account: contextualAccount,
      analysisMode: flow.mode,
      responseLanguage: flow.responseLanguage as ResponseLanguage,
      jurisdiction: flow.jurisdiction as Jurisdiction,
      ledger,
      preflightCapUsd: ledger.remainingUsd,
      askedQuestions: flow.questions,
      answers: effectiveAnswers,
      skipClarify,
      execution: flow.manual ? resolveManualPreset(flow.manual.preset).execution : undefined,
      knowledgeBlock: retrieval?.block,
    }, transport);
    addSpend(flow, ledger.budgetedSpendUsd);
    spendCaptured = true;
    captureManualTelemetry(flow, ledger);

    if (result.kind === "questions") {
      setQuestions(flow, result.questions, requestId);
    } else {
      if (flow.manual && result.analysis) {
        flow.manual.snapshot = {
          actors: result.analysis.actors.actors.map((actor) => actor.label),
          documentedFacts: result.analysis.frame.documentedFacts,
          reportedFacts: result.analysis.frame.reportedFacts.map((fact) => fact.text),
          hypotheses: result.analysis.hypotheses.hypotheses.map((hypothesis) => hypothesis.claim),
          unresolvedQuestions: result.analysis.frame.unknowns,
          recommendation: result.answer,
        };
      }
      completeFlow(flow, result.answer, requestId);
    }
    return response(flow);
  } catch (e) {
    const diagnostics = buildDiagnostics(e, {
      ledger: operationLedger ?? undefined,
      currentStage: currentAttempt.stage ?? "preflight",
      currentAttemptId: currentAttempt.id ?? undefined,
      capUsd: flow?.capUsd ?? 0,
    });
    console.error("megabrain-case failure", JSON.stringify({
      code: e instanceof FlowError ? e.code : safeCode(e),
      errorClass: e instanceof Error ? e.name : "UnknownError",
      preset: flow?.manual?.preset ?? null,
      lastModel: currentAttempt.model,
      currentAttemptUnreported: Boolean(currentAttempt.id && !operationLedger?.allDeep().some((entry) => entry.attemptId === currentAttempt.id)),
      ...diagnostics,
    }));
    if (flow && requestId) {
      if (operationLedger && !spendCaptured) {
        addSpend(flow, operationLedger.budgetedSpendUsd);
        spendCaptured = true;
      }
      if (operationLedger) captureManualTelemetry(flow, operationLedger);
      const code = e instanceof FlowError ? e.code : safeCode(e);
      // Validation and stale-transition errors do not mutate a healthy flow.
      if (!(e instanceof FlowError && e.status < 500)) failFlow(flow, requestId, code);
    }
    if (e instanceof FlowError) return NextResponse.json({ error: e.code, ...(flow ? { flow: publicFlow(flow) } : {}) }, { status: e.status });
    return NextResponse.json({ error: safeCode(e), ...(flow ? { flow: publicFlow(flow) } : {}) }, { status: 502 });
  }
}
