"use client";

import { useEffect, useMemo, useState } from "react";
import { buildTestPacket } from "@/lib/megabrain/testPacket";
import SignInForm from "@/app/plan/SignInForm";

export interface ManualAlphaSettings {
  preset: "A" | "B" | "C" | "D" | "E" | "X";
  clarification: "normal" | "off" | "fixed";
  knowledge: "off" | "core" | "research";
  memory: "off" | "case" | "saved";
  savedCaseId?: string;
}

interface Props {
  flow: {
    id: string;
    phase: string;
    answer: string | null;
    budgetedSpendUsd?: number;
    manual?: {
      retrieval?: { cards: { id: string; name: string; type: string; sourceIds: string[]; sourceNames: string[]; evidenceStrength: string; relevanceScore: number }[]; families: string[]; informationPlan: { unknown: string; safeWayToObtain: string; risk: string }[]; latencyMs: number; tokenEstimate: number; limitation: string | null; truncated: boolean } | null;
      telemetry?: { reportedSpendUsd: number; conservativeSpendUsd: number; latencyMs: number; calls: { stage: string; model: string; reasoningTokens: number; inputTokens: number; outputTokens: number; cost: number | null }[] } | null;
    } | null;
  } | null;
  originalCase: string;
  messages: { role: "user" | "assistant"; content: string }[];
  questions: { id: string; question: string }[];
  answers: Record<string, string>;
  onSettings: (settings: ManualAlphaSettings | null) => void;
  mobileOpen: boolean;
  onMobileOpenChange: (open: boolean) => void;
}

export default function ManualAlphaPanel({ flow, originalCase, messages, questions, answers, onSettings, mobileOpen, onMobileOpenChange }: Props) {
  const [config, setConfig] = useState<{ presets: { id: ManualAlphaSettings["preset"]; label: string; purpose: string; capUsd: number; limitation: string | null }[]; savedCases: { id: string; title: string }[]; savedCasePersistence: { available: boolean; durable: boolean; reason: string | null } } | null>(null);
  const [settings, setSettings] = useState<ManualAlphaSettings>({ preset: "A", clarification: "normal", knowledge: "off", memory: "case" });
  const [selected, setSelected] = useState<ManualAlphaSettings["preset"][]>(["A", "D"]);
  const [estimate, setEstimate] = useState<number | null>(null);
  const [variants, setVariants] = useState<{ label: string; answer: string; reportedSpendUsd: number; conservativeSpendUsd: number; latencyMs: number }[]>([]);
  const [compareId, setCompareId] = useState<string | null>(null);
  const [winner, setWinner] = useState("");
  const [revealed, setRevealed] = useState<Record<string, { preset: string; calls: unknown[] }>>({});
  const [title, setTitle] = useState("");
  const [actionsTaken, setActionsTaken] = useState("");
  const [observedOutcome, setObservedOutcome] = useState("");
  const [useful, setUseful] = useState<"YES" | "MIXED" | "NO" | "">("");
  const [moment, setMoment] = useState<"YES" | "NO" | "">("");
  const [busy, setBusy] = useState(false);
  const [activeVariant, setActiveVariant] = useState(0);
  const [notesOpen, setNotesOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const [access, setAccess] = useState<"loading" | "guest" | "hidden">("loading");
  const [desktopOpen, setDesktopOpen] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/megabrain-manual").then(async (response) => {
      if (cancelled) return;
      if (response.ok) {
        setConfig(await response.json());
        return;
      }
      setAccess(response.status === 401 ? "guest" : "hidden");
    }).catch(() => { if (!cancelled) setAccess("hidden"); });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => { onSettings(config ? settings : null); }, [config, onSettings, settings]);

  const savedRequired = settings.memory === "saved" || settings.clarification === "fixed";
  const canCompare = flow?.phase === "completed" && selected.length >= 2;
  const activePreset = useMemo(() => config?.presets.find((p) => p.id === settings.preset), [config, settings.preset]);
  if (!config) {
    if (access !== "guest") return null;
    return (
      <section className="mb-3 rounded-lg border border-panel-border bg-panel p-3 text-sm" data-testid="manual-alpha-sign-in">
        <div className="mb-2"><span className="font-mono text-accent">FOUNDER ACCESS</span><span className="text-muted"> · sign in on this Preview to unlock Manual Alpha</span></div>
        <SignInForm returnTo="/chat" compact />
      </section>
    );
  }

  const update = <K extends keyof ManualAlphaSettings>(key: K, value: ManualAlphaSettings[K]) =>
    setSettings((current) => ({ ...current, [key]: value }));

  async function estimateCompare() {
    const response = await fetch("/api/megabrain-manual", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "estimate", account: originalCase, presets: selected, clarification: settings.clarification }) });
    const data = await response.json();
    if (response.ok) setEstimate(data.totalConservativeUsd);
  }

  async function compare() {
    if (!flow || !canCompare || busy) return;
    setBusy(true);
    try {
      const response = await fetch("/api/megabrain-manual", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "compare", flowId: flow.id, presets: selected }) });
      const data = await response.json();
      if (response.ok) { setVariants(data.variants); setCompareId(data.compareId); setEstimate(data.reservationUsd); setRevealed({}); setWinner(""); setActiveVariant(0); }
    } finally { setBusy(false); }
  }

  async function reveal() {
    if (!compareId || !winner) return;
    const response = await fetch("/api/megabrain-manual", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "reveal", compareId }) });
    const data = await response.json();
    if (response.ok) setRevealed(Object.fromEntries(data.mapping.map((row: { label: string }) => [row.label, row])));
  }

  async function save() {
    if (!flow || flow.phase !== "completed") return;
    setBusy(true);
    try {
      const response = await fetch("/api/megabrain-manual", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "save", flowId: flow.id, title, actionsTaken: `${actionsTaken}\nUseful: ${useful}\nMegabrain moment: ${moment}`, observedOutcome, includeMessages: true, messages }) });
      if (response.ok) {
        const data = await response.json();
        setConfig((current) => current ? { ...current, savedCases: [...current.savedCases.filter((s) => s.id !== data.savedCase.id), { id: data.savedCase.id, title: data.savedCase.title }] } : current);
      }
    } finally { setBusy(false); }
  }

  async function copyPacket(variant?: typeof variants[number]) {
    const packet = buildTestPacket({
      testId: compareId ?? flow?.id ?? crypto.randomUUID(), date: new Date().toISOString(),
      preset: variant ? revealed[variant.label]?.preset : settings.preset,
      blindLabel: variant?.label, knowledgeMode: settings.knowledge, memoryMode: settings.memory,
      clarificationMode: settings.clarification, originalCase, questions, answers,
      finalResponse: variant?.answer ?? flow?.answer ?? "",
      actualCostUsd: variant?.reportedSpendUsd ?? flow?.manual?.telemetry?.reportedSpendUsd ?? null,
      conservativeUsd: variant?.conservativeSpendUsd ?? flow?.manual?.telemetry?.conservativeSpendUsd ?? flow?.budgetedSpendUsd ?? 0,
      latencyMs: variant?.latencyMs ?? flow?.manual?.telemetry?.latencyMs ?? 0, revealed: Boolean(variant ? revealed[variant.label] : true),
      retrievedCards: flow?.manual?.retrieval?.cards.map((card) => ({ name: card.name, type: card.type })),
      includeKnowledgeDebug: settings.knowledge !== "off",
      founderRating: useful, megabrainMoment: moment, actionTaken: actionsTaken, laterOutcome: observedOutcome,
    });
    await navigator.clipboard.writeText(packet);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1_600);
  }

  return (
    <>
      <div className="md:hidden fixed left-3 right-3 bottom-[calc(max(0.75rem,env(safe-area-inset-bottom))+5.75rem)] z-30 flex items-center gap-2 pointer-events-none" data-testid="manual-alpha-mobile-bar">
        <button type="button" onClick={() => onMobileOpenChange(true)} className="pointer-events-auto min-h-11 max-w-[70%] truncate rounded-full border border-accent/50 bg-panel/95 px-3 text-xs text-accent shadow-lg backdrop-blur" aria-label="Open model preset selector">{settings.preset} · {activePreset?.label} · {settings.knowledge.toUpperCase()} ▾</button>
        <button type="button" onClick={() => onMobileOpenChange(true)} className="pointer-events-auto min-h-11 flex-1 truncate rounded-full border border-panel-border bg-panel/95 px-3 text-xs text-muted shadow-lg backdrop-blur" aria-label="Open experiment controls">{settings.knowledge.toUpperCase()} · {settings.memory.toUpperCase()} · {settings.clarification}</button>
      </div>

      {mobileOpen && <div className="md:hidden fixed inset-0 z-[70]" role="dialog" aria-modal="true" aria-label="Manual Alpha controls">
        <button type="button" className="absolute inset-0 bg-black/60" onClick={() => onMobileOpenChange(false)} aria-label="Close controls" />
        <section className="absolute inset-x-0 bottom-0 max-h-[88dvh] overflow-y-auto overscroll-contain rounded-t-3xl border-t border-panel-border bg-background px-4 pt-3 pb-[max(1rem,env(safe-area-inset-bottom))] shadow-2xl">
          <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-panel-border" />
          <div className="flex items-center justify-between mb-4"><div><p className="font-mono text-xs tracking-wider text-accent">MANUAL ALPHA</p><p className="text-xs text-muted">Calls happen only on Send or Compare</p></div><button type="button" onClick={() => onMobileOpenChange(false)} className="min-h-11 min-w-11 text-xl" aria-label="Close controls">×</button></div>

          <fieldset className="mb-5"><legend className="mb-2 text-sm font-medium">Model</legend><div className="grid gap-2">{config.presets.map((preset) => <button key={preset.id} type="button" onClick={() => update("preset", preset.id)} aria-pressed={settings.preset === preset.id} className={`min-h-12 rounded-xl border px-3 text-left ${settings.preset === preset.id ? "border-accent bg-accent/10" : "border-panel-border"}`}><span className="mr-2 font-mono text-xs text-accent">{preset.id}</span><span className="text-sm">{preset.label}</span></button>)}</div></fieldset>

          <div className="grid grid-cols-1 gap-4">
            <label className="text-sm">Clarification<select value={settings.clarification} onChange={(e) => update("clarification", e.target.value as ManualAlphaSettings["clarification"])} className="mt-1 block min-h-12 w-full rounded-xl border border-panel-border bg-panel px-3 text-base"><option value="normal">Normal</option><option value="off">Off</option><option value="fixed">Fixed</option></select></label>
            <label className="text-sm">Knowledge<select value={settings.knowledge} onChange={(e) => update("knowledge", e.target.value as ManualAlphaSettings["knowledge"])} className="mt-1 block min-h-12 w-full rounded-xl border border-panel-border bg-panel px-3 text-base"><option value="off">Off</option><option value="core">Core</option><option value="research">Research</option></select></label>
            <label className="text-sm">Memory<select value={settings.memory} onChange={(e) => update("memory", e.target.value as ManualAlphaSettings["memory"])} className="mt-1 block min-h-12 w-full rounded-xl border border-panel-border bg-panel px-3 text-base"><option value="off">Off</option><option value="case">Case</option><option value="saved" disabled={!config.savedCasePersistence.available}>Saved</option></select></label>
          </div>
          {!config.savedCasePersistence.available && <p className="mt-2 text-xs text-muted">{config.savedCasePersistence.reason}</p>}
          {savedRequired && <select value={settings.savedCaseId ?? ""} onChange={(e) => update("savedCaseId", e.target.value)} className="mt-3 min-h-12 w-full rounded-xl border border-panel-border bg-panel px-3 text-base"><option value="">Choose a saved case</option>{config.savedCases.map((saved) => <option key={saved.id} value={saved.id}>{saved.title}</option>)}</select>}
          {settings.knowledge === "research" && <p className="mt-3 rounded-xl border border-panel-border bg-panel p-3 text-xs text-muted">RESEARCH has labelled analogy layers but no licensed scientific EVIDENCE cards yet.</p>}

          {flow?.manual?.retrieval && <details className="mt-4 rounded-xl border border-panel-border p-3"><summary className="min-h-8 cursor-pointer text-sm">Knowledge used ({flow.manual.retrieval.cards.length})</summary><div className="mt-2 space-y-2 text-xs text-muted">{flow.manual.retrieval.cards.map((card) => <div key={card.id} className="border-t border-panel-border pt-2"><span className="text-foreground">{card.name}</span><br/>{card.type} · score {card.relevanceScore}<br/>{card.sourceNames.join(", ")}</div>)}</div></details>}
          {flow?.manual?.telemetry && <details className="mt-3 rounded-xl border border-panel-border p-3"><summary className="min-h-8 cursor-pointer text-sm">Details · Actual ${flow.manual.telemetry.reportedSpendUsd.toFixed(4)}</summary><div className="mt-2 text-xs text-muted">Conservative ${flow.manual.telemetry.conservativeSpendUsd.toFixed(4)} · {(flow.manual.telemetry.latencyMs / 1000).toFixed(1)} s</div></details>}

          {flow?.phase === "completed" && <section className="mt-5 border-t border-panel-border pt-4"><div className="flex items-center justify-between"><p className="text-sm font-medium">Founder evaluation</p><button type="button" onClick={() => void copyPacket()} className="min-h-11 rounded-full border border-accent px-4 text-sm text-accent">{copied ? "Copied" : "Copy test"}</button></div><p className="mt-3 text-xs text-muted">Useful?</p><div className="mt-1 flex gap-2">{(["YES", "MIXED", "NO"] as const).map((value) => <button key={value} type="button" onClick={() => setUseful(value)} aria-pressed={useful === value} className={`min-h-11 flex-1 rounded-xl border text-xs ${useful === value ? "border-accent text-accent" : "border-panel-border"}`}>{value}</button>)}</div><p className="mt-3 text-xs text-muted">Megabrain moment?</p><div className="mt-1 flex gap-2">{(["YES", "NO"] as const).map((value) => <button key={value} type="button" onClick={() => setMoment(value)} aria-pressed={moment === value} className={`min-h-11 flex-1 rounded-xl border text-xs ${moment === value ? "border-accent text-accent" : "border-panel-border"}`}>{value}</button>)}</div><button type="button" onClick={() => setNotesOpen((open) => !open)} className="mt-3 min-h-11 text-sm text-muted" aria-expanded={notesOpen}>Add research notes ▾</button>{notesOpen && <div className="space-y-2"><input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Case title" className="min-h-12 w-full rounded-xl border border-panel-border bg-panel px-3 text-base"/><textarea value={actionsTaken} onChange={(e) => setActionsTaken(e.target.value)} placeholder="What did I actually do?" className="min-h-24 w-full rounded-xl border border-panel-border bg-panel p-3 text-base"/><textarea value={observedOutcome} onChange={(e) => setObservedOutcome(e.target.value)} placeholder="What happened later?" className="min-h-24 w-full rounded-xl border border-panel-border bg-panel p-3 text-base"/><button type="button" onClick={save} disabled={busy || !config.savedCasePersistence.available} className="min-h-11 rounded-xl border border-panel-border px-4 text-sm disabled:opacity-40">Save this case</button></div>}</section>}

          <section className="mt-5 border-t border-panel-border pt-4"><h3 className="text-sm font-medium">Blind Compare</h3><p className="mt-1 text-xs text-muted">Choose 2–5 presets. Models stay hidden until you vote.</p><div className="mt-3 grid grid-cols-3 gap-2">{config.presets.map((preset) => <button key={preset.id} type="button" onClick={() => setSelected((current) => current.includes(preset.id) ? current.filter((id) => id !== preset.id) : [...current, preset.id].slice(0, 5))} aria-pressed={selected.includes(preset.id)} className={`min-h-11 rounded-xl border text-xs ${selected.includes(preset.id) ? "border-accent text-accent" : "border-panel-border"}`}>{preset.id} {preset.label}</button>)}</div><div className="mt-3 flex flex-wrap items-center gap-2"><button type="button" onClick={estimateCompare} className="min-h-11 rounded-xl border border-panel-border px-3 text-sm">Estimate</button>{estimate !== null && <span className="text-xs">Estimated max ≤ ${estimate.toFixed(4)}</span>}<button type="button" onClick={compare} disabled={!canCompare || busy || estimate === null} className="min-h-11 rounded-xl bg-accent px-4 text-sm text-background disabled:opacity-40">Run comparison</button></div>
          {variants.length > 0 && <div className="mt-4"><div className="flex gap-1 overflow-x-auto" role="tablist">{variants.map((variant, index) => <button key={variant.label} type="button" role="tab" aria-selected={activeVariant === index} onClick={() => setActiveVariant(index)} className={`min-h-11 shrink-0 rounded-full border px-3 text-xs ${activeVariant === index ? "border-accent text-accent" : "border-panel-border"}`}>{variant.label}</button>)}</div>{variants[activeVariant] && <article className="mt-3 rounded-xl border border-panel-border p-3"><h4 className="text-sm font-medium">{variants[activeVariant].label}{revealed[variants[activeVariant].label] ? ` — ${revealed[variants[activeVariant].label].preset}` : ""}</h4><div className="mt-3 whitespace-pre-wrap text-sm leading-6 [overflow-wrap:anywhere]">{variants[activeVariant].answer}</div><button type="button" onClick={() => setWinner(variants[activeVariant].label)} className={`mt-4 min-h-11 w-full rounded-xl border text-sm ${winner === variants[activeVariant].label ? "border-accent text-accent" : "border-panel-border"}`}>Choose as best</button><button type="button" onClick={() => void copyPacket(variants[activeVariant])} className="mt-2 min-h-11 w-full rounded-xl border border-panel-border text-sm">{copied ? "Copied" : "Copy test"}</button></article>}{compareId && <button type="button" onClick={reveal} disabled={!winner} className="mt-3 min-h-11 w-full rounded-xl bg-accent text-sm text-background disabled:opacity-40">Reveal after choosing</button>}</div>}
          </section>
        </section>
      </div>}

    <section className="hidden md:block mb-3 rounded-lg border border-accent/40 bg-panel p-3 text-xs" data-testid="manual-alpha-panel">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0"><span className="font-mono text-accent">MANUAL ALPHA</span><span className="text-muted"> · {settings.preset} {activePreset?.label} · {settings.knowledge.toUpperCase()} · {settings.clarification.toUpperCase()}</span></div>
        <button type="button" onClick={() => setDesktopOpen((open) => !open)} aria-expanded={desktopOpen} className="min-h-10 shrink-0 rounded-full border border-accent/50 px-3 text-accent">{desktopOpen ? "Close" : "Controls"} {desktopOpen ? "↑" : "↓"}</button>
      </div>
      {desktopOpen && <div className="mt-3 space-y-3">
      <div className="text-muted">Admin-only · Manual Alpha overrides the product mode · calls happen only on Send/Compare</div>
      <fieldset><legend className="mb-1 font-medium">Model preset</legend><div className="grid grid-cols-5 gap-2">{config.presets.map((preset) => <button key={preset.id} type="button" onClick={() => update("preset", preset.id)} aria-pressed={settings.preset === preset.id} className={`min-h-12 rounded-md border px-2 text-left transition-colors ${settings.preset === preset.id ? "border-accent bg-accent/10 text-foreground" : "border-panel-border bg-background text-muted hover:border-accent/60"}`}><span className="mr-1 font-mono text-accent">{preset.id}</span><span>{preset.label}</span></button>)}</div></fieldset>
      <div className="grid grid-cols-3 gap-2">
        <label>Clarification<select value={settings.clarification} onChange={(e) => update("clarification", e.target.value as ManualAlphaSettings["clarification"])} className="block w-full bg-background border border-panel-border rounded p-1 mt-1"><option value="normal">NORMAL</option><option value="off">OFF</option><option value="fixed">FIXED</option></select></label>
        <label>Knowledge<select value={settings.knowledge} onChange={(e) => update("knowledge", e.target.value as ManualAlphaSettings["knowledge"])} className="block w-full bg-background border border-panel-border rounded p-1 mt-1"><option value="off">OFF</option><option value="core">CORE</option><option value="research">RESEARCH</option></select></label>
        <label>Memory<select value={settings.memory} onChange={(e) => update("memory", e.target.value as ManualAlphaSettings["memory"])} className="block w-full bg-background border border-panel-border rounded p-1 mt-1"><option value="off">OFF</option><option value="case">CASE</option><option value="saved" disabled={!config.savedCasePersistence.available}>SAVED</option></select></label>
      </div>
      {!config.savedCasePersistence.available && <p className="text-muted">{config.savedCasePersistence.reason}</p>}
      {savedRequired && <select value={settings.savedCaseId ?? ""} onChange={(e) => update("savedCaseId", e.target.value)} className="w-full bg-background border border-panel-border rounded p-1"><option value="">Choose an explicitly saved case</option>{config.savedCases.map((s) => <option key={s.id} value={s.id}>{s.title}</option>)}</select>}
      <p className="text-muted">{activePreset?.purpose} Cap ${activePreset?.capUsd.toFixed(2)}. {activePreset?.limitation}</p>
      {settings.knowledge === "research" && <p className="text-muted">RESEARCH includes labelled analogy layers, but no licensed scientific EVIDENCE cards yet. It is not a science-RAG comparison until that wave is installed.</p>}
      {flow?.manual?.retrieval && <details><summary>Knowledge debug ({flow.manual.retrieval.cards.length} cards)</summary><div className="mt-2 text-muted"><div>Families: {flow.manual.retrieval.families.join(", ")}</div>{flow.manual.retrieval.cards.map((card) => <div key={card.id}>{card.name} · {card.type} · score {card.relevanceScore} · {card.evidenceStrength} · {card.sourceNames.join(", ")}</div>)}{flow.manual.retrieval.informationPlan.map((item) => <div key={item.unknown}>Unknown: {item.unknown} · safe source: {item.safeWayToObtain} · risk {item.risk}</div>)}<div>{flow.manual.retrieval.latencyMs} ms · ~{flow.manual.retrieval.tokenEstimate} tokens{flow.manual.retrieval.truncated ? " · context truncated" : ""}</div>{flow.manual.retrieval.limitation && <div>{flow.manual.retrieval.limitation}</div>}</div></details>}
      {flow?.manual?.telemetry && <details><summary>Cost and latency</summary><div className="mt-2 text-muted">Actual ${flow.manual.telemetry.reportedSpendUsd.toFixed(6)} · conservative ${flow.manual.telemetry.conservativeSpendUsd.toFixed(6)} · {flow.manual.telemetry.latencyMs} ms{flow.manual.telemetry.calls.map((call, i) => <div key={`${call.stage}-${i}`}>{call.stage}: {call.model} · in {call.inputTokens} · reasoning {call.reasoningTokens} · out {call.outputTokens} · {call.cost === null ? "cost unavailable" : `$${call.cost.toFixed(6)}`}</div>)}</div></details>}
      {flow?.phase === "completed" && <div className="space-y-2 border-t border-panel-border pt-2"><input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Saved case title" className="w-full bg-background border border-panel-border rounded p-1"/><textarea value={actionsTaken} onChange={(e) => setActionsTaken(e.target.value)} placeholder="What did I actually do?" className="w-full bg-background border border-panel-border rounded p-1"/><textarea value={observedOutcome} onChange={(e) => setObservedOutcome(e.target.value)} placeholder="What happened later?" className="w-full bg-background border border-panel-border rounded p-1"/><div className="flex gap-2"><select value={useful} onChange={(e) => setUseful(e.target.value as typeof useful)}><option value="">Useful?</option><option>YES</option><option>MIXED</option><option>NO</option></select><select value={moment} onChange={(e) => setMoment(e.target.value as typeof moment)}><option value="">Megabrain moment?</option><option>YES</option><option>NO</option></select><button onClick={save} disabled={busy || !config.savedCasePersistence.available}>Save this case</button><button onClick={() => copyPacket()}>Copy Test Packet</button></div></div>}
      <details><summary>Blind Compare</summary><div className="mt-2 space-y-2"><div className="flex flex-wrap gap-2">{config.presets.map((p) => <label key={p.id}><input type="checkbox" checked={selected.includes(p.id)} onChange={(e) => setSelected((current) => e.target.checked ? [...current, p.id].slice(0, 5) : current.filter((id) => id !== p.id))}/> {p.id}</label>)}</div><button onClick={estimateCompare}>Estimate maximum</button>{estimate !== null && <span> Conservative maximum: ${estimate.toFixed(4)}</span>}<button onClick={compare} disabled={!canCompare || busy}>Compare (paid, explicit)</button>{variants.map((v) => <article key={v.label} className="border border-panel-border rounded p-2"><h4>{v.label}{revealed[v.label] ? ` — ${revealed[v.label].preset}` : ""}</h4><div className="whitespace-pre-wrap mt-1">{v.answer}</div><label><input type="radio" name="blind-winner" value={v.label} checked={winner === v.label} onChange={() => setWinner(v.label)}/> choose winner</label> <button onClick={() => copyPacket(v)}>Copy Test Packet</button></article>)}{compareId && <button onClick={reveal} disabled={!winner}>Reveal after choosing</button>}</div></details>
      </div>}
    </section>
    {copied && <div className="fixed bottom-24 left-1/2 z-[90] -translate-x-1/2 rounded-full bg-foreground px-4 py-2 text-sm text-background shadow-xl" role="status">Copied</div>}
    </>
  );
}
