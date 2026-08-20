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
import { createClient } from "@supabase/supabase-js";
import { CRAFT, type KnowledgeEntry } from "../src/lib/knowledge/craft";
import { PSYCHOLOGY } from "../src/lib/knowledge/psychology";
import { LEARNING } from "../src/lib/knowledge/learning";
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
];

/** The four parts of a note, as separate retrievable thoughts. */
function chunksFor(entry: KnowledgeEntry) {
  return [
    {
      chapter_title: "Mechanism",
      content: entry.core,
      short_definition: `How ${entry.title.toLowerCase()} works.`,
    },
    {
      chapter_title: "What it lets you see",
      content: entry.reveals,
      short_definition: `What ${entry.title.toLowerCase()} makes visible that is otherwise missed.`,
    },
    {
      chapter_title: "Using it",
      content: entry.inPractice,
      short_definition: `How to actually apply ${entry.title.toLowerCase()} in a real conversation.`,
    },
    {
      chapter_title: "Where it fails",
      content: entry.limits,
      // This chunk exists so the limits can be retrieved INDEPENDENTLY of the
      // claim. A model that finds the mechanism must be able to find the
      // caveat too, or the library becomes a confident-sounding liability.
      short_definition: `Limits and failure modes of ${entry.title.toLowerCase()}.`,
    },
  ];
}

async function main() {
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

      // Embed the definition together with the content: a query about a
      // situation matches the framing as well as the body text.
      const vectors = DRY
        ? parts.map(() => [])
        : await embed(parts.map((p) => `${entry.title} — ${p.chapter_title}. ${p.content}`));

      if (supabase) {
        const rows = parts.map((p, i) => ({
          source_id: entry.id,
          chapter_title: p.chapter_title,
          content: p.content,
          short_definition: p.short_definition,
          applicable_situations: entry.cues,
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
