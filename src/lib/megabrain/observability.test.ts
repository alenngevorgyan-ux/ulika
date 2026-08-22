import { describe, expect, it } from "vitest";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runCase, renderAnalysis, MAX_OUTPUT_TOKENS } from "./engine";
import { CostLedger } from "./costLedger";
import { OutputTruncatedError, ProviderHttpError, isTruncatedFinish, readTelemetry, type Transport } from "./transport";
import { RunRecorder, describeFailure } from "./runRecorder";
import { buildDiagnostics, normalizeKind, safeSchemaPaths } from "./labDiagnostics";
import { fixtureTransport, GOOD_ANALYSIS } from "./evals/fixtures";

/**
 * Observability tests.
 *
 * These exist because a real complex case failed with a bare ENGINE_FAILED and
 * could not be diagnosed afterwards from anything on disk, in the response or
 * on screen. Each test below pins one of the four places that information was
 * being dropped, plus the two places it must never appear.
 */

/** A distinctive account, so a privacy assertion cannot pass by coincidence. */
const SECRET_ACCOUNT =
  "Мой руководитель ЗЕЛЁНЫЙЖИРАФ8842 присвоил мою работу на совете директоров и теперь отстраняет меня от встреч.";

const ledger = () => new CostLedger("standard", 0.05);

describe("truncation is terminal, named and paid for exactly once", () => {
  it("stops at the first cut-off reply instead of retrying it", async () => {
    const calls = { n: 0 };
    const book = ledger();
    const err = await runCase(
      { account: SECRET_ACCOUNT, ledger: book },
      fixtureTransport({ truncateStage: "extract", callCount: calls })
    ).catch((e) => e);

    expect(err).toBeInstanceOf(OutputTruncatedError);
    // The whole point: the identical prompt under the identical ceiling would
    // overflow identically, so a retry buys a second charge and nothing else.
    expect(calls.n).toBe(1);
    expect((err as OutputTruncatedError).stage).toBe("extract");
    expect((err as OutputTruncatedError).maxOutputTokens).toBe(MAX_OUTPUT_TOKENS.extract);
    expect((err as OutputTruncatedError).finishReason).toBe("length");
  });

  it("still accounts for the truncated call — it was billed", async () => {
    const book = ledger();
    await runCase(
      { account: SECRET_ACCOUNT, ledger: book },
      fixtureTransport({ truncateStage: "extract" })
    ).catch(() => {});

    const entries = book.allDeep();
    expect(entries).toHaveLength(1);
    expect(entries[0].actualCostUsd).toBeGreaterThan(0);
    expect(book.reportedSpendUsd).toBeGreaterThan(0);
    // Recorded on the entry, so the journal can answer "why" later.
    expect(entries[0].finishReason).toBe("length");
  });

  it("surfaces as OUTPUT_TRUNCATED with the stage and the finish reason", async () => {
    const book = ledger();
    const err = await runCase(
      { account: SECRET_ACCOUNT, ledger: book },
      fixtureTransport({ truncateStage: "strategise" })
    ).catch((e) => e);

    const d = buildDiagnostics(err, { ledger: book, capUsd: 0.05 });
    expect(d.kind).toBe("OUTPUT_TRUNCATED");
    expect(d.stage).toBe("strategise");
    expect(d.finishReason).toBe("length");
    expect(d.callsSent).toBe(3);
    expect(d.retries).toBe(0);
    expect(d.reportedSpendUsd).toBeGreaterThan(0);
    expect(d.remainingUsd).toBeLessThan(0.05);
  });

  it("reads finish_reason off a real response shape, and only short ones", () => {
    expect(readTelemetry({ choices: [{ finish_reason: "length" }] }).finishReason).toBe("length");
    // Prose in the native field is dropped, not truncated into the payload.
    const long = "a".repeat(200);
    expect(readTelemetry({ choices: [{ native_finish_reason: long }] }).nativeFinishReason).toBeNull();
    expect(isTruncatedFinish({ finishReason: "MAX_TOKENS", nativeFinishReason: null })).toBe(true);
    expect(isTruncatedFinish({ finishReason: "stop", nativeFinishReason: null })).toBe(false);
  });
});

describe("a model that finished but wrote bad JSON keeps its one retry", () => {
  it("retries once and succeeds", async () => {
    const calls = { n: 0 };
    const book = ledger();
    const out = await runCase(
      { account: SECRET_ACCOUNT, ledger: book },
      fixtureTransport({ extractReturnsGarbageFirst: true, callCount: calls })
    );
    // extract twice, then analyse and strategise.
    expect(calls.n).toBe(4);
    expect(out.analysis.plan.conclusion.length).toBeGreaterThan(0);
    expect(book.allDeep().filter((e) => e.retryNumber > 0)).toHaveLength(1);
  });
});

describe("validation and language failures name rules, never values", () => {
  it("reports STAGE_REJECTED with schema paths and a count", async () => {
    const book = ledger();
    const err = await runCase(
      { account: SECRET_ACCOUNT, ledger: book },
      fixtureTransport({ tooFewHypotheses: true })
    ).catch((e) => e);

    const d = buildDiagnostics(err, { ledger: book, capUsd: 0.05 });
    expect(d.kind).toBe("STAGE_REJECTED");
    expect(d.stage).toBe("analyse");
    expect(d.schemaPaths.length).toBeGreaterThan(0);
    expect(d.problemCount).toBeGreaterThanOrEqual(d.schemaPaths.length);
    // Paths only. No sentence, no quoted field value.
    for (const p of d.schemaPaths) expect(p).toMatch(/^[A-Za-z0-9_.:,[\]/-]+$/);
  });

  it("separates a language miss from a schema miss", async () => {
    const book = ledger();
    const err = await runCase(
      { account: SECRET_ACCOUNT, ledger: book },
      fixtureTransport({ wrongLanguage: true })
    ).catch((e) => e);
    expect(normalizeKind(err)).toBe("LANGUAGE_MISMATCH");
  });

  it("drops anything that stops looking like a schema path", () => {
    // A future validator that helpfully interpolates the offending text would
    // be interpolating the user's account. Shape is enforced, not trusted.
    expect(safeSchemaPaths(["plan.exactWords.tooFew", "actors[2].basis"])).toHaveLength(2);
    expect(safeSchemaPaths(['plan.conclusion: "он присвоил мою работу"'])).toHaveLength(0);
    expect(safeSchemaPaths([SECRET_ACCOUNT])).toHaveLength(0);
    expect(safeSchemaPaths("not an array")).toEqual([]);
  });
});

describe("provider and render failures are told apart", () => {
  const exploding: Transport = async () => {
    throw new ProviderHttpError(429, "x-ai/grok-4.3", "rate_limit");
  };

  it("reports PROVIDER_HTTP_ERROR with the status and no body", async () => {
    const book = ledger();
    const err = await runCase({ account: SECRET_ACCOUNT, ledger: book }, exploding).catch((e) => e);
    const d = buildDiagnostics(err, { ledger: book, currentStage: "extract", capUsd: 0.05 });
    expect(d.kind).toBe("PROVIDER_HTTP_ERROR");
    expect(d.httpStatus).toBe(429);
    expect(d.stage).toBe("extract");
    // Nothing left the process successfully, so nothing is claimed as spent.
    expect(d.callsSent).toBe(0);
    expect(d.reportedSpendUsd).toBe(0);
  });

  it("a render failure is RENDER_ERROR and keeps the engine's own numbers", async () => {
    const book = ledger();
    await runCase({ account: SECRET_ACCOUNT, ledger: book }, fixtureTransport({}));
    const d = buildDiagnostics(new TypeError("cannot read property of undefined"), {
      ledger: book,
      capUsd: 0.05,
      forceKind: "RENDER_ERROR",
    });
    expect(d.kind).toBe("RENDER_ERROR");
    // A valid plan means the engine succeeded; its cost must survive the report.
    expect(d.callsSent).toBe(3);
    expect(d.reportedSpendUsd).toBeGreaterThan(0);
  });

  it("never forwards a raw error name", () => {
    class LeakyError extends Error {
      constructor() {
        super("x");
        this.name = "AccountBalanceFor_ЗЕЛЁНЫЙЖИРАФ8842";
      }
    }
    expect(normalizeKind(new LeakyError())).toBe("INTERNAL_ERROR");
  });
});

describe("privacy: neither the error payload nor the journal may carry the case", () => {
  const forbidden = (blob: string) => {
    expect(blob).not.toContain("ЗЕЛЁНЫЙЖИРАФ8842");
    expect(blob).not.toContain("присвоил");
    // The plan's own prose must not travel either.
    expect(blob).not.toContain(GOOD_ANALYSIS.plan.conclusion);
    for (const w of GOOD_ANALYSIS.plan.exactWords) expect(blob).not.toContain(w.text);
  };

  it("the diagnostics payload carries no case text", async () => {
    const book = ledger();
    const err = await runCase(
      { account: SECRET_ACCOUNT, ledger: book },
      fixtureTransport({ truncateStage: "analyse" })
    ).catch((e) => e);
    forbidden(JSON.stringify(buildDiagnostics(err, { ledger: book, capUsd: 0.05 })));
  });

  it("the run journal carries no case text, plan or prompt", async () => {
    const dir = mkdtempSync(join(tmpdir(), "ulika-journal-"));
    const file = join(dir, "run.jsonl");
    try {
      const book = ledger();
      const rec = new RunRecorder(file, {
        configuration: "test",
        caseId: "lab-deadbeef",
        capUsd: 0.05,
        baseline: "none",
      });
      book.onAttempt = rec.onAttempt;
      book.onRecord = rec.onLedgerEntry;
      book.onValidation = rec.onValidation;

      const err = await runCase(
        { account: SECRET_ACCOUNT, ledger: book },
        fixtureTransport({ truncateStage: "analyse" })
      ).catch((e) => e);
      rec.finish("incomplete", describeFailure(err, "analyse"), {
        reportedSpendUsd: book.reportedSpendUsd,
      });

      const blob = readFileSync(file, "utf8");
      forbidden(blob);

      // Written AS IT WENT, so a crash cannot erase the history: the attempt
      // lines for both completed stages are present alongside the terminal one.
      const lines = blob.trim().split("\n").map((l) => JSON.parse(l));
      expect(lines[0].t).toBe("run_started");
      expect(lines.filter((l) => l.t === "attempt")).toHaveLength(2);
      expect(lines.some((l) => l.t === "validation" && l.result === "truncated")).toBe(true);
      const finished = lines.at(-1);
      expect(finished.t).toBe("run_finished");
      expect(finished.status).toBe("incomplete");
      expect(finished.failure.stage).toBe("analyse");
      expect(finished.failure.errorKind).toBe("OutputTruncatedError");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("a successful render is still prose we never journal", async () => {
    const rendered = renderAnalysis(GOOD_ANALYSIS);
    expect(rendered).toContain(GOOD_ANALYSIS.plan.conclusion);
  });
});
