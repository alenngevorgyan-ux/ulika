import { describe, expect, it } from "vitest";
import {
  runCase,
  runLight,
  projectCasePipeline,
  CaseTooComplexError,
  MAX_OUTPUT_TOKENS,
} from "./engine";
import { CostLedger } from "./costLedger";
import { OutputTruncatedError } from "./transport";
import { EXTRACT_SCHEMA, EXTRACT_LIMITS } from "./jsonSchemas";
import { extractPrompt, analysePrompt, strategisePrompt } from "./prompts";
import { modelFor, resolveConfiguration, costOf, estimateTokens } from "./modelRouter";
import { modeCost } from "./costReport";
import { fixtureTransport } from "./evals/fixtures";
import type { CompletionRequest } from "./transport";

/**
 * Capacity of the extract stage.
 *
 * The ceiling was raised from 1600 to 3000 on proof, not on suspicion: a real
 * case came back with finish_reason "length" at exactly 1600. These tests pin
 * both halves of the fix — the larger ceiling AND the compaction that stops the
 * stage from spending it on retelling the account — plus the budget arithmetic
 * that makes the larger ceiling affordable.
 */

const cfg = resolveConfiguration("grok-matched");
const jur = { country: "AM" as const };
const systems = {
  extract: extractPrompt("sent1234", "ru", jur),
  analyse: analysePrompt("sent1234", "ru", jur),
  strategise: strategisePrompt("sent1234", "ru", jur),
};
const specs = {
  extract: modelFor(cfg, "extract"),
  analyse: modelFor(cfg, "analyse"),
  strategise: modelFor(cfg, "strategise"),
};
const project = (account: string) => projectCasePipeline({ account, systems, specs });

/** Roughly the account that truncated: ~3200 extract input tokens, in Russian. */
const LONG_RU_ACCOUNT =
  "Мой руководитель присвоил результаты проекта, о котором я вёл переписку полгода. ".repeat(68);
const SHORT_ACCOUNT = "Начальник приписал себе мой проект и перестал звать меня на встречи.";

describe("the ceiling is a bound, not a target", () => {
  it("a short case does not grow just because more room exists", async () => {
    const book = new CostLedger("standard", 0.05);
    await runCase({ account: SHORT_ACCOUNT, ledger: book }, fixtureTransport({}));
    const extract = book.allDeep().find((e) => e.stage === "extract")!;

    // What the model emits is driven by the case, not by max_tokens.
    expect(extract.outputTokens).toBeLessThan(MAX_OUTPUT_TOKENS.extract / 2);
    // And the ACTUAL charge stays far under the reservation the ceiling forces.
    expect(extract.actualCostUsd!).toBeLessThan(extract.conservativeEstimateUsd / 2);
  });

  it("a long case is reserved enough room to finish", () => {
    const p = project(LONG_RU_ACCOUNT);
    const extract = p.perStage.find((s) => s.stage === "extract")!;

    expect(MAX_OUTPUT_TOKENS.extract).toBeGreaterThanOrEqual(2800);
    expect(extract.maxOutputTokens).toBe(MAX_OUTPUT_TOKENS.extract);
    // The reservation covers a full-length answer, not a typical one — reserving
    // against the typical case is how a long generation walks through the cap.
    expect(extract.usd).toBeGreaterThanOrEqual(
      costOf(specs.extract, extract.inputTokens, MAX_OUTPUT_TOKENS.extract)
    );
  });

  it("the long Russian case fits Standard whole, in the worst case", () => {
    const p = project(LONG_RU_ACCOUNT);
    expect(estimateTokens(systems.extract + LONG_RU_ACCOUNT)).toBeGreaterThan(3000);
    // Every stage at its ceiling, with the safety margin applied, still inside $0.05.
    expect(p.totalUsd).toBeLessThanOrEqual(0.05);
    expect(p.perStage.map((s) => s.stage)).toEqual(["extract", "analyse", "strategise"]);
  });

  it("the cost report prices the new ceiling, not the old one", () => {
    const standard = modeCost("standard");
    // A report that still assumed 1600 would under-reserve by roughly the cost
    // of 1400 output tokens on the extract model.
    expect(standard.reservedUsd).toBeGreaterThan(costOf(specs.extract, 0, MAX_OUTPUT_TOKENS.extract));
    expect(standard.reservedUsd).toBeLessThanOrEqual(standard.capUsd);
    expect(MAX_OUTPUT_TOKENS.extract).toBe(3000);
  });
});

describe("a bigger ceiling does not soften the truncation rule", () => {
  it("finish_reason length still ends the run on the first call", async () => {
    const calls = { n: 0 };
    const book = new CostLedger("standard", 0.05);
    const err = await runCase(
      { account: LONG_RU_ACCOUNT, ledger: book },
      fixtureTransport({ truncateStage: "extract", callCount: calls })
    ).catch((e) => e);

    expect(err).toBeInstanceOf(OutputTruncatedError);
    expect(calls.n).toBe(1);
    expect((err as OutputTruncatedError).maxOutputTokens).toBe(3000);
  });
});

describe("a case too big for the mode is refused before it costs anything", () => {
  it("throws before any model call and names a mode that would fit", async () => {
    const calls = { n: 0 };
    const huge = "Подробное описание обстоятельств дела и переписки сторон. ".repeat(4000);
    const book = new CostLedger("standard", 0.05);
    const err = await runCase(
      // The product cap for this tier, which is what "too complex for Standard"
      // is a statement about.
      { account: huge, ledger: book, preflightCapUsd: 0.05 },
      fixtureTransport({ callCount: calls })
    ).catch((e) => e);

    expect(err).toBeInstanceOf(CaseTooComplexError);
    // The whole point of a preflight: nothing sent, nothing billed, no partial
    // pipeline to explain to somebody who now has a charge and no answer.
    expect(calls.n).toBe(0);
    expect(book.reportedSpendUsd).toBe(0);
    expect((err as CaseTooComplexError).projectedUsd).toBeGreaterThan(0.05);
    expect((err as CaseTooComplexError).code).toBe("CASE_TOO_COMPLEX_FOR_STANDARD");
  });

  it("still admits a case the size of the one that actually failed", async () => {
    expect(project(LONG_RU_ACCOUNT).totalUsd).toBeLessThanOrEqual(0.05);
    // And it really runs rather than merely projecting well.
    const book = new CostLedger("standard", 0.05);
    const out = await runCase(
      { account: LONG_RU_ACCOUNT, ledger: book, preflightCapUsd: 0.05 },
      fixtureTransport({})
    );
    expect(out.analysis.plan.exactWords.length).toBeGreaterThanOrEqual(3);
  });
});

describe("compaction is enforced where generation happens", () => {
  it("caps every list the extract stage can pad", () => {
    const schema = JSON.parse(JSON.stringify(EXTRACT_SCHEMA.schema)) as Record<string, never>;
    const frame = (schema as never as { properties: Record<string, { properties: Record<string, { maxItems?: number; description?: string }> }> })
      .properties.frame.properties;
    expect(frame.reportedFacts.maxItems).toBe(EXTRACT_LIMITS.reportedFacts);
    expect(frame.interpretations.maxItems).toBe(EXTRACT_LIMITS.interpretations);
    expect(frame.unknowns.maxItems).toBe(EXTRACT_LIMITS.unknowns);
    expect(frame.constraints.maxItems).toBe(EXTRACT_LIMITS.constraints);
    expect(frame.reportedEvidenceAvailable.maxItems).toBe(EXTRACT_LIMITS.reportedEvidenceAvailable);
    // Atomicity is stated where the provider reads it, not only in the prompt.
    expect(frame.reportedFacts.description).toMatch(/atomic/i);
  });

  it("keeps facts and interpretations from becoming the same list", () => {
    // The rule the model has to follow, in the prompt it actually receives.
    expect(systems.extract).toMatch(/reportedFacts OR the reading of it goes in interpretations/);
    expect(systems.extract).toMatch(/Do NOT quote the account at length/);
    // And the thing compaction must never do.
    expect(systems.extract).toMatch(/deadlines and dates, amounts/);
  });

  it("states the same numbers the schema enforces", () => {
    // Drift guard: a prompt promising more room than the schema allows makes the
    // model plan for entries it will never be permitted to emit.
    expect(systems.extract).toContain(`at most ${EXTRACT_LIMITS.reportedFacts} reportedFacts`);
    expect(systems.extract).toContain(`${EXTRACT_LIMITS.actors} actors`);
  });
});

describe("Light is untouched by any of this", () => {
  it("makes one call, on its own schema, at its own small ceiling", async () => {
    const spy: CompletionRequest[] = [];
    const calls = { n: 0 };
    await runLight({ account: LONG_RU_ACCOUNT }, fixtureTransport({ spy, callCount: calls }));

    expect(calls.n).toBe(1);
    expect(spy[0].jsonSchema?.name).toBe("light_plan");
    // Never the expensive extract stage, and never its ceiling.
    expect(spy[0].maxOutputTokens).toBe(MAX_OUTPUT_TOKENS.light);
    expect(spy[0].maxOutputTokens).toBeLessThan(MAX_OUTPUT_TOKENS.extract);
    expect(modeCost("light").capUsd).toBe(0.02);
  });
});
