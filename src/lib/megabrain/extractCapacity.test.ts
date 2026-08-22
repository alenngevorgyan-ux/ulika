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
import { classifyProviderError, ProviderHttpError } from "./transport";
import { assertCeilingSupported, CeilingUnsupported } from "./modelRouter";
import { buildDiagnostics } from "./labDiagnostics";
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

describe("compaction is instructed, because it cannot be enforced in the schema", () => {
  it("carries no array-length keyword — strict structured outputs rejects them", () => {
    const raw = JSON.stringify(EXTRACT_SCHEMA);
    // This exact combination — strict: true plus maxItems — is what produced
    // HTTP 400 from the provider. The keyword must not come back.
    expect(raw).not.toContain("maxItems");
    expect(raw).not.toContain("minItems");
    expect(raw).not.toContain("uniqueItems");
    expect(raw).not.toContain("maxLength");
    expect(raw).not.toContain("pattern");
  });

  it("states the ceilings where the model will actually read them", () => {
    const raw = JSON.stringify(EXTRACT_SCHEMA);
    expect(raw).toContain(`at most ${EXTRACT_LIMITS.reportedFacts}`);
    expect(raw).toMatch(/atomic/i);
    expect(systems.extract).toContain(`at most ${EXTRACT_LIMITS.reportedFacts} reportedFacts`);
    expect(systems.extract).toContain(`${EXTRACT_LIMITS.actors} actors`);
  });

  it("keeps facts and interpretations from becoming the same list", () => {
    expect(systems.extract).toMatch(/reportedFacts OR the reading of it goes in interpretations/);
    expect(systems.extract).toMatch(/Do NOT quote the account at length/);
    // And the thing compaction must never do.
    expect(systems.extract).toMatch(/deadlines and dates, amounts/);
  });
});

describe("a ceiling is never sent to a model not known to accept it", () => {
  it("passes when the capability covers it", () => {
    expect(() => assertCeilingSupported(specs.extract, MAX_OUTPUT_TOKENS.extract)).not.toThrow();
    // The capability that was actually checked, not one from memory.
    expect(specs.extract.maxCompletionTokens).toBe(65_536);
  });

  it("refuses a ceiling above a published capability", () => {
    const small = { ...specs.extract, maxCompletionTokens: 1000 };
    expect(() => assertCeilingSupported(small, 3000)).toThrow(CeilingUnsupported);
  });

  it("fails closed when the capability was never recorded", () => {
    const unchecked = { ...specs.extract } as Partial<typeof specs.extract>;
    delete unchecked.maxCompletionTokens;
    expect(() => assertCeilingSupported(unchecked as typeof specs.extract, 100)).toThrow(CeilingUnsupported);
  });

  it("allows a model whose provider publishes no completion cap", () => {
    expect(specs.strategise.maxCompletionTokens).toBe("unpublished");
    expect(() => assertCeilingSupported(specs.strategise, MAX_OUTPUT_TOKENS.strategise)).not.toThrow();
  });

  it("blocks before the reservation, so an unsendable ceiling costs nothing", async () => {
    const calls = { n: 0 };
    const book = new CostLedger("standard", 0.05);
    const err = await runCase(
      { account: SHORT_ACCOUNT, ledger: book, configurationId: "uncheckable" },
      fixtureTransport({ callCount: calls })
    ).catch((e) => e);
    // "uncheckable" is not a real configuration; the run must fail before it
    // reaches a provider either way.
    expect(err).toBeInstanceOf(Error);
    expect(calls.n).toBe(0);
    expect(book.reportedSpendUsd).toBe(0);
  });
});

describe("a provider 400 is classified without reading its prose", () => {
  it("maps enum-like fields onto the fixed vocabulary", () => {
    expect(classifyProviderError(400, { code: null, type: "invalid_request_error", param: "response_format" }))
      .toBe("SCHEMA_UNSUPPORTED");
    expect(classifyProviderError(400, { code: null, type: null, param: "max_tokens" }))
      .toBe("OUTPUT_LIMIT_UNSUPPORTED");
    expect(classifyProviderError(400, { code: null, type: null, param: "max_price" }))
      .toBe("PRICE_CONSTRAINT_REJECTED");
    expect(classifyProviderError(400, { code: "context_length_exceeded", type: null, param: null }))
      .toBe("CONTEXT_LIMIT");
    expect(classifyProviderError(404, { code: null, type: null, param: null }))
      .toBe("PROVIDER_ROUTE_UNAVAILABLE");
    expect(classifyProviderError(400, { code: null, type: null, param: "top_k" }))
      .toBe("PARAMETER_UNSUPPORTED");
    // No usable signal is its own answer, not a guess dressed as one.
    expect(classifyProviderError(400, { code: null, type: null, param: null }))
      .toBe("UNKNOWN_PROVIDER_400");
  });

  it("never lets a provider body reach the client", () => {
    const leak = "СЕКРЕТ ПОЛЬЗОВАТЕЛЯ: он присвоил мой проект";
    const err = new ProviderHttpError(400, "google/gemini-3.1-flash-lite", null, "response_format", "invalid_request_error");
    const d = buildDiagnostics(err, { ledger: new CostLedger("standard", 0.05), capUsd: 0.05 });
    const blob = JSON.stringify(d);
    expect(blob).not.toContain(leak);
    expect(d.providerCategory).toBe("SCHEMA_UNSUPPORTED");
    expect(d.httpStatus).toBe(400);
    // Refused before a call completed: nothing to charge for.
    expect(d.callsSent).toBe(0);
    expect(d.reportedSpendUsd).toBe(0);
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
