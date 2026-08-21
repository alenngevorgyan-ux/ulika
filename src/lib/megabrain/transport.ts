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

export interface CompletionRequest {
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
  /** Provider's own id for the generation. What /generations?id= takes. */
  responseId: string | null;
  /** Model the provider says it served. */
  reportedModel: string | null;
  /** Which endpoint actually served it, e.g. "Google Vertex". */
  selectedProvider: string | null;
  serviceTier: string | null;
  /** Per-attempt routing outcomes: provider and a short status, nothing else. */
  routingAttempts: { provider: string; status: string }[];
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
export class ProviderHttpError extends Error {
  constructor(
    readonly status: number,
    readonly requestedModel: string,
    readonly code: string | null
  ) {
    super(`Provider request failed (${status}) for ${requestedModel}${code ? ` [${code}]` : ""}`);
    this.name = "ProviderHttpError";
  }
}

const DEFAULT_TIMEOUT_MS = 90_000;

/**
 * Live OpenRouter transport. Constructed explicitly by the benchmark CLI and by
 * nothing else — there is no ambient default, so a module cannot accidentally
 * acquire the ability to spend money by importing this file.
 */
export function createOpenRouterTransport(apiKey: string): Transport {
  if (!apiKey) throw new Error("OPENROUTER_API_KEY is required for the live transport.");

  return async (req) => {
    const started = Date.now();
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), req.timeoutMs ?? DEFAULT_TIMEOUT_MS);

    try {
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

      if (!res.ok) {
        // NO PROVIDER BODY. A provider error message routinely quotes the
        // offending request, and the request contains the user's account —
        // which in this product is somebody's job, marriage or dispute. The
        // status code and, when present, a short machine code are enough to
        // act on; the prose is not worth the leak.
        throw new ProviderHttpError(res.status, req.modelSlug, await errorCode(res));
      }

      const data = (await res.json()) as Record<string, unknown>;
      const choices = data.choices as { message?: { content?: unknown } }[] | undefined;
      const content = choices?.[0]?.message?.content;
      if (typeof content !== "string") throw new Error("Provider returned no message content.");

      return {
        content,
        usage: readUsage(data),
        latencyMs: Date.now() - started,
        telemetry: readTelemetry(data),
      };
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
  };
}

/**
 * Extract only a short machine-readable code from an error response.
 *
 * Deliberately narrow: `code` and `type` are enum-like and safe, `message` is
 * free text written by the provider about our request and is never read.
 */
async function errorCode(res: Response): Promise<string | null> {
  try {
    const data = (await res.json()) as { error?: { code?: unknown; type?: unknown } };
    const parts = [data.error?.code, data.error?.type]
      .filter((v): v is string | number => typeof v === "string" || typeof v === "number")
      .map((v) => String(v))
      .filter((v) => v.length <= 40 && /^[\w.-]+$/.test(v));
    return parts.length ? parts.join("/") : null;
  } catch {
    return null;
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
