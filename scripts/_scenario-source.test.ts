import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createHash } from "node:crypto";
import { tmpdir } from "node:os";
import { isAbsolute, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { CANONICAL_SOURCE_PATH, parse } from "./_scenario-source";

/**
 * The 50 scenarios are the only part of the knowledge corpus written by the
 * owner rather than assembled from files in src/. Until 2026-08-21 they existed
 * in exactly two places, neither of them the repository: a ZIP in one Downloads
 * folder, and 50 rows in the live database. The ingest script read them from
 * /tmp, which had already been cleared.
 *
 * These tests are the standing guard on that recovery. They are deliberately
 * not "the corpus looks about right" checks — every assertion here is a real
 * invariant that only a deliberate content decision can change, never a number
 * that drifts as a side effect of how something is chunked or parsed.
 */

const REPO = process.cwd();
const SOURCE = join(REPO, "content/sources/ulika-50-scenarios.md");
const PROVENANCE = join(REPO, "content/sources/ulika-50-scenarios.provenance.md");

const EXPECTED_TECHNIQUES = 50;
const EXPECTED_SECTIONS = 6;

describe("the canonical scenario source is present and whole", () => {
  const md = readFileSync(SOURCE, "utf8");

  const headings = [...md.matchAll(/^### (\d+)\.\s*(.+)$/gm)];
  const numbers = headings.map((m) => Number(m[1]));

  it("exists and is not empty", () => {
    expect(md.length).toBeGreaterThan(1000);
  });

  it(`contains exactly ${EXPECTED_TECHNIQUES} techniques`, () => {
    // The real invariant. Losing some of it is the exact failure this file
    // guards against, and it can only change by someone deciding to write more.
    expect(headings).toHaveLength(EXPECTED_TECHNIQUES);
  });

  it("numbers them 1..50 with no gap and no duplicate", () => {
    // A plain count would pass on a file that had #7 twice and no #23 — which
    // is what a bad merge or a partial copy actually looks like.
    expect(numbers).toEqual(Array.from({ length: EXPECTED_TECHNIQUES }, (_, i) => i + 1));
  });

  it("gives every technique a non-empty title", () => {
    expect(headings.filter((m) => !m[2].trim()).map((m) => m[1])).toEqual([]);
  });

  it(`keeps all ${EXPECTED_SECTIONS} sections`, () => {
    expect(md.match(/^## /gm) ?? []).toHaveLength(EXPECTED_SECTIONS);
  });
});

/**
 * NOT a PII scanner, and must not be described as one. It matches four fixed
 * patterns. Text that identifies a real person by name, an address, a
 * workplace, or a paraphrased private detail passes it untouched, because no
 * regex finds those. What it does catch is the accidental paste — a key, a
 * token, a contact detail — which is the realistic way this file gets polluted.
 */
describe("the canonical source matches none of the four secret/contact patterns scanned", () => {
  const md = readFileSync(SOURCE, "utf8");

  it.each([
    ["API-key and token shapes", /sk-[a-z0-9]{10,}|eyJ[A-Za-z0-9_-]{20,}|sb_secret_|AKIA[0-9A-Z]{16}/i],
    ["private key blocks", /-----BEGIN [A-Z ]*PRIVATE KEY-----/],
    ["email addresses", /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/],
    ["phone-number-shaped digit runs", /\+?\d[\d ()-]{9,}\d/],
  ])("matches no %s", (_label, pattern) => {
    expect(pattern.test(md)).toBe(false);
  });
});

describe("provenance matches the file it describes", () => {
  it("records the same SHA-256 the committed file actually has", () => {
    // Read from the sidecar rather than hardcoded here, so there is ONE place
    // the hash lives. If the owner edits the content deliberately, this fails
    // and the provenance must be updated in the same commit — which is the
    // point: a provenance record that silently describes an older file is worse
    // than none.
    const actual = createHash("sha256").update(readFileSync(SOURCE)).digest("hex");
    const provenance = readFileSync(PROVENANCE, "utf8");
    expect(provenance).toContain(actual);
  });

  it("keeps the list of things the checksum does not establish", () => {
    // Guards against the claim being quietly upgraded. The hash shows one thing:
    // these bytes matched one local file at one moment. Everything below is
    // something it cannot show, and the sidecar has to keep saying so.
    const text = provenance();
    for (const claim of [
      "authorship",
      "legal",
      "completeness",
      "later modification",
      "independent",
    ]) {
      expect(text.toLowerCase()).toContain(claim);
    }
  });

  function provenance() {
    return readFileSync(PROVENANCE, "utf8");
  }
});

describe("the ingest script reads it from the repository", () => {
  const script = readFileSync(join(REPO, "scripts/ingest-scenarios.ts"), "utf8");

  /**
   * Comments are stripped before any of these checks. The file explains WHY the
   * old /tmp path was wrong, so a naive text search finds the string it is
   * meant to forbid and fails on the explanation rather than on the code — as
   * this test did on its first run.
   */
  const code = script.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

  const moduleCode = readFileSync(join(REPO, "scripts/_scenario-source.ts"), "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "");

  it("no longer defaults to a path under /tmp, in either file", () => {
    expect(code).not.toContain("/tmp/ulika_zip");
    expect(moduleCode).not.toContain("/tmp/ulika_zip");
  });

  it("takes its default from the shared module rather than its own copy", () => {
    // Wiring, not path resolution — the resolution itself is checked
    // behaviourally below. What this catches is the script quietly growing a
    // second definition that drifts from the one the tests exercise.
    expect(code).toContain("CANONICAL_SOURCE_PATH");
    expect(code).toMatch(/from "\.\/_scenario-source"/);
  });

  it("parses exactly 50 techniques through the parser the script itself uses", () => {
    // The same module ingest-scenarios.ts imports, so this cannot drift from
    // what the tool actually does. Previously this spawned `npx tsx` and read
    // stdout, which put a package runner inside the test runner and made the
    // shell part of what was being tested.
    const techniques = parse(readFileSync(CANONICAL_SOURCE_PATH, "utf8"));
    expect(techniques).toHaveLength(EXPECTED_TECHNIQUES);
    expect(new Set(techniques.map((t) => t.section)).size).toBe(EXPECTED_SECTIONS);
  });
});

describe("the source path does not depend on the working directory", () => {
  it("is absolute", () => {
    expect(isAbsolute(CANONICAL_SOURCE_PATH)).toBe(true);
  });

  it("resolves relative to the module, proven from this test's own location", () => {
    // Computed independently here from import.meta.url. If the script had used
    // process.cwd() or a bare relative string, these two would not agree.
    const fromThisFile = resolve(
      dirname(fileURLToPath(import.meta.url)),
      "../content/sources/ulika-50-scenarios.md"
    );
    expect(CANONICAL_SOURCE_PATH).toBe(fromThisFile);
  });

  it("still reads after the process changes directory", () => {
    // The real behavioural check, and not a string search of the source: move
    // the process somewhere else entirely and read through the same constant.
    const before = process.cwd();
    try {
      process.chdir(tmpdir());
      expect(process.cwd()).not.toBe(before);
      expect(parse(readFileSync(CANONICAL_SOURCE_PATH, "utf8"))).toHaveLength(
        EXPECTED_TECHNIQUES
      );
    } finally {
      process.chdir(before);
    }
  });
});
