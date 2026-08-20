import { createClient } from "@supabase/supabase-js";
import { routeKnowledge } from "../src/lib/knowledge/router";
import { retrieveKnowledge } from "../src/lib/knowledge/retrieve";

const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!);

const QUERIES = [
  "she shuts down completely whenever we argue and I end up chasing her",
  "how long before I stop being terrible at drawing",
  "he keeps saying we already agreed when we absolutely did not",
  "I read every book about guitar and still can't play anything",
  "my coworker was weirdly cold in the meeting today",
];

(async () => {
  for (const q of QUERIES) {
    const cues = retrieveKnowledge(q, 3).map(e => e.title);
    const routed = await routeKnowledge(sb, q);
    const top = routed.chunks.slice(0, 3).map(c => `${c.source_title} (${c.chapter_title}, ${c.similarity.toFixed(2)})`);
    console.log(`\nQ: ${q}`);
    console.log(`  OLD cues   : ${cues.length ? cues.join(" | ") : "(nothing matched)"}`);
    console.log(`  NEW ${routed.mode.padEnd(6)} : ${top.join(" | ")}`);
    console.log(`  shelves    : ${routed.categories.join(", ")}`);
  }
})();
