import type { Training } from "./types";

/**
 * Catalog entries. These are the SHORT form — what the skill is and what
 * mastery looks like. The actual teaching lives in the interactive lessons
 * under content/lessons (see memoryPalace.ts for the reference format).
 *
 * All copy is written from scratch. The underlying techniques are long-
 * established public knowledge (method of loci, major system, the doomsday
 * algorithm, Kaprekar's routine); none of the wording is taken from a source.
 */
export const TRAININGS: Training[] = [
  {
    slug: "memory-palace",
    title: "The Memory Palace",
    category: "memory",
    track: "memory",
    tagline: "Store anything inside a building you already know by heart",
    description:
      "Your memory for places is enormous and costs you nothing. Your memory for lists is small and expensive. The method of loci moves information from the weak system onto the strong one by turning it into objects sitting in a route you could walk blindfolded.",
    steps: [
      { phase: "LEARN", text: "Fix a route of five to ten places you pass without thinking." },
      { phase: "TRY", text: "Store five words as vivid, moving, physically-felt images." },
      { phase: "TRY", text: "Walk it backwards. Forwards only means you memorized a sentence." },
      { phase: "FIELD TEST", text: "Use it for something real this week and refuse to write it down." },
    ],
    masteryCriterion:
      "Ten random items, in order and in reverse, twenty-four hours later, with no notes.",
  },
  {
    slug: "doomsday-rule",
    title: "Any date, any day of the week",
    category: "math",
    track: "calculation",
    tagline: "Someone gives you their birthday. You give them the weekday.",
    description:
      "Not a trick. The doomsday algorithm anchors every month to a reference day that lands on the same weekday within a given year, so a date becomes two small additions. People will assume you looked it up.",
    steps: [
      { phase: "LEARN", text: "Memorize the anchor dates: 4/4, 6/6, 8/8, 10/10, 12/12 and the odd ones." },
      { phase: "LEARN", text: "Learn to derive a year's anchor day from its last two digits." },
      { phase: "TRY", text: "Five real birthdays on paper, timed, checked against a calendar." },
      { phase: "FIELD TEST", text: "Do it out loud in conversation, then explain it's arithmetic." },
    ],
    masteryCriterion: "Ten random dates across a century, spoken, under eight seconds each.",
  },
  {
    slug: "major-system",
    title: "The number code",
    category: "memory",
    track: "memory",
    tagline: "Turn digits into words, and suddenly numbers are stories",
    description:
      "Bare numbers give the mind nothing to grip. The major system assigns a consonant sound to each digit, so any number becomes pronounceable, then becomes a word, then becomes a picture you can store like anything else.",
    steps: [
      { phase: "LEARN", text: "Learn the ten digit-to-sound pairs." },
      { phase: "LEARN", text: "Pre-build word images for 00 through 99 so you never improvise mid-recall." },
      { phase: "TRY", text: "Encode a phone number into three images and chain them." },
      { phase: "FIELD TEST", text: "Memorize a number you actually use and stop storing it in your phone." },
    ],
    masteryCriterion: "A ten-digit number, both directions, an hour later, no errors.",
  },
  {
    slug: "mental-math-speed",
    title: "Fast mental arithmetic",
    category: "math",
    track: "calculation",
    tagline: "Multiply by eleven, square anything ending in five, take any percentage",
    description:
      "Three shortcuts that cover most of the moments people reach for a phone. Each one is the same underlying move: rewriting a multiplication so that half the terms collapse to zero or to something trivial.",
    steps: [
      { phase: "LEARN", text: "Work each rule on paper until you can see why it holds, not just that it does." },
      { phase: "TRY", text: "Twenty timed problems per rule, aiming under three seconds each." },
      { phase: "FIELD TEST", text: "Split the next restaurant bill out loud, in your head." },
    ],
    masteryCriterion: "Twenty mixed problems, nineteen correct, under five seconds each.",
  },
  {
    slug: "twenty-second-scan",
    title: "The twenty-second scan",
    category: "observation",
    track: "reading-people",
    tagline: "Walk into a room and read it before you sit down",
    description:
      "Most people look at a room without seeing it, because the eye drifts and nothing gets filed. This splits observation into three deliberate passes of seven seconds each: exits and layout, then people and their state, then whatever does not fit. Three passes, because the mind cannot hunt for everything at once but is very good at hunting for one category.",
    steps: [
      { phase: "LEARN", text: "Fix the three passes as a checklist: perimeter, people, anomaly." },
      { phase: "TRY", text: "Run it in a familiar room, then list what you missed." },
      { phase: "FIELD TEST", text: "Scan the room before an actual meeting, before you take a seat." },
    ],
    masteryCriterion:
      "Eight concrete details across all three categories, in an unfamiliar room, in twenty seconds.",
  },
  {
    slug: "names-and-faces",
    title: "Names and faces",
    category: "memory",
    track: "memory",
    tagline: "Get the name the first time and still have it next month",
    description:
      "Names vanish because they are never actually heard. People say the name, and the listener is already composing their own next line. Three moves fix it: use the name immediately, hook it to one specific feature, then use it once more before the conversation ends.",
    steps: [
      { phase: "LEARN", text: "Say the name back in your very next sentence. Ask again if you missed it." },
      { phase: "LEARN", text: "Hook the name to one distinctive feature through an image." },
      { phase: "FIELD TEST", text: "Meet eight to ten people, then greet one by name unprompted an hour later." },
    ],
    masteryCriterion: "Eight of ten names from an event, recalled the next day, unaided.",
  },
  {
    slug: "link-method",
    title: "The chain",
    category: "memory",
    track: "memory",
    tagline: "Twenty random objects, in order, with no route to walk",
    description:
      "Where the palace files images by location, the chain links each image directly to the next through an absurd action, building one continuous story. Faster than a palace for short lists, and more fragile: break one link and everything after it is gone.",
    steps: [
      { phase: "LEARN", text: "Every link is an action, not a proximity. Things must do something to each other." },
      { phase: "TRY", text: "Ten objects, then twenty. Notice exactly where the chain snaps." },
      { phase: "FIELD TEST", text: "Race the chain against a palace on the same list and keep the winner." },
    ],
    masteryCriterion: "Twenty random objects, in order, first attempt, no errors.",
  },
  {
    slug: "trick-1089",
    title: "The 1089 force",
    category: "trick",
    track: "calculation",
    tagline: "You seal the answer in an envelope before they pick a number",
    description:
      "They choose a three-digit number, reverse it, subtract, reverse again, add. The result is 1089 every single time, and you can write it down before they start. Self-working, no sleight of hand, no outs.",
    steps: [
      { phase: "LEARN", text: "Rehearse the exact wording of the instructions until it's automatic." },
      { phase: "TRY", text: "Run it on five numbers yourself on paper." },
      { phase: "FIELD TEST", text: "Perform it, then show them the algebra. Trust beats mystery." },
    ],
    masteryCriterion: "Performed live three times with clean patter and an honest explanation after.",
    proof:
      "Take a three-digit number with digits a, b, c where a exceeds c by at least 2. Reversing and subtracting gives (100a + 10b + c) − (100c + 10b + a) = 99(a − c). Since a − c runs from 2 to 9, the difference is one of 198, 297, 396, 495, 594, 693, 792, 891. Every one of these has a middle digit of 9 and outer digits summing to 9. Now take any such number XYZ with Y = 9 and X + Z = 9, and add its reverse: (100X + 90 + Z) + (100Z + 90 + X) = 101(X + Z) + 180 = 101 × 9 + 180 = 1089. The starting number never enters the final expression, which is why it cannot fail.",
  },
  {
    slug: "trick-kaprekar",
    title: "Kaprekar's constant",
    category: "trick",
    track: "calculation",
    tagline: "Every four-digit number walks itself to 6174",
    description:
      "Arrange the digits descending, then ascending, subtract, repeat. Within seven steps you land on 6174, and then it stays there forever. You can name the destination before they take the first step.",
    steps: [
      { phase: "LEARN", text: "Run it on five numbers by hand to watch the convergence yourself." },
      { phase: "TRY", text: "Walk someone through it out loud, counting the steps together." },
      { phase: "FIELD TEST", text: "Name 6174 up front, then let them prove you right." },
    ],
    masteryCriterion: "Performed with three different people, converging every time, no arithmetic slips.",
    proof:
      "The state space is finite: subtracting the ascending arrangement from the descending one maps any four-digit number (excluding repdigits, which collapse to 0) to another four-digit number, so there are fewer than 10,000 reachable states. Exhaustive traversal of that space, done by hand by D. R. Kaprekar in 1949 and trivially reproducible by program, shows every chain reaches 6174 in at most seven steps. 6174 is the unique fixed point: 7641 − 1467 = 6174, so it reproduces itself. Because the map is deterministic and the space finite, every start must reach a fixed point or a cycle, and the traversal confirms no other cycle exists for four digits.",
  },
  {
    slug: "microexpressions-basics",
    title: "Faces, handled carefully",
    category: "observation",
    track: "reading-people",
    tagline: "Seven expressions worth knowing, and why this is not a lie detector",
    description:
      "Seven emotions show up on faces with recognizable muscular signatures across cultures. Say the caveat first: the research on reading fleeting expressions is contested, accuracy in real conditions is modest, and no face proves deception. What this is actually for is noticing when words and face disagree, so you know where to ask a better question.",
    steps: [
      { phase: "LEARN", text: "Learn one reliable muscular signature for each of the seven." },
      { phase: "TRY", text: "Watch ten minutes of interview footage muted, pausing to name what you see." },
      { phase: "FIELD TEST", text: "Catch one mismatch in real conversation and ask about it, without accusing." },
    ],
    masteryCriterion:
      "Seven of seven identified from unlabeled stills, plus a clear grasp of what this cannot prove.",
  },
];
