"use client";

import { useCallback, useEffect, useState } from "react";
import type { InteractionEvent } from "./events";
import { emptyCase, type CaseState } from "./reducer";

/**
 * Case state for one conversation: loads on mount, sends events, tracks a
 * version number.
 *
 * Optimistic locally, authoritative on the server. The tick appears instantly
 * because a checkbox that waits for a round-trip feels broken.
 *
 * The version is NOT yet a staleness mechanism. It is a count of rows in the
 * event log, it is sent to the server and ignored there, and the 409 branch
 * below cannot fire. Audit §3.6-§3.7.
 */
export function useCaseState(conversationId: string | null) {
  const [state, setState] = useState<CaseState>(emptyCase());
  const [loaded, setLoaded] = useState(false);
  const [stale, setStale] = useState(false);

  useEffect(() => {
    if (!conversationId) return;
    let cancelled = false;
    // Resetting the loaded flag when the conversation changes is a one-shot
    // sync with an external identifier, not a render cascade.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLoaded(false);

    fetch(`/api/interaction?conversationId=${encodeURIComponent(conversationId)}`)
      .then((r) => r.json())
      .then((d) => {
        if (cancelled) return;
        if (d?.state) setState(d.state);
        setLoaded(true);
      })
      .catch(() => {
        // Guests and offline both land here. The UI works, it just does not
        // persist, which is the correct degradation rather than an error.
        if (!cancelled) setLoaded(true);
      });

    return () => {
      cancelled = true;
    };
  }, [conversationId]);

  const send = useCallback(
    async (event: InteractionEvent, optimistic?: (s: CaseState) => CaseState) => {
      if (optimistic) setState((s) => optimistic(s));
      if (!conversationId) return;

      try {
        const res = await fetch("/api/interaction", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ conversationId, event, caseVersion: state.version }),
        });
        const data = await res.json();

        // UNREACHABLE TODAY, kept deliberately. /api/interaction has no 409 path:
        // it stores caseVersion without comparing it. This branch and the
        // "state.stale" copy in both locales are the client half of a guarantee
        // whose server half was never written — see
        // docs/interaction-engine-readiness-audit.md §3.6. Left in place because
        // it is correct behaviour for when the server side lands; do not read it
        // as evidence that stale rejection works.
        if (res.status === 409) setStale(true);
        else if (typeof data?.caseVersion === "number") {
          setState((s) => ({ ...s, version: data.caseVersion }));
        }
      } catch {
        /* offline — the optimistic update stands for this session */
      }
    },
    [conversationId, state.version]
  );

  return { state, loaded, stale, send };
}
