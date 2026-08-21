import { MODELS } from "./modelRouter";

/**
 * Who may use the lab, and which models they may name.
 *
 * Both checks are SERVER-SIDE. A feature flag read in the browser is a
 * suggestion; an allowlist enforced in the browser is decoration. The route
 * re-checks everything regardless of what the page believes.
 */

/** Off unless explicitly enabled. Production with no value set returns 404. */
export function labEnabled(): boolean {
  return process.env.MEGABRAIN_LAB === "true";
}

/**
 * Models an admin may pick by hand, mapped from a stable UI id.
 *
 * A client never sends a provider slug. If it did, "any string reaches the
 * provider" would be true, and the cheapest exploit against a metered API is
 * naming an expensive model. The id is looked up here or the request is refused.
 */
export const LAB_MODEL_CHOICES = {
  auto: { label: "Auto", modelKey: null, available: true, note: "Server picks per mode." },
  "grok-4.3": { label: "Grok 4.3", modelKey: "grok-4.3", available: true, note: "Verified live." },
  "gemini-flash-lite": {
    label: "Gemini 3.1 Flash Lite",
    modelKey: "gemini-3.1-flash-lite",
    available: true,
    note: "Verified live. Cheapest.",
  },
  "sonnet-5": {
    label: "Claude Sonnet 5",
    modelKey: "claude-sonnet-5",
    available: false,
    note: "Unverified on this route — returned HTTP 404 twice. Disabled until diagnosed.",
  },
} as const;

export type LabModelChoice = keyof typeof LAB_MODEL_CHOICES;

export class ModelChoiceRejected extends Error {
  readonly code = "MODEL_CHOICE_REJECTED";
  constructor(reason: string) {
    super(reason);
    this.name = "ModelChoiceRejected";
  }
}

/**
 * Resolve a UI choice to a model key, or refuse.
 *
 * Refuses an unknown id, a disabled one, and anything that is not one of the
 * fixed ids — including a real, valid provider slug, because accepting those is
 * exactly the hole this exists to close.
 */
export function resolveModelChoice(choice: string | undefined): string | null {
  if (!choice || choice === "auto") return null;
  const entry = (LAB_MODEL_CHOICES as Record<string, { modelKey: string | null; available: boolean; note: string }>)[choice];
  if (!entry) throw new ModelChoiceRejected(`Unknown model choice "${choice}".`);
  if (!entry.available) throw new ModelChoiceRejected(entry.note);
  if (entry.modelKey && !MODELS[entry.modelKey]) {
    throw new ModelChoiceRejected(`Model "${entry.modelKey}" is not in the router.`);
  }
  return entry.modelKey;
}
