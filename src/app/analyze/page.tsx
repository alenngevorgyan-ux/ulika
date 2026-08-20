"use client";

import { useState } from "react";

interface Line {
  quote: string;
  who: "them" | "you";
  reading: string;
  confidence: "strong" | "tentative";
}

interface Result {
  lines: Line[];
  patterns: string[];
  missing: string[];
  read: string;
  next: string;
  droppedQuotes: number;
}

export default function AnalyzePage() {
  const [text, setText] = useState("");
  const [context, setContext] = useState("");
  const [result, setResult] = useState<Result | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function run() {
    if (text.trim().length < 40 || loading) return;
    setLoading(true);
    setError("");
    setResult(null);
    try {
      const res = await fetch("/api/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text, context }),
      });
      const data = await res.json();
      if (!res.ok) setError(data.error ?? "Something went wrong.");
      else setResult(data);
    } catch {
      setError("Couldn't reach the server.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="mx-auto max-w-3xl px-6 py-14">
      <h1 className="font-display text-3xl mb-3">Read a conversation</h1>
      <p className="text-muted mb-10 max-w-xl leading-relaxed">
        Paste a real exchange — messages, email, a transcript. You get a reading of the actual
        wording on both sides, including yours. Nothing is stored.
      </p>

      <div className="space-y-4 mb-6">
        <div>
          <label className="block text-xs text-muted mb-1.5">
            Who are these people and what&apos;s it about? (optional, but it sharpens the read)
          </label>
          <input
            value={context}
            onChange={(e) => setContext(e.target.value)}
            placeholder="my landlord, about a deposit he hasn't returned"
            className="w-full bg-panel border border-panel-border rounded-md px-4 py-2.5 text-sm outline-none focus:border-accent"
          />
        </div>

        <div>
          <label className="block text-xs text-muted mb-1.5">The conversation</label>
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={12}
            placeholder={"Them: hey, sorry, going to have to move Friday again\nMe: ok. third time though\nThem: I know, work is insane right now"}
            className="w-full bg-panel border border-panel-border rounded-md px-4 py-3 text-sm outline-none focus:border-accent resize-y font-mono leading-relaxed"
          />
        </div>
      </div>

      <button
        onClick={run}
        disabled={loading || text.trim().length < 40}
        className="bg-accent text-background font-medium px-6 py-3 rounded-md text-sm hover:opacity-90 transition-opacity disabled:opacity-40"
      >
        {loading ? "Reading…" : "Read it"}
      </button>

      {error && <p className="text-sm text-red-400 mt-4">{error}</p>}

      {result && (
        <div className="mt-14 space-y-10">
          {result.lines.length > 0 && (
            <section>
              <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-accent mb-4">
                Line by line
              </p>
              <div className="space-y-4">
                {result.lines.map((l, i) => (
                  <div key={i} className="border-l-2 border-panel-border pl-4">
                    <div className="flex items-center gap-2 mb-1.5">
                      <span className="font-mono text-[10px] uppercase tracking-wider text-muted">
                        {l.who === "you" ? "you" : "them"}
                      </span>
                      {l.confidence === "tentative" && (
                        <span className="font-mono text-[10px] uppercase tracking-wider text-muted/70">
                          · tentative
                        </span>
                      )}
                    </div>
                    <p className="text-sm mb-1.5 text-foreground/70 italic">&ldquo;{l.quote}&rdquo;</p>
                    <p className="text-sm leading-relaxed">{l.reading}</p>
                  </div>
                ))}
              </div>
            </section>
          )}

          {result.patterns.length > 0 && (
            <Section title="Patterns" items={result.patterns} />
          )}
          {result.missing.length > 0 && (
            <Section title="What isn't there" items={result.missing} />
          )}

          {result.read && (
            <section>
              <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-accent mb-3">
                My read
              </p>
              <p className="text-sm leading-relaxed">{result.read}</p>
            </section>
          )}

          {result.next && (
            <section className="bg-panel border border-accent/40 rounded-lg p-5">
              <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-accent mb-2">
                Next
              </p>
              <p className="text-sm leading-relaxed">{result.next}</p>
            </section>
          )}

          <p className="text-xs text-muted border-t border-panel-border pt-5 leading-relaxed">
            This is inference from wording, and inference is often wrong. It tells you where to ask
            a better question. It does not tell you what anyone actually meant, and it is not
            evidence of anything.
          </p>
        </div>
      )}
    </div>
  );
}

function Section({ title, items }: { title: string; items: string[] }) {
  return (
    <section>
      <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-accent mb-3">{title}</p>
      <div className="space-y-2">
        {items.map((t, i) => (
          <p key={i} className="text-sm leading-relaxed pl-3 border-l border-accent/30">
            {t}
          </p>
        ))}
      </div>
    </section>
  );
}
