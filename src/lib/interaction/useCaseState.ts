"use client";

import { useCallback, useEffect, useState } from "react";
import type { InteractionEvent } from "./events";
import { emptyCase, type CaseState } from "./reducer";

/**
 * Case state for one conversation: loads on mount, sends events, tracks
 * version for staleness.
 *
 * Optimistic locally, authoritative on the server. The tick appears instantly
 * because a checkbox that waits for a round-trip feels broken; the server's
 * version number is what everything else trusts.
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

        // The server rejected this as built against an older version of the
        // case. Surfaced rather than swallowed: silently dropping a user's
        // action is worse than telling them the case moved on.
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
