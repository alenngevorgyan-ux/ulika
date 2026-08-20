import { NextRequest, NextResponse } from "next/server";
import { getServerSupabase } from "@/lib/supabase/server";
import { assessResponses, type ResponseRecord } from "@/lib/training/assess";
import type { DepthLayer } from "@/lib/knowledge/router";

export const maxDuration = 30;

/**
 * What should this track do next, judged from what the learner wrote.
 *
 * Replaces the idle-time rule. Elapsed time says nothing about whether
 * anything landed — a fortnight of silence after a solid answer and after a
 * blank one mean opposite things. The old daysSince/isDueForReview helpers are
 * still in src/lib/tracks.ts and still used as the fallback when a track has
 * no written responses at all, which is the one case where time is the only
 * signal available.
 */
export async function POST(req: NextRequest) {
  const supabase = await getServerSupabase();
  if (!supabase) return NextResponse.json({ error: "Not configured" }, { status: 503 });

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Sign in first" }, { status: 401 });

  let body: { trackId?: string; currentDepth?: DepthLayer };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const trackId = body.trackId;
  if (!trackId) return NextResponse.json({ error: "trackId is required" }, { status: 400 });

  const { data: responses } = await supabase
    .from("training_responses")
    .select("skill_id, prompt, response, created_at")
    .eq("skill_id", trackId)
    .order("created_at", { ascending: false })
    .limit(5);

  const assessment = await assessResponses(
    (responses ?? []) as ResponseRecord[],
    body.currentDepth ?? "core"
  );

  // Stamp the review so the UI stops nagging about this track for a while.
  await supabase
    .from("user_tracks")
    .update({ last_reviewed_at: new Date().toISOString() })
    .eq("user_id", user.id)
    .eq("track_id", trackId);

  return NextResponse.json({
    ...assessment,
    responseCount: responses?.length ?? 0,
  });
}
