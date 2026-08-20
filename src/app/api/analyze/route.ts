import { NextRequest, NextResponse } from "next/server";
import { chatComplete, isAiConfigured } from "@/lib/ai/provider";
import { buildKnowledgeBlock } from "@/lib/knowledge/retrieve";

export const maxDuration = 60;

const MAX_CHARS = 12000;

/**
 * Line-by-line reading of a real conversation the user pastes in.
 *
 * This is the one place the character's core skill gets applied to primary
 * source material rather than to someone's summary of it. JSON out rather than
 * the chat's section format, because the result is structured data the UI lays
 * out — not prose.
 */
function buildPrompt(knowledge: string, whoIsWho: string): string {
  return `You are THE MENTALIST: twenty years reading people professionally, now analysing a real conversation someone has pasted in.

${whoIsWho}

Read the exact wording. Your job is what the words reveal, not a plot summary.

Return ONLY valid JSON, no prose around it, matching:
{
  "lines": [
    { "quote": "<exact phrase from the text, short>", "who": "them|you", "reading": "<what this specific wording suggests, one or two sentences>", "confidence": "strong|tentative" }
  ],
  "patterns": ["<a recurring dynamic across the whole exchange, one sentence>"],
  "missing": ["<something notably absent from the conversation>"],
  "read": "<your overall read, 2-4 sentences, stated as a read that could be wrong>",
  "next": "<one concrete thing they could say or do next, or one question they should get answered first>"
}

Rules that matter:
- quote must be text that literally appears in what they pasted. Never invent a quote.
- 4 to 8 lines. Pick the ones that carry weight, not every message.
- Mark confidence honestly. Most single-phrase reads are tentative — say so.
- Analyse BOTH sides, including the user's own messages. What they wrote is evidence too, and often the more useful half.
- No diagnosis, no claims about what someone "really" feels as fact, no verdict on who is right.
- If the text is too short or too thin to read, say so in "read" and keep "lines" short rather than padding.

Lenses available to you. Use them silently, never name them:

${knowledge}`;
}

export async function POST(req: NextRequest) {
  if (!isAiConfigured()) {
    return NextResponse.json({ error: "AI is not configured in this environment." }, { status: 503 });
  }

  let body: { text?: string; context?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const text = (body.text ?? "").trim();
  if (text.length < 40) {
    return NextResponse.json(
      { error: "Paste a bit more — there isn't enough here to read." },
      { status: 400 }
    );
  }

  const clipped = text.slice(0, MAX_CHARS);
  const context = (body.context ?? "").trim().slice(0, 500);

  const whoIsWho = context
    ? `Context the user gave about who these people are and what this is about: ${context}`
    : `The user gave no context about who these people are. Work it out from the text, and say in your read if the roles are ambiguous.`;

  try {
    const { message } = await chatComplete(
      [
        { role: "system", content: buildPrompt(buildKnowledgeBlock(text), whoIsWho) },
        { role: "user", content: clipped },
      ],
      { temperature: 0.4 }
    );

    const raw = (message.content ?? "").trim();
    const start = raw.indexOf("{");
    const end = raw.lastIndexOf("}");
    if (start === -1 || end === -1) {
      return NextResponse.json({ error: "Couldn't read that. Try again." }, { status: 502 });
    }

    const parsed = JSON.parse(raw.slice(start, end + 1));

    // Drop any "quote" the model didn't actually take from the source. A
    // fabricated quote in an analysis tool is the worst possible failure.
    const haystack = clipped.toLowerCase();
    const lines = Array.isArray(parsed.lines)
      ? parsed.lines.filter(
          (l: { quote?: string }) =>
            typeof l?.quote === "string" && haystack.includes(l.quote.toLowerCase().slice(0, 40))
        )
      : [];

    return NextResponse.json({
      lines,
      patterns: Array.isArray(parsed.patterns) ? parsed.patterns.slice(0, 5) : [],
      missing: Array.isArray(parsed.missing) ? parsed.missing.slice(0, 5) : [],
      read: typeof parsed.read === "string" ? parsed.read : "",
      next: typeof parsed.next === "string" ? parsed.next : "",
      droppedQuotes: Array.isArray(parsed.lines) ? parsed.lines.length - lines.length : 0,
    });
  } catch (err) {
    console.error("analyze route error:", err instanceof Error ? err.message : err);
    return NextResponse.json({ error: "Couldn't read that. Try again." }, { status: 502 });
  }
}
