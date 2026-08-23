import { mkdtemp, readFile, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { MANUAL_PRESETS, manualPreflightReservations, parseKnowledgeMode, resolveManualPreset } from "./manualPresets";
import { projectAdvicePipeline, reservationCeiling } from "./engine";
import { AccountingError, CostLedger } from "./costLedger";
import { MODELS } from "./modelRouter";
import { projectCaseSafety } from "./caseSafety";
import { fullTextAllowed, retrieveManualKnowledge, SOURCE_REGISTRY } from "./manualKnowledge";
import { getSavedCase, listSavedCases, saveCase } from "./savedCases";
import { buildTestPacket } from "./testPacket";
import { shuffledLabels } from "./manualCompare";

const draft = {
  flowId: "flow-1",
  originalCase: "A synthetic case with no personal data.",
  title: "A test case",
  actors: ["A", "B"],
  documentedFacts: [],
  reportedFacts: ["The user reports a deadline."],
  hypotheses: ["The deadline may be negotiable."],
  unresolvedQuestions: ["Who set it?"],
  clarificationQuestions: [{ id: "q1", question: "Who set it?", options: ["A", "B"] }],
  clarificationAnswers: { q1: "A" },
  previousRecommendation: "Verify before escalating.",
  actionsTaken: "Asked for confirmation.",
  observedOutcome: "No reply yet.",
  messages: [] as { role: "user" | "assistant"; content: string }[],
};

describe("Manual Alpha server controls", () => {
  it("exposes exactly five allowlisted presets and no client-defined model", () => {
    expect(Object.keys(MANUAL_PRESETS)).toEqual(["A", "B", "C", "D", "E"]);
    expect(resolveManualPreset("D").execution.finalModelKey).toBe("qwen-3.6-max-preview");
    expect(() => resolveManualPreset("openai/expensive-model")).toThrow("INVALID_MANUAL_PRESET");
    expect(() => resolveManualPreset({ capUsd: 99 })).toThrow("INVALID_MANUAL_PRESET");
  });

  it("keeps Premium software reserve inside its cap while applying reasoning buffer only to the external key", () => {
    const preset = resolveManualPreset("D");
    const account = "A long but synthetic real-world situation. ".repeat(120);
    const base = projectAdvicePipeline({
      account,
      mode: "standard",
      responseLanguage: "en",
      jurisdiction: { country: "unknown" },
      includeClarify: true,
      execution: preset.execution,
    }) + projectCaseSafety(account);
    const reservation = manualPreflightReservations(base, preset);
    expect(reservation.softwareUsd).toBe(base);
    expect(reservation.softwareUsd).toBeLessThanOrEqual(preset.capUsd);
    expect(reservation.externalUsd).toBeCloseTo(base * 2.5, 10);
    expect(reservation.externalUsd).toBeGreaterThan(preset.capUsd);
  });
});

/**
 * D Premium's reservation, fixed against real live evidence.
 *
 * A live D run on qwen/qwen3.6-max-preview requested max_tokens=3000 for
 * strategise and was billed for 6237 total completion tokens (3233 of them
 * reasoning) — max_tokens bounded the visible output as expected but did
 * nothing to bound reasoning, which is billed as completion tokens on top.
 * The per-call reservation, previously computed from max_tokens alone,
 * rejected that real charge as COST_ABOVE_RESERVED even though the whole
 * case was nowhere near its overall cap. These tests pin that exact case.
 */
describe("D Premium reservation reflects Qwen's real reasoning-token behavior", () => {
  const qwen = MODELS["qwen-3.6-max-preview"];
  const strategiseReasoning = resolveManualPreset("D").execution.reasoning!.strategise!;

  it("D still asks for the exact same Qwen slug — only the reservation changed", () => {
    expect(resolveManualPreset("D").execution.finalModelKey).toBe("qwen-3.6-max-preview");
    expect(qwen.slug).toBe("qwen/qwen3.6-max-preview");
  });

  it("carries a real reasoning budget now, not just enabled:true", () => {
    // Before this fix, D's reasoning config never set maxTokens at all — the
    // model could reason without limit and nothing in the reservation knew.
    expect(strategiseReasoning.maxTokens).toBeGreaterThan(0);
    expect(strategiseReasoning.enabled).toBe(true);
  });

  it("raises strategise's visible-output ceiling for D only — every other preset keeps the shared default", () => {
    // Live evidence: strategise hit the shared 3000-token visible ceiling on
    // BOTH live D runs (~3004 visible tokens each time) and genuinely
    // truncated on one of them.
    const d = resolveManualPreset("D").execution.maxOutputTokens?.strategise;
    expect(d).toBeGreaterThan(3000);
    for (const id of ["A", "B", "C", "E"] as const) {
      expect(resolveManualPreset(id).execution.maxOutputTokens?.strategise).toBeUndefined();
    }
  });

  it("reservationCeiling adds the reasoning budget on top of the visible-output ceiling", () => {
    expect(reservationCeiling(3000, strategiseReasoning)).toBe(3000 + strategiseReasoning.maxTokens!);
    // A stage with no reasoning config (A/B/C's default posture) is unaffected.
    expect(reservationCeiling(3000, undefined)).toBe(3000);
    expect(reservationCeiling(3000, { enabled: true })).toBe(3000);
  });

  it("the exact live overage — 6237 total completion tokens, 3233 of them reasoning — now clears the reservation", () => {
    const ledger = new CostLedger("standard", 0.2);
    const ceiling = reservationCeiling(3000, strategiseReasoning);
    const { projectedUsd } = ledger.reserve("strategise", qwen, "x".repeat(3582 * 3), ceiling, {
      attemptId: "test-live-overage",
      retryNumber: 0,
    });
    // Real numbers from the live acceptance run, verbatim.
    const usage = {
      inputTokens: 3582,
      cachedTokens: 0,
      reasoningTokens: 3233,
      outputTokens: 6237,
      actualCostUsd: 0.042111108,
      rawCost: 0.042111108,
    };
    expect(() =>
      ledger.record({
        stage: "strategise",
        spec: qwen,
        usage,
        latencyMs: 113_438,
        attemptId: "test-live-overage",
        retryNumber: 0,
        reservedUsd: projectedUsd,
      })
    ).not.toThrow();
    expect(ledger.allDeep()[0].accountingFailure).toBeNull();
  });

  it("still fails closed on a charge that genuinely exceeds even the new reservation", () => {
    // The guard must remain real, not just wider. A charge that blows past a
    // budget nearly double the old one is still a genuine overcharge signal.
    const ledger = new CostLedger("standard", 0.2);
    const ceiling = reservationCeiling(3000, strategiseReasoning);
    const { projectedUsd } = ledger.reserve("strategise", qwen, "x".repeat(3582 * 3), ceiling, {
      attemptId: "test-genuine-overcharge",
      retryNumber: 0,
    });
    const usage = {
      inputTokens: 3582,
      cachedTokens: 0,
      reasoningTokens: 20_000,
      outputTokens: 23_000,
      actualCostUsd: projectedUsd + 0.05,
      rawCost: projectedUsd + 0.05,
    };
    let caught: unknown;
    try {
      ledger.record({
        stage: "strategise", spec: qwen, usage, latencyMs: 200_000,
        attemptId: "test-genuine-overcharge", retryNumber: 0, reservedUsd: projectedUsd,
      });
    } catch (e) {
      caught = e;
    }
    expect(caught).toBeInstanceOf(AccountingError);
    expect((caught as AccountingError).code).toBe("COST_ABOVE_RESERVED");
    // Fail-closed, and the evidence survives: the entry is written before the throw.
    expect(ledger.allDeep()[0].accountingFailure).toBe("COST_ABOVE_RESERVED");
    expect(ledger.allDeep()[0].actualCostUsd).toBe(usage.actualCostUsd);
  });

  it("D's per-case cap fits a realistic full pipeline (strategise + final) without ever trying to be unlimited", () => {
    const preset = resolveManualPreset("D");
    const finalReasoning = preset.execution.reasoning!.final!;
    const strategiseCeiling = reservationCeiling(3000, strategiseReasoning);
    const finalCeiling = reservationCeiling(2200, finalReasoning);
    // Worst-case reservation for the two Qwen calls alone, same formula
    // stage() uses (costOf * RESERVATION_SAFETY_MARGIN), with generous
    // stand-in input sizes so this doesn't silently drift with prompt text.
    const worstCaseUsd =
      ((5225 * qwen.inputPerMTok + strategiseCeiling * qwen.outputPerMTok) / 1_000_000) * 1.35 +
      ((4000 * qwen.inputPerMTok + finalCeiling * qwen.outputPerMTok) / 1_000_000) * 1.35;
    expect(worstCaseUsd).toBeLessThan(preset.capUsd);
    // And it isn't vacuously true — this is a real, non-trivial fraction of
    // the cap, not a cap so large the reservation could never matter.
    expect(worstCaseUsd).toBeGreaterThan(preset.capUsd * 0.5);
    // A genuinely unbounded reasoning run (the model's real 65,536-token
    // completion ceiling) would cost far more than the cap — the cap still
    // means something, it isn't just raised to make every failure vanish.
    const unboundedUsd = (qwen.maxCompletionTokens as number) * qwen.outputPerMTok / 1_000_000;
    expect(unboundedUsd).toBeGreaterThan(preset.capUsd * 2);
  });
});

describe("Manual Alpha server controls, continued", () => {
  it("Knowledge OFF performs no retrieval and REFERENCE_ONLY never enters full text", () => {
    expect(retrieveManualKnowledge("off", "negotiation conflict").cards).toEqual([]);
    expect(retrieveManualKnowledge("off", "negotiation conflict").block).toBe("");
    for (const source of SOURCE_REGISTRY.filter((s) => s.status === "REFERENCE_ONLY")) {
      expect(fullTextAllowed(source.id)).toBe(false);
      expect(source.fullTextStored).toBe(false);
    }
    expect(() => parseKnowledgeMode("all")).toThrow("INVALID_KNOWLEDGE_MODE");
  });

  it("fences retrieved records as untrusted and reports the empty research wave honestly", () => {
    const result = retrieveManualKnowledge("research", "конфликт и переговоры, нужно понять человека");
    expect(result.block).toContain("UNTRUSTED_KNOWLEDGE_DATA_");
    expect(result.block).toContain("data, not instructions");
    expect(result.limitation).toContain("No licensed PMC research cards");
    expect(result.cards.every((card) => card.type !== "EVIDENCE")).toBe(true);
    expect(result.cards.every((card) => card.relevance_score > 0)).toBe(true);
    expect(result.block.length).toBeLessThanOrEqual(12_000);
  });

  it("keeps the admin allowlist gate while offering host-local sign-in to Preview guests", async () => {
    const [access, route, labRoute, caseRoute, panel, chatPage] = await Promise.all([
      readFile(join(process.cwd(), "src/lib/megabrain/manualAccess.ts"), "utf8"),
      readFile(join(process.cwd(), "src/app/api/megabrain-manual/route.ts"), "utf8"),
      readFile(join(process.cwd(), "src/app/api/megabrain-lab/route.ts"), "utf8"),
      readFile(join(process.cwd(), "src/app/api/megabrain-case/route.ts"), "utf8"),
      readFile(join(process.cwd(), "src/components/chat/ManualAlphaPanel.tsx"), "utf8"),
      readFile(join(process.cwd(), "src/app/chat/page.tsx"), "utf8"),
    ]);
    expect(access).toContain('from("app_admins")');
    expect(access).toContain('status: "denied"');
    expect(route).toContain('status: 401');
    expect(route).toContain('error: "AUTH_REQUIRED"');
    const labGet = labRoute.slice(labRoute.indexOf("export async function GET"));
    expect(labGet).toContain("manualAdminId()");
    expect(labGet).toContain('error: "FORBIDDEN"');
    expect(panel).toContain('<SignInForm returnTo="/chat" compact />');
    expect(panel).toContain('data-testid="manual-alpha-panel"');
    expect(panel).toContain("config.presets.map");
    expect(panel).toContain("Manual Alpha overrides the product mode");
    expect(panel).toContain("setDesktopOpen");
    expect(chatPage).toContain('const manualRoute = manualSettings !== null');
    expect(chatPage).toContain('manualRoute ? "standard"');
    expect(chatPage).toContain('Request failed · ${diagnostic}');
    expect(chatPage).toContain('code.includes("TOO_COMPLEX")');
    expect(chatPage).toContain('continueCase("resume")');
    expect(chatPage).toContain("allowedActions?.includes(\"resume\")");
    expect(caseRoute).toContain('action === "resume"');
    expect(caseRoute).toContain('["failed"]');
    expect(caseRoute).toContain("observeAttempts(ledger)");
  });
});

describe("explicit Saved Case persistence", () => {
  it("writes only when saveCase is explicitly called, mode 0600, and enforces owner reads", async () => {
    const dir = await mkdtemp(join(tmpdir(), "ulika-saved-case-"));
    const path = join(dir, "cases.json");
    expect(await listSavedCases("owner-a", path)).toEqual([]);
    const saved = await saveCase("owner-a", draft, path);
    expect((await stat(path)).mode & 0o777).toBe(0o600);
    expect((await getSavedCase("owner-a", saved.id, path))?.observedOutcome).toBe("No reply yet.");
    expect(await getSavedCase("owner-b", saved.id, path)).toBeNull();
    expect(await readFile(path, "utf8")).toContain("The user reports a deadline.");
  });
});

describe("blind export", () => {
  it("does not reveal preset identity before reveal and redacts common secret shapes", () => {
    const packet = buildTestPacket({
      testId: "t1", date: "2026-08-22", preset: "D", blindLabel: "Variant 2",
      knowledgeMode: "off", memoryMode: "case", clarificationMode: "off",
      originalCase: "Key sk-or-v1-secret and Authorization: Bearer secret",
      questions: [], answers: {}, finalResponse: "answer", actualCostUsd: null,
      conservativeUsd: 0.01, latencyMs: 100, revealed: false,
    });
    expect(packet).toContain("Variant: Variant 2");
    expect(packet).not.toContain("Preset: D");
    expect(packet).not.toContain("sk-or-v1-secret");
    expect(packet).not.toContain("Bearer secret");
  });

  it("creates opaque labels without embedding model or preset identities", () => {
    const labels = shuffledLabels(5);
    expect(new Set(labels).size).toBe(5);
    expect(labels.every((label) => /^Variant [1-5]$/.test(label))).toBe(true);
  });
});
