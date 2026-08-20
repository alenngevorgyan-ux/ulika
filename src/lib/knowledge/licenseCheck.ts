/**
 * Licence verification, as a permanent step in the ingest.
 *
 * THE RULE: a licence is believed only when read at the PRIMARY source — the
 * author, the publisher, or the work's own copyright page. Secondary
 * catalogues are frequently wrong or stale, and three catalogues agreeing is
 * not verification, it is three copies of one unchecked claim.
 *
 * This exists because of a real near-miss. OpenStax Psychology 2e was briefed
 * as CC BY and is actually CC BY-NC-SA, which is incompatible with ever
 * charging for the product. It was caught by checking. The next one might not
 * be, so the check is now machinery rather than diligence.
 */

export type LicenseStatus = "verified" | "needs_manual_check" | "not_applicable";

export interface LicenseFinding {
  /** Where this reading came from. */
  url: string;
  /** primary = author/publisher/the work itself. secondary = a catalogue. */
  kind: "primary" | "secondary";
  /** Verbatim, as it appeared. Empty string means the page stated nothing. */
  quote: string;
}

export interface LicenseVerdict {
  status: LicenseStatus;
  /** Set only when status is "verified". */
  verifiedSourceUrl?: string;
  quote?: string;
  /** Set only when status is "needs_manual_check". */
  conflict?: { findings: LicenseFinding[]; reason: string };
}

/**
 * Decide whether a source may be ingested.
 *
 * Deliberately refuses in three separate situations rather than picking the
 * most common answer. Silence at the primary source is treated as a conflict,
 * not as consent — an OER catalogue asserting CC BY while the author's own
 * repository says nothing is exactly the shape of a stale catalogue entry.
 */
export function verifyLicense(findings: LicenseFinding[]): LicenseVerdict {
  const primary = findings.filter((f) => f.kind === "primary");
  const secondary = findings.filter((f) => f.kind === "secondary");

  if (primary.length === 0) {
    return {
      status: "needs_manual_check",
      conflict: {
        findings,
        reason:
          "No primary source was read. Catalogue entries alone are not verification.",
      },
    };
  }

  const primaryWithQuote = primary.filter((f) => f.quote.trim().length > 0);

  if (primaryWithQuote.length === 0) {
    return {
      status: "needs_manual_check",
      conflict: {
        findings,
        reason: secondary.length
          ? "The primary source states no licence, while catalogues assert one. Silence at the source is not consent, and a catalogue asserting a licence the author does not publish is the classic shape of a stale entry."
          : "The primary source states no licence.",
      },
    };
  }

  // Compare normalised licence identifiers, not raw prose: "CC BY 4.0" and
  // "Creative Commons Attribution 4.0 International" are the same licence.
  const ids = new Set(primaryWithQuote.map((f) => normaliseLicense(f.quote)));
  if (ids.size > 1) {
    return {
      status: "needs_manual_check",
      conflict: {
        findings,
        reason: `Primary sources disagree with each other (${[...ids].join(" vs ")}).`,
      },
    };
  }

  const id = [...ids][0];
  const secondaryIds = new Set(
    secondary.filter((f) => f.quote.trim()).map((f) => normaliseLicense(f.quote))
  );

  if (secondaryIds.size && !secondaryIds.has(id)) {
    return {
      status: "needs_manual_check",
      conflict: {
        findings,
        reason: `The primary source says ${id} but a catalogue says ${[...secondaryIds].join(", ")}. The primary source is more likely correct, but the gap must be resolved by a person before anything is stored.`,
      },
    };
  }

  return {
    status: "verified",
    verifiedSourceUrl: primaryWithQuote[0].url,
    quote: primaryWithQuote[0].quote,
  };
}

/** Reduce licence prose to a comparable identifier. */
export function normaliseLicense(text: string): string {
  const t = text.toLowerCase();
  if (t.includes("public domain") || t.includes("cc0")) return "PD/CC0";

  if (!t.includes("cc by") && !t.includes("creative commons attribution")) {
    return "UNKNOWN";
  }

  // Order matters: check the restrictive clauses before concluding plain BY.
  const nc = t.includes("noncommercial") || t.includes("non-commercial") || /\bnc\b/.test(t);
  const sa = t.includes("sharealike") || t.includes("share-alike") || /\bsa\b/.test(t);
  const nd = t.includes("noderiv") || /\bnd\b/.test(t);

  return ["CC BY", nc && "NC", sa && "SA", nd && "ND"].filter(Boolean).join("-");
}

/** Only unrestricted licences may have their text stored in a product that may charge. */
export function mayStoreText(licenseId: string): boolean {
  return licenseId === "PD/CC0" || licenseId === "CC BY";
}
