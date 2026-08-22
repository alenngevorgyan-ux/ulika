import { describe, expect, it } from "vitest";
import { CostLedger } from "./costLedger";
import { projectCaseSafety, screenCaseSafety } from "./caseSafety";
import type { Transport } from "./transport";

function transport(content: string): Transport {
  return async (req) => ({
    content,
    usage: {
      inputTokens: 100,
      cachedTokens: 0,
      reasoningTokens: 0,
      outputTokens: 20,
      rawCost: 0.0001,
      actualCostUsd: 0.0001,
    },
    latencyMs: 5,
    reportedModel: req.modelSlug,
    telemetry: {
      responseId: "gen-safe",
      requestedModel: req.modelSlug,
      reportedModel: req.modelSlug,
      selectedProvider: "google-ai-studio",
      serviceTier: "default",
      finishReason: "stop",
      nativeFinishReason: "stop",
      routingAttempts: [],
    },
  });
}

describe("case safety shares the case ledger", () => {
  it("returns only a typed verdict and records the bounded call", async () => {
    const ledger = new CostLedger("standard", 0.05);
    const account = "Мне угрожают физической расправой прямо сейчас.";
    const verdict = await screenCaseSafety(account, ledger, transport('{"triggered":true,"type":"violence_threat"}'));
    expect(verdict).toEqual({ triggered: true, type: "violence_threat" });
    expect(ledger.allDeep().map((e) => e.stage)).toEqual(["safety"]);
    expect(JSON.stringify(verdict)).not.toContain(account);
  });

  it("is included in a non-zero preflight reservation", () => {
    expect(projectCaseSafety("synthetic account")).toBeGreaterThan(0);
  });
});
