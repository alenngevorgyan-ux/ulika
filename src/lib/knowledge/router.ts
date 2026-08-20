import type { SupabaseClient } from "@supabase/supabase-js";
import { chatComplete } from "../ai/provider";
import { embedOne } from "./embed";
import { buildKnowledgeBlock } from "./retrieve";

export type DepthLayer = "core" | "deepening" | "mastery";

/**
 * Which layers to retrieve, given how much time the learner actually has.
 *
 * Same content in the database, different traversal speed. A fortnight gets
 * CORE across many topics; a month unfolds all three on each.
 */
export function depthsForPace(
  pace: "intense" | "steady" | "light" | "paused" | undefined,
  daysRemaining?: number
): DepthLayer[] {
  if (typeof daysRemaining === "number" && daysRemaining <= 14) return ["core"];
  if (pace === "light" || pace === "paused") return ["core"];
  if (pace === "intense") return ["core", "deepening", "mastery"];
  return ["core", "deepening"];
}

export interface RetrievedChunk {
  source_title: string;
  category_id: string;
  evidence_grade: "A" | "B" | "C" | "D" | null;
  chapter_title: string;
  content: string;
  short_definition: string;
  depth: DepthLayer;
  /** Stage craft. Must never be presented as real perception. */
  craft_only?: boolean;
  similarity: number;
}

export interface RoutedKnowledge {
  categories: string[];
  chunks: RetrievedChunk[];
  /** "vector" once the library is seeded, "cues" while it isn't. */
  mode: "vector" | "cues";
  /** Prompt-ready text, whichever path produced it. */
  block: string;
}

const CATEGORY_IDS = ["craft", "psychology", "learning", "stoicism", "mindfulness", "emotion"] as const;

const ROUTER_PROMPT = `You route a question to the right shelf of a reference library. You output JSON only.

The shelves:
craft - reading people: observation, what wording gives away, cold reading, attention, groups, being wrong well.
psychology - relationships, conflict, decisions, habits, influence, attachment, communication.
learning - acquiring any skill: memory, practice, feedback, scheduling, plateaus.
stoicism - control, acceptance, fear of loss, duty and role, perspective on humiliation.
mindfulness - attention, rumination, forcing versus flowing, meditation practice itself.
emotion - naming feelings, self-criticism, self-worth, people-pleasing, motivation, meaning, flow, performance.

Return exactly: {"categories": ["..."]}

Pick one to three, most relevant first. Most messages need one or two. Picking all three means you have not decided, so only do it when the message genuinely spans all of them.`;

/**
 * Pick shelves before searching them.
 *
 * Searching the whole library at once lets a psychology chunk outrank the
 * craft chunk a question was actually about — same failure mode as an
 * unscoped search anywhere. Category first, vectors second.
 */
async function pickCategories(message: string, memoryContext: string): Promise<string[]> {
  try {
    const { message: reply } = await chatComplete(
      [
        { role: "system", content: ROUTER_PROMPT },
        {
          role: "user",
          content: memoryContext
            ? `What is already known about this person:\n${memoryContext.slice(0, 1200)}\n\nTheir message:\n${message}`
            : message,
        },
      ],
      { temperature: 0, model: "google/gemini-3.1-flash-lite" }
    );

    const raw = (reply.content ?? "").trim();
    const start = raw.indexOf("{");
    const end = raw.lastIndexOf("}");
    if (start === -1) return [...CATEGORY_IDS];

    const parsed = JSON.parse(raw.slice(start, end + 1));
    const picked = Array.isArray(parsed?.categories)
      ? parsed.categories.filter((c: string) => (CATEGORY_IDS as readonly string[]).includes(c))
      : [];

    return picked.length ? picked : [...CATEGORY_IDS];
  } catch {
    // A router failure must widen the search, never narrow it to nothing.
    return [...CATEGORY_IDS];
  }
}

function formatChunks(chunks: RetrievedChunk[]): string {
  return chunks
    .map(
      (c) =>
        `${c.source_title} — ${c.chapter_title}${c.evidence_grade ? ` [evidence grade ${c.evidence_grade}]` : ""}${c.craft_only ? " [STAGE CRAFT — not a real ability]" : ""}\n${c.content}`
    )
    .join("\n\n");
}

/**
 * Retrieve knowledge for a message.
 *
 * Falls back to the original cue matching over the TS notes whenever the
 * vector library is unavailable — not seeded yet, migration not applied,
 * embedding call failed. The notes stay in the repo precisely so this path
 * is real rather than a stub: the product must not get worse while the
 * library is being built.
 */
export async function routeKnowledge(
  supabase: SupabaseClient | null,
  message: string,
  memoryContext = "",
  depths?: DepthLayer[]
): Promise<RoutedKnowledge> {
  const cueFallback = (): RoutedKnowledge => ({
    categories: [],
    chunks: [],
    mode: "cues",
    block: buildKnowledgeBlock(message),
  });

  if (!supabase) return cueFallback();

  try {
    const categories = await pickCategories(message, memoryContext);
    const embedding = await embedOne(message);

    // The depth parameter only exists after migration_sources_depth.sql. Until
    // it is applied, passing it makes PostgREST fail to resolve the function
    // at all, which would silently drop live search back to keyword matching.
    // So: try the four-arg form, and fall back to the three-arg one on a
    // signature error rather than losing vector retrieval entirely.
    let { data, error } = await supabase.rpc("match_knowledge_chunks", {
      p_embedding: embedding,
      p_categories: categories,
      p_limit: 8,
      // null means every layer — conversation is not paced the way a track is.
      p_depths: depths ?? null,
    });

    if (error) {
      ({ data, error } = await supabase.rpc("match_knowledge_chunks", {
        p_embedding: embedding,
        p_categories: categories,
        p_limit: 8,
      }));
    }

    if (error || !data || data.length === 0) return cueFallback();

    const chunks = data as RetrievedChunk[];
    return { categories, chunks, mode: "vector", block: formatChunks(chunks) };
  } catch {
    return cueFallback();
  }
}
