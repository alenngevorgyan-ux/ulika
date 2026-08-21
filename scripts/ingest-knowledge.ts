/**
 * Migrate the TS knowledge notes into Supabase with embeddings.
 *
 * Chunking is SEMANTIC, not mechanical. Each note already has four distinct
 * parts that are separate complete thoughts — the mechanism, what it lets you
 * see, how it is used, and where it fails — so those become the chunk
 * boundaries. Splitting on paragraphs would cut the failure mode away from the
 * claim it qualifies, which is the one split that must never happen here.
 *
 * Run:  npx tsx scripts/ingest-knowledge.ts [--dry-run]
 * Needs OPENROUTER_API_KEY and SUPABASE_SERVICE_ROLE_KEY_ULIKA in env.
 */
import "./_load-env";
import { createClient } from "@supabase/supabase-js";
import { assertEnv } from "./_env-guard";
import { CRAFT, type KnowledgeEntry } from "../src/lib/knowledge/craft";
import { PSYCHOLOGY } from "../src/lib/knowledge/psychology";
import { LEARNING } from "../src/lib/knowledge/learning";
import { STOICISM } from "../src/lib/knowledge/stoicism";
import { MINDFULNESS } from "../src/lib/knowledge/mindfulness";
import { EMOTION } from "../src/lib/knowledge/emotion";
import { GRADING } from "../src/lib/content/grading";
import { embed } from "../src/lib/knowledge/embed";

const DRY = process.argv.includes("--dry-run");

const CATEGORIES = [
  {
    id: "craft",
    name: "The mentalist's craft",
    description: "Reading people, cold reading, observation, attention and misdirection.",
    sort_order: 1,
    entries: CRAFT,
  },
  {
    id: "psychology",
    name: "Psychology",
    description: "Frameworks for relationships, decisions, motivation and conflict.",
    sort_order: 2,
    entries: PSYCHOLOGY,
  },
  {
    id: "learning",
    name: "The meta-skill of learning",
    description: "How any skill is actually acquired: memory, practice, feedback.",
    sort_order: 3,
    entries: LEARNING,
  },
  {
    id: "stoicism",
    name: "Stoicism and ancient philosophy",
    description: "Control, acceptance, duty, and perspective on what cannot be changed.",
    sort_order: 4,
    entries: STOICISM,
  },
  {
    id: "mindfulness",
    name: "Attention and mindfulness",
    description: "Rumination, forcing versus flowing, and what meditation research actually shows.",
    sort_order: 5,
    entries: MINDFULNESS,
  },
  {
    id: "emotion",
    name: "Emotion, self-worth and performance",
    description: "Naming feelings, self-criticism, boundaries, motivation, meaning and flow.",
    sort_order: 6,
    entries: EMOTION,
  },
];

/**
 * The four parts of a note, as separate retrievable thoughts, each carrying its
 * depth layer.
 *
 * Depth is assigned HERE rather than by a migration UPDATE. It was originally a
 * one-off UPDATE keyed on chapter_title, which worked exactly once: this script
 * deletes and reinserts chunks on every run, so the next ingest silently reset
 * all 184 rows to the column default and quietly disabled the whole depth
 * feature. Anything derived from chunk content has to be produced by the thing
 * that writes the chunks.
 *
 *   mechanism + how to use it -> core       (the idea and one practice)
 *   what it reveals           -> deepening  (context, what it surfaces)
 *   where it fails            -> mastery    (edge cases, misapplication)
 */
function chunksFor(entry: KnowledgeEntry) {
  return [
    {
      chapter_title: "Mechanism",
      content: entry.core,
      depth: "core" as const,
      short_definition: `How ${entry.title.toLowerCase()} works.`,
    },
    {
      chapter_title: "Using it",
      content: entry.inPractice,
      depth: "core" as const,
      short_definition: `How to actually apply ${entry.title.toLowerCase()} in a real conversation.`,
    },
    {
      chapter_title: "What it lets you see",
      content: entry.reveals,
      depth: "deepening" as const,
      short_definition: `What ${entry.title.toLowerCase()} makes visible that is otherwise missed.`,
    },
    {
      chapter_title: "Where it fails",
      content: entry.limits,
      depth: "mastery" as const,
      // This chunk exists so the limits can be retrieved INDEPENDENTLY of the
      // claim. A model that finds the mechanism must be able to find the
      // caveat too, or the library becomes a confident-sounding liability.
      short_definition: `Limits and failure modes of ${entry.title.toLowerCase()}.`,
    },
  ];
}

async function main() {
  // Refuses before a single request: wrong project, wrong environment label, or
  // a service-role key exposed under a NEXT_PUBLIC_ name. Skipped for --dry-run
  // because that path writes nothing and must stay usable with no config.
  if (!DRY) assertEnv("write");

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY_ULIKA;

  if (!DRY && (!url || !serviceKey)) {
    console.error(
      "Need NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY_ULIKA.\n" +
        "The service role key is required because knowledge_* tables are read-only\n" +
        "to anon and authenticated by design. Run with --dry-run to preview."
    );
    process.exit(1);
  }

  const supabase = DRY ? null : createClient(url!, serviceKey!, { auth: { persistSession: false } });

  let totalChunks = 0;

  for (const cat of CATEGORIES) {
    if (supabase) {
      const { error } = await supabase.from("knowledge_categories").upsert({
        id: cat.id,
        name: cat.name,
        description: cat.description,
        sort_order: cat.sort_order,
      });
      if (error) throw new Error(`category ${cat.id}: ${error.message}`);
    }

    for (const entry of cat.entries) {
      const grade = GRADING[entry.id]?.evidence ?? null;

      if (supabase) {
        const { error } = await supabase.from("knowledge_sources").upsert({
          id: entry.id,
          category_id: cat.id,
          title: entry.title,
          type: cat.id === "craft" ? "craft" : "method",
          evidence_grade: grade,
        });
        if (error) throw new Error(`source ${entry.id}: ${error.message}`);

        // Replace rather than accumulate: re-running must not duplicate chunks.
        await supabase.from("knowledge_chunks").delete().eq("source_id", entry.id);
      }

      const parts = chunksFor(entry);

      // Embedding text leads with WHEN THIS APPLIES, not with the mechanism.
      //
      // First attempt embedded "Title — Chapter. Content", which is
      // explanatory prose, while real queries are situational sentences. That
      // mismatch produced weak discrimination (similarities clustered at
      // 0.29-0.38) and one outright collision: "my coworker was weirdly cold"
      // retrieved Cold reading and the Barnum effect, matching the term of art
      // rather than the meaning. Front-loading the situation cues puts the
      // vector in the same register as the question being asked.
      const vectors = DRY
        ? parts.map(() => [])
        : await embed(
            parts.map(
              (p) =>
                `Applies when: ${entry.cues.join(", ")}. ${p.short_definition} ${entry.title} — ${p.chapter_title}: ${p.content}`
            )
          );

      if (supabase) {
        const rows = parts.map((p, i) => ({
          source_id: entry.id,
          chapter_title: p.chapter_title,
          content: p.content,
          short_definition: p.short_definition,
          applicable_situations: entry.cues,
          depth: p.depth,
          embedding: vectors[i],
        }));
        const { error } = await supabase.from("knowledge_chunks").insert(rows);
        if (error) throw new Error(`chunks ${entry.id}: ${error.message}`);
      }

      totalChunks += parts.length;
      console.log(`  ${entry.id} — ${parts.length} chunks${grade ? ` (grade ${grade})` : ""}`);
    }
    console.log(`${cat.name}: ${cat.entries.length} sources`);
  }

  console.log(`\n${DRY ? "[dry run] would write" : "wrote"} ${totalChunks} chunks`);

  if (supabase) {
    // Built after seeding: an IVFFlat index over an empty table produces
    // useless lists.
    const { error } = await supabase.rpc("exec_sql", {
      sql: "create index if not exists knowledge_chunks_embedding_idx on public.knowledge_chunks using ivfflat (embedding vector_cosine_ops) with (lists = 10)",
    });
    if (error) {
      console.log(
        "\nNote: could not create the IVFFlat index automatically. At this size " +
          "an exact scan is fine, so this is not urgent. SQL is in the migration file."
      );
    }
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
