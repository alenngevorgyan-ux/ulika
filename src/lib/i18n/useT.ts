"use client";

import { useCallback, useEffect, useState } from "react";
import type { TranslationKey } from "./en";
import {
  DEFAULT_LOCALE,
  getStoredLocale,
  setStoredLocale,
  translate,
  type Locale,
} from "./index";

/**
 * Locale hook.
 *
 * No context provider on purpose. A provider would need to wrap the tree and
 * every component that wants a string would need to be inside it; reading
 * localStorage directly costs nothing and works in any component, including
 * ones rendered outside a provider by mistake.
 *
 * Starts at the default and corrects after mount, because localStorage does
 * not exist during server render and a mismatch would produce a hydration
 * error. The first paint being English for one frame is an acceptable trade
 * for not needing a provider.
 */
export function useT() {
  const [locale, setLocale] = useState<Locale>(DEFAULT_LOCALE);

  useEffect(() => {
    // localStorage is an external store and this is a one-shot read on mount,
    // not a render-driven cascade. Lazy useState would desync SSR and produce
    // a hydration mismatch, which is a real bug rather than a lint smell.
    const stored = getStoredLocale();
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (stored !== DEFAULT_LOCALE) setLocale(stored);
  }, []);

  const t = useCallback(
    (key: TranslationKey, vars?: Record<string, string | number>) =>
      translate(locale, key, vars),
    [locale]
  );

  const change = useCallback((next: Locale) => {
    setStoredLocale(next);
    setLocale(next);
  }, []);

  return { t, locale, setLocale: change };
}
