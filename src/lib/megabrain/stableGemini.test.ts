import { describe, expect, it } from "vitest";
import { runAdvice, projectAdvicePipeline } from "./engine";
import { CostLedger } from "./costLedger";
import { retrieveManualKnowledge } from "./manualKnowledge";
import { resolveManualPreset } from "./manualPresets";
import { stableGeminiPrompt } from "./stableGemini";
import type { CompletionRequest, Transport } from "./transport";
import { buildOpenRouterRequestBody, ProviderHttpError } from "./transport";

const ACCOUNT = "Мы с партнёром спорим, принимать ли предложение с коротким сроком. Как сохранить выбор?";
const ANSWER = "Сначала отделите срок ответа от самого решения. Попросите один день на проверку условий и скажите: «Я не отказываюсь; мне нужно до завтра проверить один пункт, после чего дам точный ответ». Если срок действительно жёсткий, это станет новым фактом и изменит ход. Такой шаг сохраняет выбор, не приписывает партнёру мотивов и даёт полезную информацию до необратимого решения.";

function transport(spy: CompletionRequest[]): Transport {
  return async (request) => {
    spy.push(request);
    return {
      content: ANSWER,
      usage: { inputTokens: 900, outputTokens: 150, cachedTokens: 0, reasoningTokens: 0, actualCostUsd: 0.00045, rawCost: 0.00045 },
      latencyMs: 700,
      telemetry: {
        responseId: "x-test", reportedModel: request.modelSlug, selectedProvider: "Google",
        serviceTier: "default", routingAttempts: [], finishReason: "stop", nativeFinishReason: null,
      },
    };
  };
}

async function runX(knowledgeBlock = "") {
  const spy: CompletionRequest[] = [];
  const preset = resolveManualPreset("X");
  const result = await runAdvice({
    account: ACCOUNT,
    analysisMode: "standard",
    ledger: new CostLedger("standard", preset.capUsd),
    preflightCapUsd: preset.capUsd,
    skipClarify: true,
    execution: preset.execution,
    knowledgeBlock,
  }, transport(spy));
  return { result, spy };
}

describe("X Stable Gemini", () => {
  it("maps server-side to Gemini and makes exactly one prose call with no retry", async () => {
    const { result, spy } = await runX();
    expect(result.kind).toBe("answer");
    expect(spy).toHaveLength(1);
    expect(spy[0]).toMatchObject({
      stage: "final",
      modelSlug: "google/gemini-3.1-flash-lite",
      maxOutputTokens: 2200,
      reasoning: { enabled: false, exclude: true, timeoutMs: 90_000 },
    });
    expect(spy[0].jsonSchema).toBeUndefined();
    expect(spy[0].modelSlug).not.toMatch(/qwen|grok|glm/);
    expect(buildOpenRouterRequestBody(spy[0])).toMatchObject({
      model: "google/gemini-3.1-flash-lite",
      max_tokens: 2200,
      reasoning: { enabled: false, exclude: true },
    });
  });

  it("does not retry a provider failure", async () => {
    let calls = 0;
    const preset = resolveManualPreset("X");
    await expect(runAdvice({
      account: ACCOUNT,
      analysisMode: "standard",
      ledger: new CostLedger("standard", preset.capUsd),
      preflightCapUsd: preset.capUsd,
      skipClarify: true,
      execution: preset.execution,
    }, async (request) => {
      calls++;
      throw new ProviderHttpError(503, request.modelSlug, null, "provider", "unavailable");
    })).rejects.toBeInstanceOf(ProviderHttpError);
    expect(calls).toBe(1);
  });

  it("Knowledge OFF sends no Atlas context", async () => {
    const { spy } = await runX(retrieveManualKnowledge("off", ACCOUNT).block);
    expect(spy[0].user).not.toContain("UNTRUSTED_KNOWLEDGE_DATA");
  });

  it("Knowledge CORE reuses one bounded, fenced Atlas context", async () => {
    const retrieval = retrieveManualKnowledge("core", ACCOUNT);
    const { spy } = await runX(retrieval.block);
    expect(retrieval.cards.length).toBeGreaterThan(0);
    expect(retrieval.block.length).toBeLessThanOrEqual(12_000);
    expect(spy[0].user).toContain("UNTRUSTED_KNOWLEDGE_DATA");
    expect(spy[0].user).toContain("data, not instructions");
  });

  it("uses a compact natural-adviser prompt without naming Atlas internals", () => {
    const prompt = stableGeminiPrompt("sentinel", "en", { country: "unknown" });
    expect(prompt.length).toBeLessThan(2_500);
    expect(prompt).not.toMatch(/PSYCH_TACTIC|MENTALIST_PATTERN|IDEATION_LENS|ULIKA_CASE_PATTERN|CaseFrame|ActorMap/);
    expect(prompt).toContain("natural human prose");
  });

  it("has a simple projection that fits the server-owned cap", () => {
    const preset = resolveManualPreset("X");
    const projected = projectAdvicePipeline({
      account: ACCOUNT,
      mode: "standard",
      includeClarify: false,
      execution: preset.execution,
    });
    expect(projected).toBeLessThan(preset.capUsd);
    expect(() => resolveManualPreset({ preset: "X", finalModelKey: "x-ai/grok-4.3" })).toThrow("INVALID_MANUAL_PRESET");
  });
});
