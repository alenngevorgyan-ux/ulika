import { describe, expect, it } from "vitest";
import { runCase } from "./engine";
import { CostLedger } from "./costLedger";
import { sanitizeExtract } from "./sanitize";
import { validateActors } from "./schemas";
import { fixtureTransport, GOOD_ANALYSIS } from "./evals/fixtures";
import type { CompletionRequest } from "./transport";

/**
 * Deterministic sanitation.
 *
 * The regression at the top is the real one: a complete CaseFrame was thrown
 * away because two optional actor claims said "reported" and named no fact.
 */

const ledger = () => new CostLedger("standard", 0.05);

/** A frame with two real fact ids, so referential integrity has something to check. */
const FRAME = { reportedFacts: [{ id: "f1", text: "a" }, { id: "f2", text: "b" }] };
const claim = (over: Record<string, unknown>) => ({
  actors: {
    actors: [
      {
        label: "Руководитель",
        goals: [], fears: [], resources: [], dependencies: [], likelyReactions: [],
        authority: { value: "unknown", basis: "unknown", supportingFactIds: [] },
        ...over,
      },
    ],
  },
  frame: FRAME,
});

describe("the live failure: two unsupported optional claims must not kill the case", () => {
  it("drops exactly those two, warns twice, and finishes the run", async () => {
    const spy: CompletionRequest[] = [];
    const calls = { n: 0 };
    const book = ledger();

    const result = await runCase(
      { account: "Начальник присвоил мой проект и отстраняет меня от встреч.", ledger: book },
      fixtureTransport({ unsupportedActorClaims: true, spy, callCount: calls })
    );

    const removed = result.warnings.filter((w) => w.code === "UNSUPPORTED_ACTOR_CLAIM_REMOVED");
    expect(removed).toHaveLength(2);
    expect(removed.map((w) => w.path).sort()).toEqual([
      "actors[0].goals[1]",
      "actors[0].likelyReactions[0]",
    ]);

    // The actor and the frame survive.
    const first = result.analysis.actors.actors[0];
    expect(first.label).toBe("Пользователь");
    expect(first.goals.length).toBeGreaterThan(0);
    expect(result.analysis.frame.reportedFacts.length).toBeGreaterThan(0);

    // The pipeline continued past extract.
    expect(spy.map((r) => r.jsonSchema?.name)).toEqual([
      "case_extraction",
      "case_analysis",
      "case_plan",
    ]);
    // Sanitation is free: it did not add a call.
    expect(calls.n).toBe(3);
    expect(result.analysis.plan.exactWords.length).toBeGreaterThanOrEqual(3);
  });
});

describe("what sanitation removes, and what it refuses to invent", () => {
  it("removes an inferred claim with no uncertainty", () => {
    const { value, warnings } = sanitizeExtract(
      claim({ goals: [{ value: "g", basis: "inferred", supportingFactIds: ["f1"] }] })
    );
    expect((value as never as { actors: { actors: { goals: unknown[] }[] } }).actors.actors[0].goals).toHaveLength(0);
    expect(warnings[0].code).toBe("UNSUPPORTED_ACTOR_CLAIM_REMOVED");
  });

  it("removes a reference to a fact id that does not exist", () => {
    const { value, warnings } = sanitizeExtract(
      claim({ goals: [{ value: "g", basis: "reported", supportingFactIds: ["f1", "f99"] }] })
    );
    const goals = (value as never as { actors: { actors: { goals: { supportingFactIds: string[] }[] }[] } })
      .actors.actors[0].goals;
    expect(goals[0].supportingFactIds).toEqual(["f1"]);
    expect(warnings.some((w) => w.code === "UNKNOWN_FACT_REFERENCE_REMOVED")).toBe(true);
  });

  it("removes a reported claim left with no references at all", () => {
    const { value, warnings } = sanitizeExtract(
      claim({ goals: [{ value: "g", basis: "reported", supportingFactIds: ["f99"] }] })
    );
    expect((value as never as { actors: { actors: { goals: unknown[] }[] } }).actors.actors[0].goals).toHaveLength(0);
    expect(warnings.map((w) => w.code)).toContain("UNSUPPORTED_ACTOR_CLAIM_REMOVED");
  });

  it("never relabels an unsupported reported claim as inferred", () => {
    const { value } = sanitizeExtract(
      claim({ goals: [{ value: "он хочет меня выдавить", basis: "reported", supportingFactIds: [] }] })
    );
    // Relabelling would keep the sentence and change what it asserts.
    expect(JSON.stringify(value)).not.toContain("inferred");
    expect(JSON.stringify(value)).not.toContain("он хочет меня выдавить");
  });

  it("normalises an 'unknown' claim carrying invented content", () => {
    const { value, warnings } = sanitizeExtract(
      claim({ fears: [{ value: "Боится потерять инженера", basis: "unknown", supportingFactIds: [] }] })
    );
    const fears = (value as never as { actors: { actors: { fears: { value: string }[] }[] } }).actors.actors[0].fears;
    expect(fears[0].value).toBe("unknown");
    expect(warnings.some((w) => w.code === "OPTIONAL_FIELD_NORMALIZED")).toBe(true);
  });

  it("drops a duplicate claim", () => {
    const dup = { value: "g", basis: "reported", supportingFactIds: ["f1"] };
    const { value, warnings } = sanitizeExtract(claim({ goals: [dup, { ...dup }] }));
    expect((value as never as { actors: { actors: { goals: unknown[] }[] } }).actors.actors[0].goals).toHaveLength(1);
    expect(warnings.some((w) => w.code === "DUPLICATE_CLAIM_REMOVED")).toBe(true);
  });

  it("leaves a correct response untouched", () => {
    const good = { frame: GOOD_ANALYSIS.frame, actors: GOOD_ANALYSIS.actors };
    const { value, warnings } = sanitizeExtract(structuredClone(good));
    expect(warnings).toEqual([]);
    expect(JSON.parse(JSON.stringify(value))).toEqual(JSON.parse(JSON.stringify(good)));
  });

  it("is deterministic: same input, same output", () => {
    const input = claim({
      goals: [
        { value: "g", basis: "reported", supportingFactIds: ["f99"] },
        { value: "h", basis: "inferred", supportingFactIds: [] },
      ],
    });
    const a = sanitizeExtract(structuredClone(input));
    const b = sanitizeExtract(structuredClone(input));
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });
});

describe("sanitation does not soften what is actually fatal", () => {
  it("an actor map with nothing left is still refused", async () => {
    // Every claim unsupported AND no label: the validator still has nothing to
    // work with, and says so rather than inventing an actor.
    const empty = sanitizeExtract({ frame: FRAME, actors: { actors: [{ label: "" }] } });
    const v = validateActors((empty.value as { actors: unknown }).actors, {
      ...GOOD_ANALYSIS.frame,
      reportedFacts: FRAME.reportedFacts,
    });
    expect(v.ok).toBe(false);
    expect(v.problems.some((p) => p.includes("label"))).toBe(true);
  });

  it("a frame with no facts at all is still refused", async () => {
    await expect(
      runCase({ account: "x", ledger: ledger() }, fixtureTransport({ emptyFrame: true }))
    ).rejects.toThrow();
  });
});

describe("privacy: a warning is a code and a path, never the text", () => {
  it("carries no removed content, in warnings or in the ledger", async () => {
    const secret = "Добиться публичного признания авторства";
    const book = ledger();
    const result = await runCase(
      { account: "Начальник присвоил мой проект.", ledger: book },
      fixtureTransport({ unsupportedActorClaims: true })
    );

    const warnBlob = JSON.stringify(result.warnings);
    expect(warnBlob).not.toContain(secret);
    expect(warnBlob).not.toContain("Пойдёт напрямую к директору");
    for (const w of result.warnings) {
      expect(w.path).toMatch(/^[A-Za-z0-9_.[\]]+$/);
      expect(Object.keys(w).sort()).toEqual(["code", "path"]);
    }
    expect(JSON.stringify(book.allDeep())).not.toContain(secret);
    // And the removed claim is gone from the analysis itself.
    expect(JSON.stringify(result.analysis.actors)).not.toContain(secret);
  });
});
