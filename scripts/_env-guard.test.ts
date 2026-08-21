import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import {
  evaluate,
  projectRefFromUrl,
  assertEnv,
  looksLikeServiceRoleSecret,
  ULIKA_ENVS,
} from "./_env-guard";

/** A Supabase-shaped JWT carrying the given role claim. Signature is not read. */
const jwt = (role: string) =>
  `header.${Buffer.from(JSON.stringify({ role, iss: "supabase" }))
    .toString("base64url")}.signature`;

const SERVICE_ROLE_JWT = jwt("service_role");
const ANON_JWT = jwt("anon");

const REF = "skbdkzddvbiljwtrcqjf";
const OTHER = "aaaabbbbccccddddeeee";
const PROD_REF = "ppppqqqqrrrrsssstttt";

/** A populated binding table, so the allowlist rules can be exercised. */
const BOUND = {
  staging: { projectRefs: [REF] },
  production: { projectRefs: [PROD_REF] },
  local: { projectRefs: [] },
};

/** A minimal environment that passes, so each test can break exactly one thing. */
const good = (over: Record<string, string | undefined> = {}) => ({
  ULIKA_ENV: "staging",
  EXPECTED_SUPABASE_PROJECT_REF: REF,
  NEXT_PUBLIC_SUPABASE_URL: `https://${REF}.supabase.co`,
  ...over,
});

describe("project ref extraction", () => {
  it("reads the ref out of a normal Supabase URL", () => {
    expect(projectRefFromUrl(`https://${REF}.supabase.co`)).toEqual({ ok: true, ref: REF });
  });

  it("tolerates a trailing slash and surrounding whitespace", () => {
    expect(projectRefFromUrl(`  https://${REF}.supabase.co/  `)).toEqual({ ok: true, ref: REF });
  });

  it("rejects a lookalike host rather than matching a substring", () => {
    // The whole reason this parses a URL instead of running a regex over the
    // string: the ref IS present here, just not where it counts.
    expect(projectRefFromUrl(`https://${REF}.supabase.co.attacker.example`)).toEqual({
      ok: false,
      code: "SUPABASE_HOST_NOT_SUPABASE",
    });
  });

  it("refuses a local or self-hosted stack, which has no ref to verify", () => {
    // A local stack is refused twice over: it is plaintext, and it carries no
    // project ref. The https rule runs first, so that is the code returned —
    // asserted explicitly rather than left as whichever check happens to win.
    expect(projectRefFromUrl("http://127.0.0.1:54321")).toEqual({
      ok: false,
      code: "SUPABASE_URL_NOT_HTTPS",
    });
    expect(projectRefFromUrl("https://localhost:54321")).toEqual({
      ok: false,
      code: "SUPABASE_HOST_NOT_SUPABASE",
    });
  });

  it("refuses plaintext and non-web protocols — the service-role key rides this URL", () => {
    for (const url of [
      `http://${REF}.supabase.co`,
      `ftp://${REF}.supabase.co`,
    ]) {
      expect(projectRefFromUrl(url)).toEqual({ ok: false, code: "SUPABASE_URL_NOT_HTTPS" });
    }
  });

  it("refuses credentials, a path, a query or a fragment on the base URL", () => {
    for (const url of [
      `https://user:pass@${REF}.supabase.co`,
      `https://${REF}.supabase.co/rest/v1`,
      `https://${REF}.supabase.co/?apikey=leaked`,
      `https://${REF}.supabase.co/#fragment`,
    ]) {
      expect(projectRefFromUrl(url)).toEqual({
        ok: false,
        code: "SUPABASE_URL_NOT_BARE_ORIGIN",
      });
    }
  });

  it("refuses junk instead of guessing", () => {
    for (const junk of ["", "not a url", "supabase.co", "/rest/v1"]) {
      expect(projectRefFromUrl(junk).ok).toBe(false);
    }
  });

  it("refuses a malformed ref on an otherwise correct host", () => {
    expect(projectRefFromUrl("https://ab.supabase.co")).toEqual({
      ok: false,
      code: "PROJECT_REF_MALFORMED",
    });
  });
});

describe("deny by default", () => {
  it("passes a read when everything is present and matching", () => {
    expect(evaluate(good(), "read")).toEqual({ ok: true, env: "staging", projectRef: REF });
  });

  it("refuses a WRITE under the shipped, empty allowlist", () => {
    // The real scripts/_environments.ts lists nothing, because no staging
    // project exists yet. Until one is added in a reviewed commit, no project
    // on earth may be written to. This test is the reminder of that.
    const verdict = evaluate(good(), "write");
    expect(verdict.ok === false && verdict.code).toBe("WRITE_TARGET_NOT_ALLOWLISTED");
  });

  it("refuses an empty environment outright", () => {
    expect(evaluate({}, "read").ok).toBe(false);
  });

  it.each([
    ["ULIKA_ENV", "ULIKA_ENV_MISSING"],
    ["EXPECTED_SUPABASE_PROJECT_REF", "EXPECTED_REF_MISSING"],
    ["NEXT_PUBLIC_SUPABASE_URL", "SUPABASE_URL_MISSING"],
  ])("refuses when %s is absent", (key, code) => {
    const verdict = evaluate(good({ [key]: undefined }), "read");
    expect(verdict.ok).toBe(false);
    expect(verdict.ok === false && verdict.code).toBe(code);
  });

  it("treats a whitespace-only value as absent, not as a value", () => {
    const verdict = evaluate(good({ EXPECTED_SUPABASE_PROJECT_REF: "   " }), "read");
    expect(verdict.ok === false && verdict.code).toBe("EXPECTED_REF_MISSING");
  });

  it("refuses an unrecognised ULIKA_ENV rather than falling back to something", () => {
    const verdict = evaluate(good({ ULIKA_ENV: "stage" }), "read");
    expect(verdict.ok === false && verdict.code).toBe("ULIKA_ENV_UNKNOWN");
  });

  it("does not accept a differently-cased env name", () => {
    expect(evaluate(good({ ULIKA_ENV: "Staging" }), "read").ok).toBe(false);
  });
});

describe("project ref must match exactly", () => {
  it("refuses when the URL points at another project", () => {
    const verdict = evaluate(good({ EXPECTED_SUPABASE_PROJECT_REF: OTHER }), "read");
    expect(verdict.ok === false && verdict.code).toBe("PROJECT_REF_MISMATCH");
  });

  it("names both refs in the message, since neither is a secret", () => {
    const verdict = evaluate(good({ EXPECTED_SUPABASE_PROJECT_REF: OTHER }), "read");
    expect(verdict.ok === false && verdict.message).toContain(REF);
    expect(verdict.ok === false && verdict.message).toContain(OTHER);
  });

  it("refuses a mismatch on READ too, not only on write", () => {
    // Reading the wrong project is how someone concludes the corpus is missing
    // and then "repairs" it into the right one.
    expect(evaluate(good({ EXPECTED_SUPABASE_PROJECT_REF: OTHER }), "read").ok).toBe(false);
  });

  it("reports the wrong project before the write rule", () => {
    const verdict = evaluate(
      good({ ULIKA_ENV: "production", EXPECTED_SUPABASE_PROJECT_REF: OTHER }),
      "write"
    );
    expect(verdict.ok === false && verdict.code).toBe("PROJECT_REF_MISMATCH");
  });
});

describe("writes are confined to an allowlisted staging project", () => {
  it("allows a write to a project the repository records as staging", () => {
    expect(evaluate(good(), "write", BOUND).ok).toBe(true);
  });

  it.each(["production", "local"])("refuses a write labelled %s", (env) => {
    const verdict = evaluate(good({ ULIKA_ENV: env }), "write", BOUND);
    expect(verdict.ok === false && verdict.code).toBe("ENVIRONMENT_LABEL_CONTRADICTS_REF");
  });

  it("refuses a write to an unlisted project even with a staging label", () => {
    const unlisted = "zzzzyyyyxxxxwwwwvvvv";
    const verdict = evaluate(
      good({
        EXPECTED_SUPABASE_PROJECT_REF: unlisted,
        NEXT_PUBLIC_SUPABASE_URL: `https://${unlisted}.supabase.co`,
      }),
      "write",
      BOUND
    );
    expect(verdict.ok === false && verdict.code).toBe("WRITE_TARGET_NOT_ALLOWLISTED");
  });

  it("still allows a read of production, so inspection stays possible", () => {
    const verdict = evaluate(
      good({
        ULIKA_ENV: "production",
        EXPECTED_SUPABASE_PROJECT_REF: PROD_REF,
        NEXT_PUBLIC_SUPABASE_URL: `https://${PROD_REF}.supabase.co`,
      }),
      "read",
      BOUND
    );
    expect(verdict.ok).toBe(true);
  });
});

describe("a self-consistent but mislabelled .env.local is refused", () => {
  /**
   * The exact configuration that passed before this rule existed: URL and
   * expected ref agree with each other, the operator has simply left the wrong
   * environment label on production credentials. Copying an .env.local or
   * editing the URL without editing the label both produce it.
   */
  const mislabelledProduction = good({
    ULIKA_ENV: "staging",
    EXPECTED_SUPABASE_PROJECT_REF: PROD_REF,
    NEXT_PUBLIC_SUPABASE_URL: `https://${PROD_REF}.supabase.co`,
  });

  it("refuses the write outright", () => {
    const verdict = evaluate(mislabelledProduction, "write", BOUND);
    expect(verdict.ok).toBe(false);
    expect(verdict.ok === false && verdict.code).toBe("ENVIRONMENT_LABEL_CONTRADICTS_REF");
  });

  it("refuses the READ too — the operator is not where they think they are", () => {
    const verdict = evaluate(mislabelledProduction, "read", BOUND);
    expect(verdict.ok).toBe(false);
    expect(verdict.ok === false && verdict.code).toBe("ENVIRONMENT_LABEL_CONTRADICTS_REF");
  });

  it("cannot detect the mislabel at all while the shipped table is empty", () => {
    // The honest limit of what is shipped today, asserted rather than left to
    // be discovered. With no refs on record the guard has nothing to contradict
    // the label with, so this read is permitted. Writes are still impossible —
    // the empty staging list blocks them — so the exposure is bounded, and it
    // closes the moment the production ref is added to scripts/_environments.ts.
    expect(evaluate(mislabelledProduction, "read").ok).toBe(true);
    const write = evaluate(mislabelledProduction, "write");
    expect(write.ok === false && write.code).toBe("WRITE_TARGET_NOT_ALLOWLISTED");
  });

  it("names both the claimed label and the recorded one", () => {
    const verdict = evaluate(mislabelledProduction, "write", BOUND);
    expect(verdict.ok === false && verdict.message).toContain("staging");
    expect(verdict.ok === false && verdict.message).toContain("production");
  });

  it("is not saved by env self-consistency — URL and ref agree here", () => {
    expect(mislabelledProduction.NEXT_PUBLIC_SUPABASE_URL).toContain(
      mislabelledProduction.EXPECTED_SUPABASE_PROJECT_REF
    );
  });
});

describe("service-role secret detection", () => {
  it("recognises the newer sb_secret_ format", () => {
    expect(looksLikeServiceRoleSecret("sb_secret_abc123")).toBe(true);
  });

  it("recognises a legacy JWT by its role claim", () => {
    expect(looksLikeServiceRoleSecret(SERVICE_ROLE_JWT)).toBe(true);
  });

  it("does NOT flag the anon key, which is the same shape with a different claim", () => {
    expect(looksLikeServiceRoleSecret(ANON_JWT)).toBe(false);
  });

  it("does not flag a publishable key or ordinary text", () => {
    for (const v of ["sb_publishable_abc123", "", "   ", "not-a-jwt", "a.b.c"]) {
      expect(looksLikeServiceRoleSecret(v)).toBe(false);
    }
  });
});

describe("service-role may never reach a NEXT_PUBLIC_ variable", () => {
  it("refuses outright if a service-role key sits in a NEXT_PUBLIC_ variable", () => {
    const verdict = evaluate(
      good({ NEXT_PUBLIC_SUPABASE_SERVICE_ROLE_KEY: "eyJ-whatever" }),
      "read"
    );
    expect(verdict.ok === false && verdict.code).toBe("SERVICE_ROLE_PUBLICLY_NAMED");
  });

  it("checks that before anything else, because it is already shipped to browsers", () => {
    // Everything else is broken here too; the exposure still wins.
    const verdict = evaluate({ NEXT_PUBLIC_SERVICE_ROLE_KEY: "x" }, "read");
    expect(verdict.ok === false && verdict.code).toBe("SERVICE_ROLE_PUBLICLY_NAMED");
  });

  it("catches a service-role key pasted into the ANON key variable", () => {
    // The failure the name-only check missed: the two keys sit next to each
    // other in the Supabase dashboard, and NEXT_PUBLIC_SUPABASE_ANON_KEY is
    // bundled into the browser verbatim.
    const verdict = evaluate(
      good({ NEXT_PUBLIC_SUPABASE_ANON_KEY: SERVICE_ROLE_JWT }),
      "read"
    );
    expect(verdict.ok === false && verdict.code).toBe("SERVICE_ROLE_PUBLICLY_EXPOSED");
  });

  it("catches the same value appearing under any public name at all", () => {
    const verdict = evaluate(
      good({
        SUPABASE_SERVICE_ROLE_KEY_ULIKA: "sb_secret_the_real_one",
        NEXT_PUBLIC_ANALYTICS_TOKEN: "sb_secret_the_real_one",
      }),
      "read"
    );
    expect(verdict.ok === false && verdict.code).toBe("SERVICE_ROLE_PUBLICLY_EXPOSED");
  });

  it("never echoes the secret back in the message, only the variable name", () => {
    const verdict = evaluate(
      good({ NEXT_PUBLIC_SUPABASE_ANON_KEY: SERVICE_ROLE_JWT }),
      "read"
    );
    expect(verdict.ok === false && verdict.message).toContain("NEXT_PUBLIC_SUPABASE_ANON_KEY");
    expect(verdict.ok === false && verdict.message).not.toContain(SERVICE_ROLE_JWT);
  });

  it("leaves a legitimate anon key alone", () => {
    expect(evaluate(good({ NEXT_PUBLIC_SUPABASE_ANON_KEY: ANON_JWT }), "read").ok).toBe(true);
  });

  it("ignores an empty variable of that name — nothing is exposed", () => {
    const verdict = evaluate(good({ NEXT_PUBLIC_SUPABASE_SERVICE_ROLE_KEY: "" }), "read");
    expect(verdict.ok).toBe(true);
  });

  it("leaves the correctly-named server-side variable alone", () => {
    expect(evaluate(good({ SUPABASE_SERVICE_ROLE_KEY_ULIKA: "eyJ-whatever" }), "read").ok).toBe(
      true
    );
  });
});

describe("the shell throws rather than returning a falsy verdict", () => {
  it("throws with the denial code in the message", () => {
    const saved = process.env.ULIKA_ENV;
    delete process.env.ULIKA_ENV;
    try {
      expect(() => assertEnv("read")).toThrow(/ULIKA_ENV_MISSING/);
    } finally {
      if (saved !== undefined) process.env.ULIKA_ENV = saved;
    }
  });
});

// ---------------------------------------------------------------------------
// Status assertions. The guard's own header states that no script calls it yet.
// These fail the moment that stops being true, so the claim cannot rot the way
// three comments in the interaction engine did.
// ---------------------------------------------------------------------------

describe("declared wiring status matches reality", () => {
  /**
   * Pinned, not discovered. A discovered list cannot notice a deletion, and a
   * list that excludes every underscore-prefixed file would not notice a
   * `_dangerous-seed.ts` either. Any change to what lives in scripts/ has to
   * come past this constant, which forces someone to say out loud whether the
   * newcomer touches the database.
   */
  const WRITE_TOOLS = [
    "ingest-knowledge.ts",
    "ingest-scenarios.ts",
    "register-source.ts",
  ].sort();

  /**
   * Files in scripts/ that are NOT database write tools, and why each is exempt.
   *
   * megabrain-bench.ts is the interesting one: it spends real money on model
   * providers, but it never writes to Supabase, so the database guard has
   * nothing to say about it. It carries its own budget guard and refuses to run
   * live without an explicit --live and --max-usd. Listing it here is the
   * deliberate decision this test exists to force, not an oversight.
   */
  const GUARD_FILES = [
    "megabrain-bench.ts",
    "_env-guard.ts",
    "_env-guard.test.ts",
    "_environments.ts",
    "_load-env.ts",
    "_scenario-source.ts",
    "_scenario-source.test.ts",
  ].sort();

  const walk = (dir: string): string[] =>
    readdirSync(join(process.cwd(), dir), { withFileTypes: true }).flatMap((e) =>
      e.isDirectory() ? walk(join(dir, e.name)) : /\.tsx?$/.test(e.name) ? [join(dir, e.name)] : []
    );

  /** Text checks over source lie when the text is inside a comment. */
  const stripComments = (src: string) =>
    src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

  const scriptsTree = walk("scripts").map((f) => f.slice("scripts/".length));

  it("scripts/ contains exactly the files this contract knows about", () => {
    // Recursive: a write tool added in a subdirectory would otherwise never be
    // scanned at all.
    expect(scriptsTree.sort()).toEqual([...GUARD_FILES, ...WRITE_TOOLS].sort());
  });

  it("every pinned write tool still exists", () => {
    for (const tool of WRITE_TOOLS) {
      expect(() => readFileSync(join(process.cwd(), "scripts", tool), "utf8")).not.toThrow();
    }
  });

  it("is called by every write tool", () => {
    // Inverted when wiring landed. While it read "called by none", it was the
    // thing that would fail the moment one of them started calling the guard;
    // now it is the thing that fails if one of them stops.
    const callers = WRITE_TOOLS.filter((tool) =>
      /\bassertEnv\s*\(/.test(
        stripComments(readFileSync(join(process.cwd(), "scripts", tool), "utf8"))
      )
    ).sort();
    expect(callers).toEqual(WRITE_TOOLS);
  });

  it("loads .env.local before reading any of it", () => {
    // tsx does not do this the way next dev does, so a correctly configured
    // machine would otherwise look unconfigured and every tool would refuse.
    for (const tool of WRITE_TOOLS) {
      expect(readFileSync(join(process.cwd(), "scripts", tool), "utf8")).toContain(
        'import "./_load-env"'
      );
    }
  });

  it("does not count a mention inside a comment as wiring", () => {
    expect(/\bassertEnv\s*\(/.test(stripComments("// assertEnv(\"write\")"))).toBe(false);
    expect(/\bassertEnv\s*\(/.test(stripComments('assertEnv("write");'))).toBe(true);
  });

  it("keeps the header's own status line honest", () => {
    const header = readFileSync(join(process.cwd(), "scripts/_env-guard.ts"), "utf8");
    expect(header).toContain("WIRED.");
    expect(header).not.toContain("NOT YET CALLED BY ANY SCRIPT");
  });
});

describe("the service-role variable name is absent from src/", () => {
  const walk = (dir: string): string[] =>
    readdirSync(join(process.cwd(), dir), { withFileTypes: true }).flatMap((e) =>
      e.isDirectory() ? walk(join(dir, e.name)) : /\.tsx?$/.test(e.name) ? [join(dir, e.name)] : []
    );

  it("is referenced nowhere under src/", () => {
    // A CONVENTION CHECK, and only that. src/ is what Next.js compiles; scripts/
    // is run by hand with tsx and never bundled, so keeping the name out of src/
    // is the cheap enforceable half of "server-side tools only".
    //
    // What it does NOT prove: that no secret VALUE reaches the bundle under some
    // other name, or through a neutral helper. Value-level exposure is the
    // guard's job (SERVICE_ROLE_PUBLICLY_EXPOSED); proving it about a built
    // bundle would need a canary secret and a scan of build output, which is not
    // in this step.
    const offenders = walk("src").filter((f) =>
      /SERVICE_ROLE/.test(readFileSync(join(process.cwd(), f), "utf8"))
    );
    expect(offenders).toEqual([]);
  });

  it("declares exactly the three environments the example env documents", () => {
    expect([...ULIKA_ENVS]).toEqual(["local", "staging", "production"]);
  });
});

describe("the committed env template stays a template", () => {
  const templatePath = join(process.cwd(), ".env.local.example");
  const template = readFileSync(templatePath, "utf8");

  /**
   * Parsed the way dotenv would, not the way the file happens to look today.
   * An earlier version of this test anchored on `^[A-Z]`, which silently
   * skipped `  KEY=secret` and `export KEY=secret` — both of which dotenv
   * accepts. A leak checker that misses the two most ordinary ways of writing
   * a line is not a leak checker.
   */
  const assignments = template
    .split("\n")
    .map((line) => /^\s*(?:export\s+)?([A-Z][A-Z0-9_]*)\s*=(.*)$/.exec(line))
    .filter((m): m is RegExpExecArray => m !== null)
    .map((m) => ({ key: m[1], value: unquote(m[2]) }));

  /** `KEY=""` is an empty value to dotenv; `KEY="x"` is not. */
  function unquote(raw: string): string {
    const v = raw.trim();
    const quoted = /^(['"])([\s\S]*)\1$/.exec(v);
    return (quoted ? quoted[2] : v).trim();
  }

  it("carries no values at all — this file is committed", () => {
    // The one mechanical check that stops a real key from being pasted in and
    // pushed. Comments may explain values; assignments may not hold them.
    expect(assignments.filter((a) => a.value !== "").map((a) => a.key)).toEqual([]);
  });

  it("would catch a value written in any form dotenv accepts", () => {
    // Guards the guard: the three shapes the previous regex let through.
    for (const line of [
      "OPENROUTER_API_KEY=secret",
      "  OPENROUTER_API_KEY=secret",
      "export OPENROUTER_API_KEY=secret",
      'OPENROUTER_API_KEY="secret"',
    ]) {
      const m = /^\s*(?:export\s+)?([A-Z][A-Z0-9_]*)\s*=(.*)$/.exec(line);
      expect(m).not.toBeNull();
      expect(unquote(m![2])).toBe("secret");
    }
    // ...and still treats a genuinely empty value as empty.
    for (const line of ["OPENROUTER_API_KEY=", '  OPENROUTER_API_KEY=""']) {
      const m = /^\s*(?:export\s+)?([A-Z][A-Z0-9_]*)\s*=(.*)$/.exec(line);
      expect(unquote(m![2])).toBe("");
    }
  });

  it("declares every variable the guard requires", () => {
    for (const key of [
      "ULIKA_ENV",
      "EXPECTED_SUPABASE_PROJECT_REF",
      "NEXT_PUBLIC_SUPABASE_URL",
    ]) {
      expect(assignments.some((a) => a.key === key)).toBe(true);
    }
  });

  it("names the service-role variable without a NEXT_PUBLIC_ prefix", () => {
    expect(assignments.some((a) => a.key === "SUPABASE_SERVICE_ROLE_KEY_ULIKA")).toBe(true);
    expect(assignments.some((a) => /^NEXT_PUBLIC_[A-Z0-9_]*SERVICE_ROLE/.test(a.key))).toBe(false);
  });

  it("does not promise protection the guard is not yet giving", () => {
    // The template is what a fresh clone reads first. While no tool calls the
    // guard, it must say so — and when wiring lands, this test is what forces
    // the wording to be updated in the same commit rather than left behind.
    const wired = ["ingest-knowledge.ts", "ingest-scenarios.ts", "register-source.ts"].some(
      (tool) =>
        /\bassertEnv\s*\(/.test(
          readFileSync(join(process.cwd(), "scripts", tool), "utf8")
            .replace(/\/\*[\s\S]*?\*\//g, "")
            .replace(/^\s*\/\/.*$/gm, "")
        )
    );
    expect(template.includes("NOT YET IN EFFECT")).toBe(!wired);
    expect(template.includes("IN EFFECT.")).toBe(wired);
  });

  it("says who loads this file, since tsx does not do it by itself", () => {
    expect(template).toContain("scripts/_load-env.ts loads this file");
  });
});
