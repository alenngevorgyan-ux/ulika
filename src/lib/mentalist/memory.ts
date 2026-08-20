import type { SupabaseClient } from "@supabase/supabase-js";
import { chatComplete } from "../ai/provider";

export interface MemoryRow {
  kind: "person" | "situation" | "pattern" | "goal" | "fact";
  subject: string;
  detail: string;
  confidence: "stated" | "inferred";
}

/** A situation goes stale after this long with no mention. */
const FOLLOW_UP_AFTER_HOURS = 20;

/**
 * Open situations he hasn't asked about recently.
 *
 * This is what turns a chat window into something that keeps track of you: he
 * opens by asking how the thing with your sister went, rather than greeting a
 * stranger. Deliberately conservative — one or two, never a status meeting.
 */
export async function loadFollowUps(
  supabase: SupabaseClient | null,
  userId: string | null
): Promise<{ subject: string; detail: string; id: string }[]> {
  if (!supabase || !userId) return [];

  const cutoff = new Date(Date.now() - FOLLOW_UP_AFTER_HOURS * 3600 * 1000).toISOString();

  const { data, error } = await supabase
    .from("mentalist_memory")
    .select("id, subject, detail, last_raised_at, updated_at")
    .eq("kind", "situation")
    .eq("status", "open")
    .lt("updated_at", cutoff)
    .or(`last_raised_at.is.null,last_raised_at.lt.${cutoff}`)
    .order("updated_at", { ascending: false })
    .limit(2);

  if (error || !data) return [];
  return data.map((r) => ({ id: r.id, subject: r.subject, detail: r.detail }));
}

/** Stamp so he doesn't ask about the same thing every single session. */
export async function markRaised(
  supabase: SupabaseClient | null,
  ids: string[]
): Promise<void> {
  if (!supabase || ids.length === 0) return;
  try {
    await supabase
      .from("mentalist_memory")
      .update({ last_raised_at: new Date().toISOString() })
      .in("id", ids);
  } catch {
    /* non-critical */
  }
}

/**
 * Load everything we know about this user and format it for the prompt.
 *
 * Returns "" for guests, or if the table isn't there yet — a missing migration
 * degrades to a forgetful Mentalist, never to a broken endpoint.
 */
export async function loadMemory(
  supabase: SupabaseClient | null,
  userId: string | null
): Promise<string> {
  if (!supabase || !userId) return "";

  const { data, error } = await supabase
    .from("mentalist_memory")
    .select("kind, subject, detail, confidence")
    .order("updated_at", { ascending: false })
    .limit(80);

  if (error || !data?.length) return "";

  const byKind: Record<string, string[]> = {};
  for (const row of data as MemoryRow[]) {
    const line =
      row.confidence === "inferred"
        ? `${row.subject}: ${row.detail} (your inference, not something they stated)`
        : `${row.subject}: ${row.detail}`;
    (byKind[row.kind] ??= []).push(line);
  }

  const label: Record<string, string> = {
    person: "People in their life",
    situation: "Live situations",
    pattern: "Patterns you've noticed in how they operate",
    goal: "What they said they want",
    fact: "Stable facts",
  };

  return Object.entries(byKind)
    .map(([kind, lines]) => `${label[kind] ?? kind}\n${lines.join("\n")}`)
    .join("\n\n");
}

const EXTRACT_PROMPT = `Extract durable facts from this exchange for a mentor's long-term memory.

Return ONLY a JSON array. Each item: {"kind","subject","detail","confidence"}
kind is one of: person, situation, pattern, goal, fact
confidence is "stated" if the user said it outright, "inferred" if you concluded it.

Rules:
- Only things worth remembering months from now. Not pleasantries, not the mechanics of this exchange.
- subject is a short stable key: a name, "the funding round", "avoids direct conflict".
- detail is one sentence.
- If nothing is worth storing, return []
- Never invent. If a name wasn't given, don't guess one.`;

/**
 * Pull new durable facts out of an exchange.
 *
 * Runs on the cheap tier deliberately — this is extraction, not conversation,
 * and paying frontier rates for it would double the cost of every message.
 */
export async function extractMemory(
  userMessage: string,
  assistantReply: string
): Promise<MemoryRow[]> {
  try {
    const { message } = await chatComplete(
      [
        { role: "system", content: EXTRACT_PROMPT },
        { role: "user", content: `USER: ${userMessage}\n\nMENTOR: ${assistantReply}` },
      ],
      { temperature: 0, model: "google/gemini-3.1-flash-lite" }
    );

    const raw = (message.content ?? "").trim();
    const start = raw.indexOf("[");
    const end = raw.lastIndexOf("]");
    if (start === -1 || end === -1) return [];

    const parsed = JSON.parse(raw.slice(start, end + 1));
    if (!Array.isArray(parsed)) return [];

    const kinds = new Set(["person", "situation", "pattern", "goal", "fact"]);
    return parsed
      .filter(
        (r) =>
          r &&
          kinds.has(r.kind) &&
          typeof r.subject === "string" &&
          r.subject.trim() &&
          typeof r.detail === "string" &&
          r.detail.trim()
      )
      .slice(0, 8)
      .map((r) => ({
        kind: r.kind,
        subject: String(r.subject).slice(0, 120),
        detail: String(r.detail).slice(0, 500),
        confidence: r.confidence === "inferred" ? "inferred" : "stated",
      }));
  } catch {
    // Memory extraction must never break the conversation it observes.
    return [];
  }
}

export async function saveMemory(
  supabase: SupabaseClient | null,
  userId: string | null,
  rows: MemoryRow[]
): Promise<void> {
  if (!supabase || !userId || rows.length === 0) return;
  try {
    await supabase.from("mentalist_memory").upsert(
      rows.map((r) => ({ ...r, user_id: userId, updated_at: new Date().toISOString() })),
      { onConflict: "user_id,kind,subject" }
    );
  } catch {
    /* memory is an enhancement, never a hard dependency */
  }
}
