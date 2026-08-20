import type { KnowledgeEntry } from "./craft";

/**
 * Emotional intelligence, self-regulation, positive psychology, boundaries and
 * self-worth, and performance psychology.
 *
 * Four shelves' worth of material that share a spine: what to do when the
 * problem is your own state rather than another person. Grades are given
 * individually and several are lower than their public reputation — emotional
 * intelligence as a commercial construct and grit in particular.
 */
export const EMOTION: KnowledgeEntry[] = [
  {
    id: "affect-labelling",
    title: "Naming a feeling reduces it",
    cues: ["angry", "upset", "furious", "overwhelmed", "can't calm", "flooded", "emotional", "worked up"],
    core:
      "Putting a feeling into specific words measurably reduces its intensity, and the more precise the word the larger the effect. Frustrated, humiliated and betrayed are three different states that a person in the grip of any of them will call angry. Precision is the active ingredient, not venting.",
    reveals:
      "That most people have about four words for their internal states and are trying to navigate with a four-colour map. The vocabulary gap is a real handicap and it is fixable in weeks.",
    inPractice:
      "Refuse the generic word once, gently. Angry at what, specifically — being overruled, or being overruled in front of people? Those lead to different conversations.",
    limits:
      "Naming reduces intensity; it does not resolve the situation, and mistaking one for the other is how people end up very articulate about a problem they never address. Also the effect is modest — this is a step down from red, not a solution.",
  },
  {
    id: "constructed-emotion",
    title: "Emotions are built, not detected",
    cues: ["feel like", "just feel", "gut says", "intuition", "emotion", "why do i feel", "mood"],
    core:
      "The older view treats emotions as fixed circuits that fire and are read off. The newer view is that the brain constructs an emotion from raw bodily signals plus context plus the concepts you have available. The same racing heart becomes excitement, dread or attraction depending on what frame is applied — and the frame is partly learnable.",
    reveals:
      "Why the same physiological state gets read completely differently by two people, and why someone who has been told all their life that they are anxious will construct anxiety out of ambiguous signals.",
    inPractice:
      "When someone reports a feeling as a fact about the world, separate the sensation from the interpretation. What is the body doing, and what did you conclude it meant? Often the conclusion is the part that is wrong.",
    limits:
      "This is contested. It is a serious research programme, not settled consensus, and the classical view has capable defenders. It also gets misused as you choose your feelings, which is not the claim and is a cruel thing to tell someone in distress.",
  },
  {
    id: "eq-honest",
    title: "Emotional intelligence, minus the marketing",
    cues: ["emotional intelligence", "eq", "empathy", "people skills", "soft skills", "self aware"],
    core:
      "The popular construct bundles several separate things — perceiving emotion, using it, understanding it, regulating it — into one number sold with large claims about life success. Ability-based measures do predict some outcomes modestly. The self-report questionnaires that most workplace training uses correlate heavily with existing personality traits and add little beyond them.",
    reveals:
      "Why so much EQ training changes nothing. It measured personality, told people their score, and called it development.",
    inPractice:
      "Drop the composite and work on one component. Emotional vocabulary is trainable. Reading a specific person accurately is trainable with feedback. A global EQ score is not a thing to improve.",
    limits:
      "The claim that EQ outweighs IQ for success is not supported at the strength it is repeated. Treat the construct as a useful grouping of skills, not as a measurable quantity you possess.",
  },
  {
    id: "self-compassion",
    title: "Self-compassion outperforms self-criticism, which is annoying",
    cues: ["hard on myself", "beat myself up", "failure", "not good enough", "ashamed", "self esteem", "discipline"],
    core:
      "Harsh self-criticism feels like the responsible option and predicts worse outcomes: more avoidance, more giving up, less honest error analysis. Treating yourself as you would treat a competent friend who made the same mistake produces more accurate assessment and more follow-through. This inverts most people's intuition, which is why it needs saying plainly.",
    reveals:
      "That severity toward yourself is often a way of not looking at the mistake. Ten minutes of self-attack feels worse and costs less than fifteen minutes of examining what actually went wrong.",
    inPractice:
      "Ask what they would say to a colleague in the identical position. Almost nobody produces the sentence they just used on themselves, and the gap is the point.",
    limits:
      "Not a licence to skip accountability, and the research does not support that reading — self-compassion correlates with taking MORE responsibility, not less. But it is also not a substitute for changing a situation that genuinely warrants distress.",
  },
  {
    id: "grit-honest",
    title: "Perseverance, and how oversold it got",
    cues: ["give up", "quit", "persist", "grit", "discipline", "stick with it", "motivation gone"],
    core:
      "The popular claim is that sustained passion and perseverance predict success better than talent. Meta-analysis has not been kind to it: grit predicts performance weakly, is largely redundant with conscientiousness, and the perseverance half does nearly all the work while the passion half does almost none.",
    reveals:
      "That advice to be grittier is close to advice to be more conscientious, which is not actionable. What IS actionable is the environment: whether the practice is scheduled, whether feedback is fast, whether quitting is easy.",
    inPractice:
      "Stop treating persistence as a character trait to summon and treat it as a design problem. Someone who cannot maintain a habit does not need more grit; they usually need a smaller commitment attached to an existing routine.",
    limits:
      "There is a second, worse problem: sometimes quitting is correct. A framework that treats all persistence as virtue gives people no way to tell a worthwhile hard thing from a sunk cost.",
  },
  {
    id: "boundaries-worth",
    title: "Where self-worth is being outsourced",
    cues: ["approval", "validation", "people pleasing", "need them to", "worth", "rejection", "disappoint"],
    core:
      "Persistent people-pleasing is usually not kindness. It is a bet that worth is granted by others and must be continuously re-earned, which makes every refusal a threat to identity rather than a normal transaction. That is why saying no feels disproportionate to the stakes.",
    reveals:
      "Why someone can state a boundary intellectually and be physically unable to deliver it. The obstacle is not skill, it is what they believe the refusal costs.",
    inPractice:
      "Ask what they think happens if the person is disappointed. Then ask what actually happened the last time someone was disappointed in them. The gap between the two is the material.",
    limits:
      "For some people, accommodation is not a psychological pattern but an accurate read on a real power imbalance — a precarious job, an unsafe household. Treating a survival strategy as low self-worth blames someone for their circumstances.",
  },
  {
    id: "flow-conditions",
    title: "The conditions flow actually needs",
    cues: ["flow", "in the zone", "focus", "distracted", "deep work", "concentration", "performance"],
    core:
      "Flow is not summoned by wanting it. It appears under specific conditions: a clear goal, immediate feedback, and difficulty matched closely to current skill. Too easy produces boredom, too hard produces anxiety, and the band between them is narrower than people assume — which is why it arrives in games and rarely at work.",
    reveals:
      "Which condition is missing. Most work fails on feedback, which arrives weeks later if at all, and that alone is enough to prevent flow no matter how much someone wants to concentrate.",
    inPractice:
      "Engineer the missing condition rather than the state. Shorten the feedback loop, or adjust the difficulty deliberately. Flow is a symptom of the conditions, not a thing to chase.",
    limits:
      "Much of the original work is self-report and the construct resists clean measurement. It is also not the only good state — plenty of valuable work is done in ordinary grinding attention, and treating flow as the target makes that feel like failure.",
  },
  {
    id: "meaning-perma",
    title: "Meaning is built from parts, and pleasure is only one",
    cues: ["pointless", "empty", "unfulfilled", "purpose", "meaning", "happiness", "lost", "burnt out"],
    core:
      "Wellbeing is usually treated as one dial labelled happiness. A more useful breakdown separates positive emotion, engagement, relationships, meaning and accomplishment. They are distinct, they trade off, and someone can be high on several while feeling empty because one is at zero. Naming which one is missing is more actionable than trying to be happier.",
    reveals:
      "That the person describing emptiness while doing well often has accomplishment and engagement and no relationships or no meaning. Chasing more of what they already have is the natural move and it does nothing.",
    inPractice:
      "Run the five. Which one, honestly, is at zero right now? The answer is usually immediate and usually not the one they came in talking about.",
    limits:
      "The model is a useful taxonomy rather than a validated causal structure, and the field around it has real replication problems — several signature positive-psychology interventions have not held up. Use it to locate the gap, not as evidence that any particular exercise will fill it.",
  },
];
