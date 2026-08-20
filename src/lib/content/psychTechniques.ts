import type { PsychTechnique } from "./types";

export const PSYCH_TECHNIQUES: PsychTechnique[] = [
  {
    slug: "dichotomy-of-control",
    title: "The dichotomy of control",
    category: "stoicism",
    track: "self-command",
    whenToUse:
      "anxiety or anger is circling something you cannot move — someone else's opinion, the past, an outcome that isn't yours alone",
    steps: [
      "Split the situation onto paper in two columns: within my control, and not.",
      "Everything in the second column is struck from your plan entirely. Not managed. Struck.",
      "From the first column pick one action you can take today, and take that one.",
      "Notice the state change. The situation didn't move. You stopped spending on what wouldn't move.",
    ],
    ethicalBoundary:
      "This is precision about where effort goes, not permission to do nothing. Using it to excuse inaction where you genuinely have leverage is self-deception wearing philosophy.",
  },
  {
    slug: "active-listening",
    title: "Actually listening",
    category: "communication",
    track: "self-command",
    whenToUse:
      "someone needs to be heard more than they need your advice, which is most of the time in a conflict",
    steps: [
      "Let them finish without drafting your reply underneath.",
      "Say the substance back in your own words and let them correct you. Am I right that the part that stung was being cut off in front of the team?",
      "Name the feeling you're hearing, not only the facts.",
      "Only once they've confirmed you got it, ask whether they want input or just wanted it said.",
    ],
    ethicalBoundary:
      "Paraphrasing is for accuracy. Bending someone's words slightly toward the version you prefer while they nod along is a manipulation technique, and a common one.",
  },
  {
    slug: "socratic-questions",
    title: "Socratic questions",
    category: "communication",
    track: "self-command",
    whenToUse:
      "a conclusion is sitting there unexamined, yours or theirs, and arguing with it directly would just harden it",
    steps: [
      "What is this actually based on? Push for specifics, not impressions.",
      "What else would explain the same facts? Force at least one alternative onto the table.",
      "What would have to be true for this to be wrong? This is the strongest of the three, because it tests whether the belief can fail at all.",
      "Don't steer toward your answer. If you already know where the questions end, you're not inquiring, you're prosecuting.",
    ],
    ethicalBoundary:
      "Asking questions you already know the answer to, in a sequence designed to corner someone, is not the Socratic method. It only works if you're genuinely willing to be surprised.",
  },
  {
    slug: "cognitive-reframing",
    title: "Reframing",
    category: "mindset",
    track: "self-command",
    whenToUse:
      "one reading of an event has hardened into the only reading, and it's blocking action",
    steps: [
      "Write the event as bare fact, with no adjectives. No disaster, no failure.",
      "Write your first interpretation next to it, then mark which parts are observed and which are inferred.",
      "Produce two more readings of the same facts, including how a stranger with no context would see it.",
      "Pick the most accurate reading, not the most positive one. Those are different jobs.",
    ],
    ethicalBoundary:
      "Reframing applies to your reaction and your next move. It does not apply to whether harm happened. Talking yourself into believing mistreatment was fine is not reframing, it's damage.",
  },
  {
    slug: "implementation-intentions",
    title: "If this, then that",
    category: "habit",
    track: "self-command",
    whenToUse:
      "a specific, predictable trigger keeps producing the behavior you said you'd stop",
    steps: [
      "Name the trigger precisely. Not I'll stress less, but when an unknown number rings during deep work.",
      "Decide the response in advance, as one sentence pairing the two.",
      "Say it or write it before the trigger occurs. Deciding in the moment is the thing that keeps failing.",
      "Watch the first three firings. If it didn't hold, the trigger was probably described too broadly.",
    ],
    ethicalBoundary:
      "This is for your own behavior. Mapping someone else's triggers in advance to catch them at their weakest point is a different activity with a different name.",
  },
  {
    slug: "cialdini-principles",
    title: "The six levers of influence",
    category: "influence",
    track: "reading-people",
    whenToUse:
      "you want to know why an offer feels more convincing than its facts justify, or you're making an honest case and want it heard",
    steps: [
      "Reciprocity. People return what they were given first. Honest version: give real value up front. Dishonest version: manufacture a sense of debt for nothing.",
      "Commitment. A small yes makes a large yes likelier. Honest: let people start small and genuinely opt out. Dishonest: extract a trivial agreement under false pretenses, then lean on it.",
      "Social proof. We follow what others do. Honest: show real numbers and real reviews. Dishonest: invent them.",
      "Liking. We agree more readily with people we like. Honest: be genuinely decent company. Dishonest: fake shared interests to get inside someone's guard.",
      "Authority. Expertise and status carry weight. Honest: cite real expertise, including its limits. Dishonest: borrow credentials you don't have.",
      "Scarcity. Limited things feel more valuable. Honest: state a real constraint. Dishonest: fabricate a deadline.",
    ],
    ethicalBoundary:
      "These are taught here so you recognize them when they're aimed at you, and so you can use the honest half. Building the dishonest half — fake scarcity, fake proof, borrowed authority — is fraud, and it isn't something this app helps with.",
  },
  {
    slug: "anchoring-negotiation",
    title: "Anchoring",
    category: "influence",
    track: "reading-people",
    whenToUse:
      "any negotiation over a number — salary, price, terms — where the first figure spoken shapes everything after it",
    steps: [
      "Prepare your number with a real basis: market data, comparables, actual constraints.",
      "Say it first where you can. That isn't greed, it's the fact that every later figure gets judged relative to the first one on the table.",
      "If they anchor first, don't counter on reflex. Ask what the number is built from. Making them justify it drains most of its pull.",
      "Keep your real acceptable range in mind throughout. The anchor sets the frame; the facts still decide.",
    ],
    ethicalBoundary:
      "Anchoring with terms you have no intention of honoring isn't a tactic, it's the setup for a lie you'll tell later.",
  },
  {
    slug: "process-over-outcome",
    title: "Process over outcome",
    category: "mindset",
    track: "self-command",
    whenToUse:
      "worry about the result is blocking the work that would actually affect the result",
    steps: [
      "Restate the goal as a repeatable action. Not get more confident, but ten minutes of observation practice daily.",
      "Track the action, not the outcome. A plain did it or didn't checklist.",
      "When a result disappoints, examine what was done or skipped, not whether you're the kind of person who can.",
      "Review outcomes on a two-week cadence, not daily. Process gets checked often, results get judged rarely.",
    ],
    ethicalBoundary:
      "This is not permission to ignore feedback forever. Steady process with no result across many cycles means the process is wrong, and grinding harder is avoidance.",
  },
  {
    slug: "gradual-exposure",
    title: "Small steps toward the thing",
    category: "habit",
    track: "self-command",
    whenToUse:
      "ordinary, non-clinical avoidance — speaking up, a hard conversation, unfamiliar work. This is not a substitute for treatment of a phobia or an anxiety disorder",
    steps: [
      "Write the whole feared task, then break it into five to seven steps from barely uncomfortable to the real thing.",
      "Stay on step one until the discomfort measurably drops. Not until you're bored of waiting.",
      "Move up only when the current step has become routine.",
      "After each step, write what actually happened. It almost never matches the rehearsal, and noticing that is most of the effect.",
    ],
    ethicalBoundary:
      "If the avoidance is tracking a real danger rather than an inflated fear — an abusive relationship, an unsafe workplace — this is not a technique for getting used to it. That's a situation for real help, not training.",
  },
  {
    slug: "five-whys",
    title: "Five whys",
    category: "communication",
    track: "self-command",
    whenToUse:
      "the same problem keeps coming back after being solved, which means what got solved was a symptom",
    steps: [
      "State the problem as a concrete event, not a general complaint.",
      "Ask why it happened and write the first honest answer.",
      "Ask why of that answer, three or four more times, until you reach a cause that stands on its own.",
      "Test it: if this were removed, would the intermediate links and the symptom both disappear? If not, you stopped short.",
    ],
    ethicalBoundary:
      "Aimed at another person without pauses and without your own cards on the table, five whys is an interrogation. Use it on yourself, or jointly, not as a way to put someone on the defensive.",
  },
];
