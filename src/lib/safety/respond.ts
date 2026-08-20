import { chatComplete } from "../ai/provider";
import { RESOURCES, HANDOFF_NOTE, type CrisisType } from "./resources";

const TONE_PROMPT = `You are THE MENTALIST, a mentor character. Someone has just disclosed something serious in conversation with you.

Write ONLY the human part of your response. Two to four short sentences.

You must:
- Acknowledge what they actually said, using their own situation, not a generic template.
- Be direct and warm. No performed calm, no drama, no clever angle, no reframing it as an interesting problem.
- Say plainly that this is beyond what you can help with, and that you are saying so because it matters, not to get rid of them.
- Ask one simple grounding question about right now, such as whether they are safe at this moment or whether anyone is with them.

You must NOT:
- Give any phone number, website, or organisation name. Those are added separately and precisely. If you invent one it could be wrong and someone could call it.
- Analyse, interpret, or read their wording. That is your normal job and it is the wrong job here.
- Offer training, techniques or exercises.
- Use markdown, asterisks or bullet points.
- Say "I'm just an AI" or otherwise make this about you.`;

const FALLBACK: Record<CrisisType, string> = {
  suicide_self_harm:
    "I want to stop and stay with what you just said, because it matters more than anything else we were talking about. This is past what I can be useful for, and I'd rather tell you that straight than pretend otherwise. Are you safe right now? Is there anyone with you?",
  violence_threat:
    "I'm stopping here, because what you've described is about someone's physical safety and that comes before anything else. This needs people who can actually do something, not a conversation with me. Are you safe where you are right now?",
  domestic_abuse:
    "What you're describing isn't an ordinary bad relationship, and I don't want to treat it like one by breaking down who said what. This is the kind of thing people train for years to help with properly. Are you safe at the moment?",
  acute_clinical:
    "I want to be straight with you rather than keep going as if this were an everyday problem. What you're describing deserves someone qualified, and that's not me. How are you doing right this minute?",
};

/**
 * Build the crisis reply.
 *
 * The model writes the acknowledgment; the resources are appended from a
 * static file it never sees. If the model call fails, a fixed acknowledgment
 * is used — this path must produce a correct answer even with no AI at all.
 */
export async function buildCrisisReply(
  type: CrisisType,
  recentUserMessage: string
): Promise<string> {
  let human = FALLBACK[type];

  try {
    const { message } = await chatComplete(
      [
        { role: "system", content: TONE_PROMPT },
        { role: "user", content: recentUserMessage.slice(0, 2000) },
      ],
      { temperature: 0.6 }
    );
    const text = (message.content ?? "").trim();
    // Reject anything that smuggled in a number or a URL despite instructions.
    const looksLikeContactInfo = /\d{3}|https?:|\.com|\.org/i.test(text);
    if (text.length > 40 && text.length < 1200 && !looksLikeContactInfo) {
      human = text;
    }
  } catch {
    /* fixed acknowledgment already in place */
  }

  const set = RESOURCES[type];
  return [human, "", HANDOFF_NOTE, "", set.heading, ...set.lines].join("\n");
}
