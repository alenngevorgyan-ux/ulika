"use client";

import { useEffect, useRef, useState } from "react";

/** Grade colours come from tokens so they are identical everywhere. */
export const GRADE_VAR: Record<string, string> = {
  A: "var(--grade-a)",
  B: "var(--grade-b)",
  C: "var(--grade-c)",
  D: "var(--grade-d)",
};

export function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setReduced(mq.matches);
    const onChange = (e: MediaQueryListEvent) => setReduced(e.matches);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);
  return reduced;
}

/**
 * The stamp. One completion gesture, used identically for a finished lesson, a
 * ticked checklist item and a closed situation, so it becomes recognisable
 * rather than decorative.
 *
 * Suppressed entirely in crisis mode and under reduced motion — the class is
 * applied conditionally rather than relying on CSS alone, so the intent is
 * visible at the call site.
 */
export function Stamp({
  children,
  trigger,
  disabled,
}: {
  children: React.ReactNode;
  trigger: unknown;
  disabled?: boolean;
}) {
  const [key, setKey] = useState(0);
  const first = useRef(true);
  const reduced = useReducedMotion();

  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    setKey((k) => k + 1);
  }, [trigger]);

  const animate = key > 0 && !reduced && !disabled;
  return (
    <span key={key} className={animate ? "ulika-stamp inline-block" : "inline-block"}>
      {children}
    </span>
  );
}

/**
 * Countdown ring. Inline SVG rather than a progress bar because a ring reads as
 * an instrument face, which is the register the rest of the app is in.
 */
export function LiveTimerRing({
  durationSeconds,
  running,
  onDone,
  size = 44,
}: {
  durationSeconds: number;
  running: boolean;
  onDone?: () => void;
  size?: number;
}) {
  const [left, setLeft] = useState(durationSeconds);
  const reduced = useReducedMotion();

  useEffect(() => {
    if (!running) return;
    if (left <= 0) {
      onDone?.();
      return;
    }
    const t = setTimeout(() => setLeft((s) => s - 1), 1000);
    return () => clearTimeout(t);
  }, [running, left, onDone]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLeft(durationSeconds);
  }, [durationSeconds]);

  const r = (size - 6) / 2;
  const circumference = 2 * Math.PI * r;
  const progress = durationSeconds > 0 ? left / durationSeconds : 0;

  return (
    <span className="inline-flex items-center gap-2">
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden>
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke="var(--line)"
          strokeWidth="2"
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke="var(--accent-brass)"
          strokeWidth="2"
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={circumference * (1 - progress)}
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
          style={reduced ? undefined : { transition: "stroke-dashoffset 1s linear" }}
        />
      </svg>
      <span className="font-mono text-xs text-muted tabular-nums">
        {String(Math.floor(left / 60)).padStart(2, "0")}:{String(left % 60).padStart(2, "0")}
      </span>
    </span>
  );
}

/**
 * Mode indicator: a folder, ajar while exploring, closed once advising.
 * Deliberately almost invisible — it is a texture cue, not a status badge.
 */
export function ModeIndicator({ mode }: { mode: "exploring" | "advising" }) {
  const open = mode === "exploring";
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 16 16"
      fill="none"
      aria-label={open ? "Still exploring" : "Advising"}
      className="opacity-40"
    >
      <path
        d="M1.5 4.2c0-.5.4-.9.9-.9h3.3l1.2 1.4h6.7c.5 0 .9.4.9.9v7c0 .5-.4.9-.9.9H2.4a.9.9 0 0 1-.9-.9V4.2Z"
        stroke="var(--accent-brass)"
        strokeWidth="1"
      />
      {open && (
        <path
          d="M2.2 12.6 4 7.4h10.3l-1.7 5.2"
          stroke="var(--accent-brass)"
          strokeWidth="1"
          strokeLinejoin="round"
        />
      )}
    </svg>
  );
}

/**
 * Case file header — a folder tab. Used at the top of a track in /plan and of a
 * chat session bound to a situation.
 */
export function CaseFileHeader({
  caseNumber,
  title,
  status,
}: {
  caseNumber: string;
  title: string;
  status: "open" | "paused" | "closed";
}) {
  const colour =
    status === "closed"
      ? "var(--muted)"
      : status === "paused"
        ? "var(--grade-d)"
        : "var(--accent-brass)";

  return (
    <div className="mb-6">
      <div
        className="inline-flex items-center gap-3 px-4 py-2 rounded-t-md border border-b-0"
        style={{ background: "var(--panel-2)", borderColor: "var(--line)" }}
      >
        <span className="font-mono text-[10px] tracking-[0.18em] text-muted">{caseNumber}</span>
        <span
          className="font-mono text-[10px] uppercase tracking-[0.18em] px-2 py-0.5 rounded-sm border"
          style={{ color: colour, borderColor: colour }}
        >
          {status}
        </span>
      </div>
      <div
        className="border rounded-b-md rounded-tr-md px-4 py-3"
        style={{ background: "var(--panel)", borderColor: "var(--line)" }}
      >
        <h2 className="font-display text-lg leading-snug">{title}</h2>
      </div>
    </div>
  );
}

/**
 * Ledger streak. Marked days are short ink strokes; missed days are simply
 * blank. No red, no broken-chain graphic, no guilt — the point is a record you
 * can read, not a punishment you can feel.
 */
export function LedgerStreak({ days }: { days: { date: string; marked: boolean }[] }) {
  return (
    <div className="flex items-end gap-1.5 py-2" role="img" aria-label="Practice record">
      {days.map((d) => (
        <span key={d.date} className="flex flex-col items-center gap-1.5" title={d.date}>
          <svg width="8" height="18" viewBox="0 0 8 18" aria-hidden>
            {d.marked && (
              <line
                x1="1.5"
                y1="15.5"
                x2="6.5"
                y2="2.5"
                stroke="var(--accent-brass)"
                strokeWidth="1.6"
                strokeLinecap="round"
              />
            )}
          </svg>
          <span
            className="block w-1 h-px"
            style={{ background: "var(--line)" }}
          />
        </span>
      ))}
    </div>
  );
}

/**
 * Depth stack. CORE, DEEPENING and MASTERY as overlapping cards where the next
 * layer is visibly present but not open — the shape communicates "there is more
 * under this" without a label saying so.
 */
export function LayeredDepthStack({
  layers,
  active,
  onSelect,
}: {
  layers: { id: "core" | "deepening" | "mastery"; label: string; blurb: string }[];
  active: string;
  onSelect: (id: "core" | "deepening" | "mastery") => void;
}) {
  const reduced = useReducedMotion();
  const activeIndex = layers.findIndex((l) => l.id === active);

  return (
    <div className="relative" style={{ height: 148 }}>
      {layers.map((layer, i) => {
        const isActive = i === activeIndex;
        const behind = i > activeIndex;
        const offset = behind ? (i - activeIndex) * 10 : 0;

        return (
          <button
            key={layer.id}
            onClick={() => onSelect(layer.id)}
            className="absolute left-0 right-0 text-left rounded-lg border px-5 py-4"
            style={{
              top: offset,
              background: isActive ? "var(--panel-2)" : "var(--panel)",
              borderColor: isActive ? "var(--accent-brass)" : "var(--line)",
              opacity: behind ? 0.55 : 1,
              zIndex: layers.length - Math.abs(i - activeIndex),
              transform: isActive ? "translateX(0)" : `translateX(${behind ? 8 : 0}px)`,
              transition: reduced
                ? "none"
                : `transform var(--dur-block) var(--ease-expo-out), opacity var(--dur-block) var(--ease-expo-out), border-color var(--dur-micro) var(--ease-expo-out)`,
            }}
          >
            <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-accent mb-1">
              {layer.label}
            </p>
            {isActive && <p className="text-sm text-muted leading-relaxed">{layer.blurb}</p>}
          </button>
        );
      })}
    </div>
  );
}
