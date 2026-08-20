import { NextRequest, NextResponse } from "next/server";
import { getServerSupabase } from "@/lib/supabase/server";
import { loadMemory } from "@/lib/mentalist/memory";
import { routeKnowledge, depthsForPace } from "@/lib/knowledge/router";
import { buildPlan, suggestTrackForPattern } from "@/lib/planner/build";

export const maxDuration = 60;

/**
 * One planning engine, two callers: /plan renders the result in full, the chat
 * renders the same object as a compact TimelineBlock. The logic lives here so
 * the two cannot drift.
 */
export async function POST(req: NextRequest) {
  const supabase = await getServerSupabase();
  if (!supabase) return NextResponse.json({ error: "Not configured" }, { status: 503 });

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Sign in first" }, { status: 401 });

  let body: { goal?: string; horizonDays?: number; pace?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const goal = (body.goal ?? "").trim();
  if (!goal) return NextResponse.json({ error: "goal is required" }, { status: 400 });

  const horizonDays = Math.max(3, Math.min(Number(body.horizonDays) || 14, 180));
  const pace = (["intense", "steady", "light", "paused"] as const).includes(
    body.pace as "intense"
  )
    ? (body.pace as "intense" | "steady" | "light" | "paused")
    : "steady";

  const [memoryBlock, { data: tracks }] = await Promise.all([
    loadMemory(supabase, user.id),
    supabase.from("user_tracks").select("track_id, label, target_pace"),
  ]);

  const routed = await routeKnowledge(
    supabase,
    goal,
    memoryBlock,
    depthsForPace(pace, horizonDays)
  );

  const plan = await buildPlan({
    goal,
    horizonDays,
    pace,
    memoryBlock,
    activeTracks: (tracks ?? []).map((t) => ({
      trackId: t.track_id,
      label: t.label,
      pace: t.target_pace,
    })),
    chunks: routed.chunks,
  });

  if (!plan) {
    return NextResponse.json(
      { error: "Could not build a plan from that. Try describing the goal more concretely." },
      { status: 502 }
    );
  }

  return NextResponse.json({ plan, retrieval: routed.mode });
}

/**
 * Look for a dossier pattern worth acting on.
 *
 * Rate-limited to once a fortnight per user, and never surfaces a pattern that
 * has already been shown. An unsolicited recommendation is welcome once; the
 * same one arriving weekly is nagging.
 */
export async function GET() {
  const supabase = await getServerSupabase();
  if (!supabase) return NextResponse.json({ suggestion: null });

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ suggestion: null });

  const fortnightAgo = new Date(Date.now() - 14 * 86_400_000).toISOString();

  const { data: recent } = await supabase
    .from("suggested_tracks")
    .select("id")
    .gt("created_at", fortnightAgo)
    .limit(1);

  if (recent && recent.length > 0) return NextResponse.json({ suggestion: null });

  const { data: patterns } = await supabase
    .from("mentalist_memory")
    .select("subject, detail")
    .eq("kind", "pattern")
    .order("updated_at", { ascending: false })
    .limit(3);

  if (!patterns?.length) return NextResponse.json({ suggestion: null });

  const { data: existingTracks } = await supabase.from("user_tracks").select("track_id");
  const running = new Set((existingTracks ?? []).map((t) => t.track_id));

  for (const p of patterns) {
    const match = await suggestTrackForPattern(p.subject, p.detail);
    // Suggesting something already running is noise, not insight.
    if (!match || running.has(match.trackId)) continue;

    const { data: saved } = await supabase
      .from("suggested_tracks")
      .upsert(
        {
          user_id: user.id,
          pattern_source: p.subject,
          suggested_track_id: match.trackId,
          reason: match.reason,
          shown_at: new Date().toISOString(),
        },
        { onConflict: "user_id,pattern_source,suggested_track_id" }
      )
      .select()
      .single();

    return NextResponse.json({
      suggestion: {
        id: saved?.id,
        patternSource: p.subject,
        patternDetail: p.detail,
        trackId: match.trackId,
        reason: match.reason,
      },
    });
  }

  return NextResponse.json({ suggestion: null });
}
