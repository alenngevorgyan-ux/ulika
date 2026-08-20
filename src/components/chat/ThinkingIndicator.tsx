"use client";

import { useEffect, useState } from "react";
import { useReducedMotion } from "./primitives";

/**
 * Three phases rather than a typing dot.
 *
 * The phases are honest about the shape of what actually happens — the router
 * runs, then retrieval, then the reply — rather than being a stalling
 * animation. They advance on a timer because the API does not stream progress;
 * if a reply lands early the component unmounts mid-phase, which is correct.
 *
 * Deliberately short. A progress theatre that outlasts the work is worse than
 * a spinner.
 */
const PHASES = ["Looking at the facts", "Working out what's missing", "Weighing it"];

export default function ThinkingIndicator({ crisis = false }: { crisis?: boolean }) {
  const [phase, setPhase] = useState(0);
  const reduced = useReducedMotion();

  useEffect(() => {
    if (phase >= PHASES.length - 1) return;
    const t = setTimeout(() => setPhase((p) => p + 1), 1400);
    return () => clearTimeout(t);
  }, [phase]);

  // In crisis mode there is nothing to perform. Say the plain thing.
  if (crisis) {
    return <p className="text-sm text-muted">One moment.</p>;
  }

  return (
    <div className="flex items-center gap-3">
      <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden className="shrink-0">
        <circle
          cx="7"
          cy="7"
          r="5.5"
          fill="none"
          stroke="var(--line)"
          strokeWidth="1.5"
        />
        <path
          d="M7 1.5a5.5 5.5 0 0 1 5.5 5.5"
          fill="none"
          stroke="var(--accent-brass)"
          strokeWidth="1.5"
          strokeLinecap="round"
          style={
            reduced
              ? undefined
              : { transformOrigin: "center", animation: "spin 1.4s linear infinite" }
          }
        />
      </svg>
      <span
        key={phase}
        className={reduced ? "text-sm text-muted" : "text-sm text-muted ulika-reveal"}
      >
        {PHASES[phase]}
      </span>
    </div>
  );
}
