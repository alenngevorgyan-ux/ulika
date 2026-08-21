/**
 * Ingest the owner's own 50 scenario sketches.
 *
 * One technique = one chunk. Graded INDIVIDUALLY, not as a group, because the
 * fifty are wildly heterogeneous in how well supported they are: a forcing
 * trick that is arithmetic sits next to gaze-direction reading that barely
 * beats chance. Grading the file as a unit would either launder the weak ones
 * under the strong ones' credibility, or bury the certain ones under the weak.
 *
 * Run: npx tsx scripts/ingest-scenarios.ts [--dry-run]
 */
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import { embed } from "../src/lib/knowledge/embed";
import { CANONICAL_SOURCE_PATH, parse } from "./_scenario-source";

const DRY = process.argv.includes("--dry-run");

/**
 * The canonical source lives IN THE REPOSITORY.
 *
 * It used to default to /tmp/ulika_zip/50_scenariev.md — a path /tmp clears on
 * reboot, and which was already gone when this was noticed. The only surviving
 * copies were a ZIP in one Downloads folder and 50 rows in the live database,
 * so a rebuild would have reported success while dropping the fifth of the
 * corpus that the owner actually wrote. Resolved from the repository root so it
 * does not depend on the working directory the script is launched from.
 *
 * Provenance and the invariant: content/sources/ulika-50-scenarios.provenance.md
 */
const SOURCE_FILE = process.argv.find((a) => a.endsWith(".md")) ?? CANONICAL_SOURCE_PATH;

const SOURCE_ID = "ulika-50-scenarios";
const CATEGORY_ID = "applied-scenarios";

type Grade = "A" | "B" | "C" | "D";

/**
 * Per-technique grade and tags.
 *
 * A = mathematically guaranteed. Not "usually works" — cannot fail.
 * B = real experimental support behind the mechanism.
 * C = stage craft. It works on an audience; it is not perception.
 * D = weak or contested even as a signal.
 */
const TECHNIQUE_META: Record<number, { grade: Grade; tags: string[] }> = {
  // A. Observation and baseline
  1: { grade: "B", tags: ["наблюдение", "подготовка_к_разговору", "переговоры"] },
  2: { grade: "B", tags: ["наблюдение", "конфликт", "переговоры"] },
  3: { grade: "B", tags: ["наблюдение", "эмоции", "лицо"] },
  4: { grade: "C", tags: ["наблюдение", "детали", "первое_впечатление"] },
  5: { grade: "C", tags: ["наблюдение", "речь", "допрос"] },
  6: { grade: "B", tags: ["наблюдение", "лицо", "искренность"] },
  7: { grade: "C", tags: ["наблюдение", "речь", "давление"] },
  // The file itself flags this one as weak. Graded to match rather than
  // rounding it up to keep the section tidy.
  8: { grade: "D", tags: ["наблюдение", "спорное", "взгляд"] },
  9: { grade: "B", tags: ["наблюдение", "интонация", "конфликт"] },
  10: { grade: "C", tags: ["наблюдение", "напряжение", "жесты"] },

  // B. Cold reading. Stage craft throughout — except the Barnum effect
  // itself, which is a replicated experimental finding about the AUDIENCE.
  11: { grade: "C", tags: ["холодное_чтение", "сцена", "ремесло"] },
  12: { grade: "B", tags: ["холодное_чтение", "эффект_барнума", "защита_от_манипуляции"] },
  13: { grade: "C", tags: ["холодное_чтение", "сцена", "ремесло"] },
  14: { grade: "C", tags: ["холодное_чтение", "наблюдение", "сцена"] },
  15: { grade: "C", tags: ["холодное_чтение", "сцена", "ремесло"] },
  16: { grade: "C", tags: ["холодное_чтение", "сцена", "ремесло"] },
  17: { grade: "C", tags: ["холодное_чтение", "сцена", "ремесло"] },
  18: { grade: "C", tags: ["холодное_чтение", "сцена", "язык"] },
  19: { grade: "C", tags: ["холодное_чтение", "раппорт", "имя"] },
  20: { grade: "C", tags: ["холодное_чтение", "честность", "доверие"] },

  // C. Number effects. Arithmetic, so certain.
  21: { grade: "A", tags: ["фокус", "математика", "развлечение"] },
  22: { grade: "A", tags: ["фокус", "математика", "форс"] },
  23: { grade: "A", tags: ["устный_счёт", "математика", "быстрый_счёт"] },
  24: { grade: "A", tags: ["устный_счёт", "математика", "дата"] },
  25: { grade: "A", tags: ["фокус", "математика", "предсказание"] },
  26: { grade: "A", tags: ["фокус", "математика", "форс"] },
  27: { grade: "A", tags: ["фокус", "математика", "магический_квадрат"] },
  28: { grade: "A", tags: ["устный_счёт", "математика", "процент"] },

  // D. Misdirection. Inattentional blindness is robust; the specific stage
  // applications of it are craft.
  29: { grade: "B", tags: ["мисдирекция", "внимание", "сцена"] },
  30: { grade: "C", tags: ["мисдирекция", "группа", "сцена"] },
  31: { grade: "C", tags: ["мисдирекция", "юмор", "раппорт"] },
  32: { grade: "B", tags: ["мисдирекция", "внимание", "сцена"] },
  33: { grade: "C", tags: ["мисдирекция", "вопрос", "разговор"] },
  34: { grade: "C", tags: ["мисдирекция", "сцена", "структура"] },
  35: { grade: "C", tags: ["мисдирекция", "внимание", "сцена"] },
  36: { grade: "C", tags: ["мисдирекция", "звук", "внимание"] },

  // E. Suggestion and language. Anchoring and presupposition have solid
  // experimental support; the wider priming literature does not, so priming
  // gets B rather than the A its popular reputation would suggest.
  37: { grade: "B", tags: ["прайминг", "влияние", "подготовка_к_разговору"] },
  38: { grade: "B", tags: ["влияние", "выбор", "переговоры"] },
  39: { grade: "B", tags: ["язык", "вопрос", "влияние"] },
  40: { grade: "A", tags: ["якорение", "переговоры", "цена"] },
  41: { grade: "C", tags: ["раппорт", "зеркалирование", "разговор"] },
  42: { grade: "B", tags: ["пауза", "переговоры", "давление"] },
  43: { grade: "A", tags: ["эмоции", "именование", "конфликт"] },
  44: { grade: "C", tags: ["форс", "сцена", "ремесло"] },

  // F. Group and rapport.
  45: { grade: "B", tags: ["группа", "статистика", "сцена"] },
  46: { grade: "C", tags: ["раппорт", "темп", "группа"] },
  47: { grade: "C", tags: ["раппорт", "поза", "спорное"] },
  // Not a skill — a description of a deception, included so it is recognisable.
  48: { grade: "D", tags: ["горячее_чтение", "обман", "распознавание"] },
  49: { grade: "C", tags: ["группа", "статус", "комната"] },
  50: { grade: "C", tags: ["честность", "доверие", "разоблачение"] },
};

/** Block B is stage craft and must never be presented as perception. */
const COLD_READING_RANGE = { from: 11, to: 20 };


async function main() {
  const md = readFileSync(SOURCE_FILE, "utf8");
  const techniques = parse(md);

  const ungraded = techniques.filter((t) => !TECHNIQUE_META[t.n]);
  if (ungraded.length) {
    console.error(
      `Refusing to ingest: ${ungraded.length} techniques have no grade (${ungraded
        .map((t) => t.n)
        .join(", ")}). Grading individually is the point of this file.`
    );
    process.exit(1);
  }

  console.log(`parsed ${techniques.length} techniques across ${new Set(techniques.map((t) => t.section)).size} sections`);
  const dist: Record<string, number> = {};
  for (const t of techniques) dist[TECHNIQUE_META[t.n].grade] = (dist[TECHNIQUE_META[t.n].grade] ?? 0) + 1;
  console.log("grades:", dist);

  if (DRY) {
    for (const t of techniques.slice(0, 3)) {
      console.log(`\n#${t.n} ${t.title} [${TECHNIQUE_META[t.n].grade}]`);
      console.log(`  mechanism: ${t.mechanism.slice(0, 90)}`);
      console.log(`  tags: ${TECHNIQUE_META[t.n].tags.join(", ")}`);
    }
    return;
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY_ULIKA;
  if (!url || !key) {
    console.error("Need NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY_ULIKA.");
    process.exit(1);
  }
  const supabase = createClient(url, key, { auth: { persistSession: false } });

  await supabase.from("knowledge_categories").upsert({
    id: CATEGORY_ID,
    name: "Прикладные сценарии",
    description:
      "Приёмы наблюдения, чтения и влияния, показанные через сценарии применения. Разнородны по доказательности — грейд у каждого свой.",
    sort_order: 7,
  });

  const { error: srcErr } = await supabase.from("knowledge_sources").upsert({
    id: SOURCE_ID,
    category_id: CATEGORY_ID,
    title: "50 приёмов наблюдения, чтения и влияния — сценарии применения",
    author: "УЛИКА / внутренний автор",
    type: "craft",
    acquisition_method: "user_uploaded",
    licence: "redistributable",
    license_status: "not_applicable",
    licence_note: "Original work by the project owner. No third-party licence involved.",
    // The source carries no single grade on purpose — every chunk has its own.
    evidence_grade: null,
  });
  if (srcErr) throw new Error(`source: ${srcErr.message}`);

  await supabase.from("knowledge_chunks").delete().eq("source_id", SOURCE_ID);

  const rows: Record<string, unknown>[] = [];
  for (let i = 0; i < techniques.length; i += 20) {
    const batch = techniques.slice(i, i + 20);
    const vectors = await embed(
      batch.map((t) => {
        const meta = TECHNIQUE_META[t.n];
        return `Applies when: ${meta.tags.join(", ")}. ${t.mechanism} ${t.title}: ${t.scenario}`;
      })
    );
    batch.forEach((t, j) => {
      const meta = TECHNIQUE_META[t.n];
      const isColdReading = t.n >= COLD_READING_RANGE.from && t.n <= COLD_READING_RANGE.to;
      rows.push({
        source_id: SOURCE_ID,
        chapter_title: `${t.n}. ${t.title}`,
        content: `${t.mechanism}\n\n${t.scenario}`,
        short_definition: t.mechanism,
        applicable_situations: meta.tags,
        // Every one of these is a practice, so they are all core depth. The
        // deepening/mastery split does not apply to a scenario sketch.
        depth: "core",
        embedding: vectors[j],
        // Carried on the chunk so retrieval can enforce the framing rule
        // without a second lookup.
        grade_override: meta.grade,
        craft_only: isColdReading,
      });
    });
    console.log(`embedded ${Math.min(i + 20, techniques.length)}/${techniques.length}`);
  }

  const { error } = await supabase.from("knowledge_chunks").insert(rows);
  if (error) throw new Error(`chunks: ${error.message}`);
  console.log(`\nwrote ${rows.length} chunks`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
