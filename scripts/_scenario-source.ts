import { fileURLToPath } from "node:url";

/**
 * The canonical scenario source: where it lives, and how it is parsed.
 *
 * Split out of ingest-scenarios.ts so both the ingest tool and its tests use the
 * SAME path resolution and the SAME parser. The alternative was a test that
 * spawns the script through npx to observe its output, which puts a package
 * runner inside the test runner and makes a shell the thing under test.
 *
 * Nothing here talks to a database, a network or an embedding provider, so it
 * can be imported freely. The ingest script keeps every other decision it had.
 */

/**
 * Absolute path to the committed source, resolved from THIS MODULE'S location
 * rather than from the working directory.
 *
 * That distinction is the whole point: the previous default was a bare string
 * under /tmp, and a bare relative string would have broken the moment the script
 * was launched from anywhere but the repository root.
 */
export const CANONICAL_SOURCE_PATH = fileURLToPath(
  new URL("../content/sources/ulika-50-scenarios.md", import.meta.url)
);

export interface Technique {
  n: number;
  title: string;
  section: string;
  mechanism: string;
  scenario: string;
}

/**
 * One technique per `### N. Title` heading, grouped under the `## ` section it
 * falls in. The mechanism is the italic line directly under the heading;
 * everything after it is the scenario.
 */
export function parse(md: string): Technique[] {
  const out: Technique[] = [];
  let section = "";
  let cur: Technique | null = null;
  const body: string[] = [];

  const flush = () => {
    if (!cur) return;
    const text = body.join("\n").trim();
    // The mechanism is the italic line directly under the heading; everything
    // after it is the scenario.
    const m = text.match(/^\*([\s\S]+?)\*\s*/);
    cur.mechanism = m ? m[1].replace(/^Механизм:\s*/i, "").trim() : "";
    cur.scenario = (m ? text.slice(m[0].length) : text).trim();
    out.push(cur);
    body.length = 0;
  };

  for (const line of md.split("\n")) {
    if (line.startsWith("## ")) {
      flush();
      cur = null;
      section = line.slice(3).trim();
    } else if (line.startsWith("### ")) {
      flush();
      const h = line.slice(4).trim();
      const m = h.match(/^(\d+)\.\s*(.+)$/);
      cur = m
        ? { n: Number(m[1]), title: m[2].trim(), section, mechanism: "", scenario: "" }
        : null;
    } else if (cur) {
      body.push(line);
    }
  }
  flush();
  return out;
}
