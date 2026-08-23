import { afterEach, describe, expect, it, vi } from "vitest";
import { CostLedger } from "./costLedger";
import { modelFor, resolveConfiguration } from "./modelRouter";
import {
  createOpenRouterTransport,
  DEFAULT_TIMEOUT_MS,
  ProviderTimeoutError,
  REASONING_STAGE_TIMEOUT_MS,
  timeoutForReasoning,
} from "./transport";
import { normalizeKind } from "./labDiagnostics";

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("provider timeout policy", () => {
  it("gives explicit reasoning a bounded 120s window and leaves ordinary calls at 90s", () => {
    expect(timeoutForReasoning({ enabled: true })).toBe(REASONING_STAGE_TIMEOUT_MS);
    expect(timeoutForReasoning()).toBeUndefined();
    expect(DEFAULT_TIMEOUT_MS).toBe(90_000);
    expect(REASONING_STAGE_TIMEOUT_MS).toBeLessThan(150_000);
  });

  it("attributes an abort to our transport timer without logging private text", async () => {
    vi.useFakeTimers();
    const log = vi.spyOn(console, "info").mockImplementation(() => undefined);
    vi.stubGlobal("fetch", vi.fn((_url: string, init?: RequestInit) => new Promise((_resolve, reject) => {
      init?.signal?.addEventListener("abort", () =>
        reject(new DOMException("The operation was aborted", "AbortError"))
      );
    })));

    const call = createOpenRouterTransport("test-key")({
      stage: "strategise",
      modelSlug: "qwen/qwen3.6-max-preview",
      system: "PRIVATE_SENTINEL_SYSTEM",
      user: "PRIVATE_SENTINEL_CASE",
      maxOutputTokens: 10,
      timeoutMs: 25,
      reasoning: { enabled: true, exclude: true },
    });
    const rejection = expect(call).rejects.toMatchObject({
      name: "ProviderTimeoutError",
      stage: "strategise",
      abortSource: "transport_timeout",
      timeoutLimitMs: 25,
      providerRequestStarted: true,
      responseHeadersReceived: false,
      partialUsageAvailable: false,
    });
    await vi.advanceTimersByTimeAsync(25);
    await rejection;

    const logged = log.mock.calls.flat().join(" ");
    expect(logged).toContain('"event":"stage_abort"');
    expect(logged).toContain('"abort_source":"transport_timeout"');
    expect(logged).not.toContain("PRIVATE_SENTINEL");
    expect(logged).not.toContain("test-key");
  });

  it("records a timed-out sent call as an unknown conservative debit", () => {
    const ledger = new CostLedger("standard", 1);
    const spec = modelFor(resolveConfiguration(), "strategise");
    const entry = ledger.recordUnreportedAttempt({
      stage: "strategise",
      spec,
      inputTokens: 123,
      latencyMs: 120_001,
      attemptId: "timeout-attempt",
      retryNumber: 0,
      reservedUsd: 0.04,
    });
    expect(entry.actualCostUsd).toBeNull();
    expect(entry.costSource).toBe("unreported");
    expect(ledger.hasUnknownCharges).toBe(true);
    expect(ledger.budgetedSpendUsd).toBe(0.04);
    expect(ledger.reportedSpendUsd).toBe(0);
  });

  it("exposes a fixed diagnostic class, not the raw AbortError", () => {
    const error = new ProviderTimeoutError(
      "strategise", "qwen/qwen3.6-max-preview", 120_000, 120_000,
      "transport_timeout", true, false, false
    );
    expect(normalizeKind(error)).toBe("PROVIDER_TIMEOUT");
  });
});
