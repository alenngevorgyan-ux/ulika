import { randomBytes } from "node:crypto";
import { join } from "node:path";
import { NextRequest, NextResponse } from "next/server";
import { getServerSupabase } from "@/lib/supabase/server";
import { labEnabled, resolveModelChoice, ModelChoiceRejected } from "@/lib/megabrain/labAccess";
import { capFor, MODES, ModeNotAvailable, type AnalysisMode } from "@/lib/megabrain/analysisMode";
import { CostLedger } from "@/lib/megabrain/costLedger";
import { RunRecorder, describeFailure } from "@/lib/megabrain/runRecorder";
import { buildDiagnostics } from "@/lib/megabrain/labDiagnostics";
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

  /**
   * Declared OUT here, not inside the try, and that is the whole point of this
   * block rather than a style preference.
   *
   * Previously `const ledger` lived inside the try, so in the catch it was not
   * merely empty — it was out of scope. Every fact about a failed run (what it
   * spent, how far it got, which attempt was in flight) was unreachable BY
   * CONSTRUCTION. These four are undefined until they are set, which is exactly
   * what has to be expressible: a failure before the ledger exists is a real
   * outcome and must report as one instead of crashing the error handler.
   */
  let ledger: CostLedger | undefined;
  let recorder: RunRecorder | undefined;
  let currentStage: string | undefined;
  let currentAttemptId: string | undefined;
  // Known without touching the engine, so the catch can always name the cap.
  const capUsd = capFor(mode);
  const runId = randomBytes(6).toString("hex");

  try {
    const modelKey = resolveModelChoice(body.modelChoice);
    const configuration = modelKey
      ? { ...resolveConfiguration(DEFAULT_CONFIGURATION), id: "lab-override", roles: { extract: modelKey, analyse: modelKey, strategise: modelKey } }
      : resolveConfiguration(DEFAULT_CONFIGURATION);

    // The cap comes from the mode table, never from the request body.
    ledger = new CostLedger("standard", capUsd);

    /**
     * The journal is written AS THE RUN HAPPENS, not assembled at the end.
     *
     * The end is precisely what does not arrive when something throws, and a
     * report serialised after the loop is a report that does not exist for the
     * runs worth reporting on. Metadata only — the recorder's own contract —
     * so no case text, no plan and no model output can reach the disk.
     */
    recorder = new RunRecorder(join(process.cwd(), ".megabrain-journal", `lab-${runId}.jsonl`), {
      configuration: configuration.id,
      // A local run id, never the account. There is no case identity here to
      // record, and inventing one from the text is how text ends up on disk.
      caseId: `lab-${runId}`,
      capUsd,
      baseline: "none",
    });
    const journal = recorder;
    ledger.onAttempt = (a) => {
      // Set before the request leaves, so an error mid-flight still names the
      // stage and the attempt it belongs to.
      currentStage = a.stage;
      currentAttemptId = a.attemptId;
      journal.onAttempt(a);
    };
    ledger.onRecord = journal.onLedgerEntry;
    ledger.onValidation = (v) => {
      currentStage = v.stage;
      journal.onValidation(v);
    };

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
    const calls = entries.map((e) => ({
      stage: e.stage,
      model: e.model,
      reportedModel: e.reportedModel,
      provider: e.selectedProvider,
      inputTokens: e.inputTokens,
      outputTokens: e.outputTokens,
      actualCostUsd: e.actualCostUsd,
      latencyMs: e.latencyMs,
      finishReason: e.finishReason,
      retryNumber: e.retryNumber,
    }));

    /**
     * Rendering is its own step with its own failure.
     *
     * A valid FinalCasePlan means the engine SUCCEEDED. Letting a formatting
     * bug surface as ENGINE_FAILED would send the next reader looking at the
     * model, and — worse — invite a re-run that pays for the same plan twice.
     */
    let rendered: string | null = null;
    try {
      rendered = result.full ? renderAnalysis(result.full.analysis) : null;
    } catch (renderError) {
      recorder.finish("incomplete", describeFailure(renderError, currentStage ?? null), {
        reportedSpendUsd: ledger.reportedSpendUsd,
        budgetedSpendUsd: ledger.budgetedSpendUsd,
        hasUnknownCharges: ledger.hasUnknownCharges,
        engineSucceeded: true,
      });
      return NextResponse.json(
        {
          ...buildDiagnostics(renderError, {
            ledger,
            currentStage,
            currentAttemptId,
            capUsd,
            forceKind: "RENDER_ERROR",
          }),
          // The engine's own metadata survives the render failure. It was paid
          // for and it is the evidence that the model side worked.
          calls,
        },
        { status: 502 }
      );
    }

    recorder.finish("complete", undefined, {
      reportedSpendUsd: ledger.reportedSpendUsd,
      budgetedSpendUsd: ledger.budgetedSpendUsd,
      hasUnknownCharges: ledger.hasUnknownCharges,
    });

    return NextResponse.json({
      mode: result.mode,
      light: result.light ?? null,
      rendered,
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
      calls,
    });
  } catch (e) {
    // Safe codes only. A provider error body can quote the request, and the
    // request is somebody's situation.
    if (e instanceof ModeNotAvailable) return NextResponse.json({ error: e.code, mode }, { status: 400 });
    if (e instanceof ModelChoiceRejected) return NextResponse.json({ error: e.code, detail: e.message }, { status: 400 });

    // Written before the response, so the journal survives even if serialising
    // the reply is itself what goes wrong.
    recorder?.finish("incomplete", describeFailure(e, currentStage ?? null), {
      reportedSpendUsd: ledger?.reportedSpendUsd ?? 0,
      budgetedSpendUsd: ledger?.budgetedSpendUsd ?? 0,
      hasUnknownCharges: ledger?.hasUnknownCharges ?? false,
    });

    /**
     * A normalised kind from a fixed vocabulary, never `error.name`.
     *
     * The old line sent the raw class name, which is a string the exception
     * picks for itself — fine for our own classes, not something to promise
     * about a dependency's.
     */
    return NextResponse.json(
      buildDiagnostics(e, { ledger, currentStage, currentAttemptId, capUsd }),
      { status: 502 }
    );
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
