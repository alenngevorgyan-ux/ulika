import type { KnowledgeEntry } from "./craft";

/**
 * Mindfulness, Taoism, Zen.
 *
 * Grades here are mixed and stated honestly. Structured programmes like MBSR
 * have real trial evidence for specific outcomes (grade B, occasionally A for
 * stress and relapse prevention). The wider popular claims about mindfulness
 * are much weaker than the marketing, several key trials are unblinded with
 * active-control problems, and adverse effects are underreported. Taoist ideas
 * are grade C philosophy, and are labelled as such rather than borrowed into
 * the credibility of the clinical work.
 */
export const MINDFULNESS: KnowledgeEntry[] = [
  {
    id: "noting",
    title: "Naming what is happening, without arguing with it",
    cues: ["spiral", "racing thoughts", "can't switch off", "rumination", "overthink", "panic", "stressed"],
    core:
      "When a thought or feeling arrives, label it in one word — planning, remembering, judging, fear — and return attention to something present. The labelling is the mechanism: it moves the mind from inside the content to observing the content, and those are different positions with different amounts of distress attached.",
    reveals:
      "How repetitive the traffic actually is. People who do this for a week discover they are having roughly six thoughts, not hundreds, and that the sense of a torrent came from re-entering the same six.",
    inPractice:
      "One word, then back to the breath or the room. Not a sentence, not an analysis of why the thought came. Analysis is re-entry.",
    limits:
      "Nearly useless as a one-off, which is how most people try it. It also goes wrong when the labelling becomes another performance to get right. And for a minority — particularly people with trauma histories — sustained attention to internal states can precipitate distress rather than relieve it; that is a documented adverse effect that programmes rarely mention.",
  },
  {
    id: "wu-wei",
    title: "Effortless action, and what it is not",
    cues: ["forcing", "pushing", "struggling", "trying too hard", "flow", "effort", "resistance"],
    core:
      "Wu wei is usually mistranslated as doing nothing. Closer is acting with the grain rather than against it — the difference between splitting wood along the fibre and hacking across it. It presumes skill, not passivity; the woodsman who works effortlessly does so because he has done it ten thousand times.",
    reveals:
      "When someone is applying force to a problem whose shape they have not understood. Increased effort against a misread situation reliably makes things worse, and it feels like virtue while it does.",
    inPractice:
      "Ask where the resistance is coming from before adding effort. If a conversation gets harder every time they push, pushing is not the missing ingredient.",
    limits:
      "This is the most-abused idea on this shelf. It is a favourite justification for avoidance — going with the flow as a name for not doing the difficult necessary thing. The original assumes deep competence; used by a beginner it is usually just giving up with better vocabulary.",
  },
  {
    id: "beginners-mind",
    title: "Looking at the familiar as if you had not seen it",
    cues: ["assumption", "obvious", "always been", "took for granted", "stale", "expert", "missed"],
    core:
      "Expertise buys speed by replacing observation with pattern-matching. That is a good trade almost always, and it fails precisely when the situation is not the pattern. Deliberately approaching something known as if unfamiliar restores the observation that expertise automated away.",
    reveals:
      "What you stopped looking at. The most common failure of experienced people is not lack of knowledge, it is confident recognition of the wrong pattern.",
    inPractice:
      "This is the same mechanism as the twenty-second scan, arriving from a different tradition. Ask what you would notice about this person or situation if you had met them today.",
    limits:
      "Not a reason to discard expertise. Someone who approaches every situation fresh is not open-minded, they are slow and they repeat solved mistakes. Reserve it for when the familiar pattern is producing results that do not fit.",
  },
  {
    id: "mbsr-structure",
    title: "The programme, not the vibe",
    cues: ["meditation", "mindfulness", "app", "calm", "practice", "how long", "does it work"],
    core:
      "The mindfulness with real trial support is a structured eight-week course with daily practice of substantial length and a trained instructor, developed for chronic pain and stress. That is a specific intervention with a specific dose. Ten minutes on an app is not a smaller version of it any more than a walk is a smaller marathon.",
    reveals:
      "Why someone who has meditated sporadically for a year has nothing to show for it and concludes the whole field is nonsense. They were not doing the thing that was tested.",
    inPractice:
      "Be precise about which claim is being made. Structured programmes for stress and depression relapse have decent evidence. General attention or wellbeing benefits from casual app use have much weaker support, and the effect sizes shrink as trial quality rises.",
    limits:
      "Much of the literature is unblinded, compared against waitlists rather than active controls, and published by people invested in the programmes. Take the strong claims down a notch and the modest ones seriously.",
  },
];
