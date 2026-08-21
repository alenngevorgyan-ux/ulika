import { loadEnvConfig } from "@next/env";
import { fileURLToPath } from "node:url";

/**
 * Load `.env.local` for scripts run with tsx.
 *
 * `next dev` does this for the app; `npx tsx scripts/...` does not. Without it a
 * machine with a correctly filled-in `.env.local` looks to the guard exactly
 * like a machine with no configuration at all, and every tool refuses for the
 * wrong reason. That was the last open item on the guard before wiring.
 *
 * The directory is resolved from this module rather than `process.cwd()`, for
 * the same reason the scenario source path is: a tool launched from anywhere
 * but the repository root must still find the repository's env file.
 *
 * Import this FIRST, for its side effect, before anything that reads
 * `process.env`. Values already exported in the shell win — @next/env does not
 * overwrite them — so an explicit `ULIKA_ENV=staging npx tsx ...` still works.
 */
const REPO_ROOT = fileURLToPath(new URL("..", import.meta.url));

// Quiet on purpose. The default logger prints which files were loaded, which is
// harmless, but these tools already print little and a stray line above a
// refusal message makes the refusal harder to see.
loadEnvConfig(REPO_ROOT, /* dev */ true, { info: () => {}, error: console.error });
