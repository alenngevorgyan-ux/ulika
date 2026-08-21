import "./_load-env";
import { writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { CONFIGURATIONS, MODELS, modelFor, resolveConfiguration } from "../src/lib/megabrain/modelRouter";
import { MODE_CAPS, projectPipelineCost, CostLedger } from "../src/lib/megabrain/costLedger";
import { MAX_OUTPUT_TOKENS, renderAnalysis, runBaseline, runCase } from "../src/lib/megabrain/engine";
import { createOpenRouterTransport } from "../src/lib/megabrain/transport";
import { FROZEN_CASES } from "../src/lib/megabrain/evals/cases";
import { gradeAnswer, summarise } from "../src/lib/megabrain/evals/graders";
import { compareBlind, summariseComparisons, type ComparisonResult } from "../src/lib/megabrain/evals/compare";

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

function projectOne(configId: string) {
  const cfg = resolveConfiguration(configId);
  return projectPipelineCost([
    { stage: "extract", spec: modelFor(cfg, "extract"), promptChars: 7500, maxOutputTokens: MAX_OUTPUT_TOKENS.extract },
    { stage: "analyse", spec: modelFor(cfg, "analyse"), promptChars: 9000, maxOutputTokens: MAX_OUTPUT_TOKENS.analyse },
    { stage: "strategise", spec: modelFor(cfg, "strategise"), promptChars: 12000, maxOutputTokens: MAX_OUTPUT_TOKENS.strategise },
  ]);
}

/** Worst case per case: engine + baseline + judge, all at their ceilings. */
function projectPerCase(configId: string) {
  const engine = projectOne(configId).totalUsd;
  const baseline = projectPipelineCost([
    { stage: "baseline", spec: MODELS["claude-sonnet-5"], promptChars: 4000, maxOutputTokens: MAX_OUTPUT_TOKENS.baseline },
  ]).totalUsd;
  const judge = projectPipelineCost([
    { stage: "judge", spec: MODELS["grok-4.3"], promptChars: 14000, maxOutputTokens: 200 },
  ]).totalUsd;
  return { engine, baseline, judge, total: engine + baseline + judge };
}

async function dryRun() {
  console.log("DRY RUN — no requests, no cost.\n");
  console.log("Per-case projection, at output ceilings (the guard reserves against these):\n");
  for (const id of Object.keys(CONFIGURATIONS)) {
    const p = projectOne(id);
    const cap = MODE_CAPS.standard;
    const stages = p.perStage.map((s) => `${s.stage} $${s.usd.toFixed(4)}`).join("  ");
    console.log(
      `  ${id.padEnd(22)} ${stages}  =  $${p.totalUsd.toFixed(4)}  ` +
        `${p.totalUsd <= cap ? "OK" : "OVER CAP"} (standard cap $${cap})`
    );
  }
  const per = projectPerCase(CONFIG_ID);
  console.log(
    `\nBenchmark cost per case with "${CONFIG_ID}": engine $${per.engine.toFixed(4)} + ` +
      `baseline $${per.baseline.toFixed(4)} + judge $${per.judge.toFixed(4)} = $${per.total.toFixed(4)}`
  );
  console.log(`  5 cases   ≈ $${(per.total * 5).toFixed(2)}`);
  console.log(`  20 cases  ≈ $${(per.total * 20).toFixed(2)}`);
  console.log(`\nFrozen cases available: ${FROZEN_CASES.length}`);
  console.log("Graders run offline; only the blind judge needs the network.");
}

/** Re-read prices from the live catalogue. Free, unauthenticated, no key. */
async function verifyPrices() {
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
  const per = projectPerCase(CONFIG_ID);
  const projected = per.total * cases.length;
  console.log(`Configuration : ${CONFIG_ID}`);
  console.log(`Cases         : ${cases.length}`);
  console.log(`Projected     : $${projected.toFixed(3)} (worst case, at output ceilings)`);
  console.log(`Hard limit    : $${MAX_USD.toFixed(2)}`);
  if (projected > MAX_USD) {
    console.error("\nRefusing to start: the worst case exceeds the limit. Lower --limit or raise --max-usd deliberately.");
    process.exit(1);
  }

  const transport = createOpenRouterTransport(key);
  const runLedger = new CostLedger("standard", MAX_USD);
  const comparisons: ComparisonResult[] = [];
  const grades = [];

  for (const c of cases) {
    if (runLedger.remainingUsd < per.total) {
      console.log(`\nStopping before ${c.id}: $${runLedger.remainingUsd.toFixed(3)} left, one case needs $${per.total.toFixed(3)}.`);
      break;
    }
    process.stdout.write(`${c.id} … `);
    const engine = await runCase({ account: c.account, configurationId: CONFIG_ID }, transport);
    const base = await runBaseline({ account: c.account }, transport);
    const rendered = renderAnalysis(engine.analysis);

    grades.push({
      engine: gradeAnswer(c, rendered, engine.analysis),
      baseline: gradeAnswer(c, base.answer),
    });

    const verdict = await compareBlind(
      { caseId: c.id, account: c.account, engineAnswer: rendered, baselineAnswer: base.answer },
      { transport, ledger: runLedger }
    );
    comparisons.push(verdict);

    // Fold per-case spend into the run ledger so the limit is global.
    for (const e of [...engine.ledger.all(), ...base.ledger.all()]) {
      runLedger.record({
        stage: e.stage,
        spec: Object.values(MODELS).find((m) => m.slug === e.model)!,
        usage: { inputTokens: e.inputTokens, cachedTokens: e.cachedTokens, reasoningTokens: e.reasoningTokens, outputTokens: e.outputTokens },
        latencyMs: e.latencyMs,
      });
    }
    console.log(`${verdict.winner}  (spent $${runLedger.spentUsd.toFixed(3)})`);
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
  console.log(`factual discipline   : engine ${engineVerdict.meanFactualDiscipline.toFixed(2)}, baseline ${baselineVerdict.meanFactualDiscipline.toFixed(2)}`);
  console.log(`total spent          : $${runLedger.spentUsd.toFixed(3)} of $${MAX_USD.toFixed(2)}`);

  mkdirSync(OUT_DIR, { recursive: true });
  const out = join(OUT_DIR, `megabrain-${Date.now()}.json`);
  // The ledger carries no conversation content, so the report is safe to keep.
  writeFileSync(out, JSON.stringify({ config: CONFIG_ID, comparisons, cmp, engineVerdict, baselineVerdict, ledger: runLedger.all() }, null, 2));
  console.log(`\nreport: ${out.replace(process.cwd(), ".")}`);
}

async function main() {
  if (flag("verify-prices")) return verifyPrices();
  if (!LIVE) return dryRun();
  return live();
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
