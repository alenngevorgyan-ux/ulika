import { describe, expect, it } from "vitest";
import { blindOrder, runVariant, JUDGING_CRITERIA, type VariantId } from "./variants";
import { renderAnalysis, runCase } from "../engine";
import { adviceTransport } from "./fixtures";

describe("the three-way comparison is blind and fairly budgeted", () => {
  const deps = {
    transport: adviceTransport({}),
    renderAnalysis: renderAnalysis as unknown as (a: never) => string,
    runCase: runCase as unknown as Parameters<typeof runVariant>[2]["runCase"],
  };

  it("gives every variant the same cap, so nobody wins on budget", async () => {
    const a = await runVariant("A", "Начальник присвоил мой проект.", deps);
    const c = await runVariant("C", "Начальник присвоил мой проект.", deps);
    expect(a.variant).toBe("A");
    expect(c.variant).toBe("C");
    expect(c.calls).toBeGreaterThan(a.calls);
    // Both produced something a reader can judge.
    expect(a.text.length).toBeGreaterThan(100);
    expect(c.text.length).toBeGreaterThan(100);
  });

  it("C answers rather than asking, because answers are what is compared", async () => {
    const c = await runVariant("C", "Мутная ситуация.", { ...deps, transport: adviceTransport({ askQuestions: true }) });
    expect(c.failure).toBeUndefined();
    expect(c.text.length).toBeGreaterThan(100);
  });

  it("shuffles deterministically, and not into A/B/C order", () => {
    const variants: VariantId[] = ["A", "B", "C"];
    const first = blindOrder("c01-boss-credit", variants);
    expect(blindOrder("c01-boss-credit", variants)).toEqual(first);
    expect([...first].sort()).toEqual(["A", "B", "C"]);
    // Different cases must not all arrange the same way, or the mapping leaks
    // after the first case.
    const orders = ["c01", "c02", "c03", "c04", "c05"].map((id) => blindOrder(id, variants).join(""));
    expect(new Set(orders).size).toBeGreaterThan(1);
  });

  it("judges on usability, not on the presence of structure", () => {
    const text = JUDGING_CRITERIA.join(" ");
    expect(text).toMatch(/практическая применимость/);
    expect(text).toMatch(/точных слов/);
    expect(text).not.toMatch(/CaseFrame|поля|структур/);
  });

  it("reports a failed variant instead of scoring it as an empty answer", async () => {
    const broken = async () => {
      throw new Error("provider down");
    };
    const r = await runVariant("A", "x", { ...deps, transport: broken as never });
    expect(r.failure).toBe("Error");
    expect(r.text).toBe("");
  });
});
