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

  // ---- stoicism (mostly C: a philosophical tradition, not a research
  // programme; where a move sits inside a tested therapy it is graded higher)
  "premeditatio": { difficulty: 4, duration: 4, evidence: "C",
    basis: "Ancient practice. The same move appears inside grade-A exposure and decatastrophising work, but has not been isolated and tested on its own." },
  "view-from-above": { difficulty: 2, duration: 3, evidence: "C",
    basis: "Philosophical device. Self-distancing has some supporting experimental work on rumination, though not under this name or this form." },
  "amor-fati": { difficulty: 5, duration: 7, evidence: "C",
    basis: "Philosophy. The popular love your fate rendering is a real distortion of the original and is noted as such." },
  "role-ethics": { difficulty: 5, duration: 6, evidence: "C",
    basis: "Epictetus. No research base; included because it separates two questions people habitually merge." },
  "voluntary-discomfort": { difficulty: 4, duration: 5, evidence: "C",
    basis: "Defensible as psychological calibration. The physiological claims attached to it by modern cold and fasting cultures are not supported at the strength claimed." },

  // ---- mindfulness
  "noting": { difficulty: 4, duration: 6, evidence: "B",
    basis: "Attention-labelling has reasonable support inside structured programmes. Adverse effects for some trauma histories are real and underreported." },
  "wu-wei": { difficulty: 6, duration: 8, evidence: "D",
    basis: "Taoist philosophy, no research base, and the most-abused idea on the shelf — it is a favourite justification for avoidance." },
  "beginners-mind": { difficulty: 3, duration: 4, evidence: "C",
    basis: "Zen framing of a real effect: expertise trades observation for pattern-matching and fails when the pattern is wrong." },
  "mbsr-structure": { difficulty: 6, duration: 8, evidence: "B",
    basis: "Structured eight-week programmes have decent trial evidence for stress and depression relapse. Much of the literature is unblinded with waitlist controls, and effects shrink as trial quality rises." },

  // ---- emotion, self-worth, performance
  "affect-labelling": { difficulty: 2, duration: 3, evidence: "A",
    basis: "Well replicated across behavioural and imaging work. Effect is modest but real, and precision of the label drives it." },
  "constructed-emotion": { difficulty: 7, duration: 7, evidence: "B",
    basis: "A serious research programme, not settled consensus. The classical view has capable defenders, and this gets misused as you choose your feelings." },
  "eq-honest": { difficulty: 3, duration: 5, evidence: "C",
    basis: "Ability measures predict modestly; the self-report questionnaires used in most workplace training add little beyond existing personality traits." },
  "self-compassion": { difficulty: 5, duration: 6, evidence: "B",
    basis: "Consistent findings that it correlates with more accountability, not less — which inverts most people's intuition." },
  "grit-honest": { difficulty: 3, duration: 4, evidence: "C",
    basis: "Meta-analysis has not been kind: weak prediction, largely redundant with conscientiousness, and the passion half does almost nothing." },
  "boundaries-worth": { difficulty: 6, duration: 8, evidence: "C",
    basis: "Clinically familiar pattern, thin isolated evidence. Important caveat: sometimes accommodation is an accurate read on a real power imbalance, not low self-worth." },
  "flow-conditions": { difficulty: 5, duration: 5, evidence: "B",
    basis: "The conditions are well described; the construct resists clean measurement and much of the original work is self-report." },
  "meaning-perma": { difficulty: 4, duration: 7, evidence: "C",
    basis: "A useful taxonomy rather than a validated causal structure. Several signature positive-psychology interventions have failed to replicate." },

  // ---- knowledge-library ids
  //
  // These are the RAG library's entry ids, which are NOT the catalog slugs
  // above. They were missing, so every retrieved chunk came back ungraded and
  // buildMaterialRules fell through to its "D" default — meaning the model was
  // told the best available material was grade D on every conversation.
  // Silent, and exactly backwards.
  "baseline-deviation": { difficulty: 4, duration: 5, evidence: "B",
    basis: "Deviation-from-baseline is the defensible core of behavioural reading. What it cannot do is identify the CAUSE of the arousal, which is where the field overclaims." },
  "cold-reading": { difficulty: 6, duration: 5, evidence: "B",
    basis: "The Barnum/Forer effect is well replicated. The performance craft built on it is grade D, and the two are routinely quoted as if they were one thing." },
  "statement-analysis": { difficulty: 6, duration: 6, evidence: "C",
    basis: "Linguistic markers of discomfort are real but weak and heavily confounded by culture and first language. Commercial deception-detection products built on this do not survive testing." },
  "what-is-missing": { difficulty: 3, duration: 3, evidence: "C",
    basis: "Practitioner heuristic rather than a research finding. Reliable as a question generator, worthless as a conclusion." },
  "suggestion-priming": { difficulty: 5, duration: 5, evidence: "C",
    basis: "Framing and option-order effects are solid; the wider social-priming literature is one of the worst casualties of the replication crisis." },
  "misdirection": { difficulty: 4, duration: 4, evidence: "A",
    basis: "Inattentional and change blindness are among the most robustly replicated findings in perception." },
  "the-out": { difficulty: 4, duration: 3, evidence: "D",
    basis: "Performer's craft with no research base, but it encodes something true: confidence and accuracy are separate variables." },
  "rapport": { difficulty: 3, duration: 4, evidence: "C",
    basis: "The honest version — attention produces rapport — has support. The mirroring-as-technique version sold in sales training does not hold up well." },
  "hot-reading": { difficulty: 2, duration: 1, evidence: "D",
    basis: "Not a skill, a description of a deception. Included so it can be recognised when done to you." },
  "reading-a-room": { difficulty: 5, duration: 5, evidence: "C",
    basis: "Grounded in real group-dynamics observation, but deference and interruption norms vary enough by culture to mislead badly." },
  "kahneman-systems": { difficulty: 5, duration: 5, evidence: "B",
    basis: "Anchoring and loss aversion replicate well; several famous priming results in the same book do not, and Kahneman said so publicly." },
  "gottman-horsemen": { difficulty: 4, duration: 5, evidence: "B",
    basis: "The four patterns are clinically useful descriptions. The famous prediction-accuracy figures come from models fitted and tested in ways that inflate them." },
  "attachment": { difficulty: 5, duration: 7, evidence: "B",
    basis: "Substantial research base. Frequently misused as a fixed personality label and as a diagnosis handed to a partner, neither of which the evidence supports." },
  "nvc": { difficulty: 5, duration: 5, evidence: "C",
    basis: "Widely used, thinly tested as a whole system. Separating observation from evaluation is the part with independent support." },
  "cbt-distortions": { difficulty: 4, duration: 5, evidence: "A",
    basis: "Cognitive restructuring is among the best-evidenced psychological interventions there is." },
  "motivational-interviewing": { difficulty: 7, duration: 6, evidence: "A",
    basis: "Strong meta-analytic support. It is a clinical method requiring training; the summary version can become manipulation wearing neutrality." },
  "transactional-analysis": { difficulty: 4, duration: 4, evidence: "D",
    basis: "Dated vocabulary and little empirical support. Kept as a lens for the shape of an exchange, not as a model of personality." },
  "self-determination": { difficulty: 4, duration: 6, evidence: "A",
    basis: "Autonomy, competence and relatedness are among the best-supported motivational constructs, across decades and cultures." },
  "growth-mindset": { difficulty: 3, duration: 6, evidence: "C",
    basis: "Real-world intervention effects are far smaller than the popular version promises and large replication attempts have been underwhelming." },
  "boundaries": { difficulty: 5, duration: 7, evidence: "C",
    basis: "Clinically standard, thinly evidenced in isolation. Requires the ability to follow through, which is not equally available to everyone." },
  "fundamental-attribution": { difficulty: 3, duration: 4, evidence: "B",
    basis: "Robust in the classic form, though its size and universality are more contested than textbooks suggest." },
  "stoic-control": { difficulty: 3, duration: 7, evidence: "C",
    basis: "Ancient philosophy. The same move sits inside grade-A acceptance-based therapies, but not in this form and not tested alone." },
  "forgetting-curve": { difficulty: 2, duration: 3, evidence: "A",
    basis: "The shape is one of the oldest replicated findings in psychology. The original numbers came from nonsense syllables and a single subject, so they do not transfer." },
  "spacing-testing": { difficulty: 3, duration: 4, evidence: "A",
    basis: "Spacing and retrieval practice are the two strongest findings in the entire learning literature, replicated across ages, materials and settings." },
  "declarative-procedural": { difficulty: 4, duration: 5, evidence: "A",
    basis: "Well established in memory research, including from dissociations observed in amnesia." },
  "deliberate-practice": { difficulty: 7, duration: 8, evidence: "B",
    basis: "Real, and much smaller than the 10,000-hours story claims. Meta-analysis puts its share of performance variance well below the popular figure, varying enormously by domain." },
  "twenty-hours": { difficulty: 2, duration: 2, evidence: "D",
    basis: "Practitioner observation, not a measured constant. The round number is memorable rather than derived." },
  "interleaving": { difficulty: 4, duration: 5, evidence: "A",
    basis: "Consistently beats blocked practice for retention, and consistently feels worse while doing it — which is why almost nobody chooses it." },
  "learning-styles-myth": { difficulty: 1, duration: 1, evidence: "A",
    basis: "One of the clearest negative results in education research: matching instruction to a preferred modality does not improve outcomes." },
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
