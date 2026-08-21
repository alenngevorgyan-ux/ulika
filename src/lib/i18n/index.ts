import { EN, type TranslationKey } from "./en";
import { RU } from "./ru";

/**
 * Minimal i18n. Deliberately not a library.
 *
 * The whole requirement is: look up a UI string by key, interpolate a couple
 * of values, and let the locale reach the AI. A library would bring loaders,
 * namespaces, pluralisation rules and a provider tree for something that is
 * two objects and a function.
 *
 * Pluralisation is the one thing a real library does better. When a string
 * genuinely needs Russian plural forms, add Intl.PluralRules here rather than
 * a dependency — the existing keys use counts in positions where "Не выяснено:
 * 4" reads correctly for every number, which was a deliberate wording choice.
 */

export const LOCALES = ["en", "ru"] as const;
export type Locale = (typeof LOCALES)[number];

export const DEFAULT_LOCALE: Locale = "en";

/**
 * Armenian slots in here as Partial<Record<...>> when it arrives — a locale
 * with gaps still works, falling back to English per key. That fallback is
 * safe HERE because these are buttons and labels. It would not be safe for
 * semantic content, which is why the Mentalist's own words never live in
 * this file.
 */
const DICTIONARIES: Record<Locale, Partial<Record<TranslationKey, string>>> = {
  en: EN,
  ru: RU,
};

const STORAGE_KEY = "ulika-locale";

export function isLocale(value: unknown): value is Locale {
  return typeof value === "string" && (LOCALES as readonly string[]).includes(value);
}

/**
 * Resolve the active locale.
 *
 * Explicit choice wins; browser language is the fallback; English is the floor.
 * Reading navigator.language means a Russian speaker gets Russian chrome on
 * first load without having to find a setting.
 */
export function resolveLocale(explicit?: string | null): Locale {
  if (isLocale(explicit)) return explicit;
  if (typeof navigator !== "undefined") {
    const nav = navigator.language?.slice(0, 2).toLowerCase();
    if (isLocale(nav)) return nav;
  }
  return DEFAULT_LOCALE;
}

export function getStoredLocale(): Locale {
  if (typeof localStorage === "undefined") return DEFAULT_LOCALE;
  try {
    return resolveLocale(localStorage.getItem(STORAGE_KEY));
  } catch {
    return DEFAULT_LOCALE;
  }
}

export function setStoredLocale(locale: Locale): void {
  try {
    localStorage.setItem(STORAGE_KEY, locale);
  } catch {
    /* private mode — the session still works, the choice just won't persist */
  }
}

/**
 * Look up a string. Missing keys fall back to English, then to the key itself,
 * so a translation gap degrades to readable text rather than to blank space.
 */
export function translate(
  locale: Locale,
  key: TranslationKey,
  vars?: Record<string, string | number>
): string {
  const raw = DICTIONARIES[locale]?.[key] ?? EN[key] ?? key;
  if (!vars) return raw;
  return raw.replace(/\{(\w+)\}/g, (match, name) =>
    name in vars ? String(vars[name]) : match
  );
}

/** Full language name, for telling the model what to write in. */
export const LOCALE_NAME: Record<Locale, string> = {
  en: "English",
  ru: "Russian",
};
