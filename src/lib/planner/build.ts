import { chatComplete } from "../ai/provider";
import { depthsForPace, type DepthLayer, type RetrievedChunk } from "../knowledge/router";
import { GRADING, describeGrading } from "../content/grading";
import { TRAININGS } from "../content/trainings";
import { PSYCH_TECHNIQUES } from "../content/psychTechniques";

export interface PlanStage {
  label: string;
  detail: string;
  trackId: string;
  depth: DepthLayer;
  days: number;
}

export interface Plan {
  goal: string;
  horizonDays: number;
  stages: PlanStage[];
  /** Named honestly so the UI can show it without the model claiming certainty. */
  caveat: string;
}

export interface PlannerInput {
  goal: string;
  horizonDays: number;
  pace: "intense" | "steady" | "light" | "paused";
  /** Formatted dossier — people, live situations, patterns. */
  memoryBlock: string;
  activeTracks: { trackId: string; label: string; pace: string }[];
  chunks: RetrievedChunk[];
}

const CATALOG = [
  ...TRAININGS.map((t) => ({ slug: t.slug, title: t.title })),
  ...PSYCH_TECHNIQUES.map((p) => ({ slug: p.slug, title: p.title })),
];

/**
 * Build a plan as its own narrow model call.
 *
 * Separate from the chat prompt on purpose: planning wants the dossier, the
 * active tracks, the retrieved material and a hard output shape, none of which
 * belong in a conversational persona. One engine, two surfaces — /plan renders
 * it in full, the chat's TimelineBlock renders the same object compactly.
 */
export async function buildPlan(input: PlannerInput): Promise<Plan | null> {
  const allowedDepths = depthsForPace(input.pace, input.horizonDays);

  const catalogLines = CATALOG.map((c) => {
    const g = describeGrading(c.slug);
    return `${c.slug} | ${c.title}${g ? ` | ${g}` : ""}`;
  }).join("\n");

  const system = `You build a training plan. You output JSON only, no prose around it.

{"goal":"...","stages":[{"label":"...","detail":"...","trackId":"<catalog slug>","depth":"core"|"deepening"|"mastery","days":<int>}],"caveat":"..."}

Rules that are not negotiable:
- trackId MUST be a slug from the catalog below. Never invent one.
- The days across all stages must add up to roughly the horizon, not more.
- Only use these depth layers: ${allowedDepths.join(", ")}. The horizon does not allow the others.
- Three to five stages. A plan with nine stages is a wish list.
- Order matters and you must make it matter: each stage should be usable before the next begins.
- detail says what they actually DO, not what they will learn.
- caveat states the honest weakness of this plan in one sentence — what it does not cover, or where it will be hard to keep going. Never omit it and never make it reassuring.

Catalog (slug | title | difficulty, time to result, evidence grade):
${catalogLines}

Difficulty and time to result are independent. Something easy and slow is where people quit, so do not stack several slow items at the front.`;

  const user = [
    `Goal: ${input.goal}`,
    `They have about ${input.horizonDays} days and want a ${input.pace} pace.`,
    input.activeTracks.length
      ? `Already running: ${input.activeTracks.map((t) => `${t.label} (${t.pace})`).join(", ")}. Do not duplicate these.`
      : "Nothing running yet.",
    input.memoryBlock ? `\nWhat you know about them:\n${input.memoryBlock}` : "",
    input.chunks.length
      ? `\nRelevant material:\n${input.chunks.map((c) => `${c.source_title}: ${c.short_definition}`).join("\n")}`
      : "",
  ]
    .filter(Boolean)
    .join("\n");

  try {
    const { message } = await chatComplete(
      [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
      { temperature: 0.4 }
    );

    const raw = (message.content ?? "").trim();
    const start = raw.indexOf("{");
    const end = raw.lastIndexOf("}");
    if (start === -1) return null;

    const parsed = JSON.parse(raw.slice(start, end + 1));
    const validSlugs = new Set(CATALOG.map((c) => c.slug));

    // Drop stages pointing at slugs that do not exist. A plan that sends
    // someone to a 404 is worse than a shorter plan.
    const stages: PlanStage[] = (Array.isArray(parsed.stages) ? parsed.stages : [])
      .filter((s: { trackId?: string }) => validSlugs.has(s.trackId ?? ""))
      .slice(0, 5)
      .map((s: PlanStage) => ({
        label: String(s.label ?? ""),
        detail: String(s.detail ?? ""),
        trackId: s.trackId,
        depth: allowedDepths.includes(s.depth) ? s.depth : allowedDepths[0],
        days: Math.max(1, Math.min(Number(s.days) || 7, input.horizonDays)),
      }));

    if (stages.length === 0) return null;

    return {
      goal: String(parsed.goal ?? input.goal),
      horizonDays: input.horizonDays,
      stages,
      caveat: String(parsed.caveat ?? "").trim(),
    };
  } catch {
    return null;
  }
}

/**
 * Match dossier patterns to catalog tracks.
 *
 * Deliberately conservative. A suggestion that misreads someone's situation is
 * worse than no suggestion, so an unmatched pattern produces nothing rather
 * than a nearest guess.
 */
export async function suggestTrackForPattern(
  patternSubject: string,
  patternDetail: string
): Promise<{ trackId: string; reason: string } | null> {
  const catalogLines = CATALOG.map((c) => `${c.slug} | ${c.title}`).join("\n");

  try {
    const { message } = await chatComplete(
      [
        {
          role: "system",
          content: `Match an observed pattern in someone's life to ONE training method that works on it directly.

Return {"trackId":"<slug>","reason":"<one sentence citing the observation>"} or {"trackId":null} if nothing fits well.

Return null far more often than you match. A method that is merely adjacent is not a match — it is a wrong recommendation dressed as insight, and it costs more trust than it gains. The reason must reference the specific observation, not describe the method in general.

Catalog:
${catalogLines}`,
        },
        { role: "user", content: `Pattern: ${patternSubject}\nDetail: ${patternDetail}` },
      ],
      { temperature: 0, model: "google/gemini-3.1-flash-lite" }
    );

    const raw = (message.content ?? "").trim();
    const start = raw.indexOf("{");
    if (start === -1) return null;
    const parsed = JSON.parse(raw.slice(start, raw.lastIndexOf("}") + 1));

    if (!parsed?.trackId || !GRADING[parsed.trackId]) return null;
    return { trackId: parsed.trackId, reason: String(parsed.reason ?? "") };
  } catch {
    return null;
  }
}
