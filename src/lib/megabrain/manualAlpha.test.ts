import { mkdtemp, readFile, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { MANUAL_PRESETS, manualPreflightReservations, parseKnowledgeMode, resolveManualPreset } from "./manualPresets";
import { projectAdvicePipeline } from "./engine";
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
    const [access, route, labRoute, panel, chatPage] = await Promise.all([
      readFile(join(process.cwd(), "src/lib/megabrain/manualAccess.ts"), "utf8"),
      readFile(join(process.cwd(), "src/app/api/megabrain-manual/route.ts"), "utf8"),
      readFile(join(process.cwd(), "src/app/api/megabrain-lab/route.ts"), "utf8"),
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
