"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import ReplyBlocks from "@/components/chat/ReplyBlocks";
import ThinkingIndicator from "@/components/chat/ThinkingIndicator";
import { ModeIndicator } from "@/components/chat/primitives";
import { parseBlocks } from "@/lib/mentalist/parseBlocks";
import { useCaseState } from "@/lib/interaction/useCaseState";
import { useT } from "@/lib/i18n/useT";
import ManualAlphaPanel, { type ManualAlphaSettings } from "@/components/chat/ManualAlphaPanel";

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
  allowedActions?: ("answer" | "skip" | "resume")[];
  answer: string | null;
  followUps: { action: string; answer: string }[];
  safeError: string | null;
  budgetedSpendUsd?: number;
  remainingUsd?: number;
  manual?: {
    retrieval?: {
      cards: { id: string; name: string; type: string; sourceIds: string[]; sourceNames: string[]; evidenceStrength: string; relevanceScore: number }[];
      families: string[];
      informationPlan: { unknown: string; safeWayToObtain: string; risk: string }[];
      latencyMs: number;
      tokenEstimate: number;
      limitation: string | null;
      truncated: boolean;
    } | null;
    telemetry?: {
      reportedSpendUsd: number;
      conservativeSpendUsd: number;
      latencyMs: number;
      calls: { stage: string; model: string; reasoningTokens: number; inputTokens: number; outputTokens: number; cost: number | null }[];
    } | null;
  } | null;
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
  const [manualSettings, setManualSettings] = useState<ManualAlphaSettings | null>(null);
  const [controlsOpen, setControlsOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [moreActionsOpen, setMoreActionsOpen] = useState(false);
  const [showLatest, setShowLatest] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const composerRef = useRef<HTMLTextAreaElement>(null);
  const nearBottomRef = useRef(true);
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
  const clarificationComplete = Boolean(active?.caseFlow?.questions.length) && active!.caseFlow!.questions.every((question) => {
    const selected = caseAnswers[question.id];
    return selected === "__other" ? Boolean(customAnswers[question.id]?.trim()) : Boolean(selected?.trim());
  });
  const { state: caseState, stale, send: sendEvent } = useCaseState(activeId);

  useEffect(() => {
    if (nearBottomRef.current) bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [active?.messages.length, loading, active?.caseFlow?.phase]);

  useEffect(() => {
    const area = composerRef.current;
    if (!area) return;
    area.style.height = "0px";
    area.style.height = `${Math.min(area.scrollHeight, 176)}px`;
  }, [input]);

  function trackScroll() {
    const el = scrollRef.current;
    if (!el) return;
    const near = el.scrollHeight - el.scrollTop - el.clientHeight < 96;
    nearBottomRef.current = near;
    setShowLatest(!near);
  }

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
        const data = await r.json().catch(() => null);
        if (cancelled) return;
        if (!r.ok || !data?.flow) {
          // The server has no record of this flow — most commonly a stale
          // reference surviving from before a storage migration, or a
          // genuinely expired case reopened after the TTL. Either way, an
          // indefinitely stuck "Continue" affordance across every future
          // page load is worse than just clearing it: the server is
          // authoritative, and silence here is exactly the stale-local-state
          // problem this refresh effect exists to prevent.
          if (data?.error === "FLOW_NOT_FOUND") {
            persist((current) => current.map((c) => (c.id === active.id ? { ...c, caseFlow: undefined } : c)));
          }
          return;
        }
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
      // Manual Alpha is an explicit, founder-only routing layer. Its server-owned
      // preset must never be silently bypassed by the ordinary product selector.
      const manualRoute = manualSettings !== null;
      const selectedMode = manualRoute ? "standard" : (active.analysisMode ?? "normal");
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
              ...(manualSettings ? { manual: manualSettings } : {}),
            }),
      });
      const data = await res.json().catch(() => ({ error: "RUNTIME" }));
      if (selectedMode !== "normal") {
        if (!res.ok || !data.flow) {
          const code = String(data.error ?? "PIPELINE");
          const diagnostic = code.includes("AUTH") || code.includes("FORBIDDEN")
            ? "AUTH"
            : code.includes("BUDGET") || code.includes("CAP") || code.includes("CREDIT") || code.includes("TOO_COMPLEX")
              ? "BUDGET_GATE"
              : code.includes("RETRIEV") || code.includes("KNOWLEDGE")
                ? "RETRIEVAL"
                : code.includes("PROVIDER") || code.includes("MODEL") || code.includes("OUTPUT") || code.includes("ACCOUNTING")
                  ? "PROVIDER"
                  : "PIPELINE";
          const errorText = manualRoute
            ? `Request failed · ${diagnostic}`
            : data.error === "AUTH_REQUIRED"
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
        { role: "assistant" as const, content: manualSettings ? "Request failed · NETWORK" : "Couldn't reach me just now. Check your connection." },
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

  async function continueCase(action: "answer" | "skip" | "resume") {
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
      const data = await res.json().catch(() => ({ error: "RUNTIME" }));
      if (!data.flow) {
        const diagnostic = data.error === "FLOW_NOT_FOUND" ? "STATE_EXPIRED"
          : String(data.error ?? "PIPELINE").includes("AUTH") ? "AUTH"
            : "PIPELINE";
        // The server has no record of this flow (genuinely expired, or this
        // id belongs to nobody the caller can see). Clear it client-side too
        // — otherwise the old clarification questions/buttons stay rendered
        // right next to "Request failed", a contradictory state the server
        // never actually asserted.
        updateConversation(active.id, (c) => ({
          ...c,
          caseFlow: undefined,
          messages: [...c.messages, { role: "assistant", source: "megabrain", content: `Request failed · ${diagnostic}` }],
          updatedAt: Date.now(),
        }));
        return;
      }
      const flow = data.flow as CaseFlowView;
      const answerSummary = action === "resume"
        ? null
        : action === "skip"
        ? "Продолжить без уточнений."
        : Object.values(answers).join(" · ");
      const extra: Message[] = [
        ...(answerSummary ? [{ role: "user" as const, source: "megabrain" as const, content: answerSummary }] : []),
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
    } catch {
      updateConversation(active.id, (c) => ({
        ...c,
        messages: [...c.messages, { role: "assistant", source: "megabrain", content: "Request failed · NETWORK" }],
        updatedAt: Date.now(),
      }));
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
      className="relative mx-auto max-w-6xl px-3 sm:px-4 md:px-6 py-0 md:py-8 flex gap-6 h-[calc(100dvh-61px)] md:h-[calc(100dvh-73px)] min-h-0 overflow-hidden"
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
      <div className="flex-1 flex flex-col min-w-0 min-h-0">
        <div className="md:hidden flex items-center justify-between h-12 shrink-0 border-b border-panel-border -mx-3 sm:-mx-4 px-3 sm:px-4">
          <button type="button" onClick={() => setHistoryOpen(true)} className="min-h-11 min-w-11 -ml-2 rounded-lg text-muted" aria-label="Open conversation history">☰</button>
          <span className="font-display text-base">Mentalist</span>
          {manualSettings ? <button type="button" onClick={() => setControlsOpen(true)} className="min-h-11 px-2 rounded-lg text-xs text-accent" aria-label="Open experiment controls">Controls</button> : <span className="min-w-11" />}
        </div>
        <h1 className="hidden md:block font-display text-2xl mb-1">The Mentalist</h1>
        <p className="hidden md:block text-xs text-muted mb-6">
          Twenty years reading people for a living. Now teaching you how it&apos;s done.
        </p>

        <ManualAlphaPanel
          flow={active?.caseFlow ?? null}
          originalCase={[...(active?.messages ?? [])].reverse().find((m) => m.role === "user" && m.source !== "megabrain")?.content ?? ""}
          messages={(active?.messages ?? []).map(({ role, content }) => ({ role, content }))}
          questions={active?.caseFlow?.questions ?? []}
          answers={Object.fromEntries((active?.caseFlow?.questions ?? []).map((q) => [q.id, customAnswers[q.id] || caseAnswers[q.id] || ""]))}
          onSettings={setManualSettings}
          mobileOpen={controlsOpen}
          onMobileOpenChange={setControlsOpen}
        />

        <div ref={scrollRef} onScroll={trackScroll} className="flex-1 overflow-y-auto overscroll-contain space-y-3 md:space-y-4 py-3 md:py-0 md:mb-4 pr-0 md:pr-1 min-h-0 scroll-pb-44">
          {active?.messages.map((m, i) => (
            <div
              key={i}
              className={`rounded-xl px-3.5 sm:px-4 py-3 overflow-hidden [overflow-wrap:anywhere] ${
                m.role === "user"
                  ? "ml-auto max-w-[88%] md:max-w-[80%] bg-accent text-background text-[15px] md:text-sm leading-relaxed whitespace-pre-wrap"
                  : "max-w-full md:max-w-[92%] bg-panel border border-panel-border"
              }`}
            >
              {m.role === "user" ? (
                m.content
              ) : m.source === "megabrain" ? (
                <div className="text-[15px] md:text-sm leading-7 md:leading-relaxed whitespace-pre-wrap [overflow-wrap:anywhere]">{m.content}</div>
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
            <div className="bg-panel border border-panel-border rounded-xl px-4 py-3 max-w-[94%]" role="status" aria-live="polite">
              {active?.caseFlow?.phase === "analysing" && <p className="text-xs text-muted mb-2">Разбираю ситуацию…</p>}
              <ThinkingIndicator crisis={Boolean(active?.crisis)} />
            </div>
          )}
          {active?.caseFlow?.phase === "awaiting_answers" && (
            <div className="bg-panel border border-panel-border rounded-xl px-3.5 sm:px-4 py-4 max-w-full md:max-w-[92%] space-y-5">
              <p className="text-sm font-medium">Несколько ответов действительно изменят первый ход.</p>
              {active.caseFlow.questions.map((q) => (
                <fieldset key={q.id} className="space-y-2">
                  <legend className="text-sm mb-2">{q.question}</legend>
                  <div className="grid grid-cols-1 sm:flex sm:flex-wrap gap-2">
                    {[...q.options, "Другое"].map((option) => {
                      const value = option === "Другое" ? "__other" : option;
                      return (
                        <button key={value} type="button" onClick={() => setCaseAnswers((a) => ({ ...a, [q.id]: value }))}
                          aria-pressed={caseAnswers[q.id] === value}
                          className={`min-h-11 text-left sm:text-center text-sm sm:text-xs rounded-xl sm:rounded-full border px-3 py-2.5 sm:py-1.5 ${caseAnswers[q.id] === value ? "border-accent bg-accent/10 text-accent" : "border-panel-border text-muted"}`}>
                          {option}
                        </button>
                      );
                    })}
                  </div>
                  {caseAnswers[q.id] === "__other" && (
                    <input value={customAnswers[q.id] ?? ""} onChange={(e) => setCustomAnswers((a) => ({ ...a, [q.id]: e.target.value }))}
                      placeholder="Ваш ответ" className="w-full min-h-11 bg-background border border-panel-border rounded-lg px-3 py-2 text-base md:text-sm" />
                  )}
                </fieldset>
              ))}
              <div className="flex flex-col sm:flex-row gap-2">
                <button type="button" onClick={() => continueCase("answer")} disabled={loading || !clarificationComplete}
                  className="min-h-11 bg-accent text-background rounded-lg px-4 py-2 text-sm disabled:opacity-50">Продолжить разбор · {manualSettings?.preset ?? "Megabrain"}</button>
                <button type="button" onClick={() => continueCase("skip")} disabled={loading}
                  className="min-h-11 border border-panel-border rounded-lg px-4 py-2 text-sm text-muted disabled:opacity-50">Продолжить без уточнений</button>
              </div>
              {active.caseFlow.remainingUsd !== undefined && <p className="text-xs text-muted">Remaining software envelope: ${active.caseFlow.remainingUsd.toFixed(4)}</p>}
            </div>
          )}
          {active?.caseFlow?.phase === "failed" && (
            <div className="bg-panel border border-panel-border rounded-xl px-3.5 sm:px-4 py-4 max-w-full md:max-w-[92%] space-y-3">
              <p className="text-sm font-medium">Разбор остановлен · {active.caseFlow.safeError ?? "PIPELINE"}</p>
              {active.caseFlow.allowedActions?.includes("resume") ? (
                <>
                  <p className="text-xs text-muted">Ответы на уточнения сохранены. Продолжение использует то же дело и не повторяет clarification.</p>
                  <button type="button" onClick={() => continueCase("resume")} disabled={loading}
                    className="min-h-11 bg-accent text-background rounded-lg px-4 py-2 text-sm disabled:opacity-50">
                    Продолжить разбор · {manualSettings?.preset ?? "Megabrain"}
                  </button>
                  {active.caseFlow.remainingUsd !== undefined && <p className="text-xs text-muted">Remaining software envelope: ${active.caseFlow.remainingUsd.toFixed(4)}</p>}
                </>
              ) : (
                <p className="text-xs text-muted">Продолжение для этого состояния недоступно. Создайте новое дело или обновите страницу для проверки состояния.</p>
              )}
            </div>
          )}
          {active?.caseFlow?.phase === "completed" && !loading && (
            <>
              <div className="md:hidden flex flex-wrap gap-2 max-w-full pb-1">
                {[["why", "Почему?"], ["stronger", "Сильнее"]].map(([id, label]) => <button key={id} type="button" onClick={() => caseFollowUp(id)} className="min-h-11 text-xs border border-panel-border rounded-full px-4 py-2 text-muted">{label}</button>)}
                <button type="button" onClick={() => setMoreActionsOpen((open) => !open)} className="min-h-11 text-xs border border-panel-border rounded-full px-4 py-2 text-muted" aria-expanded={moreActionsOpen}>Ещё…</button>
                {moreActionsOpen && <div className="basis-full grid grid-cols-1 gap-2 pt-1">{[["other_side", "Что ответит другая сторона?"], ["draft_message", "Составить сообщение"], ["what_we_got_wrong", "Что мы могли понять неправильно?"]].map(([id, label]) => <button key={id} type="button" onClick={() => { setMoreActionsOpen(false); void caseFollowUp(id); }} className="min-h-11 text-left text-xs border border-panel-border rounded-lg px-3 py-2 text-muted">{label}</button>)}</div>}
              </div>
              <div className="hidden md:flex flex-wrap gap-2 max-w-[92%]">{[["why", "Почему именно так?"], ["stronger", "Дай более сильный ход"], ["other_side", "Что ответит другая сторона?"], ["draft_message", "Составь сообщение"], ["what_we_got_wrong", "Что мы могли понять неправильно?"]].map(([id, label]) => <button key={id} type="button" onClick={() => caseFollowUp(id)} className="text-xs border border-panel-border rounded-full px-3 py-1.5 text-muted hover:text-foreground">{label}</button>)}</div>
            </>
          )}
          <div ref={bottomRef} />
        </div>

        {stale && (
          <p className="text-xs mb-2" style={{ color: "var(--danger)" }}>
            {t("state.stale")}
          </p>
        )}

        {!manualSettings && <div className="hidden md:flex flex-wrap gap-2 mb-2">
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
        </div>}
        {showLatest && <button type="button" onClick={() => { nearBottomRef.current = true; bottomRef.current?.scrollIntoView({ behavior: "smooth" }); }} className="absolute bottom-36 md:bottom-24 left-1/2 -translate-x-1/2 z-20 rounded-full border border-panel-border bg-panel px-3 py-2 text-xs shadow-lg" aria-label="Jump to latest message">↓ latest</button>}
        <div className="shrink-0 border-t border-panel-border bg-background/95 backdrop-blur -mx-3 sm:-mx-4 md:mx-0 px-3 sm:px-4 md:px-0 pt-2 pb-[max(0.75rem,env(safe-area-inset-bottom))] md:border-0 md:bg-transparent md:pt-0 md:pb-0">
          {!manualSettings && <div className="md:hidden flex gap-1.5 overflow-x-auto pb-2 [scrollbar-width:none]" aria-label="Analysis mode">{[["normal", "Chat"], ["light", "Quick"], ["standard", "Case"], ["strong", "Strong"]].map(([id, label]) => <button key={id} type="button" disabled={loading} onClick={() => active && updateConversation(active.id, (c) => ({ ...c, analysisMode: id as ChatAnalysisMode, caseFlow: undefined }))} className={`min-h-11 shrink-0 rounded-full border px-3 text-xs ${active?.analysisMode === id || (!active?.analysisMode && id === "normal") ? "border-accent text-accent" : "border-panel-border text-muted"}`}>{label}</button>)}</div>}
          <div className="flex min-w-0 items-end gap-2">
          <textarea
            ref={composerRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing && (e.preventDefault(), void send())}
            disabled={loading || (Boolean(manualSettings || active?.analysisMode !== "normal") && Boolean(active?.caseFlow))}
            placeholder={active?.caseFlow?.phase === "failed" && !active.caseFlow.allowedActions?.length
              ? `Разбор остановлен · ${active.caseFlow.safeError ?? "PIPELINE"}`
              : (manualSettings || active?.analysisMode !== "normal") && active?.caseFlow
                ? "Продолжите дело кнопками выше."
                : "Say it plainly."}
            rows={1}
            className="min-h-12 max-h-44 min-w-0 flex-1 resize-none overflow-y-auto bg-panel border border-panel-border rounded-2xl px-4 py-3 text-base md:text-sm leading-6 outline-none focus:border-accent"
          />
          <button
            onClick={send}
            disabled={loading || (Boolean(manualSettings || active?.analysisMode !== "normal") && Boolean(active?.caseFlow))}
            aria-label="Send message"
            className="min-h-12 min-w-12 bg-accent text-background font-medium px-3 md:px-5 py-3 rounded-full md:rounded-md text-lg md:text-sm hover:opacity-90 transition-opacity disabled:opacity-50"
          >
            <span className="md:hidden" aria-hidden="true">↑</span><span className="hidden md:inline">Send</span>
          </button>
          </div>
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

      {historyOpen && <div className="md:hidden fixed inset-0 z-50" role="dialog" aria-modal="true" aria-label="Conversation history"><button type="button" className="absolute inset-0 bg-black/55" onClick={() => setHistoryOpen(false)} aria-label="Close history"/><aside className="absolute inset-y-0 left-0 w-[min(86vw,20rem)] bg-background border-r border-panel-border p-4 pt-[max(1rem,env(safe-area-inset-top))] shadow-2xl"><div className="flex items-center justify-between mb-4"><span className="font-mono text-xs uppercase tracking-wider text-muted">History</span><button type="button" onClick={() => { startNew(); setHistoryOpen(false); }} className="min-h-11 px-2 text-accent">+ New</button></div><div className="overflow-y-auto space-y-1 max-h-[calc(100dvh-5rem)]">{[...conversations].sort((a, b) => b.updatedAt - a.updatedAt).map((c) => <div key={c.id} className={`flex items-center gap-2 rounded-lg border px-3 py-2 ${c.id === activeId ? "bg-panel border-panel-border" : "border-transparent"}`}><button type="button" onClick={() => { setActiveId(c.id); setHistoryOpen(false); }} className="min-h-11 flex-1 text-left text-sm line-clamp-2">{c.title}</button><button type="button" onClick={() => remove(c.id)} className="min-h-11 min-w-11 text-muted" aria-label={`Delete ${c.title}`}>×</button></div>)}</div></aside></div>}
    </div>
  );
}
