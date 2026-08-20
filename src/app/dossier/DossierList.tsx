"use client";

import { useState } from "react";
import { getBrowserSupabase } from "@/lib/supabase/client";

export interface DossierRow {
  id: string;
  kind: "person" | "situation" | "pattern" | "goal" | "fact";
  subject: string;
  detail: string;
  confidence: "stated" | "inferred";
  status: "open" | "closed";
  updated_at: string;
}

const GROUPS: { kind: DossierRow["kind"]; label: string; blurb: string }[] = [
  { kind: "person", label: "People", blurb: "Who comes up when you talk." },
  { kind: "situation", label: "Open situations", blurb: "Things he hasn't heard the end of." },
  { kind: "pattern", label: "Patterns", blurb: "How you tend to operate. His read, not fact." },
  { kind: "goal", label: "What you said you want", blurb: "" },
  { kind: "fact", label: "Background", blurb: "" },
];

export default function DossierList({ rows }: { rows: DossierRow[] }) {
  const [state, setState] = useState(rows);

  async function remove(id: string) {
    const supabase = getBrowserSupabase();
    if (!supabase) return;
    setState((prev) => prev.filter((r) => r.id !== id));
    await supabase.from("mentalist_memory").delete().eq("id", id);
  }

  async function toggleStatus(row: DossierRow) {
    const supabase = getBrowserSupabase();
    if (!supabase) return;
    const next = row.status === "open" ? "closed" : "open";
    setState((prev) => prev.map((r) => (r.id === row.id ? { ...r, status: next } : r)));
    await supabase.from("mentalist_memory").update({ status: next }).eq("id", row.id);
  }

  return (
    <div className="space-y-10">
      {GROUPS.map((group) => {
        const items = state.filter((r) => r.kind === group.kind);
        if (items.length === 0) return null;

        return (
          <section key={group.kind}>
            <h2 className="font-display text-lg mb-1">{group.label}</h2>
            {group.blurb && <p className="text-xs text-muted mb-4">{group.blurb}</p>}

            <div className="space-y-2">
              {items.map((row) => (
                <div
                  key={row.id}
                  className="group bg-panel border border-panel-border rounded-lg px-4 py-3 flex items-start gap-3"
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap mb-1">
                      <span className="text-sm font-medium">{row.subject}</span>
                      {row.confidence === "inferred" && (
                        <span className="font-mono text-[10px] uppercase tracking-wider text-muted">
                          inferred
                        </span>
                      )}
                      {row.kind === "situation" && row.status === "closed" && (
                        <span className="font-mono text-[10px] uppercase tracking-wider text-muted">
                          closed
                        </span>
                      )}
                    </div>
                    <p
                      className={`text-sm leading-relaxed ${
                        row.status === "closed" ? "text-muted line-through" : "text-muted"
                      }`}
                    >
                      {row.detail}
                    </p>
                  </div>

                  <div className="flex items-center gap-3 shrink-0">
                    {row.kind === "situation" && (
                      <button
                        onClick={() => toggleStatus(row)}
                        className="text-[10px] font-mono uppercase tracking-wider text-muted hover:text-accent transition-colors"
                      >
                        {row.status === "open" ? "Done" : "Reopen"}
                      </button>
                    )}
                    <button
                      onClick={() => remove(row.id)}
                      className="opacity-0 group-hover:opacity-100 text-muted hover:text-foreground transition-opacity"
                      aria-label="Forget this"
                    >
                      ×
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </section>
        );
      })}
    </div>
  );
}
