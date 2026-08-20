import type { KnowledgeEntry } from "./craft";

/**
 * The meta-skill: how learning actually works, for any skill.
 *
 * Separate from the psychology shelf because it fires on a different trigger —
 * someone saying they want to get good at chess or drawing or a language, not
 * someone describing a problem with a person.
 *
 * Grades follow the same honesty rule as everywhere else. Spacing and testing
 * are genuinely grade A and among the most replicated findings in the field.
 * The 10,000 hours story and learning styles are not, and are marked as such
 * because a learner who believes them will make bad decisions.
 */
export const LEARNING: KnowledgeEntry[] = [
  {
    id: "forgetting-curve",
    title: "Why it's gone by Thursday (Ebbinghaus)",
    cues: ["forget", "forgot", "can't remember", "learn", "learning", "study", "studying", "revision", "memorize", "cram"],
    core:
      "Newly learned material decays fast and unevenly. The steepest loss happens in the first day or two, and without any retrieval a large fraction of what felt solid on Monday is genuinely gone by Wednesday. The curve is not a defect to push through with effort on day one; it is the shape the system has, and the fix is scheduling, not intensity.",
    reveals:
      "Why someone can study hard, feel confident, and be blank a week later, and conclude they are bad at learning. They are not. They front-loaded everything into one session, which is the one strategy the curve punishes hardest.",
    inPractice:
      "Anything worth keeping needs to be pulled back out at increasing gaps. Roughly: same day, next day, three days, a week, a month. Each successful retrieval flattens the curve further, so the effort per review drops fast.",
    limits:
      "The original work used nonsense syllables learned by one person, and real material with real meaning decays more slowly. The shape holds, the precise numbers do not transfer.",
  },
  {
    id: "spacing-testing",
    title: "The two effects worth more than everything else",
    cues: ["how to learn", "study method", "flashcards", "practice", "revise", "exam", "language", "vocabulary", "retain"],
    core:
      "Two findings dominate the whole field. Spacing: the same total study time split across separated sessions produces far more durable learning than one block. Testing: trying to retrieve something, even failing to, strengthens it much more than re-reading it. Together they explain most of the gap between people who study a lot and people who actually keep things.",
    reveals:
      "Why re-reading notes feels productive and mostly is not. Fluency while reading is a feeling of familiarity, and familiarity is not retrieval. The unpleasantness of trying to recall something is the work happening.",
    inPractice:
      "Close the book and write down what you remember before checking. Then space the next attempt further out. This feels worse and works better, which is exactly why people abandon it — comfort during study is negatively correlated with retention.",
    limits:
      "Neither helps if the material was never understood in the first place. Spacing the memorisation of something incoherent just spaces the confusion. Understand first, then space and test.",
  },
  {
    id: "declarative-procedural",
    title: "Two kinds of knowledge that need opposite treatment",
    cues: ["skill", "practice", "chess", "drawing", "guitar", "sport", "coding", "instrument", "swimming", "driving", "technique"],
    core:
      "Declarative knowledge is facts and rules — you can state it, and reading and testing build it. Procedural knowledge is doing — you cannot state it, and it is built only by repeated performance with feedback. Knowing every opening in chess is declarative and will not make you win games. The two live in different systems and respond to different training.",
    reveals:
      "Why someone can consume enormous amounts of instructional material and not improve at all. They have been building declarative knowledge about a procedural skill, which converts at a terrible rate.",
    inPractice:
      "Ask what proportion of their time is spent producing versus consuming. For any procedural skill the answer should be uncomfortable — most of it producing, with feedback attached. Watching a drawing tutorial is not drawing.",
    limits:
      "Some declarative grounding genuinely speeds up procedural learning; pure trial and error is slow and can bake in bad form. The ratio is the issue, not the existence of theory.",
  },
  {
    id: "deliberate-practice",
    title: "Practice at the edge, with feedback attached (Ericsson)",
    cues: ["plateau", "stuck", "not improving", "get better", "improve", "years", "10000 hours", "talent", "expert"],
    core:
      "Repetition alone stops producing improvement once something is comfortable — that is why decades of driving do not make an expert driver. What continues to produce gains is working just past current ability, on a specific weak component, with immediate feedback on whether it went right. Volume without those conditions plateaus, sometimes permanently.",
    reveals:
      "Why the person practising two hours a day is stuck and the person practising twenty focused minutes is moving. The variable is not time, it is whether the time is spent at the edge with correction.",
    inPractice:
      "Find the specific sub-component that is failing and drill that alone rather than repeating the whole performance. Then make feedback fast — a recording, a stronger opponent, an engine, a coach, anything that tells you within seconds rather than weeks.",
    limits:
      "The 10,000 hours version is a distortion of this work, and Ericsson objected to it publicly. Deliberate practice explains a substantial but far from total share of the variation between performers, and the share differs a lot by domain. Starting ability, coaching access and circumstance are real.",
  },
  {
    id: "twenty-hours",
    title: "The first twenty hours (Kaufman)",
    cues: ["quickly", "fast", "beginner", "start learning", "pick up", "basics", "in a week", "in a month", "new hobby"],
    core:
      "Reaching expert level takes years, but reaching not-embarrassing takes surprisingly little. Roughly twenty focused hours gets most people to basic functional competence in most skills, provided those hours are spent on the highest-yield sub-skills rather than spread evenly across everything.",
    reveals:
      "That the gap between nothing and something is small, and the gap between something and excellent is enormous. Most people quit inside the first frustrating stretch, which is also the steepest part of the improvement curve.",
    inPractice:
      "Break the skill down, identify the few sub-skills that produce most of the useful result, remove friction from practising them, and commit to twenty hours before evaluating whether you like it. Judging a skill at hour three is judging the worst part of the curve.",
    limits:
      "This is practitioner observation, not a research finding, and the number is a memorable round figure rather than a measured constant. It varies enormously by skill — twenty hours goes further in ukulele than in classical violin.",
  },
  {
    id: "interleaving",
    title: "Mixing beats blocking",
    cues: ["drill", "repetition", "routine", "training plan", "schedule", "practice session", "curriculum"],
    core:
      "Practising one thing until it is solid, then moving to the next, feels efficient and produces worse long-term results than mixing several related things within a session. Blocked practice creates good performance during the session and poor retention after; interleaving does the reverse.",
    reveals:
      "Another case where the felt sense of progress inverts the actual outcome. Interleaved practice feels messier and produces more errors while you are doing it, which is why almost nobody chooses it voluntarily.",
    inPractice:
      "Within a practice session, rotate between two or three related sub-skills rather than grinding one. In a language, that means mixing listening, production and vocabulary rather than a pure vocabulary hour.",
    limits:
      "It backfires for genuine beginners who have not yet formed a basic representation of any of the components. Block first until something is minimally there, then interleave.",
  },
  {
    id: "learning-styles-myth",
    title: "Learning styles are not a thing",
    cues: ["visual learner", "learning style", "auditory", "kinesthetic", "i learn best by"],
    core:
      "The belief that people learn better when material matches their preferred modality is one of the most tested and most consistently unsupported claims in education research. People have real preferences; matching instruction to those preferences does not improve outcomes. What matters is matching the modality to the MATERIAL — geography wants a map regardless of who is looking at it.",
    reveals:
      "Why someone has built a study system around being a visual learner and is not getting results. The premise was wrong, not their effort.",
    inPractice:
      "Redirect from how do I learn to what does this material need. Then apply spacing and retrieval, which work for everyone.",
    limits:
      "None worth hedging on. This is one of the clearer negative results in the field, though preferences themselves are real and worth respecting for motivation, just not for method.",
  },
];
