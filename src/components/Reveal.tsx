"use client";

import { useEffect, useRef, useState } from "react";
import { useReducedMotion } from "./chat/primitives";

/**
 * Scroll-triggered reveal for long pages.
 *
 * IntersectionObserver rather than a scroll handler: it does not run on every
 * frame and it does not need throttling. Elements start visible and are hidden
 * only once the observer is confirmed working, so a browser without it — or a
 * failed hydration — leaves the content readable rather than blank.
 */
export default function Reveal({
  children,
  delay = 0,
}: {
  children: React.ReactNode;
  delay?: number;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [shown, setShown] = useState(true);
  const reduced = useReducedMotion();

  useEffect(() => {
    if (reduced || typeof IntersectionObserver === "undefined") return;
    const el = ref.current;
    if (!el) return;

    setShown(false);
    const obs = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setShown(true);
          obs.disconnect();
        }
      },
      { rootMargin: "0px 0px -10% 0px" }
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, [reduced]);

  return (
    <div
      ref={ref}
      style={{
        opacity: shown ? 1 : 0,
        transform: shown ? "none" : "translateY(8px)",
        transition: reduced
          ? undefined
          : `opacity var(--dur-block) var(--ease-expo-out) ${delay}ms, transform var(--dur-block) var(--ease-expo-out) ${delay}ms`,
      }}
    >
      {children}
    </div>
  );
}
