import { randomBytes } from "node:crypto";
import { CostLedger, RESERVATION_SAFETY_MARGIN } from "./costLedger";
import { costOf, estimateTokens, modelFor, resolveConfiguration } from "./modelRouter";
import { fence } from "./prompts";
import { parseJsonReply, type Transport } from "./transport";
import type { CrisisType } from "../safety/resources";

export const CASE_SAFETY_MAX_OUTPUT_TOKENS = 300;
const TYPES: CrisisType[] = ["suicide_self_harm", "violence_threat", "domestic_abuse", "acute_clinical"];

const SYSTEM = `You are a safety classifier, not an adviser. Decide whether the
latest user text discloses current self-harm risk, a violence threat, domestic
abuse/coercive control, or an acute clinical crisis. Ordinary conflict, stress,
ambition, negotiation and figures of speech do not trigger. When genuinely
uncertain about immediate safety, trigger. Return only the requested JSON.`;

const SCHEMA = {
  name: "case_safety",
  schema: {
    type: "object",
    additionalProperties: false,
    required: ["triggered", "type"],
    properties: {
      triggered: { type: "boolean" },
      type: { type: ["string", "null"], enum: [...TYPES, null] },
    },
  },
} as const;

export interface CaseSafetyVerdict {
  triggered: boolean;
  type: CrisisType | null;
}

export function projectCaseSafety(account: string): number {
  const spec = modelFor(resolveConfiguration(), "extract");
  return costOf(spec, estimateTokens(SYSTEM + account), CASE_SAFETY_MAX_OUTPUT_TOKENS) * RESERVATION_SAFETY_MARGIN;
}

/** One metered call. Never writes or returns the user's words. */
export async function screenCaseSafety(account: string, ledger: CostLedger, transport: Transport): Promise<CaseSafetyVerdict> {
  const spec = modelFor(resolveConfiguration(), "extract");
  const sentinel = randomBytes(4).toString("hex");
  const user = fence("LATEST_USER_TEXT", account, sentinel);
  const attemptId = randomBytes(6).toString("hex");
  const { projectedUsd } = ledger.reserve("safety", spec, SYSTEM + user, CASE_SAFETY_MAX_OUTPUT_TOKENS, { attemptId, retryNumber: 0 });
  const result = await transport({
    stage: "safety",
    modelSlug: spec.slug,
    system: SYSTEM,
    user,
    maxOutputTokens: CASE_SAFETY_MAX_OUTPUT_TOKENS,
    jsonSchema: SCHEMA as unknown as { name: string; schema: Record<string, unknown> },
    temperature: 0,
    maxPrice: { promptPerMTok: spec.inputPerMTok, completionPerMTok: spec.outputPerMTok },
  });
  ledger.record({
    stage: "safety", spec, usage: result.usage, latencyMs: result.latencyMs,
    telemetry: result.telemetry, attemptId, retryNumber: 0, reservedUsd: projectedUsd,
  });
  const parsed = parseJsonReply(result.content) as { triggered?: unknown; type?: unknown } | null;
  const type = TYPES.find((t) => t === parsed?.type) ?? null;
  // A malformed classifier response falls back locally; a transport or
  // accounting failure above remains fail-closed and stops the case.
  const valid = parsed && typeof parsed.triggered === "boolean" && (parsed.type === null || type !== null);
  return valid ? { triggered: parsed.triggered === true && type !== null, type } : screenCaseSafetyLocally(account);
}

export function screenCaseSafetyLocally(text: string): CaseSafetyVerdict {
  const t = text.toLocaleLowerCase();
  const nets: [CrisisType, string[]][] = [
    ["suicide_self_harm", ["kill myself", "want to die", "suicide", "не хочу жить", "хочу умереть", "лучше бы меня не было"]],
    ["violence_threat", ["threatened to kill", "he hits me", "she hits me", "угрожает убить", "меня бьёт", "меня бьют"]],
    ["domestic_abuse", ["controls my money", "tracks my phone", "won't let me leave", "контролирует мои деньги", "следит за телефоном", "не даёт уйти"]],
    ["acute_clinical", ["hallucinations", "hearing voices", "галлюцинации", "слышу голоса"]],
  ];
  for (const [type, needles] of nets) if (needles.some((n) => t.includes(n))) return { triggered: true, type };
  return { triggered: false, type: null };
}
