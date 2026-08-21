import { NextRequest, NextResponse } from "next/server";
import { getServerSupabase } from "@/lib/supabase/server";
import { labEnabled, resolveModelChoice, ModelChoiceRejected } from "@/lib/megabrain/labAccess";
import { capFor, MODES, ModeNotAvailable, type AnalysisMode } from "@/lib/megabrain/analysisMode";
import { CostLedger } from "@/lib/megabrain/costLedger";
import { runAnalysis, renderAnalysis } from "@/lib/megabrain/engine";
import { createOpenRouterTransport } from "@/lib/megabrain/transport";
import { resolveConfiguration, DEFAULT_CONFIGURATION } from "@/lib/megabrain/modelRouter";
import type { Jurisdiction, ResponseLanguage } from "@/lib/megabrain/schemas";

export const maxDuration = 120;

/**
 * The lab's server route. Admin-only, flag-gated, and the only place the key
 * lives.
 *
 * NOTHING IS PERSISTED. No case text, no plan, no artifact, no database row.
 * The response goes back once and the server forgets it. This is a real
 * person's situation, not a frozen test case, and persisting it would be a
 * decision nobody has made.
 */
export async function POST(req: NextRequest) {
  // 404, not 403: a disabled surface should not confirm it exists.
  if (!labEnabled()) return new NextResponse("Not found", { status: 404 });

  const supabase = await getServerSupabase();
  if (!supabase) return new NextResponse("Not found", { status: 404 });
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });

  const { data: admin } = await supabase.from("app_admins").select("user_id").eq("user_id", user.id).maybeSingle();
  if (!admin) return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });

  let body: {
    account?: string;
    responseLanguage?: ResponseLanguage;
    jurisdiction?: Jurisdiction;
    analysisMode?: AnalysisMode;
    modelChoice?: string;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "BAD_REQUEST" }, { status: 400 });
  }

  const account = String(body.account ?? "").slice(0, 20_000);
  if (account.trim().length < 20) return NextResponse.json({ error: "ACCOUNT_TOO_SHORT" }, { status: 400 });

  const mode: AnalysisMode = (["light", "standard", "strong", "deep"] as const).find((m) => m === body.analysisMode) ?? "standard";

  const key = process.env.OPENROUTER_API_KEY;
  if (!key) return NextResponse.json({ error: "NOT_CONFIGURED" }, { status: 503 });

  try {
    const modelKey = resolveModelChoice(body.modelChoice);
    const configuration = modelKey
      ? { ...resolveConfiguration(DEFAULT_CONFIGURATION), id: "lab-override", roles: { extract: modelKey, analyse: modelKey, strategise: modelKey } }
      : resolveConfiguration(DEFAULT_CONFIGURATION);

    // The cap comes from the mode table, never from the request body.
    const ledger = new CostLedger("standard", capFor(mode));
    const result = await runAnalysis(
      {
        account,
        analysisMode: mode,
        responseLanguage: body.responseLanguage ?? "auto",
        jurisdiction: body.jurisdiction ?? { country: "unknown" },
        configurationId: configuration.id === "lab-override" ? DEFAULT_CONFIGURATION : configuration.id,
        ledger,
      },
      createOpenRouterTransport(key)
    );

    const entries = ledger.allDeep();
    return NextResponse.json({
      mode: result.mode,
      light: result.light ?? null,
      rendered: result.full ? renderAnalysis(result.full.analysis) : null,
      analysis: result.full?.analysis ?? null,
      problems: result.full?.problems ?? [],
      cost: {
        reportedSpendUsd: ledger.reportedSpendUsd,
        budgetedSpendUsd: ledger.budgetedSpendUsd,
        hasUnknownCharges: ledger.hasUnknownCharges,
        capUsd: ledger.capUsd,
        latencyMs: entries.reduce((n, e) => n + e.latencyMs, 0),
      },
      // Metadata only, and only the allowlisted fields the ledger already holds.
      calls: entries.map((e) => ({
        stage: e.stage,
        model: e.model,
        reportedModel: e.reportedModel,
        provider: e.selectedProvider,
        inputTokens: e.inputTokens,
        outputTokens: e.outputTokens,
        actualCostUsd: e.actualCostUsd,
        latencyMs: e.latencyMs,
      })),
    });
  } catch (e) {
    // Safe codes only. A provider error body can quote the request, and the
    // request is somebody's situation.
    if (e instanceof ModeNotAvailable) return NextResponse.json({ error: e.code, mode }, { status: 400 });
    if (e instanceof ModelChoiceRejected) return NextResponse.json({ error: e.code, detail: e.message }, { status: 400 });
    const name = e instanceof Error ? e.name : "Error";
    return NextResponse.json({ error: "ENGINE_FAILED", kind: name }, { status: 502 });
  }
}

/** Pre-flight numbers for the page, so a cost is shown before anything is spent. */
export async function GET() {
  if (!labEnabled()) return new NextResponse("Not found", { status: 404 });
  return NextResponse.json({
    modes: Object.values(MODES).map((m) => ({
      id: m.id, label: m.label, capUsd: m.capUsd, maxModelCalls: m.maxModelCalls,
      available: m.available, unavailableReason: m.unavailableReason ?? null,
    })),
  });
}
