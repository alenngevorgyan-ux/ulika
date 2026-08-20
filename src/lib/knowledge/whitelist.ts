/**
 * Source whitelist.
 *
 * THE DISTINCTION THAT MATTERS, and it is not the one the brief assumed:
 * "free to read" and "free to redistribute" are different things.
 *
 * gottman.com, cnvc.org, pon.harvard.edu, authentichappiness.org and
 * supermemo.guru publish articles anyone can read for free. Those articles are
 * still copyrighted. Copying their text into our database and serving it to
 * our users is redistribution, and being free to read does not license that.
 *
 * So sources are split into two licence classes, enforced in the schema rather
 * than left to discipline:
 *
 *   redistributable - public domain or an explicit open licence (CC BY etc).
 *                     We may store the actual text.
 *   reference_only  - freely readable but copyrighted. We store OUR OWN notes,
 *                     the citation, and a link. Never the source text.
 *
 * A reference_only source with stored source text is a bug, not a judgement
 * call, and ingestFullText() refuses it.
 */

export type LicenceClass = "redistributable" | "reference_only";

export interface WhitelistEntry {
  domain: string;
  label: string;
  licence: LicenceClass;
  /** Why this classification — so it can be challenged rather than trusted. */
  basis: string;
}

export const WHITELIST: WhitelistEntry[] = [
  // ---- genuinely open: text may be stored
  {
    domain: "gutenberg.org",
    label: "Project Gutenberg",
    licence: "redistributable",
    basis: "Public domain works. Gutenberg's own licence permits redistribution of the text.",
  },
  {
    domain: "standardebooks.org",
    label: "Standard Ebooks",
    licence: "redistributable",
    basis: "Public domain source texts released under CC0.",
  },
  {
    domain: "archive.org",
    label: "Internet Archive",
    licence: "redistributable",
    basis:
      "Public-domain items ONLY. Archive.org also hosts in-copyright and lending-restricted items; those are out of scope and the ingest checks item rights metadata.",
  },
  {
    domain: "openstax.org",
    label: "OpenStax",
    licence: "redistributable",
    basis: "CC BY 4.0. Explicitly permits redistribution and adaptation with attribution.",
  },
  {
    domain: "ocw.mit.edu",
    label: "MIT OpenCourseWare",
    licence: "redistributable",
    basis: "CC BY-NC-SA. Note the NC clause — fine now, needs review if this product is ever sold.",
  },
  {
    domain: "oyc.yale.edu",
    label: "Open Yale Courses",
    licence: "redistributable",
    basis: "CC BY-NC-SA, same NC caveat as MIT OCW.",
  },
  {
    domain: "ncbi.nlm.nih.gov",
    label: "PubMed Central",
    licence: "redistributable",
    basis:
      "OPEN ACCESS SUBSET ONLY. PMC hosts plenty of articles that are free to read but not openly licensed; the ingest must check the licence field per article, not assume.",
  },

  // ---- free to read, still copyrighted: our notes only, never their text
  {
    domain: "selfdeterminationtheory.org",
    label: "Self-Determination Theory (Deci & Ryan)",
    licence: "reference_only",
    basis: "Author-run library of their own papers. Freely readable, individually copyrighted.",
  },
  {
    domain: "gottman.com",
    label: "The Gottman Institute",
    licence: "reference_only",
    basis: "Free articles, all rights reserved. Cite and summarise; do not copy.",
  },
  {
    domain: "pon.harvard.edu",
    label: "Harvard Program on Negotiation",
    licence: "reference_only",
    basis: "Free to read, copyright Harvard. Summarise in our own words.",
  },
  {
    domain: "cnvc.org",
    label: "Center for Nonviolent Communication",
    licence: "reference_only",
    basis: "Some CNVC material is openly licensed and some is not; default to the stricter class.",
  },
  {
    domain: "authentichappiness.org",
    label: "Penn Positive Psychology Center",
    licence: "reference_only",
    basis:
      "Questionnaires and materials are copyrighted and several instruments have separate usage terms. Reproducing a scale verbatim is its own problem.",
  },
  {
    domain: "supermemo.guru",
    label: "SuperMemo Guru (Woźniak)",
    licence: "reference_only",
    basis: "Published openly for reading; no redistribution licence stated.",
  },
  {
    domain: "plumvillage.org",
    label: "Plum Village",
    licence: "reference_only",
    basis:
      "The brief described this as openly licensed. Not verified, and their site asserts copyright, so it takes the stricter class until someone confirms otherwise.",
  },
];

/**
 * scholar.google.com is deliberately NOT on this list.
 *
 * It has no API, its terms prohibit automated access, and it actively blocks
 * scrapers. Building against it would be both fragile and a terms violation.
 * Crossref and OpenAlex provide the same bibliographic metadata through proper
 * public APIs and are the correct tools for that job.
 */
export const REJECTED_DOMAINS: Record<string, string> = {
  "scholar.google.com":
    "No public API, automated access prohibited by its terms. Use Crossref or OpenAlex for metadata instead.",
};

export function classify(url: string): WhitelistEntry | null {
  let host: string;
  try {
    host = new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return null;
  }
  return (
    WHITELIST.find((w) => host === w.domain || host.endsWith(`.${w.domain}`)) ?? null
  );
}

export function rejectionReason(url: string): string | null {
  try {
    const host = new URL(url).hostname.replace(/^www\./, "");
    for (const [domain, reason] of Object.entries(REJECTED_DOMAINS)) {
      if (host === domain || host.endsWith(`.${domain}`)) return reason;
    }
  } catch {
    return "That is not a valid URL.";
  }
  return null;
}

/** True only when the source's own licence permits storing its text. */
export function mayStoreFullText(url: string): boolean {
  return classify(url)?.licence === "redistributable";
}
