import { describe, it, expect } from "vitest";
import { validateEvent, dedupeKey, type StoredEvent } from "./events";
import { deriveCase, deriveCaseAt, emptyCase, calibration } from "./reducer";
import { buildInteractionContext } from "./context";
import { deriveBlockId, contentFingerprint } from "../mentalist/blockIds";
import { parseBlocks } from "../mentalist/parseBlocks";
import type { ReplyBlock } from "../mentalist/blocks";
import { EN } from "../i18n/en";
import { RU } from "../i18n/ru";
import { translate } from "../i18n";

const at = (n: number) => new Date(2026, 0, 1, 0, 0, n).toISOString();
const ev = (event: unknown, n: number): StoredEvent => ({
  id: `e${n}`,
  conversationId: "c1",
  event: event as StoredEvent["event"],
  caseVersion: n,
  createdAt: at(n),
});

describe("event validation is a whitelist", () => {
  it("accepts a well-formed event", () => {
    expect(
      validateEvent({ type: "CHECKLIST_TOGGLED", blockId: "b1", itemIndex: 0, checked: true })
    ).toEqual({ type: "CHECKLIST_TOGGLED", blockId: "b1", itemIndex: 0, checked: true });
  });

  it("rejects an unknown event type outright", () => {
    expect(validateEvent({ type: "DROP_TABLE", blockId: "b1" })).toBeNull();
  });

  it("rejects a known type with a missing field rather than filling a default", () => {
    expect(validateEvent({ type: "CHECKLIST_TOGGLED", blockId: "b1" })).toBeNull();
  });

  it("rejects a confidence outside 0-100", () => {
    expect(validateEvent({ type: "CONFIDENCE_SUBMITTED", blockId: "b", value: 140 })).toBeNull();
    expect(validateEvent({ type: "CONFIDENCE_SUBMITTED", blockId: "b", value: -1 })).toBeNull();
  });

  it("strips unknown extra fields instead of passing them through", () => {
    const out = validateEvent({
      type: "CHECKLIST_TOGGLED",
      blockId: "b1",
      itemIndex: 0,
      checked: true,
      isAdmin: true,
    });
    expect(out).not.toBeNull();
    expect(Object.keys(out!)).toEqual(["type", "blockId", "itemIndex", "checked"]);
  });

  it("rejects junk", () => {
    for (const junk of [null, undefined, "", 42, [], { blockId: "b" }]) {
      expect(validateEvent(junk)).toBeNull();
    }
  });
});

describe("dedupe contract", () => {
  it("marks toggles and answers as replace-not-append", () => {
    expect(
      dedupeKey({ type: "CHECKLIST_TOGGLED", blockId: "b", itemIndex: 2, checked: true })
    ).toBe("CHECKLIST_TOGGLED:b:2");
  });

  it("leaves predictions appending — a second prediction is a real second one", () => {
    expect(
      dedupeKey({
        type: "PREDICTION_MADE",
        blockId: "b",
        predictionId: "p1",
        claim: "x",
        confidence: 60,
      })
    ).toBeNull();
  });
});

describe("reducer", () => {
  it("folds a tick into state", () => {
    const s = deriveCase([
      ev({ type: "CHECKLIST_TOGGLED", blockId: "b1", itemIndex: 0, checked: true }, 1),
    ]);
    expect(s.checklists.b1[0]).toBe(true);
    expect(s.version).toBe(1);
  });

  it("last write wins on a repeated toggle (double submit)", () => {
    const s = deriveCase([
      ev({ type: "CHECKLIST_TOGGLED", blockId: "b1", itemIndex: 0, checked: true }, 1),
      ev({ type: "CHECKLIST_TOGGLED", blockId: "b1", itemIndex: 0, checked: false }, 2),
    ]);
    expect(s.checklists.b1[0]).toBe(false);
  });

  it("is order-independent on input — it sorts by time itself", () => {
    const a = ev({ type: "CHECKLIST_TOGGLED", blockId: "b", itemIndex: 0, checked: true }, 1);
    const b = ev({ type: "CHECKLIST_TOGGLED", blockId: "b", itemIndex: 0, checked: false }, 2);
    expect(deriveCase([b, a]).checklists.b[0]).toBe(false);
  });

  it("supersedes a hypothesis instead of overwriting it", () => {
    const s = deriveCase([
      ev(
        {
          type: "HYPOTHESIS_COMMITTED",
          blockId: "b",
          hypothesisId: "h1",
          claim: "he is jealous",
          supports: [],
          contradicts: [],
          wouldChangeMind: "",
        },
        1
      ),
      ev(
        {
          type: "HYPOTHESIS_COMMITTED",
          blockId: "b",
          hypothesisId: "h2",
          claim: "he felt excluded",
          supports: [],
          contradicts: [],
          wouldChangeMind: "",
        },
        2
      ),
    ]);
    expect(s.hypotheses).toHaveLength(2);
    expect(s.hypotheses[0].supersededBy).toBe("h2");
    expect(s.hypotheses.find((h) => !h.supersededBy)?.claim).toBe("he felt excluded");
  });

  it("marks dismissed evidence rather than deleting it", () => {
    const s = deriveCase([
      ev({ type: "EVIDENCE_PINNED", blockId: "b", evidenceId: "e1", excerpt: "said maybe" }, 1),
      ev({ type: "EVIDENCE_DISMISSED", blockId: "b", evidenceId: "e1" }, 2),
    ]);
    expect(s.evidence).toHaveLength(1);
    expect(s.evidence[0].dismissed).toBe(true);
  });

  it("replays a prefix for the retrospective", () => {
    const events = [
      ev({ type: "CHECKLIST_TOGGLED", blockId: "b", itemIndex: 0, checked: true }, 1),
      ev({ type: "CASE_CLOSED", caseId: "c1" }, 5),
    ];
    expect(deriveCase(events).status).toBe("closed");
    expect(deriveCaseAt(events, at(2)).status).toBe("open");
  });

  it("never invents a calibration number from too few predictions", () => {
    const s = emptyCase();
    expect(calibration(s).meanAbsError).toBeNull();
    expect(calibration(s).resolved).toBe(0);
  });
});

describe("AI context", () => {
  it("is empty when nothing has happened, rather than emitting a header", () => {
    expect(buildInteractionContext(emptyCase())).toBe("");
  });

  it("tells the model not to re-assign completed work", () => {
    const s = deriveCase([
      ev({ type: "CHECKLIST_TOGGLED", blockId: "b1", itemIndex: 0, checked: true }, 1),
    ]);
    const ctx = buildInteractionContext(s);
    expect(ctx).toContain("completed");
    expect(ctx).toContain("Do not re-assign");
  });

  it("blocks a second prediction while one is unresolved", () => {
    const s = deriveCase([
      ev(
        { type: "PREDICTION_MADE", blockId: "b", predictionId: "p1", claim: "she calls", confidence: 70 },
        1
      ),
    ]);
    expect(buildInteractionContext(s)).toContain("do NOT ask for another prediction");
  });

  it("stays bounded on a long case", () => {
    const many = Array.from({ length: 60 }, (_, i) =>
      ev(
        {
          type: "EVIDENCE_PINNED",
          blockId: "b",
          evidenceId: `e${i}`,
          excerpt: "x".repeat(400),
        },
        i + 1
      )
    );
    // 60 pinned items at 400 chars each is 24k characters of raw log; the
    // context must not simply pass that through.
    expect(buildInteractionContext(deriveCase(many)).length).toBeLessThan(2500);
  });
});

describe("block ids", () => {
  const block: ReplyBlock = {
    type: "checklist",
    title: "Try this",
    items: ["ask her directly", "wait a day"],
    skillId: "s",
  };

  it("is stable across calls — the reload guarantee", () => {
    expect(deriveBlockId("c1", 0, 0, block)).toBe(deriveBlockId("c1", 0, 0, block));
  });

  it("differs by conversation, message and position", () => {
    const a = deriveBlockId("c1", 0, 0, block);
    expect(deriveBlockId("c2", 0, 0, block)).not.toBe(a);
    expect(deriveBlockId("c1", 1, 0, block)).not.toBe(a);
    expect(deriveBlockId("c1", 0, 1, block)).not.toBe(a);
  });

  it("derives from content, so legacy messages get ids with no migration", () => {
    const legacy = parseBlocks(
      JSON.stringify({
        blocks: [{ type: "checklist", title: "Try this", items: ["ask her directly", "wait a day"], skillId: "s" }],
      })
    ).blocks[0];
    expect(deriveBlockId("c1", 0, 0, legacy)).toBe(deriveBlockId("c1", 0, 0, block));
  });

  it("changes when the content changes", () => {
    const edited: ReplyBlock = { ...block, items: ["something else"] };
    expect(deriveBlockId("c1", 0, 0, edited)).not.toBe(deriveBlockId("c1", 0, 0, block));
  });

  it("fingerprints every block type without throwing", () => {
    const all: ReplyBlock[] = [
      { type: "observation", lines: [{ text: "a", kind: "fact" }] },
      { type: "questions", items: ["q"] },
      { type: "prose", text: "p" },
      { type: "source", slug: "s", title: "t", grade: "A", note: "n" },
      block,
      { type: "timeline", title: "t", steps: [{ label: "l", detail: "d" }] },
      { type: "pattern", subject: "s", observation: "o", thenWhat: "w" },
      { type: "drill", title: "t", instruction: "i", seconds: 60, skillId: "s" },
      { type: "envelope", title: "t", assignment: "a", skillId: "s" },
    ];
    for (const b of all) expect(typeof contentFingerprint(b)).toBe("string");
  });
});

describe("legacy message compatibility", () => {
  it("still renders the old [NOTICED] section format", () => {
    const { blocks } = parseBlocks("[NOTICED]\nsomething\n\n[ASKING]\nwhy?\n\n[SAYING]\nhm.");
    expect(blocks.map((b) => b.type)).toEqual(["observation", "questions", "prose"]);
  });

  it("marks legacy observations as inference, not fact", () => {
    // The old format carried no fact/inference distinction. Claiming "fact"
    // would assert more precision than the stored data has.
    const { blocks } = parseBlocks("[NOTICED]\nsomething");
    expect(blocks[0]).toMatchObject({ lines: [{ kind: "inference" }] });
  });

  it("degrades malformed JSON to prose rather than blanking", () => {
    const { blocks } = parseBlocks('{"blocks": [{"type": "obs');
    expect(blocks).toHaveLength(1);
    expect(blocks[0].type).toBe("prose");
  });

  it("drops unknown block types but keeps the valid ones", () => {
    const { blocks } = parseBlocks(
      JSON.stringify({ blocks: [{ type: "wormhole" }, { type: "prose", text: "kept" }] })
    );
    expect(blocks).toHaveLength(1);
    expect(blocks[0]).toMatchObject({ type: "prose", text: "kept" });
  });
});

describe("i18n", () => {
  it("has full Russian coverage of every English key", () => {
    const missing = Object.keys(EN).filter((k) => !(k in RU));
    expect(missing).toEqual([]);
  });

  it("has no Russian keys that English does not define", () => {
    const extra = Object.keys(RU).filter((k) => !(k in EN));
    expect(extra).toEqual([]);
  });

  it("interpolates variables", () => {
    expect(translate("en", "case.unresolved", { count: 4 })).toBe("4 unresolved");
    expect(translate("ru", "case.unresolved", { count: 4 })).toBe("Не выяснено: 4");
  });

  it("leaves an unknown placeholder alone rather than printing undefined", () => {
    expect(translate("en", "evidence.grade", {})).toContain("{grade}");
  });
});
