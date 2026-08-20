"use client";

import { useState } from "react";
import Link from "next/link";
import { getBrowserSupabase } from "@/lib/supabase/client";
import { PACES, daysSince, isDueForReview, type Track, type Pace } from "@/lib/tracks";
import { TRAININGS } from "@/lib/content/trainings";
import { PSYCH_TECHNIQUES } from "@/lib/content/psychTechniques";
import { describeGrading, isDemanding } from "@/lib/content/grading";

const SUGGESTIONS = [
  ...TRAININGS.map((t) => ({ id: t.slug, label: t.title })),
  ...PSYCH_TECHNIQUES.map((p) => ({ id: p.slug, label: p.title })),
];

interface Review {
  grasp: string;
  action: string;
  nextDepth: string | null;
  reason: string;
  responseCount: number;
}

const ACTION_TEXT: Record<string, string> = {
  repeat_core_differently: "Repeat this layer with a different practice — not forward yet.",
  hold: "Stay here a bit longer. It's landing, but not solid.",
  advance_depth: "Ready to go deeper.",
  increase_pace: "This is solid. Worth speeding up or adding a track.",
};

export default function TracksPanel({ initial, userId }: { initial: Track[]; userId: string }) {
  const [tracks, setTracks] = useState(initial);
  const [reviews, setReviews] = useState<Record<string, Review | "loading">>({});

  async function review(track: Track) {
    setReviews((r) => ({ ...r, [track.id]: "loading" }));
    try {
      const res = await fetch("/api/track-review", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ trackId: track.track_id }),
      });
      const data = await res.json();
      setReviews((r) => ({ ...r, [track.id]: data }));
    } catch {
      setReviews((r) => {
        const next = { ...r };
        delete next[track.id];
        return next;
      });
    }
  }
  const [adding, setAdding] = useState(false);
  const [label, setLabel] = useState("");
  const [pace, setPace] = useState<Pace>("steady");

  async function add() {
    const name = label.trim();
    if (!name) return;
    const supabase = getBrowserSupabase();
    if (!supabase) return;

    // Free-form skills are allowed alongside catalog items — someone learning
    // chess should be able to run it as a track even though we teach no chess.
    const match = SUGGESTIONS.find((s) => s.label.toLowerCase() === name.toLowerCase());
    const trackId = match?.id ?? name.toLowerCase().replace(/[^a-z0-9]+/g, "-").slice(0, 60);

    const { data, error } = await supabase
      .from("user_tracks")
      .insert({ user_id: userId, track_id: trackId, label: name, target_pace: pace })
      .select()
      .single();

    if (!error && data) {
      setTracks((t) => [...t, data as Track]);
      setLabel("");
      setAdding(false);
    }
  }

  async function setTrackPace(track: Track, next: Pace) {
    const supabase = getBrowserSupabase();
    if (!supabase) return;
    setTracks((t) => t.map((x) => (x.id === track.id ? { ...x, target_pace: next } : x)));
    await supabase.from("user_tracks").update({ target_pace: next }).eq("id", track.id);
  }

  async function remove(track: Track) {
    const supabase = getBrowserSupabase();
    if (!supabase) return;
    setTracks((t) => t.filter((x) => x.id !== track.id));
    await supabase.from("user_tracks").delete().eq("id", track.id);
  }

  return (
    <section className="mb-16">
      <div className="flex items-baseline justify-between mb-2">
        <h2 className="font-display text-xl">Tracks</h2>
        {!adding && (
          <button
            onClick={() => setAdding(true)}
            className="text-xs text-accent hover:opacity-80 transition-opacity"
          >
            + Add a track
          </button>
        )}
      </div>
      <p className="text-sm text-muted mb-6 max-w-lg leading-relaxed">
        Several at once is fine and normal — they move at different speeds. Anything can be a
        track, including things we don&apos;t teach.
      </p>

      {adding && (
        <div className="bg-panel border border-panel-border rounded-lg p-5 mb-4">
          <input
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && add()}
            list="track-suggestions"
            placeholder="Negotiation, chess, drawing…"
            className="w-full bg-background border border-panel-border rounded-md px-4 py-2.5 text-sm outline-none focus:border-accent mb-4"
          />
          <datalist id="track-suggestions">
            {SUGGESTIONS.map((s) => (
              <option key={s.id} value={s.label} />
            ))}
          </datalist>

          <div className="flex flex-wrap gap-2 mb-4">
            {PACES.map((p) => (
              <button
                key={p.id}
                onClick={() => setPace(p.id)}
                title={p.blurb}
                className={`text-xs px-3 py-1.5 rounded-md border transition-colors ${
                  pace === p.id
                    ? "border-accent bg-accent/10"
                    : "border-panel-border text-muted hover:border-accent/50"
                }`}
              >
                {p.label}
              </button>
            ))}
          </div>
          <p className="text-xs text-muted mb-4">{PACES.find((p) => p.id === pace)?.blurb}</p>

          <div className="flex gap-2">
            <button
              onClick={add}
              disabled={!label.trim()}
              className="bg-accent text-background text-sm font-medium px-4 py-2 rounded-md disabled:opacity-40"
            >
              Start it
            </button>
            <button
              onClick={() => setAdding(false)}
              className="text-sm text-muted px-3 py-2 hover:text-foreground transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {tracks.length === 0 && !adding ? (
        <p className="text-sm text-muted">Nothing running yet.</p>
      ) : (
        <div className="space-y-2">
          {tracks.map((track) => {
            const due = isDueForReview(track);
            const idle = daysSince(track.last_reviewed_at ?? track.started_at);
            const grading = describeGrading(track.track_id);

            return (
              <div
                key={track.id}
                className="group bg-panel border border-panel-border rounded-lg p-5"
              >
                <div className="flex items-start justify-between gap-3 mb-2">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h3 className="font-display text-base">{track.label}</h3>
                      {isDemanding(track.track_id) && (
                        <span className="font-mono text-[10px] uppercase tracking-wider text-accent">
                          demanding
                        </span>
                      )}
                    </div>
                    {grading && <p className="text-xs text-muted mt-1">{grading}</p>}
                  </div>
                  <button
                    onClick={() => remove(track)}
                    className="opacity-0 group-hover:opacity-100 text-muted hover:text-foreground transition-opacity shrink-0"
                    aria-label="Drop this track"
                  >
                    ×
                  </button>
                </div>

                <div className="flex flex-wrap items-center gap-2 mt-4">
                  {PACES.map((p) => (
                    <button
                      key={p.id}
                      onClick={() => setTrackPace(track, p.id)}
                      className={`text-xs px-2.5 py-1 rounded border transition-colors ${
                        track.target_pace === p.id
                          ? "border-accent bg-accent/10"
                          : "border-panel-border text-muted hover:border-accent/50"
                      }`}
                    >
                      {p.label}
                    </button>
                  ))}
                  {idle !== null && (
                    <span className="text-xs text-muted ml-auto">
                      {idle === 0 ? "started today" : `${idle}d since review`}
                    </span>
                  )}
                </div>

                {(due || reviews[track.id]) && (
                  <div className="mt-4 pt-4 border-t border-panel-border">
                    {reviews[track.id] === "loading" ? (
                      <p className="text-sm text-muted">Reading what you wrote…</p>
                    ) : reviews[track.id] ? (
                      <>
                        <p className="text-sm leading-relaxed mb-1.5">
                          {ACTION_TEXT[(reviews[track.id] as Review).action] ?? ""}
                        </p>
                        <p className="text-xs text-muted leading-relaxed mb-2">
                          {(reviews[track.id] as Review).responseCount === 0
                            ? "Nothing written back on this one yet, so this is a guess from timing alone. Finish a lesson and it gets an actual read."
                            : (reviews[track.id] as Review).reason}
                        </p>
                        <Link href="/chat" className="text-sm text-accent hover:opacity-80">
                          Talk it over →
                        </Link>
                      </>
                    ) : (
                      <>
                        <p className="text-sm text-muted leading-relaxed mb-2">
                          This one is due a look.
                        </p>
                        <button
                          onClick={() => review(track)}
                          className="text-sm text-accent hover:opacity-80"
                        >
                          See where it stands →
                        </button>
                      </>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
