import type { CostLedger, LedgerEntry } from "./costLedger";

/**
 * Turns a thrown error into the small, fixed set of facts the Founder Lab is
 * allowed to show.
 *
 * WHY THIS EXISTS. The first complex case failed with a bare ENGINE_FAILED. The
 * response did carry `kind`, but it was the raw `error.name`, the client never
 * rendered it, the ledger was declared inside the try block and was therefore
 * out of scope in the catch, and nothing was written to disk. The failure was
 * undiagnosable — not because the information was sensitive, but because it was
 * discarded at four independent points.
 *
 * The rule here is the same one the transport telemetry follows: an ALLOWLIST,
 * not a filter. Every field is named and copied individually. Nothing derived
 * from a prompt, a model answer, a provider body or an exception message is
 * ever placed in this object, so a new error class cannot start leaking by
 * inheriting a default.
 */

export type LabErrorKind =
  | "STAGE_REJECTED"
  | "BUDGET_EXCEEDED"
  | "ACCOUNTING_ERROR"
  | "PROVIDER_HTTP_ERROR"
  | "OUTPUT_TRUNCATED"
  | "LANGUAGE_MISMATCH"
  | "RENDER_ERROR"
  | "INTERNAL_ERROR";

/**
 * Map an exception onto the fixed vocabulary.
 *
 * `error.name` is NEVER forwarded as-is. It is a string an exception chooses for
 * itself; a dependency that throws with a descriptive name would put that
 * description on an admin's screen and, worse, into the journal, where the
 * privacy tests are the only thing standing between a field and permanence.
 *
 * Anything unrecognised becomes INTERNAL_ERROR. Losing precision on an
 * unexpected class is the correct trade: the journal still records our own
 * `errorKind`, which is written by describeFailure under the same discipline.
 */
export function normalizeKind(e: unknown): LabErrorKind {
  const name = e instanceof Error ? e.name : "";
  const stage = (e as { stage?: unknown })?.stage;
  switch (name) {
    case "StageRejectedError":
      // The language gate is a StageRejectedError with a reserved stage name.
      // It gets its own kind because the remedy is completely different: a
      // schema miss is fixed in the prompt or the schema, a language miss means
      // the answer is unusable to the person who asked for it.
      return stage === "language" ? "LANGUAGE_MISMATCH" : "STAGE_REJECTED";
    case "BudgetExceededError":
      return "BUDGET_EXCEEDED";
    case "AccountingError":
      return "ACCOUNTING_ERROR";
    case "ProviderHttpError":
      return "PROVIDER_HTTP_ERROR";
    case "OutputTruncatedError":
      return "OUTPUT_TRUNCATED";
    default:
      return "INTERNAL_ERROR";
  }
}

/**
 * Schema paths, and only things shaped like schema paths.
 *
 * Every validator in schemas.ts currently emits a path, an index or a list of
 * enum names — `plan.exactWords.tooFew`, `actors[2].basis`,
 * `leverage.missing:economic,batna`. None of them interpolate a field's value.
 *
 * This filter does not trust that to stay true. A validator added later could
 * helpfully include the offending text, and that text comes from the user's
 * account. So the shape is enforced rather than assumed: identifier characters
 * only, no whitespace, bounded length, bounded count. A problem string that
 * stops looking like a path stops being shown.
 */
const SCHEMA_PATH = /^[A-Za-z0-9_.:,[\]/-]{1,80}$/;
const MAX_PATHS = 20;

export function safeSchemaPaths(problems: unknown): string[] {
  if (!Array.isArray(problems)) return [];
  return problems.filter((p): p is string => typeof p === "string" && SCHEMA_PATH.test(p)).slice(0, MAX_PATHS);
}

export interface LabDiagnostics {
  /** Stable machine code. The client keys its copy off this, never off prose. */
  error: string;
  kind: LabErrorKind;
  stage: string | null;
  attemptId: string | null;
  /** Requests that actually left the process. A budget refusal is not one. */
  callsSent: number;
  retries: number;
  /** What the provider said it charged. Never our estimate. */
  reportedSpendUsd: number;
  /** True when a call completed or failed without a usable figure. */
  hasUnknownCharges: boolean;
  /** What is left of this mode's cap. */
  remainingUsd: number;
  capUsd: number;
  latencyMs: number;
  httpStatus: number | null;
  finishReason: string | null;
  schemaPaths: string[];
  /** How many problems the validator reported, including any not shown above. */
  problemCount: number;
  /** Fixed guidance per kind. Not generated, so it cannot echo anything. */
  recommendation: string;
}

/** One sentence per kind, chosen from a table. Never built from the exception. */
const RECOMMENDATION: Record<LabErrorKind, string> = {
  OUTPUT_TRUNCATED:
    "Ответ обрезан нашим потолком max_tokens, а не отказом модели. Поднимать потолок этой стадии — осознанное решение по цене, не автоматическое.",
  STAGE_REJECTED:
    "Модель ответила, но структура не прошла валидатор. Смотрите schema paths: это либо недостающее поле в промпте, либо слишком жёсткое правило.",
  LANGUAGE_MISMATCH:
    "План собран не на том языке, на котором его будут произносить. Проверьте language directive для стадии.",
  BUDGET_EXCEEDED:
    "Guard остановил стадию до отправки запроса. Деньги за неё не списаны. Либо режим дороже кейса, либо потолок стадии занижен.",
  ACCOUNTING_ERROR:
    "Счёт от провайдера разошёлся с ожидаемым или сменилась маршрутизация. Прогон остановлен до следующего вызова; уже сделанный отменить нельзя.",
  PROVIDER_HTTP_ERROR:
    "Провайдер вернул ошибку HTTP. Тело ответа намеренно не читается. Смотрите статус и модель.",
  RENDER_ERROR:
    "Движок отработал успешно, план валиден — упала только отрисовка. Повторный вызов модели не нужен и не выполнялся.",
  INTERNAL_ERROR: "Неклассифицированное исключение. Смотрите журнал прогона: стадия и attempt id записаны по ходу.",
};

/**
 * Assemble the safe payload.
 *
 * `ledger` is optional on purpose: this must produce a usable answer when the
 * failure happened BEFORE a ledger existed. That case is exactly the one the
 * previous implementation could not express at all, because the variable was
 * scoped to the block that threw.
 */
export function buildDiagnostics(
  e: unknown,
  ctx: {
    ledger?: CostLedger;
    currentStage?: string;
    currentAttemptId?: string;
    capUsd: number;
    /** Set only by the route's render step, which the engine knows nothing about. */
    forceKind?: LabErrorKind;
  }
): LabDiagnostics {
  const kind = ctx.forceKind ?? normalizeKind(e);
  const entries: LedgerEntry[] = ctx.ledger?.allDeep() ?? [];
  // A preflight refusal is recorded as an entry so the guard leaves a trace,
  // but no request left the process. Counting it as a call sent would report
  // spending that never happened.
  const sent = entries.filter((x) => !x.stoppedByBudgetGuard);
  const last = sent[sent.length - 1];
  const problems = (e as { problems?: unknown })?.problems;

  return {
    error: "ENGINE_FAILED",
    kind,
    stage: (e as { stage?: string })?.stage ?? ctx.currentStage ?? last?.stage ?? null,
    attemptId: ctx.currentAttemptId ?? last?.attemptId ?? null,
    callsSent: sent.length,
    retries: sent.filter((x) => x.retryNumber > 0).length,
    reportedSpendUsd: ctx.ledger?.reportedSpendUsd ?? 0,
    hasUnknownCharges: ctx.ledger?.hasUnknownCharges ?? false,
    remainingUsd: ctx.ledger?.remainingUsd ?? ctx.capUsd,
    capUsd: ctx.capUsd,
    latencyMs: sent.reduce((n, x) => n + x.latencyMs, 0),
    httpStatus: typeof (e as { status?: unknown })?.status === "number" ? (e as { status: number }).status : null,
    finishReason:
      (e as { finishReason?: string })?.finishReason ?? last?.finishReason ?? last?.nativeFinishReason ?? null,
    schemaPaths: safeSchemaPaths(problems),
    problemCount: Array.isArray(problems) ? problems.length : 0,
    recommendation: RECOMMENDATION[kind],
  };
}
