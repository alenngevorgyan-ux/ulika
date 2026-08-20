import { stripMarkdown } from "../stripMarkdown";

export interface ParsedReply {
  noticed: string[];
  asking: string[];
  saying: string;
  /** True when no section labels were present — render as plain prose. */
  plain: boolean;
}

const LABELS = ["NOTICED", "ASKING", "SAYING"] as const;

/**
 * Split the section-labelled reply into renderable parts.
 *
 * Degrades deliberately: an unlabelled reply (greetings, crisis responses,
 * or a model that just didn't comply) comes back as `plain` prose rather than
 * an error or an empty screen.
 */
export function parseReply(raw: string): ParsedReply {
  const text = stripMarkdown(raw ?? "");

  const hasLabel = LABELS.some((l) => text.includes(`[${l}]`));
  if (!hasLabel) {
    return { noticed: [], asking: [], saying: text, plain: true };
  }

  const section = (name: string): string => {
    const start = text.indexOf(`[${name}]`);
    if (start === -1) return "";
    const after = start + name.length + 2;
    // Ends at whichever other label comes next.
    const nextPositions = LABELS.map((l) => text.indexOf(`[${l}]`, after)).filter((i) => i !== -1);
    const end = nextPositions.length ? Math.min(...nextPositions) : text.length;
    return text.slice(after, end).trim();
  };

  const lines = (s: string) =>
    s
      .split("\n")
      .map((l) => l.trim())
      .filter(Boolean);

  return {
    noticed: lines(section("NOTICED")),
    asking: lines(section("ASKING")),
    saying: section("SAYING"),
    plain: false,
  };
}
