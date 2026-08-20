"use client";

import { useState, useEffect } from "react";
import { getBrowserSupabase } from "@/lib/supabase/client";

const SESSION_KEY = "ulika-feedback-asked";

/**
 * One quiet question, after something was actually finished.
 *
 * Deliberately constrained: fires only after a real completion (a lesson
 * finished, a situation closed), once per session, dismissible, and never
 * blocking. Asking before someone has done anything gets you politeness;
 * asking repeatedly gets you resentment and then silence.
 *
 * The rating is optional on purpose. A required star rating collects a number
 * and loses the sentence, and the sentence is the part worth having.
 */
export default function FeedbackPrompt({ page }: { page: string }) {
  const [visible, setVisible] = useState(false);
  const [rating, setRating] = useState<number | null>(null);
  const [comment, setComment] = useState("");
  const [sent, setSent] = useState(false);

  useEffect(() => {
    try {
      if (sessionStorage.getItem(SESSION_KEY)) return;
    } catch {
      return;
    }
    // A short beat after the completion, so it does not collide with whatever
    // just finished.
    const t = setTimeout(() => setVisible(true), 1200);
    return () => clearTimeout(t);
  }, []);

  function close() {
    setVisible(false);
    try {
      sessionStorage.setItem(SESSION_KEY, "1");
    } catch {
      /* private mode — it will ask once more next session, which is acceptable */
    }
  }

  async function send() {
    close();
    setSent(true);
    const supabase = getBrowserSupabase();
    if (!supabase) return;
    const { data } = await supabase.auth.getUser();
    if (!data.user) return;
    await supabase.from("feedback_events").insert({
      user_id: data.user.id,
      page,
      rating,
      comment: comment.trim() || null,
    });
  }

  if (!visible && !sent) return null;

  if (sent) {
    return (
      <p className="text-xs text-muted mt-6">Noted. That is genuinely useful.</p>
    );
  }

  return (
    <div
      className="rounded-lg border p-5 mt-8 ulika-reveal"
      style={{ background: "var(--panel)", borderColor: "var(--line)" }}
    >
      <div className="flex items-start justify-between gap-4 mb-3">
        <p className="text-sm">Was that any use?</p>
        <button
          onClick={close}
          className="text-muted hover:text-foreground transition-colors text-sm shrink-0"
          aria-label="Dismiss"
        >
          ×
        </button>
      </div>

      <div className="flex gap-1.5 mb-3">
        {[1, 2, 3, 4, 5].map((n) => (
          <button
            key={n}
            onClick={() => setRating(n)}
            className="w-8 h-8 rounded-md border text-xs"
            style={{
              borderColor: rating === n ? "var(--accent-brass)" : "var(--line)",
              color: rating === n ? "var(--accent-brass)" : "var(--muted)",
              background: rating === n ? "color-mix(in srgb, var(--accent-brass) 10%, transparent)" : "transparent",
              transition: "border-color var(--dur-micro) var(--ease-expo-out)",
            }}
            aria-label={`${n} out of 5`}
          >
            {n}
          </button>
        ))}
      </div>

      <textarea
        value={comment}
        onChange={(e) => setComment(e.target.value)}
        rows={2}
        placeholder="What was wrong with it? That's more useful than what was right."
        className="w-full bg-background border border-panel-border rounded-md px-3 py-2 text-sm outline-none focus:border-accent resize-none mb-3"
      />

      <div className="flex gap-4">
        <button
          onClick={send}
          disabled={!rating && !comment.trim()}
          className="text-sm text-accent hover:opacity-80 disabled:opacity-40"
        >
          Send it
        </button>
        <button
          onClick={close}
          className="text-sm text-muted hover:text-foreground transition-colors"
        >
          Not now
        </button>
      </div>
    </div>
  );
}
