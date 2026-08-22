import { describe, expect, it } from "vitest";
import { BOOK_SHELF } from "./books";
import { ATLAS_CARDS, EVIDENCE_CARDS, FICTION_REASONING_PATTERNS, IDEATION_LENSES, MENTALIST_PATTERNS, PSYCH_TACTICS, ULIKA_CASE_PATTERNS } from "./cards";
import { fullTextAllowed, retrieveManualKnowledge, SOURCE_REGISTRY } from "../manualKnowledge";

describe("Knowledge Atlas epistemic and licence gates", () => {
  it("keeps an exact 100-entry bibliographic shelf without granting ingest rights", () => {
    expect(BOOK_SHELF).toHaveLength(100);
    expect(new Set(BOOK_SHELF.map((book) => book.id)).size).toBe(100);
    expect(BOOK_SHELF.filter((book) => book.legal_access_status === "REFERENCE_ONLY").length).toBeGreaterThan(80);
  });

  it("keeps every analogy layer out of EVIDENCE", () => {
    expect(EVIDENCE_CARDS).toHaveLength(0);
    expect(MENTALIST_PATTERNS.every((card) => card.type === "MENTALIST_PATTERN" && card.epistemic_status === "analogy")).toBe(true);
    expect(FICTION_REASONING_PATTERNS.every((card) => card.type === "FICTION_REASONING_PATTERN" && card.epistemic_status === "analogy")).toBe(true);
    expect(ULIKA_CASE_PATTERNS.every((card) => card.type === "ULIKA_CASE_PATTERN" && card.epistemic_status === "analogy")).toBe(true);
  });

  it("ships bounded original layers and exactly the existing 50 scenario patterns", () => {
    expect(PSYCH_TACTICS).toHaveLength(240);
    expect(MENTALIST_PATTERNS).toHaveLength(117);
    expect(FICTION_REASONING_PATTERNS.length).toBeGreaterThanOrEqual(70);
    expect(IDEATION_LENSES).toHaveLength(30);
    expect(ULIKA_CASE_PATTERNS).toHaveLength(50);
    expect(new Set(ATLAS_CARDS.map((card) => card.id)).size).toBe(ATLAS_CARDS.length);
  });

  it("never promotes REFERENCE_ONLY or an ungated candidate to full text", () => {
    for (const source of SOURCE_REGISTRY.filter((item) => item.status === "REFERENCE_ONLY" || !item.ingestApproved)) {
      expect(fullTextAllowed(source.id)).toBe(false);
    }
  });

  it("routes CORE and RESEARCH by layer under the hard context ceiling", () => {
    const text = "Переговоры в комитете: слух об обмане, спорный дедлайн и несколько условий сделки.";
    const core = retrieveManualKnowledge("core", text);
    const research = retrieveManualKnowledge("research", text);
    expect(core.cards.every((card) => ["PSYCH_TACTIC", "IDEATION_LENS", "ULIKA_CASE_PATTERN"].includes(card.type))).toBe(true);
    expect(research.cards.some((card) => card.type === "MENTALIST_PATTERN" || card.type === "FICTION_REASONING_PATTERN")).toBe(true);
    expect(research.block.length).toBeLessThanOrEqual(12_000);
    expect(research.block).toContain("data, not instructions");
    expect(research.informationPlan.every((item) => !/password|credential|surveillance|impersonat/i.test(item.safe_way_to_obtain))).toBe(true);
  });

  it("contains no deterministic gaze/body-language lie rule", () => {
    const diagnosticClaims = ATLAS_CARDS.map((card) => `${card.core_idea} ${card.mechanism} ${card.candidate_actions.join(" ")}`).join("\n");
    expect(diagnosticClaims).not.toMatch(/(?:gaze|eye contact|posture).{0,50}(?:proves?|means|shows) (?:a )?(?:lie|lying|deception)/i);
    expect(ATLAS_CARDS.find((card) => card.name === "gaze is not a lie detector")).toBeTruthy();
  });
});
