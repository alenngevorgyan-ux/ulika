import type { Lesson } from "../lessonTypes";

/**
 * Reference implementation of the interactive lesson format.
 *
 * Note the shape: the learner builds THEIR OWN palace inside the lesson
 * (input blocks), then is tested on it from memory (recall blocks). We never
 * just describe the technique and wish them luck.
 */
export const MEMORY_PALACE_LESSON: Lesson = {
  slug: "memory-palace",
  trainingSlug: "memory-palace",
  title: "The Memory Palace",
  subtitle: "Store anything inside a building you already know by heart",
  estimatedMinutes: 25,
  blocks: [
    {
      kind: "concept",
      title: "You already have perfect memory. Just not for the right things.",
      body: [
        "Try this. Picture your front door. Now walk in. What's on your left? Keep going. Where does the light come from in the afternoon?",
        "You just retrieved dozens of details you never once sat down to memorize. Nobody quizzed you on your hallway. You simply walked through it enough times and your brain kept the whole thing, for free.",
        "Now try to recall a shopping list from last Tuesday. Nothing. Same brain, same day, and it dropped it in minutes.",
        "That gap is the entire technique. Your memory for places is enormous and effortless. Your memory for abstract lists is small and expensive. So you stop storing lists as lists, and start storing them as things sitting in a place.",
      ],
      illustration: {
        src: "/lessons/memory-palace/hallway.png",
        alt: "A simple floor plan of an apartment hallway with numbered stopping points",
        caption: "A route you know without trying is a route you can store things in.",
      },
    },
    {
      kind: "concept",
      title: "Why it works, in one paragraph",
      body: [
        "Spatial memory runs on old, deep hardware. It was load-bearing for survival long before anyone had a grocery list, so it got built sturdy and automatic.",
        "Abstract verbal memory is newer and weaker. When you convert a word into a vivid object sitting in a specific corner of a room you know, you are moving that information off the weak system and onto the strong one.",
        "That's it. No mysticism, no untapped ninety percent of the brain. You are just filing things where the good cabinet is.",
      ],
    },
    {
      kind: "demo",
      title: "Watch one get built",
      body: [
        "Say I need to remember: milk, keys, umbrella, batteries, stamps.",
        "My route is my own kitchen. Five stops I could walk blindfolded. Here's what I put at each one.",
        "Read it slowly. Actually see each one before moving to the next line.",
      ],
      example: [
        { at: "Kitchen door", image: "A river of milk pours through the doorway and soaks my socks" },
        { at: "Kettle", image: "The kettle is stuffed with keys, rattling and screaming as it boils" },
        { at: "Fridge", image: "An umbrella has burst open inside the fridge, holding the door wide" },
        { at: "Sink", image: "Batteries fizz and spark in a sink full of water" },
        { at: "Window sill", image: "Thousands of stamps flutter in through the window like moths" },
      ],
      illustration: {
        src: "/lessons/memory-palace/kitchen-route.png",
        alt: "Kitchen floor plan with five numbered stops: door, kettle, fridge, sink, window sill",
        caption: "Five stops, one fixed order, always walked the same direction.",
      },
    },
    {
      kind: "quiz",
      title: "Check yourself",
      question: "Why is 'milk sits on the counter' a bad image, while 'a river of milk soaks my socks' is a good one?",
      options: [
        "The second one is longer, and longer images are easier to store",
        "The second one has motion, exaggeration and physical sensation, so it registers as an event rather than a fact",
        "The first one is wrong because milk doesn't belong on a counter",
        "There's no real difference, both work equally well",
      ],
      correctIndex: 1,
      explanation:
        "Ordinary is invisible. Your brain files 'milk on a counter' under 'kitchen, normal, ignore.' Something absurd, moving, and physically felt refuses to be filed as background. Weird is not a stylistic choice here, it's the mechanism.",
    },
    {
      kind: "guided",
      title: "Build your route. Eyes closed, right now.",
      instruction: [
        "Put the phone or laptop down for sixty seconds. This does not work if you skim it.",
        "Close your eyes. Stand at the front door of the place you've lived in longest.",
        "Walk in. Move in one consistent direction, the way you'd actually walk it. Don't teleport around.",
        "Stop at five distinct things you could touch. A specific chair, not 'the living room.'",
      ],
      noticePrompt:
        "Notice how little effort this takes. You're not straining to recall the route, it just unrolls. That effortlessness is the resource you're about to use.",
      reflection: "Name your five stops, in walking order.",
      storeAs: "route",
    },
    {
      kind: "input",
      title: "Lock in your five stops",
      body: [
        "Write them down exactly as you walked them. Order matters more than anything else here, and it must never change between sessions.",
        "Be specific. 'Kitchen' is not a stop. 'The handle of the fridge' is a stop.",
      ],
      fields: [
        { label: "Stop 1", placeholder: "e.g. the coat hook by the door", storeAs: "loci1" },
        { label: "Stop 2", placeholder: "e.g. the third stair", storeAs: "loci2" },
        { label: "Stop 3", placeholder: "e.g. the kitchen tap", storeAs: "loci3" },
        { label: "Stop 4", placeholder: "e.g. the left arm of the sofa", storeAs: "loci4" },
        { label: "Stop 5", placeholder: "e.g. the bathroom mirror", storeAs: "loci5" },
      ],
    },
    {
      kind: "concept",
      title: "The three rules for an image that survives",
      body: [
        "Motion. Something has to be happening. Static objects rot fast; a thing that is falling, bursting, or chasing you does not.",
        "Scale. Wrong size is memorable. A stapler the size of a car. A single grape filling the entire bathtub.",
        "Sensation. Put your body in it. Cold, sticky, deafening, painful. A picture you merely looked at fades. A picture you felt tends not to.",
        "You'll be tempted to make tasteful, sensible images. Don't. Tasteful is forgettable, and nobody else is going to see these.",
      ],
    },
    {
      kind: "input",
      title: "Now store a real list",
      body: [
        "Here are five words. For each one, write the image you're placing at your matching stop.",
        "Don't write the word again. Write what is happening to it, and where.",
        "Words: ANCHOR, CANDLE, TIGER, PIANO, HONEY",
      ],
      fields: [
        { label: "ANCHOR at stop 1", placeholder: "what's happening, and how does it feel", storeAs: "img1" },
        { label: "CANDLE at stop 2", placeholder: "make it move", storeAs: "img2" },
        { label: "TIGER at stop 3", placeholder: "make it loud", storeAs: "img3" },
        { label: "PIANO at stop 4", placeholder: "wrong size", storeAs: "img4" },
        { label: "HONEY at stop 5", placeholder: "make it physical", storeAs: "img5" },
      ],
    },
    {
      kind: "timer",
      title: "Walk it three times",
      instruction: [
        "Eyes closed. Walk your route from stop one to stop five, seeing each image as you arrive.",
        "Then do it again, faster.",
        "Then a third time, fast enough that it feels sloppy.",
        "Three passes is the number where this usually locks. One pass is not enough and you'll believe it worked anyway.",
      ],
      seconds: 90,
      afterword:
        "The third pass usually feels too fast to be doing anything. It's doing the most. Speed forces retrieval instead of re-reading.",
    },
    {
      kind: "recall",
      title: "Now give them back",
      body: [
        "No scrolling up. Write the five words in order, from your palace.",
        "If one is missing, don't force the word — walk to the stop and look at what's there. The image gives you the word, not the other way round.",
      ],
      recallKeys: ["img1", "img2", "img3", "img4", "img5"],
      afterword:
        "If you got four or five, that's normal on a first build, and you did it after roughly ten minutes of practice. If you got two, the images were probably polite. Go back and make them violent, wet, and enormous.",
    },
    {
      kind: "concept",
      title: "The part everyone skips",
      body: [
        "Walk it backwards. Stop five to stop one.",
        "This feels unnecessary and it is the actual test. If you can only go forwards, you memorized a sentence, not a place. Going backwards proves each image is genuinely attached to its own location and can be reached directly.",
        "It also means you can jump straight to item three without replaying one and two, which is what makes this usable under pressure.",
      ],
    },
    {
      kind: "recall",
      title: "Backwards",
      body: ["Five to one. Same five words, reverse order."],
      recallKeys: ["img5", "img4", "img3", "img2", "img1"],
      afterword:
        "Slower than forwards is expected. Impossible backwards means the images are living in a chain, each one pulling the next, rather than nailed to their own spot. Fix: revisit the weak stop and make the image physically interact with that exact object.",
    },
    {
      kind: "quiz",
      title: "Diagnose the failure",
      question:
        "Someone stores a 20-item list, recalls items 1 through 7 perfectly, then blanks completely from 8 onward. What's the most likely cause?",
      options: [
        "Their memory capacity is genuinely 7 items and that's a hard limit",
        "They built the images while fresh and got lazy and generic later in the list",
        "20 items is too many for any memory palace to hold",
        "They walked the route in the wrong direction",
      ],
      correctIndex: 1,
      explanation:
        "Almost always attention decay, not capacity. The first images get real effort; by number twelve people are writing 'a book is there.' The tell is that the failure starts gradually rather than all at once. Fix by building long lists in blocks of five with a short break, not in one run.",
    },
    {
      kind: "concept",
      title: "Making it last past today",
      body: [
        "What you built will be gone in two days if you leave it alone. That's not a flaw, it's how storage works without review.",
        "Walk it once tonight before sleep. Once tomorrow. Once three days from now. After those three passes, spread out, it stops needing you.",
        "This is the single highest-return habit in the whole technique and it costs about forty seconds each time.",
      ],
    },
    {
      kind: "concept",
      title: "Reusing a palace without wrecking it",
      body: [
        "Common fear: if I put a new list in the same route, does the old one get destroyed?",
        "Partly, and that's usually fine. Old images fade on their own once you stop walking them, which frees the stops back up within a few days.",
        "But if you need to hold two lists at once, don't reuse. Build a second route somewhere else. Your childhood home, your commute, a shop you know. Most people can generate four or five usable routes in ten minutes, and route capacity is never the bottleneck.",
        "Keep one dedicated route for things you're actively memorizing and one for things that are permanent. Don't mix them.",
      ],
    },
    {
      kind: "field",
      title: "Take it outside",
      body: [
        "In-app practice is where it clicks. Real use is where it becomes a skill you actually have.",
        "Pick something you genuinely need this week. Talking points for a meeting, a shopping list you refuse to write down, names of people you're about to be introduced to.",
      ],
      assignment:
        "Store one real, useful list in a route today, and deliberately do not write it down anywhere else. Use it from memory when the moment comes.",
      masteryCheck:
        "You've got this when: 10 random items, recalled in order and in reverse, 24 hours later, with no notes — and when you reach for it automatically instead of reaching for your phone.",
    },
    {
      kind: "guided",
      title: "One last thing before you go",
      instruction: [
        "Close your eyes one more time.",
        "Walk your route. Don't try to recall anything. Just look at what's still there.",
      ],
      noticePrompt:
        "Some images will have gone soft already and some will be as loud as when you made them. Notice which ones survived.",
      reflection:
        "Which image is still sharpest, and what did you do differently when you built that one?",
      storeAs: "strongest_image",
    },
    {
      kind: "concept",
      title: "What you actually learned",
      body: [
        "Not a party trick. A storage system with a known failure mode and a known repair.",
        "The images that survived were the ones with motion, wrong scale, or physical sensation. That's your personal evidence, from your own head, not a claim from a book.",
        "Everything else in memory work is a variation on what you just did. Numbers, names, faces, speeches — same machine, different cargo.",
      ],
    },
  ],
};
