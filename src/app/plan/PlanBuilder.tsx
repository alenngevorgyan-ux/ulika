"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { PACES, type Pace } from "@/lib/tracks";
import { getBrowserSupabase } from "@/lib/supabase/client";
import { Stamp } from "@/components/chat/primitives";

interface Stage {
  label: string;
  detail: string;
  trackId: string;
  depth: "core" | "deepening" | "mastery";
  days: number;
}

interface Plan {
  goal: string;
  horizonDays: number;
  stages: Stage[];
  caveat: string;
}

interface Suggestion {
  id: string;
  patternSource: string;
  patternDetail: string;
  trackId: string;
  reason: string;
}

const HORIZONS = [
  { days: 14, label: "Two weeks" },
  { days: 30, label: "A month" },
  { days: 90, label: "Three months" },
];

export default function PlanBuilder({ userId }: { userId: string }) {
  const [goal, setGoal] = useState("");
  const [horizon, setHorizon] = useState(30);
  const [pace, setPace] = useState<Pace>("steady");
  const [plan, setPlan] = useState<Plan | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [suggestion, setSuggestion] = useState<Suggestion | null>(null);
  const [suggestionHandled, setSuggestionHandled] = useState(false);

  // Checked once on mount. The endpoint enforces the once-a-fortnight rule
  // server-side, so this cannot be made pushy by reloading the page.
  useEffect(() => {
    fetch("/api/plan")
      .then((r) => r.json())
      .then((d) => d?.suggestion && setSuggestion(d.suggestion))
      .catch(() => {});
  }, []);

  async function build() {
    if (!goal.trim() || loading) return;
    setLoading(true);
    setError("");
    setPlan(null);
    try {
      const res = await fetch("/api/plan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ goal, horizonDays: horizon, pace }),
      });
      const data = await res.json();
      if (!res.ok) setError(data.error ?? "Could not build that.");
      else setPlan(data.plan);
    } catch {
      setError("Couldn't reach the server.");
    } finally {
      setLoading(false);
    }
  }

  async function acceptSuggestion() {
    if (!suggestion) return;
    const supabase = getBrowserSupabase();
    setSuggestionHandled(true);
    if (!supabase) return;
    await supabase.from("user_tracks").upsert(
      {
        user_id: userId,
        track_id: suggestion.trackId,
        label: suggestion.trackId.replace(/-/g, " "),
        target_pace: "steady",
      },
      { onConflict: "user_id,track_id" }
    );
    await supabase.from("suggested_tracks").update({ accepted: true }).eq("id", suggestion.id);
  }

  async function dismissSuggestion() {
    setSuggestionHandled(true);
    const supabase = getBrowserSupabase();
    if (!supabase || !suggestion) return;
    await supabase.from("suggested_tracks").update({ accepted: false }).eq("id", suggestion.id);
  }

  return (
    <section className="mb-16">
      {/* A suggestion arrives once a fortnight at most, cites the specific
          observation it came from, and is dismissible without argument. */}
      {suggestion && !suggestionHandled && (
        <div
          className="rounded-lg border-l-2 pl-4 py-3 pr-4 mb-8"
          style={{ borderColor: "var(--accent-teal)", background: "var(--panel)" }}
        >
          <p
            className="font-mono text-[10px] uppercase tracking-[0.18em] mb-2"
            style={{ color: "var(--accent-teal)" }}
          >
            Something I noticed
          </p>
          <p className="text-sm leading-relaxed mb-1.5">{suggestion.reason}</p>
          <p className="text-xs text-muted italic leading-relaxed mb-3">
            From your dossier: {suggestion.patternDetail}
          </p>
          <div className="flex gap-4">
            <button onClick={acceptSuggestion} className="text-sm text-accent hover:opacity-80">
              Start that track
            </button>
            <button
              onClick={dismissSuggestion}
              className="text-sm text-muted hover:text-foreground transition-colors"
            >
              Not now
            </button>
          </div>
        </div>
      )}

      <h2 className="font-display text-xl mb-2">Build a plan</h2>
      <p className="text-sm text-muted mb-6 max-w-lg leading-relaxed">
        Say what you want and how long you have. Short horizons get the core of more topics;
        long ones go deeper on fewer.
      </p>

      <div
        className="rounded-lg border p-5"
        style={{ background: "var(--panel)", borderColor: "var(--line)" }}
      >
        <input
          value={goal}
          onChange={(e) => setGoal(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && build()}
          placeholder="Stop freezing up in salary negotiations"
          className="w-full bg-background border border-panel-border rounded-md px-4 py-2.5 text-sm outline-none focus:border-accent mb-4"
        />

        <div className="flex flex-wrap gap-2 mb-3">
          {HORIZONS.map((h) => (
            <button
              key={h.days}
              onClick={() => setHorizon(h.days)}
              className={`text-xs px-3 py-1.5 rounded-md border transition-colors ${
                horizon === h.days
                  ? "border-accent bg-accent/10"
                  : "border-panel-border text-muted hover:border-accent/50"
              }`}
            >
              {h.label}
            </button>
          ))}
        </div>

        <div className="flex flex-wrap gap-2 mb-4">
          {PACES.filter((p) => p.id !== "paused").map((p) => (
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

        <button
          onClick={build}
          disabled={!goal.trim() || loading}
          className="bg-accent text-background font-medium px-5 py-2.5 rounded-md text-sm hover:opacity-90 transition-opacity disabled:opacity-40"
        >
          {loading ? "Working it out…" : "Build it"}
        </button>
        {error && <p className="text-xs text-danger mt-3">{error}</p>}
      </div>

      {plan && (
        <div className="mt-8 ulika-reveal">
          <Stamp trigger={plan.goal}>
            <h3 className="font-display text-lg mb-1">{plan.goal}</h3>
          </Stamp>
          <p className="text-xs text-muted mb-6">
            {plan.stages.length} stages over {plan.horizonDays} days
          </p>

          <div>
            {plan.stages.map((s, i) => (
              <div key={i} className="flex gap-4">
                <div className="flex flex-col items-center">
                  <span
                    className="w-2 h-2 rounded-full mt-1.5 shrink-0"
                    style={{ background: "var(--accent-brass)" }}
                  />
                  {i < plan.stages.length - 1 && (
                    <span className="w-px flex-1 my-1" style={{ background: "var(--line)" }} />
                  )}
                </div>
                <div className="pb-6 flex-1">
                  <div className="flex items-center gap-2 flex-wrap mb-1">
                    <p className="text-sm font-medium">{s.label}</p>
                    <span className="font-mono text-[10px] uppercase tracking-wider text-muted">
                      {s.depth} · {s.days}d
                    </span>
                  </div>
                  <p className="text-sm text-muted leading-relaxed mb-1.5">{s.detail}</p>
                  <Link
                    href={`/train/${s.trackId}`}
                    className="text-xs text-accent hover:opacity-80"
                  >
                    {s.trackId.replace(/-/g, " ")} →
                  </Link>
                </div>
              </div>
            ))}
          </div>

          {/* Shown, not buried. A plan that hides its own weakness is a sales pitch. */}
          {plan.caveat && (
            <div
              className="rounded-lg border p-4 mt-2"
              style={{ borderColor: "var(--line)", background: "var(--panel-2)" }}
            >
              <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted mb-2">
                What this plan does not do
              </p>
              <p className="text-sm text-muted leading-relaxed">{plan.caveat}</p>
            </div>
          )}
        </div>
      )}
    </section>
  );
}
