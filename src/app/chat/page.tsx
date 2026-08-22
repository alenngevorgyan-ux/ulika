"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import ReplyBlocks from "@/components/chat/ReplyBlocks";
import ThinkingIndicator from "@/components/chat/ThinkingIndicator";
import { ModeIndicator } from "@/components/chat/primitives";
import { parseBlocks } from "@/lib/mentalist/parseBlocks";
import { useCaseState } from "@/lib/interaction/useCaseState";
import { useT } from "@/lib/i18n/useT";

interface Message {
  role: "user" | "assistant";
  content: string;
  source?: "chat" | "megabrain";
}

type ChatAnalysisMode = "normal" | "light" | "standard" | "strong" | "deep";

interface CaseFlowView {
  id: string;
  phase: "intake" | "awaiting_answers" | "analysing" | "completed" | "failed";
  mode: Exclude<ChatAnalysisMode, "normal" | "deep">;
  questions: { id: string; question: string; options: string[] }[];
  answer: string | null;
  followUps: { action: string; answer: string }[];
  safeError: string | null;
}

interface Conversation {
  id: string;
  title: string;
  messages: Message[];
  updatedAt: number;
  /** Sticky for the session once the detector fires — see the container below. */
  crisis?: boolean;
  mode?: "exploring" | "advising";
  analysisMode?: ChatAnalysisMode;
  caseFlow?: CaseFlowView;
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
    analysisMode: "normal",
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
  const [caseAnswers, setCaseAnswers] = useState<Record<string, string>>({});
  const [customAnswers, setCustomAnswers] = useState<Record<string, string>>({});
  const bottomRef = useRef<HTMLDivElement>(null);
  const sendInFlight = useRef(false);
  const { t, locale } = useT();

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

  const persist = useCallback((nextOrUpdate: Conversation[] | ((current: Conversation[]) => Conversation[])) => {
    setConversations((current) => {
      const next = typeof nextOrUpdate === "function" ? nextOrUpdate(current) : nextOrUpdate;
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      } catch {
        /* quota exceeded — session still works, history just won't survive */
      }
      return next;
    });
  }, []);

  const active = conversations.find((c) => c.id === activeId) ?? null;
  const { state: caseState, stale, send: sendEvent } = useCaseState(activeId);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [active?.messages.length, loading]);

  // Restore server-owned flow state after a browser refresh. The private case
  // text is not returned; it is already present in the user's local conversation.
  useEffect(() => {
    const flowId = active?.caseFlow?.id;
    if (!flowId) return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const refresh = async () => {
      try {
        const r = await fetch(`/api/megabrain-case?flowId=${encodeURIComponent(flowId)}`);
        const data = r.ok ? await r.json() : null;
        if (cancelled || !data?.flow) return;
        const flow = data.flow as CaseFlowView;
        persist((current) => current.map((c) => {
          if (c.id !== active.id) return c;
          const hasAnswer = flow.answer && c.messages.some((m) => m.source === "megabrain" && m.content === flow.answer);
          return {
            ...c,
            caseFlow: flow,
            messages: flow.phase === "completed" && flow.answer && !hasAnswer
              ? [...c.messages, { role: "assistant", source: "megabrain", content: flow.answer }]
              : c.messages,
          };
        }));
        if (flow.phase === "intake" || flow.phase === "analysing") {
          timer = setTimeout(refresh, 1_000);
        }
      } catch {
        /* the normal chat remains usable if the ephemeral flow expired */
      }
    };
    void refresh();
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
    // Refresh only when the active flow identity changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active?.caseFlow?.id]);

  function updateConversation(id: string, update: (c: Conversation) => Conversation) {
    persist((current) => current.map((c) => c.id === id ? update(c) : c));
  }

  function applyCaseFlow(conversation: Conversation, flow: CaseFlowView, extraMessages: Message[] = [], updatedAt = conversation.updatedAt): Conversation {
    return {
      ...conversation,
      caseFlow: flow,
      messages: [...conversation.messages, ...extraMessages],
      updatedAt,
    };
  }

  async function send() {
    const text = input.trim();
    if (!text || loading || sendInFlight.current || !active) return;
    sendInFlight.current = true;

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
      const selectedMode = active.analysisMode ?? "normal";
      const res = await fetch(selectedMode === "normal" ? "/api/chat" : "/api/megabrain-case", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(selectedMode === "normal"
          ? { messages: nextMessages, conversationId: active.id, locale }
          : {
              action: "create",
              requestId: crypto.randomUUID(),
              conversationId: active.id,
              account: text,
              mode: selectedMode,
              responseLanguage: locale,
              jurisdiction: { country: "unknown" },
            }),
      });
      const data = await res.json();
      if (selectedMode !== "normal") {
        if (!res.ok || !data.flow) {
          const errorText = data.error === "AUTH_REQUIRED"
            ? "Войдите в аккаунт, чтобы открыть стратегическое дело. Обычный чат доступен без входа."
            : "Не удалось продолжить стратегическое дело. Попробуйте ещё раз.";
          persist(withUser.map((c) => c.id === active.id
            ? { ...c, messages: [...nextMessages, { role: "assistant", source: "megabrain", content: errorText }], updatedAt: Date.now() }
            : c));
          return;
        }
        const flow = data.flow as CaseFlowView;
        const extra: Message[] = flow.phase === "completed" && flow.answer
          ? [{ role: "assistant", source: "megabrain", content: flow.answer }]
          : [];
        const updatedAt = active.updatedAt + 1;
        persist(withUser.map((c) => c.id === active.id ? applyCaseFlow(c, flow, extra, updatedAt) : c));
        setCaseAnswers({});
        setCustomAnswers({});
        return;
      }
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
      sendInFlight.current = false;
      setLoading(false);
    }
  }

  async function continueCase(action: "answer" | "skip") {
    if (!active?.caseFlow || loading || sendInFlight.current) return;
    sendInFlight.current = true;
    setLoading(true);
    try {
      const answers = Object.fromEntries(active.caseFlow.questions.map((q) => {
        const selected = caseAnswers[q.id];
        return [q.id, selected === "__other" ? (customAnswers[q.id] ?? "") : (selected ?? "")];
      }).filter(([, value]) => String(value).trim()));
      const res = await fetch("/api/megabrain-case", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action,
          requestId: crypto.randomUUID(),
          flowId: active.caseFlow.id,
          ...(action === "answer" ? { answers } : {}),
        }),
      });
      const data = await res.json();
      if (!data.flow) return;
      const flow = data.flow as CaseFlowView;
      const answerSummary = action === "skip"
        ? "Продолжить без уточнений."
        : Object.values(answers).join(" · ");
      const extra: Message[] = [
        { role: "user", source: "megabrain", content: answerSummary },
        ...(flow.phase === "completed" && flow.answer
          ? [{ role: "assistant" as const, source: "megabrain" as const, content: flow.answer }]
          : []),
        ...(flow.phase === "failed"
          ? [{ role: "assistant" as const, source: "megabrain" as const, content: "Разбор остановлен безопасно. Новый модельный вызов автоматически не выполнялся." }]
          : []),
      ];
      const updatedAt = active.updatedAt + 1;
      updateConversation(active.id, (c) => applyCaseFlow(c, flow, extra, updatedAt));
      setCaseAnswers({});
      setCustomAnswers({});
    } finally {
      sendInFlight.current = false;
      setLoading(false);
    }
  }

  async function caseFollowUp(action: string) {
    if (!active?.caseFlow || loading || sendInFlight.current) return;
    sendInFlight.current = true;
    setLoading(true);
    try {
      const res = await fetch("/api/megabrain-case", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "follow_up", requestId: crypto.randomUUID(), flowId: active.caseFlow.id, followUpAction: action }),
      });
      const data = await res.json();
      if (!data.flow) return;
      const flow = data.flow as CaseFlowView;
      const latest = flow.followUps[flow.followUps.length - 1];
      const updatedAt = active.updatedAt + 1;
      updateConversation(active.id, (c) => applyCaseFlow(c, flow, latest
        ? [{ role: "assistant", source: "megabrain", content: latest.answer }]
        : [], updatedAt));
    } finally {
      sendInFlight.current = false;
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
              ) : m.source === "megabrain" ? (
                <div className="text-sm leading-relaxed whitespace-pre-wrap">{m.content}</div>
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
                    conversationId={active?.id ?? ""}
                    messageIndex={i}
                    caseState={caseState}
                    onEvent={sendEvent}
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
          {active?.caseFlow?.phase === "awaiting_answers" && (
            <div className="bg-panel border border-panel-border rounded-lg px-4 py-4 max-w-[92%] space-y-4">
              <p className="text-sm font-medium">Несколько ответов действительно изменят первый ход.</p>
              {active.caseFlow.questions.map((q) => (
                <fieldset key={q.id} className="space-y-2">
                  <legend className="text-sm mb-2">{q.question}</legend>
                  <div className="flex flex-wrap gap-2">
                    {[...q.options, "Другое"].map((option) => {
                      const value = option === "Другое" ? "__other" : option;
                      return (
                        <button key={value} type="button" onClick={() => setCaseAnswers((a) => ({ ...a, [q.id]: value }))}
                          className={`text-xs rounded-full border px-3 py-1.5 ${caseAnswers[q.id] === value ? "border-accent text-accent" : "border-panel-border text-muted"}`}>
                          {option}
                        </button>
                      );
                    })}
                  </div>
                  {caseAnswers[q.id] === "__other" && (
                    <input value={customAnswers[q.id] ?? ""} onChange={(e) => setCustomAnswers((a) => ({ ...a, [q.id]: e.target.value }))}
                      placeholder="Ваш ответ" className="w-full bg-background border border-panel-border rounded-md px-3 py-2 text-sm" />
                  )}
                </fieldset>
              ))}
              <div className="flex flex-wrap gap-2">
                <button type="button" onClick={() => continueCase("answer")} disabled={loading}
                  className="bg-accent text-background rounded-md px-4 py-2 text-sm disabled:opacity-50">Продолжить</button>
                <button type="button" onClick={() => continueCase("skip")} disabled={loading}
                  className="border border-panel-border rounded-md px-4 py-2 text-sm text-muted disabled:opacity-50">Продолжить без уточнений</button>
              </div>
            </div>
          )}
          {active?.caseFlow?.phase === "completed" && !loading && (
            <div className="flex flex-wrap gap-2 max-w-[92%]">
              {[
                ["why", "Почему именно так?"], ["stronger", "Дай более сильный ход"],
                ["other_side", "Что ответит другая сторона?"], ["draft_message", "Составь сообщение"],
                ["what_we_got_wrong", "Что мы могли понять неправильно?"],
              ].map(([id, label]) => (
                <button key={id} type="button" onClick={() => caseFollowUp(id)}
                  className="text-xs border border-panel-border rounded-full px-3 py-1.5 text-muted hover:text-foreground">{label}</button>
              ))}
            </div>
          )}
          <div ref={bottomRef} />
        </div>

        {stale && (
          <p className="text-xs mb-2" style={{ color: "var(--danger)" }}>
            {t("state.stale")}
          </p>
        )}

        <div className="flex flex-wrap gap-2 mb-2">
          {[
            ["normal", "Обычный чат", true], ["light", "Быстро", true], ["standard", "Разобрать", true],
            ["strong", "Сильный ход", true], ["deep", "Глубокое дело", false],
          ].map(([id, label, available]) => (
            <button key={String(id)} type="button" disabled={!available || loading}
              onClick={() => active && updateConversation(active.id, (c) => ({ ...c, analysisMode: id as ChatAnalysisMode, caseFlow: undefined }))}
              className={`text-xs rounded-full border px-3 py-1.5 disabled:opacity-35 ${active?.analysisMode === id || (!active?.analysisMode && id === "normal") ? "border-accent text-accent" : "border-panel-border text-muted"}`}>
              {String(label)}{!available ? " — скоро" : ""}
            </button>
          ))}
        </div>

        <div className="flex gap-2">
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && send()}
            disabled={loading || (active?.analysisMode !== "normal" && Boolean(active?.caseFlow))}
            placeholder={active?.analysisMode !== "normal" && active?.caseFlow ? "Продолжите дело кнопками выше." : "Say it plainly."}
            className="flex-1 bg-panel border border-panel-border rounded-md px-4 py-3 text-sm outline-none focus:border-accent"
          />
          <button
            onClick={send}
            disabled={loading || (active?.analysisMode !== "normal" && Boolean(active?.caseFlow))}
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
