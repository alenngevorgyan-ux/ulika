/**
 * THE MENTALIST'S CRAFT.
 *
 * Original summaries of long-established, publicly documented techniques.
 * Nothing here is copied from any book or performer's material — these are
 * written from scratch as working notes, which is also why they carry the
 * limits and failure modes that promotional writing about mentalism leaves out.
 *
 * Retrieval: entries carry `cues`. Only entries whose cues match the current
 * conversation get injected, so the model gets depth on what's relevant rather
 * than a shallow dump of everything.
 */

export interface KnowledgeEntry {
  id: string;
  title: string;
  /** Lowercased trigger words/phrases matched against the conversation. */
  cues: string[];
  /** The mechanism, in our own words. */
  core: string;
  /** What having this lens lets you actually notice. */
  reveals: string;
  /** How it gets used in a real conversation, not on a stage. */
  inPractice: string;
  /** Where it breaks, or where it becomes manipulation. Never omitted. */
  limits: string;
}

export const CRAFT: KnowledgeEntry[] = [
  {
    id: "baseline-deviation",
    title: "Baseline and deviation",
    cues: ["lying", "lie", "body language", "acting weird", "off", "different", "changed", "nervous", "suspicious", "tell"],
    core:
      "There is no universal gesture that means anything. Crossed arms mean cold, or comfortable, or defensive, depending entirely on the person. The only readable signal is change: how this specific person behaves at rest, versus how they behave right now. Everything worth reading is a delta from their own baseline, never a match against a table of meanings.",
    reveals:
      "The moment a topic starts costing someone something. Speech rate drops or spikes, they go formal, they stop using contractions, hands stop moving, eye contact either vanishes or becomes deliberate and locked. It tells you WHERE the load is, not what the load is.",
    inPractice:
      "Spend the first stretch of any conversation collecting baseline on purpose, on low-stakes material. Then when the deviation shows up you have something to compare against. In text, baseline is sentence length, punctuation habits, how much they hedge, whether they use names.",
    limits:
      "Deviation means arousal, and arousal has many causes. Shame, grief, anger, and the fear of being disbelieved all look like the fear of being caught. This is the single most abused idea in the field. It marks the spot to ask about. It never proves what is at the spot.",
  },
  {
    id: "cold-reading",
    title: "Cold reading and the Barnum effect",
    cues: ["cold reading", "psychic", "read me", "mind reading", "how do you know", "horoscope", "personality test", "fortune"],
    core:
      "A performer produces statements that feel piercingly specific but apply to almost everyone, then reads the subject's reaction and steers. The Barnum or Forer effect is the engine: people rate vague, universally-true descriptions as highly accurate about themselves personally. Add shotgunning (fire many small claims, the audience remembers the hits and forgets the misses), the rainbow ruse (attribute a trait and its opposite in one sentence, so it lands whichever way they lean), and the fork (phrase things so either answer confirms you).",
    reveals:
      "Mostly it reveals how badly someone wants the reading to be true. The information flows from the subject to the reader, not the other way. A good cold reader is doing rapid live inference on micro-reactions while appearing to broadcast.",
    inPractice:
      "The honest use is defensive and diagnostic. When someone finds a description of themselves uncannily accurate, check whether it would also fit their neighbour. When you catch yourself feeling deeply understood by someone who knows nothing about you, ask what they actually said versus what you filled in.",
    limits:
      "Used on a person who does not know it is happening, for anything beyond entertainment, this is fraud. It works best on the grieving, the frightened and the lonely, which is precisely why it is the most predatory tool in the set. Never deploy it to build trust you have not earned.",
  },
  {
    id: "statement-analysis",
    title: "What the exact words give away",
    cues: ["said", "told me", "wrote", "message", "text", "email", "phrasing", "words", "explained"],
    core:
      "People choose words under pressure and the choices leak. Watch for: passive voice appearing exactly where responsibility sits (the money went missing, not I lost the money). Pronoun drops (we had a great time becomes there was a good time). Sudden formality or jargon at the emotionally hot point. Distancing language (that woman rather than my wife). Unnecessary qualifiers stacking up (honestly, to be fair, basically). Verb tense slipping into present when narrating the past, or into past when talking about a living relationship.",
    reveals:
      "Where the speaker's own discomfort is, and what they are unconsciously refusing to own. Also what they consider the real subject — people spend the most words on what matters to them, and often the least on what hurts.",
    inPractice:
      "Quote their exact phrase back and ask about it, gently. You said he made you look stupid. Not that he was wrong, that he made you look stupid. Is the audience the part that stings? Naming the word choice is far more useful than announcing a conclusion about it.",
    limits:
      "Language habits vary enormously by person, culture and first language. Non-native speakers use passive voice and formality for reasons that have nothing to do with evasion. One tell is noise. A cluster of tells that appears only around one topic is signal, and even then it is a question, not a verdict.",
  },
  {
    id: "what-is-missing",
    title: "The absence is the information",
    cues: ["situation", "problem", "happened", "conflict", "argument", "advice", "what should i do", "help"],
    core:
      "In any account of a conflict, notice what is structurally missing. The most common omissions are: what the person actually wants to happen next, what they contributed to the situation, what the other party would say if asked, and what they are afraid of. An account that runs long on grievance and contains none of these has told you exactly where the person cannot yet look.",
    reveals:
      "The real question underneath the stated one. Someone who describes an injustice at length and never states a desired outcome is usually not asking how to fix it. They are asking to be told they are right, or they have already decided and want cover.",
    inPractice:
      "Rather than announcing the omission as a failing, name it as the thing you need. Say what the missing piece is and why you need it before you can be useful. That is the difference between an observation and an accusation, and it is almost entirely a matter of framing.",
    limits:
      "Someone may omit their own contribution because there genuinely was not one. Abuse, harassment and plain bad luck exist. Treating every omission as evasion is its own bias, and a cruel one when it lands on someone who was actually wronged.",
  },
  {
    id: "suggestion-priming",
    title: "Suggestion, priming and the illusion of free choice",
    cues: ["suggestion", "hypnosis", "influence", "convince", "persuade", "priming", "choice", "decide"],
    core:
      "Choices are steered by what was made available and salient a moment earlier. A stage mentalist who forces a card is exploiting a mechanical version of something that runs constantly: emphasis, timing, ordering and framing all shift what comes to mind first, and what comes to mind first usually wins. The subject experiences the outcome as entirely their own idea, which is the whole effect.",
    reveals:
      "Why people are certain a decision was free when the option set was shaped for them. Also why the order of questions changes the answers, and why the first number in a negotiation matters so much.",
    inPractice:
      "Defensively: before deciding anything that matters, ask who set the options, in what order, and what is absent from the list entirely. Constructively: when you want a fair decision, deliberately generate an option nobody proposed, before evaluating any of them.",
    limits:
      "Effect sizes for classic priming research are much smaller and less replicable than popular accounts claim. This is a real phenomenon that has been wildly oversold. Use it to notice framing, not to believe you can steer people at will.",
  },
  {
    id: "misdirection",
    title: "Attention is a spotlight, not a floodlight",
    cues: ["distracted", "missed", "didn't notice", "attention", "focus", "overlooked", "obvious"],
    core:
      "Attention is a single narrow beam that you aim, and everything outside it is functionally invisible even though your eyes are open. Misdirection is not making someone look away, it is giving them something more interesting to look at. The strongest form is not visual at all: give someone a question to answer and their attention goes there, leaving everything else unguarded.",
    reveals:
      "How competent people miss enormous things in plain sight. Also why the interesting detail in a room is usually the one nobody is looking at, including you.",
    inPractice:
      "Deliberately look where the attention is not. In a meeting, when everyone is watching the person presenting, watch the person who called the meeting. Build the habit of asking what am I being invited to look at, and what does that leave unwatched.",
    limits:
      "Understanding misdirection does not make you immune to it. You have one spotlight too. The practical benefit is not becoming unfoolable, it is remembering to sweep the beam.",
  },
  {
    id: "the-out",
    title: "The out: being wrong without losing the room",
    cues: ["wrong", "mistake", "misread", "assumed", "apologize", "backtrack", "corrected"],
    core:
      "Every performer misses. What separates a good one is the out — a prepared way to be wrong that costs nothing. The amateur doubles down or crumbles. The professional treats the miss as information, says so plainly, adjusts, and continues with authority intact. The audience trusts the recovery more than they would have trusted an unbroken run.",
    reveals:
      "That confidence and accuracy are separate variables, and people routinely confuse them. Someone who never visibly updates is not more reliable, they are less.",
    inPractice:
      "Offer reads as reads. Say here is what I think is going on, tell me where that is wrong. Then when it is wrong, say good, that changes it, and revise out loud. This is also the single fastest way to get accurate information from someone, because it makes correcting you easy and rewarding.",
    limits:
      "An out is not a licence to guess wildly and let the other person do the work. Fishing while looking confident is the dishonest version, and it is exactly what a fraudulent psychic does.",
  },
  {
    id: "rapport",
    title: "Rapport, and why it is not a technique",
    cues: ["rapport", "trust", "connect", "likeable", "mirroring", "small talk", "first impression"],
    core:
      "Popular material sells mirroring and matching as a trick for manufacturing closeness. The honest version is duller and more effective: rapport is the by-product of accurate attention. People feel connected to someone who demonstrably heard them, remembered a detail, and did not immediately redirect to themselves. Mirroring happens naturally when that is real, which is why deliberately performing it usually reads as uncanny.",
    reveals:
      "The difference between someone who is interested and someone who is performing interest. The tell is what they do with what you said — an interested person builds on it, a performer waits for their turn.",
    inPractice:
      "Remember one specific, non-obvious detail from a previous conversation and bring it up unprompted. That single move outperforms every posture-matching technique ever sold.",
    limits:
      "Rapport built deliberately to extract something is a con, regardless of how warm it feels to the target. The technique and the con differ only in intent, which is why intent is the thing to be honest with yourself about.",
  },
  {
    id: "hot-reading",
    title: "Hot reading, and the modern version of it",
    cues: ["researched", "looked up", "social media", "background", "knew about me", "how did they know"],
    core:
      "Hot reading is knowing things in advance and pretending to divine them. Historically it meant plants in the audience or lifted wallets. Now it means fifteen minutes on someone's public profiles before a meeting, which produces an effect indistinguishable from insight.",
    reveals:
      "That an uncanny amount of apparent intuition about you is just homework. When someone seems to know you unusually well on first contact, the first hypothesis should be research, not perception.",
    inPractice:
      "Doing your homework before an important conversation is legitimate and smart. Presenting the results of homework as intuition is not. The line is whether you would be comfortable saying how you know.",
    limits:
      "This is where mentalism shades into deception with no entertainment defence. If you would have to hide the source, you are running a con, not reading someone.",
  },
  {
    id: "reading-a-room",
    title: "Reading a group rather than a person",
    cues: ["meeting", "team", "room", "group", "everyone", "colleagues", "party", "negotiation"],
    core:
      "Groups leak structure faster than individuals leak content. Watch who people look at before they speak, which tells you where authority actually sits regardless of titles. Watch who gets interrupted and who never does. Watch seating: people place themselves relative to whoever they are aligned with or wary of. Watch who speaks after a silence, which is usually either the most senior or the most anxious.",
    reveals:
      "The real hierarchy, the alliances, and the person whose disagreement will actually matter later. Often none of these match the org chart.",
    inPractice:
      "Before you argue for anything in a group, identify who the room checks with. Persuading that person privately beforehand is worth more than the best argument delivered publicly.",
    limits:
      "Culture changes all of this substantially. Deference patterns, eye contact and interruption norms are not universal, and reading a room by rules learned in one culture will actively mislead you in another.",
  },
];
