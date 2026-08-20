"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import ReplyBlocks from "@/components/chat/ReplyBlocks";
import ThinkingIndicator from "@/components/chat/ThinkingIndicator";
import { ModeIndicator } from "@/components/chat/primitives";
import { parseBlocks } from "@/lib/mentalist/parseBlocks";

interface Message {
  role: "user" | "assistant";
  content: string;
}

interface Conversation {
  id: string;
  title: string;
  messages: Message[];
  updatedAt: number;
  /** Sticky for the session once the detector fires — see the container below. */
  crisis?: boolean;
  mode?: "exploring" | "advising";
}

const STORAGE_KEY = "ulika-conversations";

const OPENER: Message = {
  role: "assistant",
  content:
    "Tell me what's actually going on, or tell me what you want to get better at. Either works. I'd rather have the messy version than the tidied-up one.",
};

function newConversation(): Conversation {
  return {
    id: crypto.randomUUID(),
    title: "New conversation",
    messages: [OPENER],
    updatedAt: Date.now(),
  };
}

/** First user message becomes the title — that's what people scan for. */
function titleFrom(messages: Message[]): string {
  const first = messages.find((m) => m.role === "user");
  if (!first) return "New conversation";
  const t = first.content.trim().replace(/\s+/g, " ");
  return t.length > 42 ? t.slice(0, 42) + "…" : t;
}

export default function ChatPage() {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  // Load history once on mount.
  useEffect(() => {
    let loaded: Conversation[] = [];
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) loaded = JSON.parse(raw);
    } catch {
      /* corrupted history should not brick the page */
    }
    if (loaded.length === 0) loaded = [newConversation()];
    // One-shot hydration from an external store on mount. See LessonPlayer.
    /* eslint-disable react-hooks/set-state-in-effect */
    setConversations(loaded);
    setActiveId(loaded[0].id);
    /* eslint-enable react-hooks/set-state-in-effect */
  }, []);

  const persist = useCallback((next: Conversation[]) => {
    setConversations(next);
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    } catch {
      /* quota exceeded — session still works, history just won't survive */
    }
  }, []);

  const active = conversations.find((c) => c.id === activeId) ?? null;

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [active?.messages.length, loading]);

  async function send() {
    const text = input.trim();
    if (!text || loading || !active) return;

    const nextMessages = [...active.messages, { role: "user" as const, content: text }];
    const withUser = conversations.map((c) =>
      c.id === active.id
        ? { ...c, messages: nextMessages, title: titleFrom(nextMessages), updatedAt: Date.now() }
        : c
    );
    persist(withUser);
    setInput("");
    setLoading(true);

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: nextMessages }),
      });
      const data = await res.json();
      const reply = data.reply || "Nothing came back. Try again.";
      const wasCrisis = Boolean(data.crisis);
      const done = [...nextMessages, { role: "assistant" as const, content: reply }];
      persist(
        withUser.map((c) =>
          c.id === active.id
            ? {
                ...c,
                messages: done,
                updatedAt: Date.now(),
                // Sticky: once a serious disclosure has happened, the decorative
                // layer stays down for the rest of this conversation rather than
                // springing back on the next ordinary message.
                crisis: c.crisis || wasCrisis,
                mode: data.mode ?? c.mode,
              }
            : c
        )
      );
    } catch {
      const done = [
        ...nextMessages,
        { role: "assistant" as const, content: "Couldn't reach me just now. Check your connection." },
      ];
      persist(
        withUser.map((c) =>
          c.id === active.id ? { ...c, messages: done, updatedAt: Date.now() } : c
        )
      );
    } finally {
      setLoading(false);
    }
  }

  function startNew() {
    const c = newConversation();
    persist([c, ...conversations]);
    setActiveId(c.id);
  }

  function remove(id: string) {
    const next = conversations.filter((c) => c.id !== id);
    const safe = next.length ? next : [newConversation()];
    persist(safe);
    if (id === activeId) setActiveId(safe[0].id);
  }

  return (
    <div
      className="mx-auto max-w-6xl px-6 py-8 flex gap-6 h-[calc(100vh-73px)]"
      data-crisis={active?.crisis ? "true" : undefined}
      style={{
        // A 2-3% tonal shift, not a colour change. Nobody should be able to
        // name it; they should just feel the register is different.
        ["--mode-tint" as string]:
          active?.crisis
            ? "transparent"
            : active?.mode === "advising"
              ? "color-mix(in srgb, var(--accent-brass) 3%, transparent)"
              : "color-mix(in srgb, var(--accent-teal) 3%, transparent)",
        background: "var(--mode-tint)",
      }}
    >
      {/* Conversation */}
      <div className="flex-1 flex flex-col min-w-0">
        <h1 className="font-display text-2xl mb-1">The Mentalist</h1>
        <p className="text-xs text-muted mb-6">
          Twenty years reading people for a living. Now teaching you how it&apos;s done.
        </p>

        <div className="flex-1 overflow-y-auto space-y-4 mb-4 pr-1">
          {active?.messages.map((m, i) => (
            <div
              key={i}
              className={`rounded-lg px-4 py-3 ${
                m.role === "user"
                  ? "ml-auto max-w-[80%] bg-accent text-background text-sm leading-relaxed whitespace-pre-wrap"
                  : "max-w-[92%] bg-panel border border-panel-border"
              }`}
            >
              {m.role === "user" ? (
                m.content
              ) : (
                <>
                  {!active?.crisis && active?.mode && i === (active?.messages.length ?? 0) - 1 && (
                    <div className="flex justify-end mb-2">
                      <ModeIndicator mode={active.mode} />
                    </div>
                  )}
                  <ReplyBlocks
                    blocks={parseBlocks(m.content).blocks}
                    crisis={Boolean(active?.crisis)}
                  />
                </>
              )}
            </div>
          ))}
          {loading && (
            <div className="bg-panel border border-panel-border rounded-lg px-4 py-3 max-w-[90%]">
              <ThinkingIndicator crisis={Boolean(active?.crisis)} />
            </div>
          )}
          <div ref={bottomRef} />
        </div>

        <div className="flex gap-2">
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && send()}
            placeholder="Say it plainly."
            className="flex-1 bg-panel border border-panel-border rounded-md px-4 py-3 text-sm outline-none focus:border-accent"
          />
          <button
            onClick={send}
            disabled={loading}
            className="bg-accent text-background font-medium px-5 py-3 rounded-md text-sm hover:opacity-90 transition-opacity disabled:opacity-50"
          >
            Send
          </button>
        </div>
      </div>

      {/* History rail */}
      <aside className="w-60 shrink-0 hidden md:flex flex-col border-l border-panel-border pl-5">
        <div className="flex items-center justify-between mb-4">
          <span className="font-mono text-xs uppercase tracking-wider text-muted">History</span>
          <button
            onClick={startNew}
            className="text-xs text-accent hover:opacity-80 transition-opacity"
          >
            + New
          </button>
        </div>

        <div className="flex-1 overflow-y-auto space-y-1">
          {[...conversations]
            .sort((a, b) => b.updatedAt - a.updatedAt)
            .map((c) => (
              <div
                key={c.id}
                className={`group flex items-start gap-2 rounded-md px-3 py-2 cursor-pointer transition-colors ${
                  c.id === activeId ? "bg-panel border border-panel-border" : "hover:bg-panel/60"
                }`}
                onClick={() => setActiveId(c.id)}
              >
                <p className="flex-1 text-xs leading-snug text-foreground/80 line-clamp-2">
                  {c.title}
                </p>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    remove(c.id);
                  }}
                  className="opacity-0 group-hover:opacity-100 text-muted hover:text-foreground text-xs transition-opacity shrink-0"
                  aria-label="Delete conversation"
                >
                  ×
                </button>
              </div>
            ))}
        </div>
      </aside>
    </div>
  );
}
