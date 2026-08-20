"use client";

import { useState } from "react";
import { getBrowserSupabase } from "@/lib/supabase/client";
import { classify, rejectionReason, type LicenceClass } from "@/lib/knowledge/whitelist";

export interface SourceRow {
  id: string;
  title: string;
  author: string | null;
  type: string;
  category_id: string;
  evidence_grade: "A" | "B" | "C" | "D" | null;
  acquisition_method: string | null;
  licence: LicenceClass;
  source_url: string | null;
  licence_note: string | null;
}

const GRADE_COLOR: Record<string, string> = {
  A: "text-emerald-400",
  B: "text-sky-400",
  C: "text-amber-400",
  D: "text-muted",
};

const METHODS = [
  { id: "public_domain", label: "Public domain" },
  { id: "open_courseware", label: "Open courseware" },
  { id: "open_access_research", label: "Open access research" },
  { id: "author_released_free", label: "Author released free" },
  { id: "user_uploaded", label: "Uploaded by me" },
];

export default function SourceManager({
  initial,
  chunkCounts,
  userId,
}: {
  initial: SourceRow[];
  chunkCounts: Record<string, number>;
  userId: string;
}) {
  const [sources] = useState(initial);
  const [url, setUrl] = useState("");
  const [title, setTitle] = useState("");
  const [author, setAuthor] = useState("");
  const [category, setCategory] = useState("psychology");
  const [method, setMethod] = useState("open_access_research");
  const [status, setStatus] = useState("");

  const rejected = url.trim() ? rejectionReason(url.trim()) : null;
  const matched = url.trim() && !rejected ? classify(url.trim()) : null;
  const offWhitelist = Boolean(url.trim()) && !rejected && !matched;

  async function add() {
    const supabase = getBrowserSupabase();
    if (!supabase || !title.trim()) return;

    if (offWhitelist && method !== "user_uploaded") {
      setStatus("That domain is not on the whitelist. Upload the file manually instead.");
      return;
    }

    const id = title.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").slice(0, 60);
    const { error } = await supabase.from("knowledge_sources").insert({
      id,
      category_id: category,
      title: title.trim(),
      author: author.trim() || null,
      type: "book",
      acquisition_method: method,
      licence: matched?.licence ?? "reference_only",
      source_url: url.trim() || null,
      licence_note: matched?.basis ?? "Off-whitelist upload — treated as reference only.",
      added_by: userId,
    });

    setStatus(
      error
        ? `Could not add it: ${error.message}`
        : `Added. ${matched?.licence === "redistributable" ? "Text may be stored." : "Notes and citation only — do not store its text."}`
    );
    if (!error) {
      setTitle("");
      setAuthor("");
      setUrl("");
    }
  }

  return (
    <>
      <section className="bg-panel border border-panel-border rounded-lg p-6 mb-10">
        <h2 className="font-display text-lg mb-5">Add a source</h2>

        <div className="space-y-4">
          <div>
            <label className="block text-xs text-muted mb-1.5">
              URL (leave empty for a file you upload yourself)
            </label>
            <input
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://www.gutenberg.org/ebooks/2680"
              className="w-full bg-background border border-panel-border rounded-md px-4 py-2.5 text-sm outline-none focus:border-accent"
            />
            {rejected && <p className="text-xs text-red-400 mt-2 leading-relaxed">{rejected}</p>}
            {matched && (
              <p className="text-xs text-muted mt-2 leading-relaxed">
                <span
                  className={
                    matched.licence === "redistributable" ? "text-accent" : "text-amber-400"
                  }
                >
                  {matched.label} —{" "}
                  {matched.licence === "redistributable"
                    ? "text may be stored"
                    : "notes and citation only"}
                </span>
                . {matched.basis}
              </p>
            )}
            {offWhitelist && (
              <p className="text-xs text-amber-400 mt-2 leading-relaxed">
                Not a whitelisted domain. Nothing will be fetched from it — add it as an upload and
                supply the file yourself.
              </p>
            )}
          </div>

          <div className="grid sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs text-muted mb-1.5">Title</label>
              <input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className="w-full bg-background border border-panel-border rounded-md px-4 py-2.5 text-sm outline-none focus:border-accent"
              />
            </div>
            <div>
              <label className="block text-xs text-muted mb-1.5">Author</label>
              <input
                value={author}
                onChange={(e) => setAuthor(e.target.value)}
                className="w-full bg-background border border-panel-border rounded-md px-4 py-2.5 text-sm outline-none focus:border-accent"
              />
            </div>
          </div>

          <div className="grid sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs text-muted mb-1.5">Shelf</label>
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                className="w-full bg-background border border-panel-border rounded-md px-4 py-2.5 text-sm outline-none focus:border-accent"
              >
                <option value="craft">The mentalist&apos;s craft</option>
                <option value="psychology">Psychology</option>
                <option value="learning">Learning</option>
              </select>
            </div>
            <div>
              <label className="block text-xs text-muted mb-1.5">How we got it</label>
              <select
                value={method}
                onChange={(e) => setMethod(e.target.value)}
                className="w-full bg-background border border-panel-border rounded-md px-4 py-2.5 text-sm outline-none focus:border-accent"
              >
                {METHODS.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <button
            onClick={add}
            disabled={!title.trim() || Boolean(rejected)}
            className="bg-accent text-background font-medium px-5 py-2.5 rounded-md text-sm hover:opacity-90 transition-opacity disabled:opacity-40"
          >
            Add source
          </button>
          {status && <p className="text-xs text-muted leading-relaxed">{status}</p>}
        </div>
      </section>

      <section>
        <h2 className="font-display text-lg mb-4">In the library ({sources.length})</h2>
        <div className="space-y-2">
          {sources.map((s) => (
            <div key={s.id} className="bg-panel border border-panel-border rounded-lg p-4">
              <div className="flex items-start justify-between gap-3 flex-wrap">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-medium">{s.title}</span>
                    {s.evidence_grade && (
                      <span
                        className={`font-mono text-[10px] uppercase tracking-wider ${GRADE_COLOR[s.evidence_grade]}`}
                      >
                        grade {s.evidence_grade}
                      </span>
                    )}
                    {s.licence === "reference_only" && (
                      <span className="font-mono text-[10px] uppercase tracking-wider text-amber-400">
                        notes only
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-muted mt-1">
                    {s.category_id}
                    {s.author ? ` · ${s.author}` : ""}
                    {s.acquisition_method ? ` · ${s.acquisition_method.replace(/_/g, " ")}` : ""}
                  </p>
                </div>
                <span className="font-mono text-xs text-muted shrink-0">
                  {chunkCounts[s.id] ?? 0} chunks
                </span>
              </div>
            </div>
          ))}
        </div>
      </section>
    </>
  );
}
