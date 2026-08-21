import { appendFileSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import type { LedgerEntry } from "./costLedger";

/**
 * Append-only run journal, written as spend happens.
 *
 * WHY THIS EXISTS. The first live run cost $0.0157 and produced no record of
 * what it bought, because the report was serialised once, after the whole loop,
 * and the loop threw. Money had moved; the accounting had not been written
 * anywhere. Holding a ledger in memory until the end is fine right up until the
 * moment it is not.
 *
 * HONEST LIMIT, and it belongs here rather than in a summary that overstates it:
 * appending after each accounted call means a crash, an exception or a Ctrl-C
 * leaves everything up to the last COMPLETED call on disk. It does not survive
 * SIGKILL, a power cut, or a failure between the provider charging and this
 * process learning about it. A `finally` block would not survive those either,
 * which is exactly why this writes incrementally instead of relying on one.
 * There is always a window; this makes it one call wide instead of one run wide.
 *
 * WHAT IS NEVER WRITTEN: prompts, model answers, the user's account, judge
 * reasoning, provider error prose, API keys. Statuses, model slugs, token counts
 * and dollars only.
 */

export type RunStatus = "started" | "stage_recorded" | "complete" | "incomplete";

export interface RunFailure {
  /** Pipeline stage that failed, when known. */
  stage: string | null;
  /** Model slug requested for the failing call, when known. */
  requestedModel: string | null;
  /** HTTP status, for a provider failure. */
  httpStatus: number | null;
  /**
   * Short enum-like code from the PROVIDER. Never the provider's message, and
   * never one of our own codes — an internal AccountingError landing in a field
   * named "provider" would send someone reading the journal to OpenRouter's
   * documentation to look up a string we invented.
   */
  providerCode: string | null;
  /** Our own error class name — BudgetExceededError, AccountingError, … */
  errorKind: string;
  /** Our own failure code, when the error carries one. */
  internalCode: string | null;
  /**
   * True when the failing call had already been charged. Distinguishes "we
   * stopped before spending" from "we spent and then stopped", which is the
   * difference a bill will show.
   */
  chargeAlreadyIncurred: boolean;
}

export class RunRecorder {
  private closed = false;

  constructor(
    private readonly path: string,
    meta: { configuration: string; caseId: string; capUsd: number; baseline: string }
  ) {
    mkdirSync(dirname(path), { recursive: true });
    // Truncate on open: a run journal describes ONE run.
    writeFileSync(path, "");
    this.line({ t: "run_started", at: new Date().toISOString(), ...meta });
  }

  private line(obj: Record<string, unknown>): void {
    // Synchronous append on purpose. An async write can still be queued when the
    // process dies, which is the failure mode this file exists to remove.
    appendFileSync(this.path, JSON.stringify(obj) + "\n");
  }

  /**
   * Hook for CostLedger.onAttempt. Written immediately BEFORE a request leaves.
   *
   * This is what makes a failed call identifiable. A ledger line only exists
   * for a call that came back; the first live run showed two successful stages
   * and a bare "Provider request failed (404)", and the failing stage could not
   * be determined afterwards from either.
   */
  readonly onAttempt = (a: { stage: string; model: string; provider: string; reservedUsd: number }): void => {
    this.line({ t: "attempt", at: new Date().toISOString(), ...a });
  };

  /** Hook for CostLedger.onRecord. Called for every call and every refusal. */
  readonly onLedgerEntry = (entry: LedgerEntry): void => {
    this.line({ t: "ledger", at: new Date().toISOString(), ...entry });
  };

  note(event: string, fields: Record<string, unknown> = {}): void {
    this.line({ t: "note", at: new Date().toISOString(), event, ...fields });
  }

  finish(status: "complete" | "incomplete", failure?: RunFailure, totals?: Record<string, unknown>): void {
    if (this.closed) return;
    this.closed = true;
    this.line({
      t: "run_finished",
      at: new Date().toISOString(),
      status,
      ...(failure ? { failure } : {}),
      ...(totals ?? {}),
    });
  }

  get file(): string {
    return this.path;
  }
}

/** Classify a thrown error into the safe fields the journal records. */
export function describeFailure(e: unknown, currentStage: string | null): RunFailure {
  const err = e as {
    name?: string;
    status?: number;
    requestedModel?: string;
    code?: string | null;
    stage?: string;
  };
  const isProviderHttp = err?.name === "ProviderHttpError";
  return {
    stage: err?.stage ?? currentStage,
    requestedModel: typeof err?.requestedModel === "string" ? err.requestedModel : null,
    httpStatus: typeof err?.status === "number" ? err.status : null,
    providerCode: isProviderHttp && typeof err?.code === "string" ? err.code : null,
    errorKind: typeof err?.name === "string" ? err.name : "Error",
    internalCode: !isProviderHttp && typeof err?.code === "string" ? err.code : null,
    // An AccountingError only exists because a call completed and was billed.
    // A BudgetExceededError means the opposite: nothing was sent.
    chargeAlreadyIncurred: err?.name === "AccountingError" || isProviderHttp,
  };
}
