import { stripMarkdown } from "../stripMarkdown";
import { parseReply } from "./parseReply";
import type { ReplyBlock, StructuredReply } from "./blocks";

const TYPES = new Set([
  "observation",
  "questions",
  "prose",
  "source",
  "checklist",
  "timeline",
  "pattern",
  "drill",
  "envelope",
]);

/**
 * Turn whatever came back into blocks.
 *
 * Three paths, in order of preference:
 *   1. Valid JSON matching the schema.
 *   2. The old [NOTICED]/[ASKING]/[SAYING] text format — still used by every
 *      reply already sitting in someone's history, so it must keep rendering.
 *   3. Plain prose.
 *
 * Never throws and never returns nothing. A parse failure that blanks the
 * screen is worse than an ugly fallback.
 */
export function parseBlocks(raw: string): StructuredReply {
  const text = (raw ?? "").trim();
  if (!text) return { blocks: [] };

  const json = tryJson(text);
  if (json) return json;

  // Legacy section format.
  const legacy = parseReply(text);
  if (!legacy.plain) {
    const blocks: ReplyBlock[] = [];
    if (legacy.noticed.length) {
      blocks.push({
        type: "observation",
        // The old format carried no fact/inference distinction, so everything
        // it produced is marked inference rather than claiming more precision
        // than the data actually has.
        lines: legacy.noticed.map((t) => ({ text: t, kind: "inference" as const })),
      });
    }
    if (legacy.asking.length) blocks.push({ type: "questions", items: legacy.asking });
    if (legacy.saying) blocks.push({ type: "prose", text: legacy.saying });
    return { blocks };
  }

  return { blocks: [{ type: "prose", text: legacy.saying || stripMarkdown(text) }] };
}

function tryJson(text: string): StructuredReply | null {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start === -1 || end <= start) return null;

  let parsed: unknown;
  try {
    parsed = JSON.parse(text.slice(start, end + 1));
  } catch {
    return null;
  }

  const raw = (parsed as { blocks?: unknown })?.blocks;
  if (!Array.isArray(raw)) return null;

  const blocks = raw.filter(isBlock).map(clean);
  return blocks.length ? { blocks } : null;
}

function isBlock(b: unknown): b is ReplyBlock {
  return Boolean(b) && TYPES.has((b as { type?: string }).type ?? "");
}

/** Strip markdown from every text field, whatever the model promised. */
function clean(b: ReplyBlock): ReplyBlock {
  const s = (v: unknown) => stripMarkdown(String(v ?? ""));

  switch (b.type) {
    case "observation":
      return {
        type: "observation",
        lines: (b.lines ?? [])
          .filter((l) => l && String(l.text ?? "").trim())
          .map((l) => ({
            text: s(l.text),
            kind: l.kind === "fact" ? "fact" : "inference",
          })),
      };
    case "questions":
      return { type: "questions", items: (b.items ?? []).map(s).filter(Boolean) };
    case "prose":
      return { type: "prose", text: s(b.text) };
    case "source":
      return {
        type: "source",
        slug: String(b.slug ?? ""),
        title: s(b.title),
        grade: ["A", "B", "C", "D"].includes(b.grade as string) ? b.grade : null,
        note: s(b.note),
      };
    case "checklist":
      return {
        type: "checklist",
        title: s(b.title),
        items: (b.items ?? []).map(s).filter(Boolean),
        skillId: String(b.skillId ?? "general"),
      };
    case "timeline":
      return {
        type: "timeline",
        title: s(b.title),
        steps: (b.steps ?? []).map((st) => ({
          label: s(st.label),
          detail: s(st.detail),
          depth: st.depth,
        })),
      };
    case "pattern":
      return {
        type: "pattern",
        subject: s(b.subject),
        observation: s(b.observation),
        thenWhat: s(b.thenWhat),
      };
    case "drill":
      return {
        type: "drill",
        title: s(b.title),
        instruction: s(b.instruction),
        seconds: Number(b.seconds) > 0 ? Math.min(Number(b.seconds), 600) : 60,
        skillId: String(b.skillId ?? "general"),
      };
    case "envelope":
      return {
        type: "envelope",
        title: s(b.title),
        assignment: s(b.assignment),
        skillId: String(b.skillId ?? "general"),
      };
  }
}
