import { describe, expect, it } from "vitest";
import { runAdvice, MAX_OUTPUT_TOKENS } from "./engine";
import { CostLedger } from "./costLedger";
import { validateClarify, MAX_QUESTIONS, formatAnswers } from "./clarify";
import { buildBrief } from "./brief";
import { checkNarrative } from "./finalStrategist";
import { modeCost } from "./costReport";
import { MODES } from "./analysisMode";
import { GOOD_ANALYSIS, adviceTransport } from "./evals/fixtures";
import type { CompletionRequest } from "./transport";

/**
 * The product pipeline: ask only when it changes the answer, analyse in
 * private, advise in prose.
 */

const ledger = () => new CostLedger("standard", 0.05);
const ACCOUNT = "Начальник присвоил мой проект и перестал звать меня на встречи.";

describe("the clarification gate asks only when an answer would change the move", () => {
  it("returns questions and spends nothing further", async () => {
    const spy: CompletionRequest[] = [];
    const out = await runAdvice(
      { account: ACCOUNT, analysisMode: "standard", ledger: ledger() },
      adviceTransport({ askQuestions: true, spy })
    );
    expect(out.kind).toBe("questions");
    if (out.kind !== "questions") return;
    expect(out.questions.length).toBeGreaterThan(0);
    expect(out.questions.length).toBeLessThanOrEqual(MAX_QUESTIONS);
    expect(out.questions[0].options.length).toBeGreaterThanOrEqual(2);
    // Nothing past the gate ran.
    expect(spy).toHaveLength(1);
    expect(spy[0].jsonSchema?.name).toBe("clarification_gate");
  });

  it("drops a question that cannot say what it would change", () => {
    const r = validateClarify({
      ready: false,
      questions: [
        { question: "Расскажите подробнее о фоне", options: ["Да", "Нет"], decisionImpact: "" },
        { question: "Есть ли у вас письменный договор?", options: ["Да", "Нет"], decisionImpact: "Если да — письменная претензия; если нет — сначала фиксация." },
      ],
    });
    expect(r.questions).toHaveLength(1);
    expect(r.questions[0].id).toBe("q2");
  });

  it("treats a reply with no usable question as ready, whatever it claims", () => {
    expect(validateClarify({ ready: false, questions: [] }).ready).toBe(true);
    expect(validateClarify({ ready: true, questions: [{ question: "q", options: ["a", "b"], decisionImpact: "x" }] }).ready)
      .toBe(false);
  });

  it("does not ask again once answers have arrived", async () => {
    const spy: CompletionRequest[] = [];
    const out = await runAdvice(
      {
        account: ACCOUNT,
        analysisMode: "standard",
        ledger: ledger(),
        askedQuestions: [{ id: "q1", question: "Есть договор?", options: [{ label: "Да" }], decisionImpact: "x" }],
        answers: { q1: "Да" },
      },
      adviceTransport({ askQuestions: true, spy })
    );
    expect(out.kind).toBe("answer");
    expect(spy.some((r) => r.jsonSchema?.name === "clarification_gate")).toBe(false);
  });

  it("can be skipped outright by the user", async () => {
    const out = await runAdvice(
      { account: ACCOUNT, analysisMode: "light", ledger: ledger(), skipClarify: true },
      adviceTransport({ askQuestions: true })
    );
    expect(out.kind).toBe("answer");
  });
});

describe("the analysis is staff work, not the deliverable", () => {
  it("Standard answers in prose and keeps the structure internal", async () => {
    const spy: CompletionRequest[] = [];
    const out = await runAdvice(
      { account: ACCOUNT, analysisMode: "standard", ledger: ledger(), skipClarify: true },
      adviceTransport({ spy })
    );
    expect(out.kind).toBe("answer");
    if (out.kind !== "answer") return;

    // Prose, not a report.
    expect(out.answer.length).toBeGreaterThan(200);
    expect(checkNarrative(out.answer).ok).toBe(true);
    expect(out.answer).not.toContain("CaseFrame");
    expect(out.answer).not.toMatch(/\d{1,3}\s?%/);

    // The analysis exists, but only for the lab and the benchmark.
    expect(out.brief).not.toBeNull();
    expect(out.analysis).not.toBeNull();

    // The private pipeline is the two-call one, then the adviser.
    expect(spy.map((r) => r.jsonSchema?.name ?? "prose")).toEqual([
      "case_extraction",
      "case_analysis_and_plan",
      "prose",
    ]);
  });

  it("Light buys no private analysis at all", async () => {
    const spy: CompletionRequest[] = [];
    const out = await runAdvice(
      { account: ACCOUNT, analysisMode: "light", ledger: ledger(), skipClarify: true },
      adviceTransport({ spy })
    );
    expect(out.kind).toBe("answer");
    if (out.kind !== "answer") return;
    expect(out.brief).toBeNull();
    expect(spy).toHaveLength(1);
    expect(spy[0].jsonSchema).toBeUndefined();
  });

  it("the brief carries what is usable and drops what is not", () => {
    const b = buildBrief(GOOD_ANALYSIS);
    // Facts and readings stay apart, so the adviser cannot state one as the other.
    expect(b.reportedFacts.length).toBeGreaterThan(0);
    expect(b.interpretations.length).toBeGreaterThan(0);
    expect(b.reportedFacts.some((f) => b.interpretations.includes(f))).toBe(false);
    // Leverage that is absent or unknown is not a candidate and is not listed.
    expect(b.leverage.every((l) => l.kind.length > 0)).toBe(true);
    expect(b.leverage.length).toBeLessThan(GOOD_ANALYSIS.leverage.points.length);
    // An actor claim marked unknown says nothing usable and does not travel.
    expect(JSON.stringify(b.actors)).not.toContain("unknown");
  });

  it("the adviser prompt offers the brief as a menu, never as a checklist", async () => {
    const spy: CompletionRequest[] = [];
    await runAdvice(
      { account: ACCOUNT, analysisMode: "standard", ledger: ledger(), skipClarify: true },
      adviceTransport({ spy })
    );
    const final = spy[spy.length - 1];
    expect(final.system).toMatch(/MENU, NOT A CHECKLIST/);
    expect(final.system).toMatch(/not required to mention every hypothesis/);
  });
});

describe("the narrative check refuses a report wearing prose clothes", () => {
  it("flags JSON, fences, stubs and internal vocabulary", () => {
    expect(checkNarrative('{"conclusion":"x"}').problems).toContain("final.looksLikeJson");
    expect(checkNarrative("too short").problems).toContain("final.tooShort");
    expect(checkNarrative("a".repeat(300) + "```").problems).toContain("final.codeFence");
    expect(checkNarrative("a".repeat(300) + " CaseFrame").problems).toContain("final.internalVocabulary");
  });
});

describe("every mode fits its cap under the new shape", () => {
  it("prices the gate and the adviser into all of them", () => {
    for (const mode of ["light", "standard", "strong"] as const) {
      const c = modeCost(mode);
      expect(c.reservedUsd).toBeLessThanOrEqual(c.capUsd);
      expect(c.maxModelCalls).toBe(MODES[mode].maxModelCalls);
    }
    // Light is the gate plus the adviser, and nothing else.
    expect(MODES.light.maxModelCalls).toBe(2);
    expect(MAX_OUTPUT_TOKENS.clarify).toBeLessThan(MAX_OUTPUT_TOKENS.final);
  });
});

describe("answers become part of the case", () => {
  it("folds them into the account the later stages read", () => {
    const block = formatAnswers(
      [{ id: "q1", question: "Есть договор?", options: [{ label: "Да" }], decisionImpact: "x" }],
      { q1: "Да, подписан в марте" }
    );
    expect(block).toContain("Есть договор?");
    expect(block).toContain("Да, подписан в марте");
    expect(formatAnswers([], {})).toBe("");
  });
});
