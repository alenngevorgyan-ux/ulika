import { describe, expect, it } from "vitest";
import { CostLedger } from "./costLedger";
import { runAdvice, StageParseError, StageRejectedError } from "./engine";
import { adviceTransport } from "./evals/fixtures";
import { resolveManualPreset } from "./manualPresets";
import { buildOpenRouterRequestBody, OutputTruncatedError, type CompletionRequest, type CompletionResult, type Transport } from "./transport";

const account = "A synthetic committee dispute with a written deadline and no personal data.";

function response(content: string, finishReason = "stop"): CompletionResult {
  return {
    content,
    usage: {
      inputTokens: 2_000, cachedTokens: 0, reasoningTokens: 500,
      outputTokens: 800, actualCostUsd: 0.004, rawCost: 0.004,
    },
    latencyMs: 2_000,
    telemetry: {
      responseId: "gen-compact", reportedModel: "qwen/qwen3.6-max-preview",
      selectedProvider: "Alibaba", serviceTier: "default", routingAttempts: [],
      finishReason, nativeFinishReason: null,
    },
  };
}

const runE = (transport: Transport) => runAdvice({
  account,
  analysisMode: "standard",
  responseLanguage: "en",
  jurisdiction: { country: "unknown" },
  skipClarify: true,
  ledger: new CostLedger("standard", 0.1),
  preflightCapUsd: 0.1,
  execution: resolveManualPreset("E").execution,
}, transport);

describe("E Hybrid bounded strategist handoff", () => {
  it("keeps D as Qwen/Qwen and E as Qwen/GLM", () => {
    const d = resolveManualPreset("D");
    const e = resolveManualPreset("E");
    expect(d.execution.analysisConfigurationId).toBe("manual-premium");
    expect(d.execution.finalModelKey).toBe("qwen-3.6-max-preview");
    expect(e.execution.analysisConfigurationId).toBe("manual-premium");
    expect(e.execution.finalModelKey).toBe("glm-5.2");
  });

  it("serializes the exact bounded Qwen wire configuration", () => {
    const e = resolveManualPreset("E");
    const req: CompletionRequest = {
      stage: "strategise",
      modelSlug: "qwen/qwen3.6-max-preview",
      system: "system",
      user: "user",
      maxOutputTokens: e.execution.maxOutputTokens!.strategise!,
      timeoutMs: 120_000,
      reasoning: e.execution.reasoning!.strategise,
      jsonSchema: { name: "compact_case_analysis_and_plan", schema: { type: "object" } },
    };
    const wire = buildOpenRouterRequestBody(req);
    expect(wire.model).toBe("qwen/qwen3.6-max-preview");
    expect(wire.max_tokens).toBe(1_500);
    expect(wire.reasoning).toEqual({ enabled: true, exclude: true });
    expect(JSON.stringify(wire)).not.toContain("timeoutMs");
    expect(JSON.stringify(wire)).not.toContain("reasoningReservationTokens");
    expect((wire.response_format as { json_schema: { name: string } }).json_schema.name)
      .toBe("compact_case_analysis_and_plan");
  });

  it("reaches the GLM final exactly once after a valid compact Qwen strategy", async () => {
    const calls: CompletionRequest[] = [];
    const outcome = await runE(adviceTransport({ spy: calls }));
    expect(outcome.kind).toBe("answer");
    expect(calls.map((c) => [c.stage, c.modelSlug])).toEqual([
      ["extract", "google/gemini-3.1-flash-lite"],
      ["strategise", "qwen/qwen3.6-max-preview"],
      ["final", "z-ai/glm-5.2"],
    ]);
    expect(calls.filter((c) => c.stage === "strategise")).toHaveLength(1);
    expect(calls.find((c) => c.stage === "strategise")?.maxOutputTokens).toBe(1_500);
    const entries = outcome.ledger.allDeep();
    expect(entries.map((entry) => entry.stage)).toEqual(["extract", "strategise", "final"]);
    expect(entries.every((entry) => entry.actualCostUsd !== null && entry.accountingFailure === null)).toBe(true);
  });

  it("never calls GLM when compact strategy JSON cannot be parsed and never retries", async () => {
    const calls: CompletionRequest[] = [];
    const inner = adviceTransport({ spy: calls });
    const transport: Transport = async (req) => {
      if (req.jsonSchema?.name === "compact_case_analysis_and_plan") {
        calls.push(req);
        return response("{not-json");
      }
      return inner(req);
    };
    await expect(runE(transport)).rejects.toBeInstanceOf(StageParseError);
    expect(calls.filter((c) => c.stage === "strategise")).toHaveLength(1);
    expect(calls.some((c) => c.stage === "final")).toBe(false);
  });

  it("classifies schema garbage and does not call GLM", async () => {
    const calls: CompletionRequest[] = [];
    const inner = adviceTransport({ spy: calls });
    const transport: Transport = async (req) => {
      if (req.jsonSchema?.name === "compact_case_analysis_and_plan") {
        calls.push(req);
        return response(JSON.stringify({ hypotheses: { hypotheses: [] } }));
      }
      return inner(req);
    };
    await expect(runE(transport)).rejects.toBeInstanceOf(StageRejectedError);
    expect(calls.filter((c) => c.stage === "strategise")).toHaveLength(1);
    expect(calls.some((c) => c.stage === "final")).toBe(false);
  });

  it("refuses a truncated/oversized Qwen artifact before parsing or GLM", async () => {
    const calls: CompletionRequest[] = [];
    const inner = adviceTransport({ spy: calls });
    const transport: Transport = async (req) => {
      if (req.jsonSchema?.name === "compact_case_analysis_and_plan") {
        calls.push(req);
        return response('{"hypotheses":', "length");
      }
      return inner(req);
    };
    await expect(runE(transport)).rejects.toBeInstanceOf(OutputTruncatedError);
    expect(calls.filter((c) => c.stage === "strategise")).toHaveLength(1);
    expect(calls.some((c) => c.stage === "final")).toBe(false);
  });

  it("reserves reasoning separately without pretending it is a wire guarantee", () => {
    const e = resolveManualPreset("E").execution;
    expect(e.reasoning?.strategise?.maxTokens).toBeUndefined();
    expect(e.reasoningReservationTokens?.strategise).toBe(3_500);
    expect(e.maxOutputTokens?.strategise).toBe(1_500);
  });
});
