import { NextRequest, NextResponse } from "next/server";
import { getServerSupabase } from "@/lib/supabase/server";
import { validateEvent, dedupeKey, type StoredEvent } from "@/lib/interaction/events";
import { deriveCase } from "@/lib/interaction/reducer";

export const maxDuration = 15;

/**
 * The only way an interaction reaches state.
 *
 * Everything arriving here is validated against the whitelist in events.ts
 * before it touches the database. An event SHAPE that is not in that file
 * cannot be written, whatever the client or a creative model sends.
 *
 * What this handler does NOT do, so nobody builds on a guarantee that is not
 * here (docs/interaction-engine-readiness-audit.md §3.4, §3.5, §3.6):
 *   - it does not verify blockId against a real block — it cannot, no message
 *     is stored server-side;
 *   - it does not verify that an EVIDENCE_PINNED excerpt occurs in any message;
 *   - it does not compare caseVersion, so it never returns 409.
 * RLS is what keeps rows confined to their owner; none of the above is.
 */
export async function POST(req: NextRequest) {
  const supabase = await getServerSupabase();
  if (!supabase) return NextResponse.json({ error: "Not configured" }, { status: 503 });

  let body: { conversationId?: string; event?: unknown; caseVersion?: number };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const conversationId = String(body.conversationId ?? "").slice(0, 64);
  if (!conversationId) {
    return NextResponse.json({ error: "conversationId required" }, { status: 400 });
  }

  const event = validateEvent(body.event);
  if (!event) {
    // Deliberately not echoing the payload back — an invalid event is either a
    // bug or a probe, and neither benefits from a detailed rejection.
    return NextResponse.json({ error: "Unrecognised interaction" }, { status: 400 });
  }

  // Auth is checked AFTER shape validation, on purpose. Malformed input should
  // be rejected as malformed for everyone, not silently absorbed by the guest
  // path — otherwise a client bug looks like a working anonymous session and
  // the whitelist cannot be exercised without a login.
  const {
    data: { user },
  } = await supabase.auth.getUser();
  // Guests get a 200 with accepted:false rather than a 401: interactions are an
  // enhancement, and a guest ticking a box should see it tick. It just will not
  // survive the session.
  if (!user) return NextResponse.json({ accepted: false, reason: "anonymous" });

  const key = dedupeKey(event);
  const row = {
    user_id: user.id,
    conversation_id: conversationId,
    event_type: event.type,
    payload: event,
    // Stored for forward compatibility, never compared. See the column comment
    // in migration_interaction_events.sql for why it is not yet a real version.
    case_version: Number(body.caseVersion) || 0,
    dedupe_key: key,
  };

  // Idempotent where the event type says so: ticking the same box twice must
  // leave one row with the later value, not two rows that disagree.
  let { error } = key
    ? await supabase
        .from("interaction_events")
        .upsert(row, { onConflict: "user_id,conversation_id,dedupe_key" })
    : await supabase.from("interaction_events").insert(row);

  // ON CONFLICT cannot target a PARTIAL unique index, and an older deployment
  // of this schema had one. Rather than being wrong until the index is fixed
  // everywhere, fall back to update-then-insert for the dedupe case. Slower by
  // one round trip and only on that path, and it keeps a correct index from
  // being a deployment prerequisite.
  if (error && key && /ON CONFLICT/i.test(error.message)) {
    const { data: updated } = await supabase
      .from("interaction_events")
      .update({ payload: row.payload, case_version: row.case_version })
      .eq("conversation_id", conversationId)
      .eq("dedupe_key", key)
      .select("id");

    ({ error } = updated?.length
      ? { error: null }
      : await supabase.from("interaction_events").insert(row));
  }

  if (error) {
    console.error("interaction insert:", error.message);
    return NextResponse.json({ error: "Could not record that" }, { status: 500 });
  }

  const state = await loadCase(supabase, conversationId);
  return NextResponse.json({ accepted: true, caseVersion: state.version });
}

/** Rehydrate a conversation's interaction state on page load. */
export async function GET(req: NextRequest) {
  const supabase = await getServerSupabase();
  if (!supabase) return NextResponse.json({ state: null });

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ state: null });

  const conversationId = req.nextUrl.searchParams.get("conversationId");
  if (!conversationId) return NextResponse.json({ state: null });

  return NextResponse.json({ state: await loadCase(supabase, conversationId) });
}

async function loadCase(
  supabase: NonNullable<Awaited<ReturnType<typeof getServerSupabase>>>,
  conversationId: string
) {
  const { data } = await supabase
    .from("interaction_events")
    .select("id, conversation_id, payload, case_version, created_at")
    .eq("conversation_id", conversationId)
    .order("created_at", { ascending: true })
    .limit(500);

  const events: StoredEvent[] = (data ?? []).map((r) => ({
    id: r.id,
    conversationId: r.conversation_id,
    event: r.payload,
    caseVersion: r.case_version,
    createdAt: r.created_at,
  }));

  return deriveCase(events);
}
