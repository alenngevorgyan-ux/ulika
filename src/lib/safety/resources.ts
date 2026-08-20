/**
 * Crisis resources.
 *
 * CRITICAL DESIGN RULE: these strings never pass through a language model.
 * A hallucinated crisis line number is the single most dangerous output this
 * product could produce, so the model writes the human part of the response
 * and this file supplies the numbers, verbatim, always.
 *
 * findahelpline.com is listed for every category because it resolves to the
 * user's actual country. We do not know the user's region reliably, and
 * guessing wrong is worse than pointing at a directory that doesn't guess.
 */

export type CrisisType =
  | "suicide_self_harm"
  | "violence_threat"
  | "domestic_abuse"
  | "acute_clinical";

export interface ResourceSet {
  heading: string;
  lines: string[];
}

export const RESOURCES: Record<CrisisType, ResourceSet> = {
  suicide_self_harm: {
    heading: "Where to get help right now",
    lines: [
      "If you are in immediate danger, call your local emergency number.",
      "US: call or text 988 (Suicide and Crisis Lifeline), 24/7.",
      "UK and Ireland: call 116 123 (Samaritans), 24/7, free.",
      "EU: 112 reaches emergency services in every member state.",
      "Anywhere: findahelpline.com lists verified lines for your country.",
    ],
  },
  violence_threat: {
    heading: "This needs someone who can actually act",
    lines: [
      "If anyone is in immediate danger, call your local emergency number now.",
      "US and Canada: 911. UK: 999. EU: 112.",
      "Anywhere: findahelpline.com lists local crisis and emergency lines.",
    ],
  },
  domestic_abuse: {
    heading: "Specialist support for this",
    lines: [
      "US: National Domestic Violence Hotline, 1-800-799-7233, or text START to 88788.",
      "UK: National Domestic Abuse Helpline, 0808 2000 247, 24/7, free.",
      "EU: 116 006 is the victim support line in many member states.",
      "Anywhere: findahelpline.com and hotpeachpages.net list local services.",
      "If you are planning to leave, a specialist advocate can help you do it safely. That planning matters and is worth doing with someone trained.",
    ],
  },
  acute_clinical: {
    heading: "This is worth taking to someone qualified",
    lines: [
      "Start with your doctor or a licensed mental health professional.",
      "If it feels urgent, your local emergency number or an emergency department.",
      "Anywhere: findahelpline.com lists lines that can point you to local services.",
    ],
  },
};

/** Shown alongside resources so the handoff is not experienced as a shutdown. */
export const HANDOFF_NOTE =
  "I'm not the right thing for this, and saying otherwise would be the least useful thing I could do. Not because it isn't serious — because it is.";
