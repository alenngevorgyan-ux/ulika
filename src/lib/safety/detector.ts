import { chatComplete } from "../ai/provider";
import type { CrisisType } from "./resources";

export interface CrisisVerdict {
  triggered: boolean;
  type: CrisisType | null;
  /** Quoted from the user's own words, for the log. Never paraphrased. */
  evidence: string;
}

/**
 * Independent crisis detection.
 *
 * Runs as its own model call with a single narrow job, BEFORE the main
 * conversation model sees anything. The reason it is separate rather than an
 * instruction inside the big prompt: a long system prompt competes for
 * attention, and mid-conversation the main model is deep in a discussion about
 * a difficult relationship — exactly the context where a quiet disclosure is
 * easiest to absorb into the flow and miss.
 *
 * This layer has one job and no other context to lose it to.
 *
 * Deliberately tuned toward false positives. Over-triggering costs an awkward
 * moment; under-triggering costs something that cannot be undone.
 */
const DETECTOR_PROMPT = `You are a safety classifier. You do not converse, advise or comfort. You output JSON only.

Read the user's most recent message in context and decide whether it discloses any of the following:

suicide_self_harm - suicidal thoughts, intent or planning, self-harm, wanting to not exist, feeling there is no point to living. Includes indirect or minimising phrasing ("what's the point", "everyone would be better off", "I won't be around much longer"), and disclosures buried mid-message or waved away immediately after.

violence_threat - threats of violence toward the user or by the user toward someone else, fear for physical safety, someone being hurt.

domestic_abuse - a pattern of coercion, control, intimidation, isolation, financial control, monitoring, or physical/sexual/emotional abuse by a partner or family member. Note this is about a PATTERN OF CONTROL, not an ordinary bad argument or an unfair partner.

acute_clinical - disclosure of severe symptoms needing professional care: psychosis, hallucinations, mania, severe eating-disorder behaviour, substance dependence causing harm, inability to function.

Return exactly:
{"triggered": true|false, "type": "<one of the four, or null>", "evidence": "<short exact quote from the user's own words>"}

Rules:
- evidence must be a literal quote from the user. Never paraphrase, never invent.
- If someone describes these things happening to a third party in a way that suggests real current risk, that still triggers.
- Fiction, hypotheticals, historical events long resolved, song lyrics, and academic discussion do NOT trigger.
- Someone saying a situation is "killing me" or "I could kill him" as ordinary figures of speech does NOT trigger.
- Ordinary conflict, unfairness, sadness, stress, breakups and frustration do NOT trigger.
- When genuinely uncertain between triggering and not, trigger. A false positive is a recoverable awkward moment. A miss is not.`;

const VALID: CrisisType[] = [
  "suicide_self_harm",
  "violence_threat",
  "domestic_abuse",
  "acute_clinical",
];

export async function detectCrisis(
  messages: { role: string; content: string }[]
): Promise<CrisisVerdict> {
  const recent = messages.slice(-4);
  const latest = [...messages].reverse().find((m) => m.role === "user");
  if (!latest) return { triggered: false, type: null, evidence: "" };

  const context = recent
    .map((m) => `${m.role === "user" ? "USER" : "MENTOR"}: ${m.content}`)
    .join("\n\n");

  try {
    const { message } = await chatComplete(
      [
        { role: "system", content: DETECTOR_PROMPT },
        { role: "user", content: `${context}\n\nClassify the LAST user message.` },
      ],
      { temperature: 0, model: "google/gemini-3.1-flash-lite" }
    );

    const raw = (message.content ?? "").trim();
    const start = raw.indexOf("{");
    const end = raw.lastIndexOf("}");
    if (start === -1 || end === -1) return failOpen(latest.content);

    const parsed = JSON.parse(raw.slice(start, end + 1));
    const type = VALID.includes(parsed?.type) ? (parsed.type as CrisisType) : null;

    return {
      triggered: Boolean(parsed?.triggered) && type !== null,
      type,
      evidence: typeof parsed?.evidence === "string" ? parsed.evidence.slice(0, 300) : "",
    };
  } catch {
    return failOpen(latest.content);
  }
}

/**
 * If the classifier is unavailable, fall back to a small keyword net rather
 * than to no protection at all. Crude and noisy on purpose — this path only
 * runs when the real detector already failed, and silence here is the one
 * outcome that is not acceptable.
 */
function failOpen(text: string): CrisisVerdict {
  const t = text.toLowerCase();
  const nets: [CrisisType, string[]][] = [
    [
      "suicide_self_harm",
      ["kill myself", "end my life", "suicide", "suicidal", "self harm", "self-harm", "cut myself", "not worth living", "better off without me", "want to die", "no point in living"],
    ],
    ["violence_threat", ["he hits me", "she hits me", "beat me", "hurt me physically", "threatened to kill", "afraid he'll hurt", "afraid she'll hurt"]],
    ["domestic_abuse", ["won't let me leave", "controls my money", "tracks my phone", "isolates me", "scared of my husband", "scared of my wife", "scared of my partner"]],
  ];

  for (const [type, needles] of nets) {
    if (needles.some((n) => t.includes(n))) {
      return { triggered: true, type, evidence: text.slice(0, 300) };
    }
  }
  return { triggered: false, type: null, evidence: "" };
}
