import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";

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

describe("the canonical source carries no secrets or personal data", () => {
  const md = readFileSync(SOURCE, "utf8");

  it.each([
    ["API keys and tokens", /sk-[a-z0-9]{10,}|eyJ[A-Za-z0-9_-]{20,}|sb_secret_|AKIA[0-9A-Z]{16}/i],
    ["private key blocks", /-----BEGIN [A-Z ]*PRIVATE KEY-----/],
    ["email addresses", /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/],
    ["phone numbers", /\+?\d[\d ()-]{9,}\d/],
  ])("contains no %s", (_label, pattern) => {
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

  it("states what the checksum does not prove", () => {
    // Guards against the claim being quietly upgraded into "integrity check".
    expect(provenance()).toMatch(/does \*\*not\*\* prove integrity inside the repository/);
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

  it("no longer defaults to a path under /tmp", () => {
    expect(code).not.toContain("/tmp/ulika_zip");
  });

  it("defaults to the committed canonical file", () => {
    expect(code).toContain("../content/sources/ulika-50-scenarios.md");
  });

  it("resolves that path independently of the working directory", () => {
    // A bare relative string would break the moment the script is launched from
    // anywhere but the repo root.
    expect(code).toMatch(/fileURLToPath\(\s*new URL\(/);
  });

  it("parses exactly 50 techniques through the real --dry-run path", () => {
    // The acceptance criterion for this step, run literally rather than
    // approximated: the actual script, its actual default path, its actual
    // parser. --dry-run returns before any database or embedding call, so this
    // touches nothing.
    const out = execFileSync("npx", ["tsx", "scripts/ingest-scenarios.ts", "--dry-run"], {
      cwd: REPO,
      encoding: "utf8",
      timeout: 120_000,
    });
    expect(out).toContain(`parsed ${EXPECTED_TECHNIQUES} techniques across ${EXPECTED_SECTIONS} sections`);
  }, 120_000);
});
