import { mkdirSync, renameSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import type { LedgerEntry } from "./costLedger";
import type { CaseAnalysis } from "./schemas";
import type { GradeReport } from "./evals/graders";

/**
 * The result of a run, saved so a successful engine is not thrown away because
 * something after it failed.
 *
 * WHY. A run charged $0.0165, produced three valid stages and a complete
 * FinalCasePlan, then died on an optional baseline call — and the plan vanished,
 * because the report was only written after the whole benchmark. The engine and
 * the benchmark are different things and must fail independently.
 *
 * ── FROZEN CASES ONLY, BY DEFAULT ───────────────────────────────────────────
 * The twenty frozen cases are synthetic: invented people, invented disputes, no
 * real person's situation. Their analysis is safe to keep.
 *
 * A REAL user's case is not. Their account and the plan built from it describe
 * somebody's job, marriage or dispute, and persisting that by default would be
 * a decision nobody made. `writeArtifact` refuses unless the caller states the
 * case is frozen, or a real case carries an explicit opt-in.
 * ────────────────────────────────────────────────────────────────────────────
 *
 * Never written: the account text, prompts, chain of thought, provider bodies.
 */

export interface RunArtifact {
  caseId: string;
  configuration: string;
  /** The engine's own verdict, independent of anything downstream. */
  engineStatus: "complete" | "failed";
  /** "complete" only when baseline AND judge both ran. */
  benchmarkStatus: "complete" | "incomplete";
  /** Why the benchmark did not finish. Null when it did. */
  incompleteReason: string | null;
  analysis: CaseAnalysis | null;
  gates: GradeReport | null;
  /** Null until the baseline actually runs. Never a placeholder. */
  baselineResult: null | { answer: string; gates: GradeReport };
  judgeResult: null | { winner: string; reason: string };
  /** Null whenever the benchmark is incomplete. A missing comparison is not a tie. */
  winner: null | "engine" | "baseline" | "tie";
  ledger: LedgerEntry[];
  totals: {
    reportedSpendUsd: number;
    budgetedSpendUsd: number;
    hasUnknownCharges: boolean;
    latencyMs: number;
  };
  writtenAt: string;
}

export class ArtifactRefused extends Error {
  constructor(reason: string) {
    super(`Refusing to write an artifact: ${reason}`);
    this.name = "ArtifactRefused";
  }
}

export interface WriteOptions {
  /** True only for the committed synthetic corpus. */
  frozenCase: boolean;
  /** Explicit opt-in required to persist anything derived from a real case. */
  persistRealCase?: boolean;
}

/**
 * Write atomically: a full file appears or none does.
 *
 * A half-written artifact read by a later tool is worse than no artifact,
 * because it looks like data.
 */
export function writeArtifact(path: string, artifact: RunArtifact, opts: WriteOptions): string {
  if (!opts.frozenCase && !opts.persistRealCase) {
    throw new ArtifactRefused(
      "the case is not from the frozen corpus and no explicit opt-in to persist a real case was given"
    );
  }
  mkdirSync(dirname(path), { recursive: true });
  const tmp = `${path}.tmp`;
  writeFileSync(tmp, JSON.stringify(artifact, null, 2));
  renameSync(tmp, path);
  return path;
}

/**
 * Build the artifact for a run whose engine finished but whose benchmark did not.
 *
 * Everything downstream stays null. Filling `winner` with "tie" because no
 * comparison happened would turn an absent measurement into a result, which is
 * the one thing this file must not do.
 */
export function partialArtifact(args: {
  caseId: string;
  configuration: string;
  analysis: CaseAnalysis;
  gates: GradeReport;
  ledger: LedgerEntry[];
  totals: RunArtifact["totals"];
  incompleteReason: string;
}): RunArtifact {
  return {
    caseId: args.caseId,
    configuration: args.configuration,
    engineStatus: "complete",
    benchmarkStatus: "incomplete",
    incompleteReason: args.incompleteReason,
    analysis: args.analysis,
    gates: args.gates,
    baselineResult: null,
    judgeResult: null,
    winner: null,
    ledger: args.ledger,
    totals: args.totals,
    writtenAt: new Date().toISOString(),
  };
}
