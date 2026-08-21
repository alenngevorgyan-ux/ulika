/**
 * Register an external source with its licence provenance.
 *
 * Runs verifyLicense over the findings and refuses to mark anything
 * ingestable unless a primary source was actually read. Sources that fail land
 * in /admin/sources flagged for a human, carrying both readings so whoever
 * looks at it sees the conflict rather than one side of it.
 *
 * Run: npx tsx scripts/register-source.ts
 */
import "./_load-env";
import { createClient } from "@supabase/supabase-js";
import { assertEnv } from "./_env-guard";
import {
  verifyLicense,
  normaliseLicense,
  mayStoreText,
  type LicenseFinding,
} from "../src/lib/knowledge/licenseCheck";

interface Candidate {
  id: string;
  category_id: string;
  title: string;
  author: string;
  acquisition_method: string;
  findings: LicenseFinding[];
}

const CANDIDATES: Candidate[] = [
  {
    id: "levy-human-potential",
    category_id: "psychology",
    title: "Psychology: The Science of Human Potential",
    author: "Jeffrey C. Levy",
    acquisition_method: "open_courseware",
    // Checked 2026-08-21. The author's own institutional repository at Seton
    // Hall shows NO licence statement; three secondary catalogues assert
    // CC BY 4.0; the published Pressbooks edition, which would carry the
    // actual copyright page, blocks automated access (403 to both a fetch tool
    // and a plain request with an honest user agent).
    //
    // That is a catalogue-versus-primary disagreement, which is precisely what
    // this pipeline exists to stop. A human needs to open the Pressbooks
    // copyright page in a browser and read it.
    findings: [
      // Owner read the book's own copyright page directly in a browser on
      // 2026-08-21 (this tool's own fetch attempts got 403 from BCcampus) and
      // reported the exact text back verbatim. That is what makes this
      // "primary" rather than another catalogue echo: it is the work's own
      // stated licence, not a third party's claim about it.
      {
        url: "https://pressbooks.bccampus.ca/thescienceofhumanpotential/",
        kind: "primary",
        quote:
          "Psychology Copyright © by Jeffrey C. Levy is licensed under a Creative Commons Attribution 4.0 International License, except where otherwise noted.",
      },
      {
        url: "https://www.merlot.org/merlot/viewMaterial.htm?id=773419164",
        kind: "secondary",
        quote: "licensed under a CC BY 4.0 license",
      },
      {
        url: "https://oercommons.org/courses/psychology-the-science-of-human-potential",
        kind: "secondary",
        quote: "CC BY 4.0",
      },
      // The author's institutional repository, checked earlier, still shows
      // no licence at all. Kept in the record as a genuine absence, not
      // dropped — it is why this needed a human to look rather than trusting
      // the catalogues alone.
      {
        url: "https://scholarship.shu.edu/psychology-oer/1/",
        kind: "primary",
        quote: "",
      },
    ],
  },
  {
    id: "openstax-psychology-2e",
    category_id: "psychology",
    title: "OpenStax Psychology 2e",
    author: "OpenStax / Rice University",
    acquisition_method: "open_courseware",
    // Kept on record deliberately. It was briefed as CC BY, is actually
    // NonCommercial, and that is incompatible with ever charging for this
    // product. Recording the rejection stops it being re-proposed later by
    // someone reading the same brief.
    findings: [
      {
        url: "https://openstax.org/apps/cms/api/v2/pages/417/",
        kind: "primary",
        quote: "Creative Commons Attribution-NonCommercial-ShareAlike License",
      },
    ],
  },
];

async function main() {
  // This tool has no dry-run path — every invocation writes.
  assertEnv("write");

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY_ULIKA;
  if (!url || !key) {
    console.error("Need NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY_ULIKA.");
    process.exit(1);
  }
  const supabase = createClient(url, key, { auth: { persistSession: false } });

  for (const c of CANDIDATES) {
    const verdict = verifyLicense(c.findings);
    const licenceId = verdict.quote ? normaliseLicense(verdict.quote) : "UNKNOWN";
    const storable = verdict.status === "verified" && mayStoreText(licenceId);

    const { error } = await supabase.from("knowledge_sources").upsert({
      id: c.id,
      category_id: c.category_id,
      title: c.title,
      author: c.author,
      type: "book",
      acquisition_method: c.acquisition_method,
      licence: storable ? "redistributable" : "reference_only",
      license_status: verdict.status,
      license_verified_source_url: verdict.verifiedSourceUrl ?? null,
      license_quote: verdict.quote ?? null,
      license_conflict: verdict.conflict ?? null,
      licence_note:
        verdict.status === "verified"
          ? `${licenceId}, read at the primary source.`
          : verdict.conflict?.reason ?? "Unverified.",
    });

    if (error) {
      console.error(`${c.id}: ${error.message}`);
      continue;
    }

    console.log(
      `${c.id}\n  status=${verdict.status} licence=${licenceId} text_storable=${storable}`
    );
    if (verdict.conflict) console.log(`  ${verdict.conflict.reason}`);
    console.log(
      `  -> ${storable ? "may be chunked and stored" : "NOT ingested; notes and citation only"}`
    );
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
