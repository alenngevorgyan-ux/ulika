import { CRAFT, type KnowledgeEntry } from "./craft";
import { PSYCHOLOGY } from "./psychology";
import { LEARNING } from "./learning";

export const ALL_KNOWLEDGE: KnowledgeEntry[] = [...CRAFT, ...PSYCHOLOGY, ...LEARNING];

/**
 * Cue matching rather than embeddings, on purpose.
 *
 * The library is ~22 entries. An embedding round-trip would add latency and a
 * second provider dependency to pick from twenty-two items, which is not a
 * retrieval problem, it is a filtering problem. Revisit if the library passes
 * a few hundred entries.
 */
export function retrieveKnowledge(conversationText: string, limit = 5): KnowledgeEntry[] {
  const haystack = conversationText.toLowerCase();

  const scored = ALL_KNOWLEDGE.map((entry) => {
    let score = 0;
    for (const cue of entry.cues) {
      if (haystack.includes(cue)) {
        // Longer cues are more specific, so they count for more than a stray
        // common word happening to appear.
        score += cue.length > 6 ? 3 : 1;
      }
    }
    return { entry, score };
  })
    .filter((s) => s.score > 0)
    .sort((a, b) => b.score - a.score);

  return scored.slice(0, limit).map((s) => s.entry);
}

/** Always-on core. These apply to essentially any personal situation. */
const ALWAYS = ["baseline-deviation", "statement-analysis", "what-is-missing"];

export function buildKnowledgeBlock(conversationText: string): string {
  const retrieved = retrieveKnowledge(conversationText);
  const always = ALL_KNOWLEDGE.filter((e) => ALWAYS.includes(e.id));

  const seen = new Set<string>();
  const merged: KnowledgeEntry[] = [];
  for (const e of [...always, ...retrieved]) {
    if (!seen.has(e.id)) {
      seen.add(e.id);
      merged.push(e);
    }
  }

  return merged
    .map(
      (e) =>
        `${e.title}\nMechanism: ${e.core}\nLets you see: ${e.reveals}\nUsing it: ${e.inPractice}\nWhere it fails: ${e.limits}`
    )
    .join("\n\n");
}
