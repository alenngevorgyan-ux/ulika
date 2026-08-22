/**
 * Deterministic repair of an extract reply, between parsing and validation.
 *
 * WHY. A real case died with STAGE_REJECTED over exactly two claims: one goal
 * and one likely reaction, both marked `reported`, neither naming a fact. The
 * rest of the CaseFrame was complete and the run had already been paid for.
 * Destroying a whole case file over two unsupported optional sentences is a
 * worse answer than dropping the two sentences.
 *
 * WHAT THIS IS NOT. It does not soften the validators — they still refuse
 * everything they refused before, and they run afterwards on the cleaned
 * object. It does not call a model, spend a token, or invent content. It only
 * removes or normalises claims that are already known to be unusable, and it
 * says which ones by CODE and PATH, never by quoting them.
 *
 * The line it must never cross: a `reported` claim with no facts is NOT
 * reclassified as `inferred`. That would keep the sentence and change what it
 * asserts — turning something the user supposedly said into something the model
 * worked out, which is the precise distinction this whole product rests on.
 * Unusable claims are dropped, not relabelled.
 */

export type SanitationCode =
  | "UNSUPPORTED_ACTOR_CLAIM_REMOVED"
  | "UNKNOWN_FACT_REFERENCE_REMOVED"
  | "DUPLICATE_CLAIM_REMOVED"
  | "OPTIONAL_FIELD_NORMALIZED";

export interface SanitationWarning {
  code: SanitationCode;
  /** Schema path only. The removed text is never carried. */
  path: string;
}

/** The five optional claim lists on an actor. `authority` is handled separately. */
const CLAIM_LISTS = ["goals", "fears", "resources", "dependencies", "likelyReactions"] as const;

/** Mirrors the validator's own set, so the two agree on what "unknown" reads as. */
const UNKNOWN_VALUES = new Set(["unknown", "неизвестно", "не известно", "n/a", "-"]);

const HONEST_UNKNOWN = { value: "unknown", basis: "unknown", supportingFactIds: [] as string[] };

type Claim = Record<string, unknown>;

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

/**
 * Clean one claim, or refuse it.
 *
 * Returns null when the claim cannot be saved without inventing something. The
 * caller decides what null means: dropping an optional entry, or normalising a
 * required one to an honest unknown.
 */
function cleanClaim(
  raw: unknown,
  factIds: Set<string>,
  path: string,
  warn: (code: SanitationCode, path: string) => void
): Claim | null {
  if (!isObject(raw)) return null;
  const value = typeof raw.value === "string" ? raw.value.trim() : "";
  if (!value) return null;

  const basis = raw.basis;
  if (basis !== "reported" && basis !== "inferred" && basis !== "unknown") return null;

  // Referential integrity first: a claim's support is only what actually exists.
  // Ids are never invented, and a claim is never matched to a fact by wording.
  const declared = Array.isArray(raw.supportingFactIds)
    ? raw.supportingFactIds.filter((id): id is string => typeof id === "string")
    : [];
  const supportingFactIds = declared.filter((id) => factIds.has(id));
  if (supportingFactIds.length < declared.length) warn("UNKNOWN_FACT_REFERENCE_REMOVED", path);

  const uncertainty = typeof raw.uncertainty === "string" ? raw.uncertainty.trim() : "";

  if (basis === "reported" && supportingFactIds.length === 0) return null;
  if (basis === "inferred" && !uncertainty) return null;
  if (basis === "unknown" && !UNKNOWN_VALUES.has(value.toLowerCase())) {
    // "unknown" carrying specific content is an invented biography wearing an
    // honest label. The label is the part worth keeping.
    warn("OPTIONAL_FIELD_NORMALIZED", path);
    return { ...HONEST_UNKNOWN };
  }

  return {
    value,
    basis,
    supportingFactIds,
    ...(uncertainty ? { uncertainty } : {}),
  };
}

function cleanClaimList(
  raw: unknown,
  factIds: Set<string>,
  path: string,
  warn: (code: SanitationCode, path: string) => void
): Claim[] {
  if (!Array.isArray(raw)) return [];
  const out: Claim[] = [];
  const seen = new Set<string>();
  raw.forEach((entry, i) => {
    const at = `${path}[${i}]`;
    const cleaned = cleanClaim(entry, factIds, at, warn);
    if (!cleaned) {
      // An entry that was never a claim is a normalisation; one that was a claim
      // and could not be supported is a removal. The codes say which.
      warn(isObject(entry) && typeof entry.value === "string" && entry.value.trim()
        ? "UNSUPPORTED_ACTOR_CLAIM_REMOVED"
        : "OPTIONAL_FIELD_NORMALIZED", at);
      return;
    }
    const key = `${cleaned.basis}::${String(cleaned.value).toLowerCase()}`;
    if (seen.has(key)) {
      warn("DUPLICATE_CLAIM_REMOVED", at);
      return;
    }
    seen.add(key);
    out.push(cleaned);
  });
  return out;
}

/**
 * Sanitise a parsed extract reply.
 *
 * Pure and total: same input, same output, no clock, no randomness, no network.
 * Anything it cannot recognise is passed through untouched for the validators to
 * refuse — silently dropping an unrecognised shape would hide a real defect.
 */
export function sanitizeExtract(raw: unknown): { value: unknown; warnings: SanitationWarning[] } {
  if (!isObject(raw)) return { value: raw, warnings: [] };

  const warnings: SanitationWarning[] = [];
  const warn = (code: SanitationCode, path: string) => warnings.push({ code, path });

  const frame = isObject(raw.frame) ? raw.frame : null;
  const facts = Array.isArray(frame?.reportedFacts) ? frame.reportedFacts : [];
  const factIds = new Set(
    facts
      .filter(isObject)
      .map((f) => f.id)
      .filter((id): id is string => typeof id === "string")
  );

  const actorsContainer = isObject(raw.actors) ? raw.actors : null;
  const actorsRaw = actorsContainer && Array.isArray(actorsContainer.actors) ? actorsContainer.actors : null;
  if (!actorsContainer || !actorsRaw) return { value: raw, warnings };

  const actors = actorsRaw.map((a, i) => {
    if (!isObject(a)) return a;
    const p = `actors[${i}]`;
    const out: Record<string, unknown> = { ...a };
    for (const list of CLAIM_LISTS) {
      out[list] = cleanClaimList(a[list], factIds, `${p}.${list}`, warn);
    }
    // authority is a single required claim: an actor without one is not an
    // actor with fewer opinions, it is a broken record. So it is normalised to
    // an honest unknown rather than removed.
    const authority = cleanClaim(a.authority, factIds, `${p}.authority`, warn);
    if (!authority) {
      warn("OPTIONAL_FIELD_NORMALIZED", `${p}.authority`);
      out.authority = { ...HONEST_UNKNOWN };
    } else {
      out.authority = authority;
    }
    return out;
  });

  return { value: { ...raw, actors: { ...actorsContainer, actors } }, warnings };
}
