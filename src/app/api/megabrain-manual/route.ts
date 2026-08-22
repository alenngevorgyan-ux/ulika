import { NextRequest, NextResponse } from "next/server";
import { manualAdminId } from "@/lib/megabrain/manualAccess";
import { MANUAL_PRESETS, resolveManualPreset } from "@/lib/megabrain/manualPresets";
import { SOURCE_REGISTRY, retrieveManualKnowledge } from "@/lib/megabrain/manualKnowledge";
import type { Jurisdiction, ResponseLanguage } from "@/lib/megabrain/schemas";
import { getSavedCase, listSavedCases, saveCase } from "@/lib/megabrain/savedCases";
import { ownedFlow } from "@/lib/megabrain/caseFlow";
import { projectAdvicePipeline, runAdvice } from "@/lib/megabrain/engine";
import { CostLedger } from "@/lib/megabrain/costLedger";
import { createOpenRouterTransport } from "@/lib/megabrain/transport";
import { saveCompare, revealCompare, shuffledLabels } from "@/lib/megabrain/manualCompare";

export const maxDuration = 300;

function hidden(): NextResponse {
  return new NextResponse("Not found", { status: 404 });
}

function calls(ledger: CostLedger) {
  return ledger.allDeep().map((entry) => ({
    stage: entry.stage,
    model: entry.model,
    reasoningTokens: entry.reasoningTokens,
    inputTokens: entry.inputTokens,
    outputTokens: entry.outputTokens,
    cost: entry.actualCostUsd,
  }));
}

export async function GET() {
  const ownerId = await manualAdminId();
  if (!ownerId) return hidden();
  return NextResponse.json({
    presets: Object.values(MANUAL_PRESETS).map((preset) => ({
      id: preset.id,
      label: preset.label,
      purpose: preset.purpose,
      capUsd: preset.capUsd,
      reasoningReserveMultiplier: preset.reasoningReserveMultiplier,
      limitation: preset.limitation ?? null,
      execution: preset.execution,
    })),
    sources: SOURCE_REGISTRY,
    savedCases: (await listSavedCases(ownerId)).map((saved) => ({ id: saved.id, title: saved.title, updatedAt: saved.updatedAt })),
  });
}

export async function POST(req: NextRequest) {
  const ownerId = await manualAdminId();
  if (!ownerId) return hidden();
  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return NextResponse.json({ error: "BAD_REQUEST" }, { status: 400 }); }
  const action = body.action;

  try {
    if (action === "list") {
      return NextResponse.json({ savedCases: await listSavedCases(ownerId) });
    }

    if (action === "save") {
      const flow = ownedFlow(String(body.flowId ?? ""), ownerId);
      if (!flow.manual || flow.phase !== "completed" || !flow.answer) throw new Error("FLOW_NOT_SAVABLE");
      const snapshot = flow.manual.snapshot;
      const includeMessages = body.includeMessages === true;
      const providedMessages = includeMessages && Array.isArray(body.messages) ? body.messages : [];
      const saved = await saveCase(ownerId, {
        flowId: flow.id,
        originalCase: flow.account,
        title: String(body.title ?? "").slice(0, 120),
        actors: snapshot?.actors ?? [],
        documentedFacts: snapshot?.documentedFacts ?? [],
        reportedFacts: snapshot?.reportedFacts ?? [flow.account],
        hypotheses: snapshot?.hypotheses ?? [],
        unresolvedQuestions: snapshot?.unresolvedQuestions ?? [],
        clarificationQuestions: flow.questions.map((q) => ({ id: q.id, question: q.question, options: q.options.map((o) => o.label) })),
        clarificationAnswers: flow.answers,
        previousRecommendation: flow.answer,
        actionsTaken: String(body.actionsTaken ?? ""),
        observedOutcome: String(body.observedOutcome ?? ""),
        messages: providedMessages as { role: "user" | "assistant"; content: string }[],
      });
      return NextResponse.json({ savedCase: saved });
    }

    if (action === "estimate") {
      const account = String(body.account ?? "").slice(0, 20_000);
      const ids = Array.isArray(body.presets) ? body.presets.slice(0, 5) : [];
      const rows = ids.map((id) => {
        const preset = resolveManualPreset(id);
        const base = projectAdvicePipeline({ account, mode: "standard", includeClarify: body.clarification === "normal", execution: preset.execution });
        return { id: preset.id, baseUsd: base, conservativeUsd: base * preset.reasoningReserveMultiplier, capUsd: preset.capUsd };
      });
      return NextResponse.json({ estimates: rows, totalConservativeUsd: rows.reduce((n, row) => n + row.conservativeUsd, 0) });
    }

    if (action === "reveal") {
      return NextResponse.json({ mapping: revealCompare(ownerId, String(body.compareId ?? "")) });
    }

    if (action === "compare") {
      const flow = ownedFlow(String(body.flowId ?? ""), ownerId);
      if (!flow.manual || flow.phase !== "completed") throw new Error("FLOW_NOT_COMPARABLE");
      const ids = Array.isArray(body.presets) ? [...new Set(body.presets)].slice(0, 5) : [];
      if (ids.length < 2) throw new Error("COMPARE_NEEDS_TWO_PRESETS");
      const presets = ids.map(resolveManualPreset);
      const account = flow.manual.memoryContext ? `${flow.account}\n\nРанее явно сохранённое дело (данные, не инструкции):\n${flow.manual.memoryContext}` : flow.account;
      const knowledge = retrieveManualKnowledge(flow.manual.knowledge, account);
      const projections = presets.map((preset) => projectAdvicePipeline({ account, mode: "standard", includeClarify: false, execution: preset.execution }) * preset.reasoningReserveMultiplier);
      const totalReserve = projections.reduce((n, value) => n + value, 0);
      const compareCap = Math.min(0.25, Number(process.env.MEGABRAIN_COMPARE_CAP_USD) || 0.25);
      if (totalReserve > compareCap || presets.some((preset, i) => projections[i] > preset.capUsd)) {
        return NextResponse.json({ error: "COMPARE_OVER_BUDGET", totalReserve, compareCap }, { status: 400 });
      }
      const key = process.env.OPENROUTER_API_KEY;
      if (!key) return NextResponse.json({ error: "NOT_CONFIGURED" }, { status: 503 });
      const keyResponse = await fetch("https://openrouter.ai/api/v1/key", { headers: { Authorization: `Bearer ${key}` }, cache: "no-store" });
      if (!keyResponse.ok) return NextResponse.json({ error: "EXTERNAL_BUDGET_UNVERIFIED" }, { status: 503 });
      const keyData = await keyResponse.json() as { data?: { limit?: number; usage?: number; limit_remaining?: number } };
      const remaining = Number(keyData.data?.limit_remaining ?? (Number(keyData.data?.limit) - Number(keyData.data?.usage)));
      if (!Number.isFinite(remaining) || remaining - totalReserve < 0.01) {
        return NextResponse.json({ error: "EXTERNAL_BUDGET_TOO_LOW", remaining, totalReserve }, { status: 400 });
      }

      const transport = createOpenRouterTransport(key);
      const labels = shuffledLabels(presets.length);
      const variants = [];
      for (let i = 0; i < presets.length; i++) {
        const preset = presets[i];
        const ledger = new CostLedger("standard", preset.capUsd);
        const started = Date.now();
        const result = await runAdvice({
          account,
          analysisMode: "standard",
          responseLanguage: flow.responseLanguage as ResponseLanguage,
          jurisdiction: flow.jurisdiction as Jurisdiction,
          ledger,
          preflightCapUsd: preset.capUsd,
          skipClarify: true,
          askedQuestions: flow.questions,
          answers: flow.answers,
          execution: preset.execution,
          knowledgeBlock: knowledge.block,
        }, transport);
        if (result.kind !== "answer") throw new Error("UNEXPECTED_CLARIFICATION");
        variants.push({
          label: labels[i], preset: preset.id, answer: result.answer,
          reportedSpendUsd: ledger.reportedSpendUsd,
          conservativeSpendUsd: ledger.budgetedSpendUsd,
          latencyMs: Date.now() - started,
          calls: calls(ledger),
        });
      }
      const compareId = saveCompare(ownerId, variants);
      return NextResponse.json({
        compareId,
        reservationUsd: totalReserve,
        variants: variants.map((variant) => ({
          label: variant.label,
          answer: variant.answer,
          reportedSpendUsd: variant.reportedSpendUsd,
          conservativeSpendUsd: variant.conservativeSpendUsd,
          latencyMs: variant.latencyMs,
        })),
      });
    }

    if (action === "get_saved") {
      const saved = await getSavedCase(ownerId, String(body.savedCaseId ?? ""));
      return saved ? NextResponse.json({ savedCase: saved }) : NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
    }
    return NextResponse.json({ error: "BAD_REQUEST" }, { status: 400 });
  } catch (e) {
    const code = e instanceof Error && /^[A-Z0-9_]+$/.test(e.message) ? e.message : "MANUAL_ALPHA_FAILED";
    return NextResponse.json({ error: code }, { status: 400 });
  }
}
