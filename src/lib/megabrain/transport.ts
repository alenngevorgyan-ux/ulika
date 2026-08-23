import { readUsage, type ProviderUsage } from "./costLedger";

/**
 * The one place a network call is made, and the seam every test replaces.
 *
 * Separate from src/lib/ai/provider.ts on purpose, for two reasons that both
 * matter here and not there: that module discards `data.usage` entirely, so
 * there is no cost accounting to be had from it, and it does not send
 * `response_format`, so nothing constrains the JSON. Changing it would alter
 * the live chat path, which is out of scope for V0 and would be a behaviour
 * change to a shipped product for the benefit of an experiment.
 *
 * The interface is what tests inject. No test in this repository may reach the
 * network — a paid call from a unit test is a bill nobody approved.
 */

export interface ReasoningConfig {
  enabled?: boolean;
  effort?: "low" | "medium" | "high" | "xhigh" | "max";
  /**
   * OpenRouter's `reasoning.max_tokens` — an explicit reasoning budget, distinct
   * from `maxOutputTokens`/`max_tokens` at the top level. Live evidence on
   * qwen/qwen3.6-max-preview: a request with max_tokens=3000 and no reasoning
   * budget came back with 3233 reasoning tokens PLUS ~3000 visible tokens
   * (6237 total billed) — max_tokens bounded the visible output, not reasoning.
   * This field is the documented lever for bounding reasoning specifically.
   */
  maxTokens?: number;
  exclude?: boolean;
  /**
   * Per-stage override for the reasoning-call timeout. Falls back to
   * REASONING_STAGE_TIMEOUT_MS when unset, so every existing preset (A/B/C/E)
   * is unaffected.
   */
  timeoutMs?: number;
}

export interface CompletionRequest {
  /** Safe pipeline label used only for operational telemetry. Never user text. */
  stage?: string;
  modelSlug: string;
  /** Ceiling prices per million tokens, sent to the provider as a hard bound. */
  maxPrice?: { promptPerMTok: number; completionPerMTok: number };
  system: string;
  user: string;
  maxOutputTokens: number;
  /** JSON Schema for response_format. Omitted for the free-text baseline. */
  jsonSchema?: { name: string; schema: Record<string, unknown> };
  temperature?: number;
  timeoutMs?: number;
  /**
   * Experimental reasoning controls. Omitted by every production call unless
   * an admin-only execution profile supplies them explicitly.
   */
  reasoning?: ReasoningConfig;
}

/**
 * Everything we are willing to learn about a call, and nothing else.
 *
 * A STRICT ALLOWLIST, not a filter. Fields are named individually and copied one
 * at a time; whatever else the provider returns is dropped without being looked
 * at. The alternative — passing metadata through and removing known-bad keys —
 * fails the first time a provider adds a field, and the field it adds could be
 * an echo of the prompt.
 *
 * Never here: prompt, user text, completion, reasoning, summaries, error bodies,
 * response headers, the key.
 */
export interface ResponseTelemetry {
  /** Provider's own id for the generation. What /api/v1/generation?id= takes. */
  responseId: string | null;
  /** Model the provider says it served. */
  reportedModel: string | null;
  /** Which endpoint actually served it, e.g. "Google Vertex". */
  selectedProvider: string | null;
  serviceTier: string | null;
  /** Per-attempt routing outcomes: provider and a short status, nothing else. */
  routingAttempts: { provider: string; status: string }[];
  /**
   * Why the model stopped. "stop" is a finished answer; "length" means WE cut
   * it off at max_tokens and whatever came back is a fragment.
   *
   * Read as an enum-like token through safeToken, never as free text: some
   * providers put a sentence in the native field.
   */
  finishReason: string | null;
  /** The provider's own wording for the same thing, when it is short enough. */
  nativeFinishReason: string | null;
}

/**
 * Finish reasons that mean "the output is a fragment", across providers.
 *
 * Matched case-insensitively because Google returns MAX_TOKENS and OpenAI
 * returns length for the same event.
 */
const TRUNCATION_FINISH_REASONS = new Set(["length", "max_tokens", "model_length", "max_output_tokens"]);

/** True when either finish reason says the answer was cut off at the ceiling. */
export function isTruncatedFinish(t: Pick<ResponseTelemetry, "finishReason" | "nativeFinishReason">): boolean {
  return [t.finishReason, t.nativeFinishReason].some(
    (r) => typeof r === "string" && TRUNCATION_FINISH_REASONS.has(r.trim().toLowerCase())
  );
}

/**
 * The model was cut off at our own max_tokens ceiling.
 *
 * A separate class rather than a parse failure, because the two need opposite
 * handling. Malformed JSON from a model that FINISHED is worth one more attempt:
 * the next sample may be well-formed. A fragment is not — the same prompt under
 * the same ceiling produces the same overflow, so a retry is a second charge
 * bought in exchange for the identical failure. That retry is precisely what
 * turned an unreadable answer into two unreadable answers, twice the price, and
 * a bare ENGINE_FAILED on screen.
 *
 * Carries the stage because the transport does not know it: the stage name is
 * attached by the engine, which is also where the call has already been
 * recorded, so the charge for the truncated attempt is never lost.
 */
export class OutputTruncatedError extends Error {
  readonly code = "OUTPUT_TRUNCATED";
  constructor(
    readonly stage: string,
    readonly outputTokens: number,
    readonly maxOutputTokens: number,
    readonly finishReason: string | null
  ) {
    super(
      `Stage "${stage}" was cut off at the ${maxOutputTokens}-token ceiling ` +
        `(${outputTokens} output tokens, finish_reason=${finishReason ?? "unknown"}).`
    );
    this.name = "OutputTruncatedError";
  }
}

export interface CompletionResult {
  content: string;
  usage: ProviderUsage;
  latencyMs: number;
  telemetry: ResponseTelemetry;
}

export type Transport = (req: CompletionRequest) => Promise<CompletionResult>;

/**
 * An HTTP failure from the provider, carrying only what is safe and useful.
 *
 * Structured rather than a string because the run recorder has to write the
 * status and the requested slug into a partial report — and because "Provider
 * request failed (404)" told us the request failed and nothing about WHICH
 * request, which is how a $0.0157 run ended with no idea what it bought.
 */
/**
 * What a provider 400 actually meant, from a closed vocabulary.
 *
 * Derived ONLY from enum-like fields — status, error.code, error.type,
 * error.param — never from the message. A provider's prose routinely quotes the
 * offending request back, and the offending request is somebody's situation.
 * Unrecognised stays UNKNOWN_PROVIDER_400 rather than being talked into a
 * category by a string that looked promising.
 */
export type ProviderErrorCategory =
  | "OUTPUT_LIMIT_UNSUPPORTED"
  | "PARAMETER_UNSUPPORTED"
  | "SCHEMA_UNSUPPORTED"
  | "PROVIDER_ROUTE_UNAVAILABLE"
  | "PRICE_CONSTRAINT_REJECTED"
  | "CONTEXT_LIMIT"
  | "UNKNOWN_PROVIDER_400";

/** Enum-like fields only. Anything not matching the token shape is dropped. */
export interface ProviderErrorFacts {
  code: string | null;
  type: string | null;
  param: string | null;
}

const OUTPUT_PARAMS = new Set(["max_tokens", "max_completion_tokens", "max_output_tokens"]);
const SCHEMA_PARAMS = new Set(["response_format", "json_schema", "schema", "structured_outputs"]);
const PRICE_PARAMS = new Set(["max_price", "provider.max_price", "price"]);

/**
 * Classify a provider failure without reading its prose.
 *
 * `param` is the load-bearing field and the reason it is read at all: an
 * OpenAI-shaped 400 for an unsupported schema construct names
 * "response_format" there while leaving code null, which is exactly the case
 * that would otherwise be indistinguishable from every other 400.
 */
export function classifyProviderError(status: number, f: ProviderErrorFacts): ProviderErrorCategory {
  const param = f.param?.toLowerCase() ?? "";
  const code = (f.code ?? "").toLowerCase();
  const type = (f.type ?? "").toLowerCase();
  const says = (needle: string) => code.includes(needle) || type.includes(needle);

  if (status === 402 || says("credit") || says("insufficient")) return "PRICE_CONSTRAINT_REJECTED";
  if (status === 404 || says("no_endpoints") || says("no_allowed_providers") || says("route"))
    return "PROVIDER_ROUTE_UNAVAILABLE";
  if (says("context_length") || says("context_window")) return "CONTEXT_LIMIT";
  if (PRICE_PARAMS.has(param) || says("max_price")) return "PRICE_CONSTRAINT_REJECTED";
  if (OUTPUT_PARAMS.has(param) || says("max_tokens") || says("max_completion_tokens"))
    return "OUTPUT_LIMIT_UNSUPPORTED";
  if (SCHEMA_PARAMS.has(param) || says("schema") || says("response_format")) return "SCHEMA_UNSUPPORTED";
  if (param.length > 0 || says("unsupported_parameter") || says("invalid_parameter"))
    return "PARAMETER_UNSUPPORTED";
  return "UNKNOWN_PROVIDER_400";
}

export class ProviderHttpError extends Error {
  readonly category: ProviderErrorCategory;
  constructor(
    readonly status: number,
    readonly requestedModel: string,
    readonly code: string | null,
    /** Enum-like param name from the provider, when it named one. */
    readonly param: string | null = null,
    type: string | null = null
  ) {
    super(`Provider request failed (${status}) for ${requestedModel}${code ? ` [${code}]` : ""}`);
    this.name = "ProviderHttpError";
    this.category = classifyProviderError(status, { code, type, param });
  }
}

export const DEFAULT_TIMEOUT_MS = 90_000;
/**
 * Bounded allowance for explicitly reasoning stages.
 *
 * Two such calls still fit inside the route's 300-second Vercel ceiling, with
 * roughly a minute left for safety, extraction and application overhead.
 */
export const REASONING_STAGE_TIMEOUT_MS = 120_000;

export function timeoutForReasoning(reasoning?: ReasoningConfig): number | undefined {
  if (!reasoning) return undefined;
  return reasoning.timeoutMs ?? REASONING_STAGE_TIMEOUT_MS;
}

export class ProviderTimeoutError extends Error {
  readonly code = "PROVIDER_TIMEOUT";
  constructor(
    readonly stage: string,
    readonly requestedModel: string,
    readonly elapsedMs: number,
    readonly timeoutLimitMs: number,
    readonly abortSource: "transport_timeout" | "fetch_abort",
    readonly providerRequestStarted: boolean,
    readonly responseHeadersReceived: boolean,
    readonly partialUsageAvailable: boolean
  ) {
    super(`Provider request timed out during "${stage}" after ${elapsedMs}ms.`);
    this.name = "ProviderTimeoutError";
  }
}

function logProviderLifecycle(event: string, fields: Record<string, unknown>): void {
  // Strictly operational allowlist at each call site: no prompts, completions,
  // headers, keys, response bodies or user text are ever passed here.
  console.info("megabrain-provider", JSON.stringify({ event, ...fields }));
}

/**
 * Live OpenRouter transport. Constructed explicitly by the benchmark CLI and by
 * nothing else — there is no ambient default, so a module cannot accidentally
 * acquire the ability to spend money by importing this file.
 */
export function createOpenRouterTransport(apiKey: string): Transport {
  if (!apiKey) throw new Error("OPENROUTER_API_KEY is required for the live transport.");

  return async (req) => {
    const started = Date.now();
    const stage = req.stage ?? "provider";
    const timeoutLimitMs = req.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    const controller = new AbortController();
    let timedOut = false;
    let providerRequestStarted = false;
    let responseHeadersReceived = false;
    const timer = setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, timeoutLimitMs);

    try {
      providerRequestStarted = true;
      logProviderLifecycle("stage_start", {
        stage,
        requested_model: req.modelSlug,
        elapsed_ms: 0,
        abort_source: null,
        timeout_limit_ms: timeoutLimitMs,
        provider_request_started: true,
        response_headers_received: false,
        partial_usage_available: false,
        streaming: false,
      });
      const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
          // Asks OpenRouter to return routing metadata. Only the allowlisted
          // fields in readTelemetry() are ever read from it.
          "X-OpenRouter-Metadata": "enabled",
        },
        signal: controller.signal,
        body: JSON.stringify({
          model: req.modelSlug,
          /**
           * No substitutions, at any level.
           *
           * `allow_fallbacks: false` stops OpenRouter routing to a different
           * upstream provider for this model, and omitting a `models` array
           * stops model-level fallback. Detecting a swap after the fact — which
           * is all the accounting check can do — is strictly worse than making
           * it impossible: by then the charge at the other model's price has
           * already happened.
           *
           * `require_parameters` refuses a provider that would silently drop
           * response_format, which would turn a structured stage into free text
           * we then pay for and reject.
           *
           * `max_price` is the only ceiling the provider itself enforces. Set to
           * the exact catalogue price, so a regional or provider markup is
           * refused rather than billed.
           */
          provider: {
            allow_fallbacks: false,
            require_parameters: true,
            ...(req.maxPrice
              ? {
                  max_price: {
                    prompt: req.maxPrice.promptPerMTok,
                    completion: req.maxPrice.completionPerMTok,
                  },
                }
              : {}),
          },
          messages: [
            { role: "system", content: req.system },
            { role: "user", content: req.user },
          ],
          max_tokens: req.maxOutputTokens,
          temperature: req.temperature ?? 0.7,
          // Built field-by-field rather than passed through verbatim: the TS
          // type uses maxTokens/timeoutMs (repo convention), but OpenRouter's
          // actual API field is reasoning.max_tokens, and timeoutMs is ours
          // alone (consumed by timeoutForReasoning, never sent). A verbatim
          // passthrough would have serialized "maxTokens" — a key the provider
          // does not recognize and silently ignores — which is exactly what
          // happened here until now: no preset had ever set it, so the bug was
          // latent rather than causing a visible failure.
          ...(req.reasoning
            ? {
                reasoning: {
                  ...(req.reasoning.enabled !== undefined ? { enabled: req.reasoning.enabled } : {}),
                  ...(req.reasoning.effort !== undefined ? { effort: req.reasoning.effort } : {}),
                  ...(req.reasoning.maxTokens !== undefined ? { max_tokens: req.reasoning.maxTokens } : {}),
                  ...(req.reasoning.exclude !== undefined ? { exclude: req.reasoning.exclude } : {}),
                },
              }
            : {}),
          ...(req.jsonSchema
            ? {
                response_format: {
                  type: "json_schema",
                  json_schema: { name: req.jsonSchema.name, strict: true, schema: req.jsonSchema.schema },
                },
              }
            : {}),
          usage: { include: true },
        }),
      });
      responseHeadersReceived = true;
      logProviderLifecycle("response_headers", {
        stage,
        requested_model: req.modelSlug,
        elapsed_ms: Date.now() - started,
        timeout_limit_ms: timeoutLimitMs,
        provider_request_started: true,
        response_headers_received: true,
        partial_usage_available: false,
        http_status: res.status,
        streaming: false,
      });

      if (!res.ok) {
        // NO PROVIDER BODY. A provider error message routinely quotes the
        // offending request, and the request contains the user's account —
        // which in this product is somebody's job, marriage or dispute. The
        // status code and, when present, a short machine code are enough to
        // act on; the prose is not worth the leak.
        const facts = await errorFacts(res);
        throw new ProviderHttpError(
          res.status,
          req.modelSlug,
          [facts.code, facts.type].filter(Boolean).join("/") || null,
          facts.param,
          facts.type
        );
      }

      const data = (await res.json()) as Record<string, unknown>;
      const choices = data.choices as { message?: { content?: unknown } }[] | undefined;
      const content = choices?.[0]?.message?.content;
      if (typeof content !== "string") throw new Error("Provider returned no message content.");

      logProviderLifecycle("stage_complete", {
        stage,
        requested_model: req.modelSlug,
        elapsed_ms: Date.now() - started,
        timeout_limit_ms: timeoutLimitMs,
        provider_request_started: true,
        response_headers_received: true,
        partial_usage_available: "usage" in data,
        streaming: false,
      });

      return {
        content,
        usage: readUsage(data),
        latencyMs: Date.now() - started,
        telemetry: readTelemetry(data),
      };
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") {
        const elapsedMs = Date.now() - started;
        const abortSource = timedOut ? "transport_timeout" : "fetch_abort";
        logProviderLifecycle("stage_abort", {
          stage,
          requested_model: req.modelSlug,
          elapsed_ms: elapsedMs,
          abort_source: abortSource,
          timeout_limit_ms: timeoutLimitMs,
          provider_request_started: providerRequestStarted,
          response_headers_received: responseHeadersReceived,
          partial_usage_available: false,
          streaming: false,
        });
        throw new ProviderTimeoutError(
          stage,
          req.modelSlug,
          elapsedMs,
          timeoutLimitMs,
          abortSource,
          providerRequestStarted,
          responseHeadersReceived,
          false
        );
      }
      throw error;
    } finally {
      clearTimeout(timer);
    }
  };
}

/** Short, enum-like, bounded. Anything longer or odder is dropped, not truncated. */
function safeToken(v: unknown, max = 60): string | null {
  if (typeof v !== "string" && typeof v !== "number") return null;
  const s = String(v).trim();
  return s.length > 0 && s.length <= max && /^[\w .:\/-]+$/.test(s) ? s : null;
}

/**
 * Copy the allowlisted telemetry fields out of a provider response.
 *
 * Every field is fetched by name. Nothing is spread, merged or iterated from the
 * response object, so a field the provider adds tomorrow cannot arrive here by
 * default — which matters because the thing it might add is an echo of the
 * prompt.
 */
export function readTelemetry(raw: unknown): ResponseTelemetry {
  const d = (raw ?? {}) as Record<string, unknown>;
  const meta = (d.metadata ?? {}) as Record<string, unknown>;
  const choice = (Array.isArray(d.choices) ? d.choices[0] : null) as Record<string, unknown> | null;

  const attemptsRaw = Array.isArray(meta.routing_attempts)
    ? (meta.routing_attempts as unknown[])
    : Array.isArray(meta.attempts)
      ? (meta.attempts as unknown[])
      : [];

  const routingAttempts = attemptsRaw
    .slice(0, 10)
    .map((a) => {
      const o = (a ?? {}) as Record<string, unknown>;
      const provider = safeToken(o.provider ?? o.provider_name ?? o.name);
      const status = safeToken(o.status ?? o.error_code ?? o.result, 40);
      return provider && status ? { provider, status } : null;
    })
    .filter((a): a is { provider: string; status: string } => a !== null);

  return {
    responseId: safeToken(d.id, 80),
    reportedModel: safeToken(d.model, 80),
    selectedProvider: safeToken(d.provider ?? meta.provider ?? meta.provider_name),
    serviceTier: safeToken(d.service_tier ?? meta.service_tier, 40),
    routingAttempts,
    // Bounded to 40 chars: a provider that answers with prose here gets dropped
    // rather than trimmed, same rule as every other field in this allowlist.
    finishReason: safeToken(choice?.finish_reason, 40),
    nativeFinishReason: safeToken(choice?.native_finish_reason, 40),
  };
}

/**
 * Extract only a short machine-readable code from an error response.
 *
 * Deliberately narrow: `code` and `type` are enum-like and safe, `message` is
 * free text written by the provider about our request and is never read.
 */
async function errorFacts(res: Response): Promise<ProviderErrorFacts> {
  const token = (v: unknown): string | null => {
    if (typeof v !== "string" && typeof v !== "number") return null;
    const t = String(v);
    // Enum-like only. A provider that puts a sentence in `param` gets dropped,
    // not truncated into our logs.
    return t.length > 0 && t.length <= 40 && /^[\w.-]+$/.test(t) ? t : null;
  };
  try {
    const data = (await res.json()) as {
      error?: { code?: unknown; type?: unknown; param?: unknown; metadata?: { provider_name?: unknown } };
    };
    return {
      code: token(data.error?.code),
      type: token(data.error?.type),
      param: token(data.error?.param),
    };
  } catch {
    return { code: null, type: null, param: null };
  }
}

/** Parse a model's JSON reply without letting a stray fence break the run. */
export function parseJsonReply(content: string): unknown {
  const trimmed = content.trim();
  const fenced = /^```(?:json)?\s*([\s\S]*?)\s*```$/.exec(trimmed);
  const body = fenced ? fenced[1] : trimmed;
  try {
    return JSON.parse(body);
  } catch {
    // Some models prepend a sentence despite instructions. Take the outermost
    // object rather than failing the whole stage over a preamble.
    const first = body.indexOf("{");
    const last = body.lastIndexOf("}");
    if (first >= 0 && last > first) {
      try {
        return JSON.parse(body.slice(first, last + 1));
      } catch {
        /* fall through */
      }
    }
    return null;
  }
}
