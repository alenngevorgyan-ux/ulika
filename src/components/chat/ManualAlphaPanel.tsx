"use client";

import { useEffect, useMemo, useState } from "react";
import { buildTestPacket } from "@/lib/megabrain/testPacket";

export interface ManualAlphaSettings {
  preset: "A" | "B" | "C" | "D" | "E";
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
      retrieval?: { cards: { id: string; name: string; sourceIds: string[]; sourceNames: string[]; evidenceStrength: string; relevanceScore: number }[]; latencyMs: number; tokenEstimate: number; limitation: string | null } | null;
      telemetry?: { reportedSpendUsd: number; conservativeSpendUsd: number; latencyMs: number; calls: { stage: string; model: string; reasoningTokens: number; inputTokens: number; outputTokens: number; cost: number | null }[] } | null;
    } | null;
  } | null;
  originalCase: string;
  messages: { role: "user" | "assistant"; content: string }[];
  questions: { id: string; question: string }[];
  answers: Record<string, string>;
  onSettings: (settings: ManualAlphaSettings | null) => void;
}

export default function ManualAlphaPanel({ flow, originalCase, messages, questions, answers, onSettings }: Props) {
  const [config, setConfig] = useState<{ presets: { id: ManualAlphaSettings["preset"]; label: string; purpose: string; capUsd: number; limitation: string | null }[]; savedCases: { id: string; title: string }[] } | null>(null);
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

  useEffect(() => {
    let cancelled = false;
    fetch("/api/megabrain-manual").then(async (response) => {
      if (!cancelled && response.ok) setConfig(await response.json());
    }).catch(() => {});
    return () => { cancelled = true; };
  }, []);

  useEffect(() => { onSettings(config ? settings : null); }, [config, onSettings, settings]);

  const savedRequired = settings.memory === "saved" || settings.clarification === "fixed";
  const canCompare = flow?.phase === "completed" && selected.length >= 2;
  const activePreset = useMemo(() => config?.presets.find((p) => p.id === settings.preset), [config, settings.preset]);
  if (!config) return null;

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
      if (response.ok) { setVariants(data.variants); setCompareId(data.compareId); setEstimate(data.reservationUsd); setRevealed({}); setWinner(""); }
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
    });
    await navigator.clipboard.writeText(packet);
  }

  return (
    <section className="mb-3 rounded-lg border border-accent/40 bg-panel p-3 text-xs space-y-3" data-testid="manual-alpha-panel">
      <div><span className="font-mono text-accent">MANUAL ALPHA</span> · admin-only · calls happen only on Send/Compare</div>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-2">
        <label>Preset<select value={settings.preset} onChange={(e) => update("preset", e.target.value as ManualAlphaSettings["preset"])} className="block w-full bg-background border border-panel-border rounded p-1 mt-1">{config.presets.map((p) => <option key={p.id} value={p.id}>{p.id} — {p.label}</option>)}</select></label>
        <label>Clarification<select value={settings.clarification} onChange={(e) => update("clarification", e.target.value as ManualAlphaSettings["clarification"])} className="block w-full bg-background border border-panel-border rounded p-1 mt-1"><option value="normal">NORMAL</option><option value="off">OFF</option><option value="fixed">FIXED</option></select></label>
        <label>Knowledge<select value={settings.knowledge} onChange={(e) => update("knowledge", e.target.value as ManualAlphaSettings["knowledge"])} className="block w-full bg-background border border-panel-border rounded p-1 mt-1"><option value="off">OFF</option><option value="core">CORE</option><option value="research">RESEARCH</option></select></label>
        <label>Memory<select value={settings.memory} onChange={(e) => update("memory", e.target.value as ManualAlphaSettings["memory"])} className="block w-full bg-background border border-panel-border rounded p-1 mt-1"><option value="off">OFF</option><option value="case">CASE</option><option value="saved">SAVED</option></select></label>
      </div>
      {savedRequired && <select value={settings.savedCaseId ?? ""} onChange={(e) => update("savedCaseId", e.target.value)} className="w-full bg-background border border-panel-border rounded p-1"><option value="">Choose an explicitly saved case</option>{config.savedCases.map((s) => <option key={s.id} value={s.id}>{s.title}</option>)}</select>}
      <p className="text-muted">{activePreset?.purpose} Cap ${activePreset?.capUsd.toFixed(2)}. {activePreset?.limitation}</p>
      {settings.knowledge === "research" && <p className="text-muted">RESEARCH is not populated yet: this run uses CORE only and reports that limitation. It must not be interpreted as a RAG-vs-OFF research test.</p>}
      {flow?.manual?.retrieval && <details><summary>Knowledge debug ({flow.manual.retrieval.cards.length} cards)</summary><div className="mt-2 text-muted">{flow.manual.retrieval.cards.map((card) => <div key={card.id}>{card.name} · score {card.relevanceScore} · {card.evidenceStrength} · {card.sourceNames.join(", ")}</div>)}<div>{flow.manual.retrieval.latencyMs} ms · ~{flow.manual.retrieval.tokenEstimate} tokens</div>{flow.manual.retrieval.limitation && <div>{flow.manual.retrieval.limitation}</div>}</div></details>}
      {flow?.manual?.telemetry && <details><summary>Cost and latency</summary><div className="mt-2 text-muted">Actual ${flow.manual.telemetry.reportedSpendUsd.toFixed(6)} · conservative ${flow.manual.telemetry.conservativeSpendUsd.toFixed(6)} · {flow.manual.telemetry.latencyMs} ms{flow.manual.telemetry.calls.map((call, i) => <div key={`${call.stage}-${i}`}>{call.stage}: {call.model} · in {call.inputTokens} · reasoning {call.reasoningTokens} · out {call.outputTokens} · {call.cost === null ? "cost unavailable" : `$${call.cost.toFixed(6)}`}</div>)}</div></details>}
      {flow?.phase === "completed" && <div className="space-y-2 border-t border-panel-border pt-2"><input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Saved case title" className="w-full bg-background border border-panel-border rounded p-1"/><textarea value={actionsTaken} onChange={(e) => setActionsTaken(e.target.value)} placeholder="What did I actually do?" className="w-full bg-background border border-panel-border rounded p-1"/><textarea value={observedOutcome} onChange={(e) => setObservedOutcome(e.target.value)} placeholder="What happened later?" className="w-full bg-background border border-panel-border rounded p-1"/><div className="flex gap-2"><select value={useful} onChange={(e) => setUseful(e.target.value as typeof useful)}><option value="">Useful?</option><option>YES</option><option>MIXED</option><option>NO</option></select><select value={moment} onChange={(e) => setMoment(e.target.value as typeof moment)}><option value="">Megabrain moment?</option><option>YES</option><option>NO</option></select><button onClick={save} disabled={busy}>Save this case</button><button onClick={() => copyPacket()}>Copy Test Packet</button></div></div>}
      <details><summary>Blind Compare</summary><div className="mt-2 space-y-2"><div className="flex flex-wrap gap-2">{config.presets.map((p) => <label key={p.id}><input type="checkbox" checked={selected.includes(p.id)} onChange={(e) => setSelected((current) => e.target.checked ? [...current, p.id].slice(0, 5) : current.filter((id) => id !== p.id))}/> {p.id}</label>)}</div><button onClick={estimateCompare}>Estimate maximum</button>{estimate !== null && <span> Conservative maximum: ${estimate.toFixed(4)}</span>}<button onClick={compare} disabled={!canCompare || busy}>Compare (paid, explicit)</button>{variants.map((v) => <article key={v.label} className="border border-panel-border rounded p-2"><h4>{v.label}{revealed[v.label] ? ` — ${revealed[v.label].preset}` : ""}</h4><div className="whitespace-pre-wrap mt-1">{v.answer}</div><label><input type="radio" name="blind-winner" value={v.label} checked={winner === v.label} onChange={() => setWinner(v.label)}/> choose winner</label> <button onClick={() => copyPacket(v)}>Copy Test Packet</button></article>)}{compareId && <button onClick={reveal} disabled={!winner}>Reveal after choosing</button>}</div></details>
    </section>
  );
}
