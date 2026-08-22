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

export const maxDuration = 300;

type Action = "create" | "answer" | "skip" | "follow_up";

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
}

function safeCode(e: unknown): string {
  const name = e instanceof Error ? e.name : "";
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

    let skipClarify = false;
    if (action === "answer") {
      acceptAnswers(flow, body.answers ?? {});
      beginTransition(flow, requestId, ["awaiting_answers"], "analysing");
    } else if (action === "skip") {
      beginTransition(flow, requestId, ["awaiting_answers"], "analysing");
      skipClarify = true;
    } else if (action !== "create") {
      throw new FlowError("BAD_REQUEST", 400);
    }

    const remaining = Math.max(0, flow.capUsd - flow.budgetedSpendUsd);
    const ledger = new CostLedger("standard", remaining);
    operationLedger = ledger;
    const safetyText = action === "create"
      ? flow.account
      : action === "answer"
        ? Object.values(flow.answers).join("\n")
        : "";
    const includeClarify = action === "create";
    const answerBlock = formatAnswers(flow.questions, flow.answers);
    const projected = projectAdvicePipeline({
      account: answerBlock ? `${flow.account}\n\nУточнения:\n${answerBlock}` : flow.account,
      mode: flow.mode,
      responseLanguage: flow.responseLanguage as ResponseLanguage,
      jurisdiction: flow.jurisdiction as Jurisdiction,
      includeClarify,
    }) + (safetyText ? projectCaseSafety(safetyText) : 0);
    if (projected > remaining) {
      throw new CaseTooComplexError(flow.mode, projected, remaining, null);
    }
    if (safetyText) {
      const safety = await screenCaseSafety(safetyText, ledger, transport);
      if (safety.triggered && safety.type) {
        addSpend(flow, ledger.budgetedSpendUsd);
        spendCaptured = true;
        completeFlow(flow, buildStaticCrisisReply(safety.type), requestId);
        return response(flow);
      }
    }
    const result = await runAdvice({
      account: flow.account,
      analysisMode: flow.mode,
      responseLanguage: flow.responseLanguage as ResponseLanguage,
      jurisdiction: flow.jurisdiction as Jurisdiction,
      ledger,
      preflightCapUsd: ledger.remainingUsd,
      askedQuestions: flow.questions,
      answers: flow.answers,
      skipClarify,
    }, transport);
    addSpend(flow, ledger.budgetedSpendUsd);
    spendCaptured = true;

    if (result.kind === "questions") {
      setQuestions(flow, result.questions, requestId);
    } else {
      completeFlow(flow, result.answer, requestId);
    }
    return response(flow);
  } catch (e) {
    if (flow && requestId) {
      if (operationLedger && !spendCaptured) {
        addSpend(flow, operationLedger.budgetedSpendUsd);
        spendCaptured = true;
      }
      const code = e instanceof FlowError ? e.code : safeCode(e);
      // Validation and stale-transition errors do not mutate a healthy flow.
      if (!(e instanceof FlowError && e.status < 500)) failFlow(flow, requestId, code);
    }
    if (e instanceof FlowError) return NextResponse.json({ error: e.code, ...(flow ? { flow: publicFlow(flow) } : {}) }, { status: e.status });
    return NextResponse.json({ error: safeCode(e), ...(flow ? { flow: publicFlow(flow) } : {}) }, { status: 502 });
  }
}
