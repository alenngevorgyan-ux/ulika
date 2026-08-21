"use client";

import { useRef, useState } from "react";

/**
 * The lab's interface.
 *
 * NOTHING IS STORED. No localStorage, no draft recovery, no analytics payload.
 * Reloading the page loses the case, and that is the intended behaviour: this
 * text is somebody's real situation, and a convenience feature that quietly
 * kept it would be a decision nobody made.
 */

interface ModeInfo {
  id: string;
  label: { ru: string; en: string };
  capUsd: number;
  expectedUsd: number;
  reservedUsd: number;
  maxModelCalls: number;
  available: boolean;
  unavailableReason: string | null;
}
interface ModelInfo {
  id: string;
  label: string;
  available: boolean;
  note: string;
}

interface CallRow {
  stage: string;
  model: string;
  provider: string | null;
  inputTokens: number;
  outputTokens: number;
  actualCostUsd: number | null;
  latencyMs: number;
}

export default function LabClient({ modes, models }: { modes: ModeInfo[]; models: ModelInfo[] }) {
  const [account, setAccount] = useState("");
  const [language, setLanguage] = useState("auto");
  const [country, setCountry] = useState("unknown");
  const [region, setRegion] = useState("");
  const [mode, setMode] = useState("standard");
  const [modelChoice, setModelChoice] = useState("auto");
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{
    rendered: string | null;
    light: Record<string, string> | null;
    cost: { reportedSpendUsd: number; budgetedSpendUsd: number; capUsd: number; latencyMs: number; hasUnknownCharges: boolean };
    calls: CallRow[];
    problems: string[];
  } | null>(null);

  // A ref, not state: a second click must be impossible before React re-renders.
  const inFlight = useRef(false);
  const abortRef = useRef<AbortController | null>(null);

  const selected = modes.find((m) => m.id === mode)!;

  async function run() {
    if (inFlight.current || !selected.available) return;
    inFlight.current = true;
    setRunning(true);
    setError(null);
    setResult(null);

    const controller = new AbortController();
    abortRef.current = controller;
    const timeout = setTimeout(() => controller.abort(), 150_000);

    try {
      const res = await fetch("/api/megabrain-lab", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: controller.signal,
        body: JSON.stringify({
          account,
          responseLanguage: language,
          jurisdiction: { country, ...(region.trim() ? { region: region.trim() } : {}) },
          analysisMode: mode,
          modelChoice,
        }),
      });
      const data = await res.json().catch(() => ({ error: "BAD_RESPONSE" }));
      if (!res.ok) {
        // A code, never a provider message.
        setError(String(data.error ?? res.status) + (data.detail ? `: ${data.detail}` : ""));
      } else {
        setResult(data);
      }
    } catch (e) {
      setError(e instanceof Error && e.name === "AbortError" ? "TIMEOUT" : "REQUEST_FAILED");
    } finally {
      clearTimeout(timeout);
      inFlight.current = false;
      abortRef.current = null;
      setRunning(false);
    }
  }

  return (
    <main className="max-w-3xl mx-auto p-6 space-y-6">
      <header>
        <h1 className="text-xl font-semibold">Megabrain Lab</h1>
        <p className="text-sm text-muted">
          Закрытая страница. Ничего не сохраняется: обновление страницы стирает кейс.
        </p>
      </header>

      <textarea
        value={account}
        onChange={(e) => setAccount(e.target.value)}
        rows={10}
        placeholder="Опишите ситуацию так, как рассказали бы человеку."
        className="w-full bg-panel border border-panel-border rounded-md p-3 text-sm"
      />

      <div className="grid grid-cols-2 gap-4 text-sm">
        <label className="space-y-1">
          <span className="block text-xs uppercase tracking-wide">Язык ответа</span>
          <select value={language} onChange={(e) => setLanguage(e.target.value)} className="w-full bg-panel border border-panel-border rounded-md p-2">
            <option value="auto">Auto (по тексту)</option>
            <option value="ru">Русский</option>
            <option value="en">English</option>
          </select>
        </label>
        <label className="space-y-1">
          <span className="block text-xs uppercase tracking-wide">Юрисдикция</span>
          <select value={country} onChange={(e) => setCountry(e.target.value)} className="w-full bg-panel border border-panel-border rounded-md p-2">
            <option value="unknown">Не указана</option>
            <option value="AM">Армения</option>
            <option value="RU">Россия</option>
            <option value="US">США</option>
            <option value="other">Другая</option>
          </select>
        </label>
        <label className="space-y-1 col-span-2">
          <span className="block text-xs uppercase tracking-wide">Регион / штат (необязательно)</span>
          <input value={region} onChange={(e) => setRegion(e.target.value)} className="w-full bg-panel border border-panel-border rounded-md p-2" />
          {country === "US" && !region.trim() && (
            <span className="text-xs text-muted">Без штата ответ не будет делать конкретных правовых утверждений.</span>
          )}
        </label>
      </div>

      <fieldset className="space-y-2">
        <legend className="text-xs uppercase tracking-wide">Режим</legend>
        {modes.map((m) => (
          <label key={m.id} className={`flex gap-3 items-start ${m.available ? "" : "opacity-50"}`}>
            <input type="radio" name="mode" value={m.id} checked={mode === m.id} disabled={!m.available} onChange={() => setMode(m.id)} className="mt-1" />
            <span className="text-sm">
              <b>{m.label.ru}</b>{" "}
              <span className="text-muted">
                ~${m.expectedUsd.toFixed(4)}, резерв ${m.reservedUsd.toFixed(4)}, потолок ${m.capUsd.toFixed(2)}, до {m.maxModelCalls} вызовов
              </span>
              {!m.available && <span className="block text-xs text-muted">Скоро. {m.unavailableReason}</span>}
              {m.id === "strong" && <span className="block text-xs text-muted">Дороже Standard: добавляет один проход критика.</span>}
            </span>
          </label>
        ))}
      </fieldset>

      <details className="text-sm">
        <summary className="cursor-pointer text-xs uppercase tracking-wide">Advanced (только админ)</summary>
        <select value={modelChoice} onChange={(e) => setModelChoice(e.target.value)} className="mt-2 w-full bg-panel border border-panel-border rounded-md p-2">
          {models.map((m) => (
            <option key={m.id} value={m.id} disabled={!m.available}>
              {m.label}
              {m.available ? "" : " — недоступна"}
            </option>
          ))}
        </select>
        <p className="text-xs text-muted mt-1">
          Выбор модели не поднимает потолок расхода — он задан режимом на сервере.
        </p>
      </details>

      <button
        onClick={run}
        disabled={running || account.trim().length < 20 || !selected.available}
        className="px-4 py-2 rounded-md bg-accent text-black disabled:opacity-40"
      >
        {running ? "Считаю…" : `Запустить (${selected.label.ru})`}
      </button>

      {error && <p className="text-sm" style={{ color: "var(--danger)" }}>Ошибка: {error}</p>}

      {result && (
        <section className="space-y-4">
          <div className="text-xs text-muted">
            ${result.cost.reportedSpendUsd.toFixed(4)} из ${result.cost.capUsd.toFixed(2)} · {(result.cost.latencyMs / 1000).toFixed(1)} с
            {result.cost.hasUnknownCharges && " · есть неоценённые вызовы"}
          </div>
          <table className="w-full text-xs">
            <tbody>
              {result.calls.map((c, i) => (
                <tr key={i}>
                  <td className="pr-3">{c.stage}</td>
                  <td className="pr-3">{c.model}</td>
                  <td className="pr-3">{c.provider ?? "—"}</td>
                  <td className="pr-3">{c.inputTokens}/{c.outputTokens}</td>
                  <td className="pr-3">${(c.actualCostUsd ?? 0).toFixed(5)}</td>
                  <td>{(c.latencyMs / 1000).toFixed(1)}с</td>
                </tr>
              ))}
            </tbody>
          </table>
          {result.light ? (
            <dl className="text-sm space-y-2">
              {Object.entries(result.light)
                .filter(([k]) => !["language", "jurisdiction"].includes(k))
                .map(([k, v]) => (
                  <div key={k}>
                    <dt className="text-xs uppercase tracking-wide text-muted">{k}</dt>
                    <dd>{String(v)}</dd>
                  </div>
                ))}
            </dl>
          ) : (
            <pre className="text-sm whitespace-pre-wrap">{result.rendered}</pre>
          )}
          {result.problems.length > 0 && (
            <p className="text-xs text-muted">Замечания валидаторов: {result.problems.join(", ")}</p>
          )}
        </section>
      )}
    </main>
  );
}
