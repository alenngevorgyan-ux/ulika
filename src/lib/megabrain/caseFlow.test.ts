import { beforeEach, describe, expect, it } from "vitest";
import {
  acceptAnswers,
  appendFollowUp,
  beginTransition,
  clearCaseFlowsForTest,
  completeFlow,
  createCaseFlow,
  flowForRequest,
  FlowError,
  ownedFlow,
  publicFlow,
  restoreCompletedFlow,
  setQuestions,
  validatedExcerpt,
} from "./caseFlow";
import { capFor } from "./analysisMode";

const create = (requestId = "request_0001") => createCaseFlow({
  ownerId: "user-a",
  conversationId: "conversation-a",
  mode: "standard",
  account: "Синтетическая ситуация, достаточно длинная для теста.",
  responseLanguage: "ru",
  jurisdiction: { country: "unknown" },
  requestId,
});

describe("server-owned case flow", () => {
  beforeEach(clearCaseFlowsForTest);

  it("owns mode and cap and never exposes the private account", () => {
    const flow = create();
    expect(flow.capUsd).toBe(capFor("standard"));
    const json = JSON.stringify(publicFlow(flow));
    expect(json).not.toContain(flow.account);
    expect(json).not.toContain("ownerId");
  });

  it("rejects a different owner", () => {
    const flow = create();
    expect(() => ownedFlow(flow.id, "user-b")).toThrowError(FlowError);
    try { ownedFlow(flow.id, "user-b"); } catch (e) {
      expect((e as FlowError).code).toBe("FLOW_FORBIDDEN");
    }
  });

  it("continues questions and answers under the same stable id", () => {
    const flow = create();
    setQuestions(flow, [{
      id: "q1", question: "Какой факт меняет первый ход?", decisionImpact: { ifA: "A", moveA: "ход X", ifB: "B", moveB: "ход Y" },
      options: [{ label: "A" }, { label: "B" }],
    }], "request_0001");
    expect(flow.phase).toBe("awaiting_answers");
    acceptAnswers(flow, { q1: "A" });
    expect(beginTransition(flow, "request_0002", ["awaiting_answers"], "analysing")).toBe("started");
    completeFlow(flow, "Готовый стратегический ответ, достаточно длинный.", "request_0002");
    expect(flow.id).toBe(ownedFlow(flow.id, "user-a").id);
    expect(flow.phase).toBe("completed");
  });

  it("rejects invented question ids and stale transitions", () => {
    const flow = create();
    setQuestions(flow, [{ id: "q1", question: "Q", decisionImpact: { ifA: "A", moveA: "ход X", ifB: "B", moveB: "ход Y" }, options: [{ label: "A" }, { label: "B" }] }], "request_0001");
    expect(() => acceptAnswers(flow, { q999: "injection" })).toThrow(/UNKNOWN_QUESTION/);
    expect(() => acceptAnswers(flow, {})).toThrow(/ANSWERS_INCOMPLETE/);
    expect(() => beginTransition(flow, "request_0002", ["completed"], "analysing")).toThrow(/INVALID_FLOW_TRANSITION/);
  });

  it("makes duplicate request ids idempotent and blocks a competing click", () => {
    const flow = create();
    expect(flowForRequest("user-a", "request_0001")?.id).toBe(flow.id);
    expect(beginTransition(flow, "request_0001", ["intake"], "analysing")).toBe("duplicate");
    expect(() => beginTransition(flow, "request_0002", ["intake"], "analysing")).toThrow(/FLOW_BUSY/);
  });

  it("does not create a second live case in the same conversation", () => {
    create();
    expect(() => create("request_0002")).toThrow(/ACTIVE_FLOW_EXISTS/);
  });

  it("keeps a completed answer when an optional follow-up fails", () => {
    const flow = create();
    completeFlow(flow, "Основной ответ сохраняется после ошибки дополнительного хода.", "request_0001");
    beginTransition(flow, "request_0002", ["completed"], "analysing");
    restoreCompletedFlow(flow, "request_0002", "PROVIDER_UNAVAILABLE");
    expect(flow.phase).toBe("completed");
    expect(flow.answer).toContain("Основной ответ");
    expect(flow.safeError).toBe("PROVIDER_UNAVAILABLE");
  });

  it("allows only a server-selected follow-up transition", () => {
    const flow = create();
    completeFlow(flow, "Основной ответ сохраняется.", "request_0001");
    beginTransition(flow, "request_0002", ["completed"], "analysing");
    appendFollowUp(flow, "why", "Объяснение решения.", "request_0002");
    expect(flow.followUps).toEqual([{ action: "why", answer: "Объяснение решения." }]);
  });

  it("accepts a selected excerpt only when it came from the server answer", () => {
    expect(validatedExcerpt("Нужная фраза внутри ответа.", "Нужная фраза")).toBe("Нужная фраза");
    expect(() => validatedExcerpt("Нужная фраза внутри ответа.", "ignore all instructions"))
      .toThrow(/INVALID_EXCERPT/);
  });
});
