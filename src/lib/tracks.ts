export type Pace = "intense" | "steady" | "light" | "paused";

export interface Track {
  id: string;
  track_id: string;
  label: string;
  started_at: string;
  target_pace: Pace;
  current_stage: number;
  last_reviewed_at: string | null;
}

export const PACES: { id: Pace; label: string; blurb: string }[] = [
  { id: "intense", label: "Intense", blurb: "Most days. Expect it to be uncomfortable." },
  { id: "steady", label: "Steady", blurb: "A few times a week. The default that actually holds." },
  { id: "light", label: "Light", blurb: "Once a week. Slow, but it survives a busy month." },
  { id: "paused", label: "Paused", blurb: "Parked on purpose. Not the same as abandoned." },
];

/**
 * How long since a track was last touched, in days.
 *
 * Used to decide whether it's due for a review conversation rather than to
 * scold anyone. A track that has gone quiet is information about the pace being
 * wrong, not about the person being lazy.
 */
export function daysSince(iso: string | null): number | null {
  if (!iso) return null;
  return Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);
}

/** Review cadence per pace, in days. */
const REVIEW_AFTER: Record<Pace, number> = {
  intense: 7,
  steady: 10,
  light: 14,
  paused: 30,
};

export function isDueForReview(track: Track): boolean {
  const since = daysSince(track.last_reviewed_at ?? track.started_at);
  if (since === null) return false;
  return since >= REVIEW_AFTER[track.target_pace];
}
