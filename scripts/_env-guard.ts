/**
 * The environment contract every server-side database tool must clear first.
 *
 * The problem it solves is specific and has already nearly happened here: this
 * project has ONE Supabase project, its URL lives in a `.env.local` that is
 * edited by hand, and the seed/admin scripts write with a service-role key that
 * bypasses RLS entirely. Nothing stops a shell with the wrong `.env` loaded from
 * rewriting the live corpus. A guard that runs before the first request is the
 * cheapest place to stop that, and the only place that works regardless of which
 * script is being run.
 *
 * DENY BY DEFAULT, and deliberately stricter than strictly necessary. Missing
 * variable, unrecognised value, unparseable URL, host that is not Supabase —
 * all refuse. Failing closed costs a human thirty seconds of reading an error;
 * failing open costs the corpus. Where the two trade off, this file chooses the
 * thirty seconds every time.
 *
 * Split into a pure core and a thin imperative shell for the same reason
 * src/lib/interaction does it: `evaluate()` takes an env object and returns a
 * verdict, so every branch is testable without touching process.env, a network
 * or a database. `assertEnv()` is the four-line wrapper that reads the real
 * environment and throws.
 *
 * ── STATUS ──────────────────────────────────────────────────────────────────
 * WIRED. `scripts/ingest-knowledge.ts`, `scripts/ingest-scenarios.ts` and
 * `scripts/register-source.ts` all call `assertEnv("write")` before they read
 * any credential or construct a Supabase client. `scripts/_load-env.ts` loads
 * `.env.local` first, because tsx does not do it the way `next dev` does.
 *
 * `--dry-run` deliberately does NOT go through the guard: those paths write
 * nothing, and they must stay usable on a machine with no configuration at all.
 *
 * What this does and does not buy today: the staging allowlist in
 * `_environments.ts` is EMPTY, so every one of these tools now refuses to write
 * to any project whatsoever. That is the intended state until a staging project
 * exists and its ref is added there in a reviewed commit. Turning writes back
 * on is a repository change, not an `.env.local` edit.
 *
 * A test pins the exact set of write tools and asserts every one of them calls
 * the guard. It is a text check over source, not proof, and it cannot see a
 * tool that reaches Supabase through a wrapper.
 * ────────────────────────────────────────────────────────────────────────────
 */

import { ENVIRONMENT_BINDINGS, type EnvironmentBinding } from "./_environments";

/** Which environment the operator claims to be pointed at. */
export const ULIKA_ENVS = ["local", "staging", "production"] as const;
export type UlikaEnv = (typeof ULIKA_ENVS)[number];

/** Read-only inspection, or something that can modify data. */
export type Access = "read" | "write";

export type DenialCode =
  | "ULIKA_ENV_MISSING"
  | "ULIKA_ENV_UNKNOWN"
  | "EXPECTED_REF_MISSING"
  | "SUPABASE_URL_MISSING"
  | "SUPABASE_URL_UNPARSEABLE"
  | "SUPABASE_URL_NOT_HTTPS"
  | "SUPABASE_URL_NOT_BARE_ORIGIN"
  | "SUPABASE_HOST_NOT_SUPABASE"
  | "PROJECT_REF_MALFORMED"
  | "PROJECT_REF_MISMATCH"
  | "WRITE_OUTSIDE_STAGING"
  | "WRITE_TARGET_NOT_ALLOWLISTED"
  | "ENVIRONMENT_LABEL_CONTRADICTS_REF"
  | "SERVICE_ROLE_PUBLICLY_NAMED"
  | "SERVICE_ROLE_PUBLICLY_EXPOSED";

export type GuardVerdict =
  | { ok: true; env: UlikaEnv; projectRef: string }
  | { ok: false; code: DenialCode; message: string };

/**
 * Supabase project refs are a fixed-length lowercase alphanumeric slug. The
 * bound is loose enough not to break on a future ref length and tight enough
 * that a path fragment or a typo does not pass as one.
 */
const PROJECT_REF = /^[a-z0-9]{16,32}$/;

const SUPABASE_HOST_SUFFIX = ".supabase.co";

/**
 * Pull the project ref out of a Supabase URL.
 *
 * Parsed as a URL rather than pattern-matched on the string, so that a
 * lookalike host — `abcd.supabase.co.attacker.example` — is rejected on its
 * hostname instead of matching a substring somewhere in the middle.
 *
 * Returns a denial code rather than null so the caller can say WHICH thing was
 * wrong; "could not read the project ref" is not an actionable error message at
 * 2am.
 */
export function projectRefFromUrl(
  rawUrl: string
): { ok: true; ref: string } | { ok: false; code: DenialCode } {
  let url: URL;
  try {
    url = new URL(rawUrl.trim());
  } catch {
    return { ok: false, code: "SUPABASE_URL_UNPARSEABLE" };
  }

  // A service-role key travels on this URL. Plaintext transport for it is not
  // a downgrade to argue about — it is the key in the clear.
  if (url.protocol !== "https:") return { ok: false, code: "SUPABASE_URL_NOT_HTTPS" };

  // Credentials in the URL end up in shell history, process listings and logs;
  // a path, query or fragment on a base URL means it is not a base URL and
  // something is redirecting the client somewhere unexamined.
  if (
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    (url.pathname !== "" && url.pathname !== "/")
  ) {
    return { ok: false, code: "SUPABASE_URL_NOT_BARE_ORIGIN" };
  }

  const host = url.hostname.toLowerCase();
  if (!host.endsWith(SUPABASE_HOST_SUFFIX)) {
    // Covers a self-hosted or local Supabase too. That is intentional: a local
    // stack has no project ref, so this contract cannot say anything true about
    // it, and saying nothing true is a refusal.
    return { ok: false, code: "SUPABASE_HOST_NOT_SUPABASE" };
  }

  const ref = host.slice(0, -SUPABASE_HOST_SUFFIX.length);
  if (!PROJECT_REF.test(ref)) return { ok: false, code: "PROJECT_REF_MALFORMED" };

  return { ok: true, ref };
}

const DENIAL_TEXT: Record<DenialCode, string> = {
  ULIKA_ENV_MISSING:
    "ULIKA_ENV is not set. Every database tool must state which environment it is pointed at.",
  ULIKA_ENV_UNKNOWN: `ULIKA_ENV must be one of: ${ULIKA_ENVS.join(", ")}.`,
  EXPECTED_REF_MISSING:
    "EXPECTED_SUPABASE_PROJECT_REF is not set. Without it there is nothing to check the URL against.",
  SUPABASE_URL_MISSING: "NEXT_PUBLIC_SUPABASE_URL is not set.",
  SUPABASE_URL_UNPARSEABLE: "NEXT_PUBLIC_SUPABASE_URL is not a valid URL.",
  SUPABASE_URL_NOT_HTTPS:
    "NEXT_PUBLIC_SUPABASE_URL must use https. A service-role key must never travel in the clear.",
  SUPABASE_URL_NOT_BARE_ORIGIN:
    "NEXT_PUBLIC_SUPABASE_URL must be a bare origin — no credentials, path, query or fragment.",
  SUPABASE_HOST_NOT_SUPABASE:
    "NEXT_PUBLIC_SUPABASE_URL does not point at a *.supabase.co host, so no project ref can be verified.",
  PROJECT_REF_MALFORMED:
    "The host does not carry a well-formed Supabase project ref.",
  PROJECT_REF_MISMATCH:
    "The Supabase URL points at a DIFFERENT project than EXPECTED_SUPABASE_PROJECT_REF. Refusing before any query.",
  WRITE_OUTSIDE_STAGING:
    "Write access is only permitted with ULIKA_ENV=staging. Refusing before any query.",
  WRITE_TARGET_NOT_ALLOWLISTED:
    "This project is not in the staging allowlist in scripts/_environments.ts, so it may not be written to. ULIKA_ENV alone is the operator's claim, not proof.",
  ENVIRONMENT_LABEL_CONTRADICTS_REF:
    "ULIKA_ENV does not match the environment this project ref is bound to in scripts/_environments.ts. One of the two is wrong; refusing rather than guessing which.",
  SERVICE_ROLE_PUBLICLY_NAMED:
    "A variable named for the service role carries a value under a NEXT_PUBLIC_ prefix. Anything so prefixed is bundled into the browser.",
  SERVICE_ROLE_PUBLICLY_EXPOSED:
    "A NEXT_PUBLIC_ variable holds what appears to be a service-role secret. That value is bundled into the browser and bypasses RLS entirely.",
};

/**
 * Does this value look like a secret that bypasses RLS?
 *
 * Checking variable NAMES is not enough, and assuming it was is how the first
 * version of this file failed review: pasting a service-role key into
 * NEXT_PUBLIC_SUPABASE_ANON_KEY — a plausible slip, the two sit next to each
 * other in the dashboard — passed a name-only check and would have been
 * published to every visitor.
 *
 * Two shapes, both current:
 *   - `sb_secret_…`, Supabase's newer secret key format;
 *   - a legacy JWT whose payload carries `"role":"service_role"`. The anon key
 *     is the same shape with `"role":"anon"`, which is exactly why the claim
 *     has to be read rather than the format guessed at.
 *
 * Never throws and never returns the value: a malformed token is simply not a
 * match, and callers report the variable NAME only.
 */
export function looksLikeServiceRoleSecret(value: string): boolean {
  const v = value.trim();
  if (!v) return false;
  if (v.startsWith("sb_secret_")) return true;

  const parts = v.split(".");
  if (parts.length !== 3) return false;
  try {
    const payload = Buffer.from(
      parts[1].replace(/-/g, "+").replace(/_/g, "/"),
      "base64"
    ).toString("utf8");
    return (JSON.parse(payload) as { role?: unknown }).role === "service_role";
  } catch {
    return false;
  }
}

function deny(code: DenialCode, detail = ""): GuardVerdict {
  return { ok: false, code, message: DENIAL_TEXT[code] + (detail ? ` ${detail}` : "") };
}

/**
 * The whole decision, as a pure function of an environment snapshot.
 *
 * Order matters: the service-role naming check runs FIRST, because a
 * service-role key sitting in a NEXT_PUBLIC_ variable is already shipped to
 * every browser that loads the app. That is a live exposure, not a
 * misconfiguration to be reported after the ref check passes.
 */
export function evaluate(
  env: Record<string, string | undefined>,
  access: Access,
  // Injectable so tests can exercise a populated allowlist without editing the
  // real one, and so the real one stays a plain reviewable table.
  bindings: Record<UlikaEnv, EnvironmentBinding> = ENVIRONMENT_BINDINGS
): GuardVerdict {
  const serverSideSecret = env.SUPABASE_SERVICE_ROLE_KEY_ULIKA?.trim();

  for (const [key, raw] of Object.entries(env)) {
    if (!key.startsWith("NEXT_PUBLIC_")) continue;
    const value = raw?.trim();
    if (!value) continue;

    // Only ever the variable name in the message — never the value.
    if (/SERVICE_ROLE/i.test(key)) {
      return deny("SERVICE_ROLE_PUBLICLY_NAMED", `Offending variable: ${key}.`);
    }
    if (serverSideSecret && value === serverSideSecret) {
      return deny(
        "SERVICE_ROLE_PUBLICLY_EXPOSED",
        `${key} holds the same value as SUPABASE_SERVICE_ROLE_KEY_ULIKA.`
      );
    }
    if (looksLikeServiceRoleSecret(value)) {
      return deny("SERVICE_ROLE_PUBLICLY_EXPOSED", `Offending variable: ${key}.`);
    }
  }

  const rawEnvName = env.ULIKA_ENV?.trim();
  if (!rawEnvName) return deny("ULIKA_ENV_MISSING");
  if (!(ULIKA_ENVS as readonly string[]).includes(rawEnvName)) {
    return deny("ULIKA_ENV_UNKNOWN", `Got: ${JSON.stringify(rawEnvName)}.`);
  }
  const ulikaEnv = rawEnvName as UlikaEnv;

  const expected = env.EXPECTED_SUPABASE_PROJECT_REF?.trim();
  if (!expected) return deny("EXPECTED_REF_MISSING");

  const url = env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  if (!url) return deny("SUPABASE_URL_MISSING");

  const parsed = projectRefFromUrl(url);
  if (!parsed.ok) return deny(parsed.code);

  if (parsed.ref !== expected) {
    // Neither value is a secret — a project ref is public — so naming both is
    // safe and is the difference between a fixable error and a puzzle.
    return deny(
      "PROJECT_REF_MISMATCH",
      `URL is ${parsed.ref}, expected ${expected}.`
    );
  }

  // The label is only the operator's claim. If the repository binds this ref to
  // a DIFFERENT environment, the two disagree about where we are, and that is
  // true whether we are reading or writing — continuing would mean working in a
  // project the operator does not think they are in.
  const boundTo = (Object.keys(bindings) as UlikaEnv[]).find((name) =>
    bindings[name].projectRefs.includes(parsed.ref)
  );
  if (boundTo && boundTo !== ulikaEnv) {
    return deny(
      "ENVIRONMENT_LABEL_CONTRADICTS_REF",
      `ULIKA_ENV says ${ulikaEnv}, but ${parsed.ref} is recorded as ${boundTo}.`
    );
  }

  // Checked last on purpose: "you are pointed at the wrong project" is more
  // urgent than "this environment may not be written to", and reporting the
  // wrong project first is what stops someone re-running with a write flag.
  if (access === "write") {
    if (ulikaEnv !== "staging") {
      return deny("WRITE_OUTSIDE_STAGING", `ULIKA_ENV is ${ulikaEnv}.`);
    }
    // The half the operator cannot edit alongside their credentials. Without it
    // a stale .env.local that still says staging while pointing at production
    // is self-consistent, and self-consistency is not correctness.
    if (!bindings.staging.projectRefs.includes(parsed.ref)) {
      return deny("WRITE_TARGET_NOT_ALLOWLISTED", `Project ${parsed.ref} is not listed.`);
    }
  }

  return { ok: true, env: ulikaEnv, projectRef: parsed.ref };
}

/**
 * Imperative shell: read the real environment, throw on refusal.
 *
 * Throws rather than calling process.exit so a caller can catch it and so the
 * message is visible in a stack trace during development.
 */
export function assertEnv(access: Access): { env: UlikaEnv; projectRef: string } {
  const verdict = evaluate(process.env, access);
  if (!verdict.ok) {
    throw new Error(`[ulika env guard] ${verdict.code}: ${verdict.message}`);
  }
  return { env: verdict.env, projectRef: verdict.projectRef };
}
