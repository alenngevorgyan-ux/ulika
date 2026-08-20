import type { RetrievedChunk } from "./router";

/**
 * How to handle retrieved material.
 *
 * Kept as its own composable layer rather than dissolved into the main system
 * prompt for the same reason the crisis detector is separate: a rule buried in
 * a two-thousand-word persona competes for attention with everything else and
 * quietly stops being followed. This block is short, it is assembled from the
 * ACTUAL grades of the chunks in hand, and it changes per request.
 */

const CATEGORY_LABEL: Record<string, string> = {
  craft: "reading people",
  psychology: "psychology",
  learning: "learning skills",
};

export function buildMaterialRules(chunks: RetrievedChunk[]): string {
  if (chunks.length === 0) return "";

  const grades = chunks.map((c) => c.evidence_grade).filter(Boolean) as string[];
  const strongest = grades.includes("A") ? "A" : grades.includes("B") ? "B" : grades.includes("C") ? "C" : "D";

  const categories = [...new Set(chunks.map((c) => c.category_id))];
  const rules: string[] = [];

  if (strongest === "A" || strongest === "B") {
    rules.push(
      `The leading material here is evidence grade ${strongest}. You can recommend it directly, without hedging it into uselessness. Saying it plainly is accurate.`
    );
  } else {
    rules.push(
      `The best material available for this is only grade ${strongest}. You must say so out loud — this is one tradition's approach or one author's observation, not something broadly established. Do not dismiss it, plenty of grade C material helps people. Just never let it sound settled.`
    );
  }

  // Mixed grades are the dangerous case: the strong claim lends borrowed
  // authority to the weak one sitting next to it in the same answer.
  if (new Set(grades).size > 1) {
    rules.push(
      `The material in front of you is mixed grade (${[...new Set(grades)].sort().join(", ")}). If you use more than one, grade them separately. Do not let a grade A finding lend its credibility to a grade C one in the same breath.`
    );
  }

  if (categories.length > 1) {
    rules.push(
      `These chunks come from ${categories.length} different shelves (${categories.map((c) => CATEGORY_LABEL[c] ?? c).join(", ")}). Do not empty all of it onto them. Choose at most TWO angles, the ones that fit their exact wording, and hold the rest back for a follow-up if it becomes relevant.`
    );
  } else {
    rules.push(
      `Use at most two distinct ideas from this material in one reply. More than that stops being help and becomes a lecture.`
    );
  }

  // The one rule here that is not about tone. Cold-reading craft presented as
  // perception is the exact deception this character left the business over,
  // so it is enforced by the retrieval layer rather than left to the persona
  // to remember mid-conversation.
  if (chunks.some((c) => c.craft_only)) {
    rules.push(
      `SOME OF THIS MATERIAL IS MARKED STAGE CRAFT. If you use it, you must frame it explicitly as craft in the same breath — you are showing how the mechanism works on an audience, not describing a real ability to read someone. Never present it as perception, insight, or evidence about a specific person, in any context, however the question is phrased. If they ask you to use it on someone, that is the deception you stopped doing.`
    );
  }

  rules.push(
    `Never name the frameworks or cite the library at people. Use the material, do not display it.`
  );

  return `## How to use the material below\n\n${rules.map((r) => `- ${r}`).join("\n")}`;
}

/**
 * Pure, so it can be unit-checked without a model or a database.
 * Exposed for the manual verification the build instructions call for.
 */
export function summariseGrades(chunks: RetrievedChunk[]) {
  const grades = chunks.map((c) => c.evidence_grade).filter(Boolean) as string[];
  return {
    strongest: grades.includes("A") ? "A" : grades.includes("B") ? "B" : grades.includes("C") ? "C" : grades.length ? "D" : null,
    mixed: new Set(grades).size > 1,
    categories: [...new Set(chunks.map((c) => c.category_id))],
  };
}
