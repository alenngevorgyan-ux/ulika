import type { UlikaEnv } from "./_env-guard";

/**
 * The trusted half of the environment contract: which real Supabase projects
 * each environment name is allowed to mean.
 *
 * WHY THIS IS A SEPARATE FILE IN THE REPOSITORY. `ULIKA_ENV`,
 * `EXPECTED_SUPABASE_PROJECT_REF` and the Supabase URL all live in the same
 * hand-edited `.env.local`. A guard built only from those three checks that the
 * operator was self-consistent, not that they were right — this passes:
 *
 *     ULIKA_ENV=staging
 *     EXPECTED_SUPABASE_PROJECT_REF=<production ref>
 *     NEXT_PUBLIC_SUPABASE_URL=https://<production ref>.supabase.co
 *
 * URL and ref agree; the label is simply wrong, which is exactly what a copied
 * or stale `.env.local` looks like. Binding the label to a ref HERE means the
 * two halves cannot be edited together: getting working credentials is an
 * `.env.local` edit, and changing what counts as staging is a commit.
 *
 * HONEST LIMIT: this is a review gate, not authentication. Anyone able to edit
 * the repository can edit this file. The point is that they cannot do it by
 * accident while fixing their local environment, and that the change shows up
 * in a diff.
 *
 * ── CURRENT STATE ───────────────────────────────────────────────────────────
 * Both lists are EMPTY, deliberately and correctly:
 *   - no staging project exists yet (it is created in block B of
 *     docs/staging-bootstrap-plan.md);
 *   - the production project ref has not been confirmed — see finding F6, it
 *     needs a check the repository cannot perform.
 *
 * The consequence is the point rather than a gap: with an empty staging list
 * NO WRITE IS PERMITTED ANYWHERE. Once the guard is wired, corpus ingest and
 * admin bootstrap will refuse against every project, including the one in use
 * today, until a ref is added here in a reviewed commit. That is the correct
 * default for a system whose entire risk is writing to the wrong database.
 * ────────────────────────────────────────────────────────────────────────────
 */

export interface EnvironmentBinding {
  /** Supabase project refs this environment name is allowed to resolve to. */
  projectRefs: string[];
}

export const ENVIRONMENT_BINDINGS: Record<UlikaEnv, EnvironmentBinding> = {
  // Populated when the staging project is created (block B, step 1). Adding a
  // ref here is what turns writes on, and it is a reviewable change.
  staging: { projectRefs: [] },

  // Populated once the production ref is confirmed. Listing it does more than
  // document: a ref recorded here can never be written to under a staging
  // label, because the label then provably contradicts the project.
  production: { projectRefs: [] },

  // A local stack has no project ref at all — the guard rejects non-Supabase
  // hosts before it ever reaches this table.
  local: { projectRefs: [] },
};
