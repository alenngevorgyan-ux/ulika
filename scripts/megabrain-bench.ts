import "./_load-env";
import { writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { CONFIGURATIONS } from "../src/lib/megabrain/modelRouter";
import { MODELS } from "../src/lib/megabrain/modelRouter";
import { MODE_CAPS, CostLedger, AccountingError } from "../src/lib/megabrain/costLedger";
import { benchmarkCost, engineCost, fitsStandardCap, scale } from "../src/lib/megabrain/costReport";
import { renderAnalysis, runBaseline, runCase } from "../src/lib/megabrain/engine";
import { createOpenRouterTransport } from "../src/lib/megabrain/transport";
import { FROZEN_CASES } from "../src/lib/megabrain/evals/cases";
import { SMOKE_BASELINE } from "../src/lib/megabrain/modelRouter";
import { gradeAnswer, summarise } from "../src/lib/megabrain/evals/graders";
import { compareBlind, summariseComparisons, type ComparisonResult } from "../src/lib/megabrain/evals/compare";
import { RunRecorder, describeFailure } from "../src/lib/megabrain/runRecorder";

/**
 * The ONLY thing in this repository that can spend money, and it never runs by
 * itself. Not imported by the app, not reachable from vitest, not part of the
 * build. Running it is a deliberate act with an explicit flag and a hard total
 * limit that it refuses to exceed.
 *
 *   npx tsx scripts/megabrain-bench.ts --dry-run                 free, always
 *   npx tsx scripts/megabrain-bench.ts --verify-prices           free, no key
 *   npx tsx scripts/megabrain-bench.ts --live --limit 5 --max-usd 0.50
 *
 * --dry-run is the default. Live runs require --live AND --max-usd, and stop
 * the moment projected spend would cross it.
 */

const argv = process.argv.slice(2);
const flag = (name: string) => argv.includes(`--${name}`);
const value = (name: string, fallback?: string) => {
  const i = argv.indexOf(`--${name}`);
  return i >= 0 && argv[i + 1] ? argv[i + 1] : fallback;
};

const LIVE = flag("live");
const CONFIG_ID = value("config", "cheap-extract-sonnet")!;
const LIMIT = Number(value("limit", "5"));
const MAX_USD = Number(value("max-usd", "0"));
const OUT_DIR = fileURLToPath(new URL("../bench", import.meta.url));

async function dryRun() {
  const usd = (n: number) => `$${n.toFixed(4)}`;
  console.log("DRY RUN — no requests, no cost.\n");
  console.log("Three bounds, and conflating them is what made earlier numbers disagree:");
  console.log("  expected  — typical output length, no retry. A forecast.");
  console.log("  reserved  — every stage once at its output ceiling. What the guard checks.");
  console.log("  absolute  — every stage additionally using its one retry. A planning bound;");
  console.log("              the guard reserves against ACTUAL spend, so it refuses a retry");
  console.log("              rather than letting a case reach this. Retries are best-effort.\n");

  console.log("A. PRODUCT RUNTIME — engine only, one Standard case\n");
  for (const id of Object.keys(CONFIGURATIONS)) {
    const e = engineCost(id);
    const fit = fitsStandardCap(id);
    console.log(
      `  ${id.padEnd(22)} expected ${usd(e.expectedUsd)}  reserved ${usd(e.reservedUsd)}  absolute ${usd(e.absoluteUsd)}  ` +
        `${fit.fits ? "within" : "OVER"} $${MODE_CAPS.standard} cap`
    );
  }

  const b = benchmarkCost(CONFIG_ID);
  console.log(`\nB. BENCHMARK — engine + baseline + judge, configuration "${CONFIG_ID}"\n`);
  for (const [label, bound] of [["engine", b.engine], ["baseline", b.baseline], ["judge", b.judge], ["TOTAL/case", b.total]] as const) {
    console.log(`  ${label.padEnd(12)} expected ${usd(bound.expectedUsd)}  reserved ${usd(bound.reservedUsd)}  absolute ${usd(bound.absoluteUsd)}`);
  }
  console.log("\n  cases   expected    reserved    absolute");
  for (const n of [1, 2, 5, 20]) {
    const t = scale(b.total, n);
    console.log(`  ${String(n).padStart(5)}   ${usd(t.expectedUsd).padEnd(11)} ${usd(t.reservedUsd).padEnd(11)} ${usd(t.absoluteUsd)}`);
  }
  console.log(`\nBaseline used in the smoke: ${SMOKE_BASELINE} (current-production baseline defined but not run).`);
  console.log(`Frozen cases available: ${FROZEN_CASES.length}. Graders run offline; only the judge needs the network.`);
}

/** Re-read prices from the live catalogue. Free, unauthenticated, no key. */
async function verifyPrices() {
  // Free and unauthenticated, but it IS a network call. Guarded so it can never
  // run inside a "no network" check by accident.
  if (!flag("allow-network")) {
    console.error("verify-prices contacts openrouter.ai. Re-run with --allow-network to permit it.");
    process.exit(1);
  }
  const res = await fetch("https://openrouter.ai/api/v1/models");
  const data = (await res.json()) as { data: { id: string; pricing: { prompt: string; completion: string } }[] };
  const live = new Map(data.data.map((m) => [m.id, m.pricing]));
  let drift = 0;
  for (const [key, spec] of Object.entries(MODELS)) {
    const p = live.get(spec.slug);
    if (!p) {
      console.log(`  ${key.padEnd(24)} SLUG NOT FOUND — the router would price a model that does not exist`);
      drift++;
      continue;
    }
    const inUsd = Number(p.prompt) * 1e6;
    const outUsd = Number(p.completion) * 1e6;
    const ok = Math.abs(inUsd - spec.inputPerMTok) < 1e-6 && Math.abs(outUsd - spec.outputPerMTok) < 1e-6;
    if (!ok) drift++;
    console.log(
      `  ${key.padEnd(24)} recorded ${spec.inputPerMTok}/${spec.outputPerMTok}  live ${inUsd}/${outUsd}  ${ok ? "ok" : "DRIFT"}`
    );
  }
  console.log(drift ? `\n${drift} model(s) drifted — the cost guard is using stale numbers.` : "\nAll prices current.");
  process.exit(drift ? 1 : 0);
}

async function live() {
  if (!Number.isFinite(MAX_USD) || MAX_USD <= 0) {
    console.error("Refusing to run live without an explicit --max-usd limit.");
    process.exit(1);
  }
  const key = process.env.OPENROUTER_API_KEY;
  if (!key) {
    console.error("OPENROUTER_API_KEY is not set.");
    process.exit(1);
  }

  const cases = FROZEN_CASES.slice(0, Math.max(1, LIMIT));
  const bench = benchmarkCost(CONFIG_ID);
  const per = {
    reservedUsd: bench.total.reservedUsd,
    expectedUsd: bench.total.expectedUsd,
    baselineReserved: bench.baseline.reservedUsd,
    judgeReserved: bench.judge.reservedUsd,
  };
  // Gate on `reserved`: it is what the guard enforces per call. Using `absolute`
  // would refuse runs that can never actually cost that much; using `expected`
  // would start runs the guard then aborts halfway.
  const projected = per.reservedUsd * cases.length;
  console.log(`Configuration : ${CONFIG_ID}`);
  console.log(`Cases         : ${cases.length}`);
  console.log(`Baseline      : ${SMOKE_BASELINE}`);
  console.log(`Reserved      : $${projected.toFixed(3)} (every stage at its output ceiling)`);
  console.log(`Expected      : $${(per.expectedUsd * cases.length).toFixed(3)}`);
  console.log(`Hard limit    : $${MAX_USD.toFixed(2)}`);
  if (projected > MAX_USD) {
    console.error("\nRefusing to start: the worst case exceeds the limit. Lower --limit or raise --max-usd deliberately.");
    process.exit(1);
  }

  const transport = createOpenRouterTransport(key);
  // Opened BEFORE the first request, so there is a file on disk from the moment
  // money can start moving.
  mkdirSync(OUT_DIR, { recursive: true });
  const recorder = new RunRecorder(join(OUT_DIR, `run-${Date.now()}.jsonl`), {
    configuration: CONFIG_ID,
    caseId: FROZEN_CASES.slice(0, Math.max(1, LIMIT)).map((c) => c.id).join(","),
    capUsd: MAX_USD,
    baseline: SMOKE_BASELINE,
  });
  let currentStage: string | null = null;
  // The command's total. Every component runs inside its OWN envelope carved
  // from this, so none of them can consume another's remainder, and the engine
  // additionally cannot exceed the Standard cap whatever this number is.
  const runLedger = new CostLedger("standard", MAX_USD);
  runLedger.onRecord = recorder.onLedgerEntry;
  const comparisons: ComparisonResult[] = [];
  const grades = [];

  try {
  for (const c of cases) {
    if (runLedger.remainingUsd < per.reservedUsd) {
      console.log(`\nStopping before ${c.id}: $${runLedger.remainingUsd.toFixed(3)} left, one case reserves $${per.reservedUsd.toFixed(3)}.`);
      break;
    }
    process.stdout.write(`${c.id} … `);
    recorder.note("case_started", { caseId: c.id });
    currentStage = "engine";
    // ONE ledger for the whole run. Engine stages, their retries, the baseline
    // and the judge all reserve against it before going out, so --max-usd is a
    // real ceiling rather than something checked after the money is gone.
    // runCase carves its own $0.10 envelope from runLedger internally.
    const engine = await runCase(
      { account: c.account, configurationId: CONFIG_ID, ledger: runLedger },
      transport
    );
    currentStage = "baseline";
    const base = await runBaseline(
      { account: c.account, ledger: runLedger.envelope(per.baselineReserved) },
      transport
    );
    const rendered = renderAnalysis(engine.analysis);

    grades.push({
      engine: gradeAnswer(c, rendered, engine.analysis),
      baseline: gradeAnswer(c, base.answer),
    });

    currentStage = "judge";
    const verdict = await compareBlind(
      { caseId: c.id, account: c.account, engineAnswer: rendered, baselineAnswer: base.answer },
      { transport, ledger: runLedger.envelope(per.judgeReserved) }
    );
    comparisons.push(verdict);
    console.log(`${verdict.winner}  (spent $${runLedger.spentUsd.toFixed(3)})`);
  }

  } catch (e) {
    // The money is already spent; what is left to protect is the record of it.
    recorder.finish("incomplete", describeFailure(e, currentStage), {
      spentUsd: runLedger.spentUsd,
      capUsd: MAX_USD,
      completedCases: comparisons.length,
    });
    console.error(`\nRUN INCOMPLETE at stage "${currentStage}". Journal: ${recorder.file.replace(process.cwd(), ".")}`);
    console.error(`Spent before the failure: $${runLedger.spentUsd.toFixed(4)} of $${MAX_USD.toFixed(2)}.`);
    throw e;
  }

  const cmp = summariseComparisons(comparisons);
  const engineVerdict = summarise(grades.map((g) => g.engine));
  const baselineVerdict = summarise(grades.map((g) => g.baseline));

  console.log("\n──────── result ────────");
  console.log(`blind win rate       : ${(cmp.engineWinRate * 100).toFixed(0)}%  (need ≥65%)  ${cmp.passesThreshold ? "PASS" : "FAIL"}`);
  console.log(`  engine/baseline/tie: ${cmp.engineWins}/${cmp.baselineWins}/${cmp.ties}`);
  console.log(`anti-banality engine : ${(engineVerdict.antiBanalityRate * 100).toFixed(0)}%  (need ≥85%)  ${engineVerdict.passesAntiBanality ? "PASS" : "FAIL"}`);
  console.log(`anti-banality base   : ${(baselineVerdict.antiBanalityRate * 100).toFixed(0)}%`);
  console.log(`safety violations    : engine ${engineVerdict.safetyViolations}, baseline ${baselineVerdict.safetyViolations}`);
  // Completeness and quality are printed apart, never summed. Gates measure
  // whether an answer is worth comparing; only quality speaks to "better".
  console.log(`structural gates     : engine ${(engineVerdict.gatesPassedRate * 100).toFixed(0)}%, baseline ${(baselineVerdict.gatesPassedRate * 100).toFixed(0)}%  (completeness, NOT a quality win)`);
  console.log(`quality score        : engine ${engineVerdict.meanQuality.toFixed(2)}, baseline ${baselineVerdict.meanQuality.toFixed(2)}`);
  console.log(`total spent          : $${runLedger.spentUsd.toFixed(3)} of $${MAX_USD.toFixed(2)}`);

  recorder.finish("complete", undefined, { spentUsd: runLedger.spentUsd, capUsd: MAX_USD, completedCases: comparisons.length });
  const out = join(OUT_DIR, `megabrain-${Date.now()}.json`);
  // The ledger carries no conversation content, so the report is safe to keep.
  writeFileSync(out, JSON.stringify({ config: CONFIG_ID, comparisons, cmp, engineVerdict, baselineVerdict, ledger: runLedger.allDeep() }, null, 2));
  console.log(`\nreport: ${out.replace(process.cwd(), ".")}`);
}

async function main() {
  if (flag("verify-prices")) return verifyPrices();
  if (!LIVE) return dryRun();
  return live();
}

/**
 * Only when this file is the process entry point.
 *
 * Without the guard, importing the module — a test, a tool, an editor's
 * auto-import — executes main(), and with --live in argv that would spend money
 * on import. The claim that this CLI is import-safe was made before the guard
 * existed, which is exactly the kind of unearned assurance this project keeps
 * finding.
 */
const isEntryPoint = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;

if (isEntryPoint) {
  main().catch(onError);
}

function onError(e: unknown) {
  if (e instanceof AccountingError) {
    // Deliberately terse. A provider error body can quote the request, and the
    // request contains the user's account.
    console.error(`ACCOUNTING FAILURE — run stopped, case incomplete: ${e.message}`);
    console.error("The charge for the call that triggered this had already happened.");
    process.exit(2);
  }
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
}
