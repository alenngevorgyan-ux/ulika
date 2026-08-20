/**
 * Difficulty, duration and evidence grade for everything in the catalog.
 *
 * Kept as one map rather than scattered across the content files so the whole
 * set can be read and argued with at a glance — these are judgement calls and
 * they should be easy to challenge.
 *
 * DIFFICULTY (1-10): how hard it is to do correctly.
 * DURATION   (1-10): how long until a noticeable result.
 * These are INDEPENDENT. The 1089 trick is trivially easy and instant.
 * The dichotomy of control is easy to understand and takes months to run.
 * Confusing the two is why people quit things that were only ever going to
 * be slow.
 *
 * EVIDENCE GRADE:
 *   A - meta-analyses or a substantial body of RCTs
 *   B - decent individual studies, but not an overwhelming corpus
 *   C - widely respected theory or observation from one tradition, thin
 *       independent replication
 *   D - practitioner craft or entertainment. Not science, and said so.
 *
 * The grades below are deliberately harsher than the popular reputation of
 * several of these. Memory palaces really are grade A. Microexpression reading
 * really is grade C at best. Saying so is the point.
 */

export type EvidenceGrade = "A" | "B" | "C" | "D";

export interface Grading {
  difficulty: number;
  duration: number;
  evidence: EvidenceGrade;
  /** Why this grade — shown when the Mentalist cites it. */
  basis: string;
}

export const GRADING: Record<string, Grading> = {
  // ---- trainings
  "memory-palace": {
    difficulty: 3,
    duration: 3,
    evidence: "A",
    basis: "Method of loci is one of the most replicated findings in memory research, including brain-imaging work on trained memory athletes.",
  },
  "doomsday-rule": {
    difficulty: 6,
    duration: 4,
    evidence: "A",
    basis: "It is arithmetic. It either produces the right weekday or it does not.",
  },
  "major-system": {
    difficulty: 5,
    duration: 6,
    evidence: "A",
    basis: "Mnemonic encoding of digits is well established; the slow part is building the 00-99 image set.",
  },
  "mental-math-speed": {
    difficulty: 4,
    duration: 3,
    evidence: "A",
    basis: "Provable arithmetic identities plus ordinary practice effects.",
  },
  "twenty-second-scan": {
    difficulty: 3,
    duration: 4,
    evidence: "B",
    basis: "Structured observation checklists outperform unstructured looking, but most of the supporting research comes from specific professional settings rather than everyday use.",
  },
  "names-and-faces": {
    difficulty: 3,
    duration: 4,
    evidence: "A",
    basis: "Elaborative encoding and immediate rehearsal of names have strong, repeatedly demonstrated effects.",
  },
  "link-method": {
    difficulty: 2,
    duration: 2,
    evidence: "A",
    basis: "Same well-supported mnemonic mechanism as the palace, with a known fragility on long lists.",
  },
  "trick-1089": {
    difficulty: 1,
    duration: 1,
    evidence: "D",
    basis: "Entertainment. The mathematics is certain; the value is performance, not science.",
  },
  "trick-kaprekar": {
    difficulty: 2,
    duration: 1,
    evidence: "D",
    basis: "Entertainment, resting on a proven convergence result.",
  },
  "microexpressions-basics": {
    difficulty: 7,
    duration: 8,
    evidence: "C",
    basis: "Contested. Real-world accuracy at detecting deception from facial cues is barely above chance in most studies, and commercial training programmes have failed independent evaluation. Useful for noticing mismatch, not for concluding anything.",
  },

  // ---- psychological methods
  "dichotomy-of-control": {
    difficulty: 3,
    duration: 7,
    evidence: "C",
    basis: "Ancient philosophy rather than a research programme, though the same move sits inside grade-A therapies as cognitive defusion and acceptance work.",
  },
  "active-listening": {
    difficulty: 4,
    duration: 4,
    evidence: "B",
    basis: "Reflective listening has solid support in counselling and negotiation research; the popular self-help version is broader than what was tested.",
  },
  "socratic-questions": {
    difficulty: 6,
    duration: 5,
    evidence: "B",
    basis: "A core component of cognitive therapy, which is grade A overall, though this element is rarely isolated and tested alone.",
  },
  "cognitive-reframing": {
    difficulty: 5,
    duration: 6,
    evidence: "A",
    basis: "Cognitive restructuring is among the best-evidenced psychological interventions for anxiety and low mood.",
  },
  "implementation-intentions": {
    difficulty: 2,
    duration: 3,
    evidence: "A",
    basis: "Meta-analysed across hundreds of studies with a consistent, moderate effect on follow-through. One of the highest return-per-effort items here.",
  },
  "cialdini-principles": {
    difficulty: 4,
    duration: 4,
    evidence: "B",
    basis: "The individual principles have real experimental support, though several classic demonstrations replicate more weakly than the book implies.",
  },
  "anchoring-negotiation": {
    difficulty: 3,
    duration: 2,
    evidence: "A",
    basis: "Anchoring is among the most robust findings in judgement research and survives replication well.",
  },
  "process-over-outcome": {
    difficulty: 4,
    duration: 7,
    evidence: "B",
    basis: "Goal-setting and self-monitoring research supports it; the popular framing is stronger than the evidence.",
  },
  "gradual-exposure": {
    difficulty: 6,
    duration: 6,
    evidence: "A",
    basis: "Graded exposure is the best-evidenced treatment component for anxiety. Note the clinical version is delivered by a professional; this is the everyday, non-clinical cousin.",
  },
  "five-whys": {
    difficulty: 2,
    duration: 2,
    evidence: "D",
    basis: "An industrial quality-control heuristic, not a psychological finding. Useful, unstudied as a self-reflection tool.",
  },
};

/** Above this on BOTH axes, warn before someone starts. */
export const HARD_THRESHOLD = { difficulty: 7, duration: 7 };

export function isDemanding(slug: string): boolean {
  const g = GRADING[slug];
  if (!g) return false;
  return g.difficulty >= HARD_THRESHOLD.difficulty && g.duration >= HARD_THRESHOLD.duration;
}

export function describeGrading(slug: string): string {
  const g = GRADING[slug];
  if (!g) return "";
  return `difficulty ${g.difficulty}/10, time to result ${g.duration}/10, evidence grade ${g.evidence} (${g.basis})`;
}
