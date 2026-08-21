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

export interface CompletionResult {
  content: string;
  usage: ProviderUsage;
  latencyMs: number;
  /**
   * The model the provider says it actually served. OpenRouter may route to a
   * different model than requested; when it does, every price we reserved
   * against is wrong, so the caller refuses rather than accounting against a
   * model it did not choose.
   */
  reportedModel?: string;
}

export type Transport = (req: CompletionRequest) => Promise<CompletionResult>;

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
        throw new Error(`Provider request failed (${res.status})${await errorCode(res)}`);
      }

      const data = (await res.json()) as {
        choices?: { message?: { content?: string } }[];
        model?: string;
      };
      const content = data.choices?.[0]?.message?.content;
      if (typeof content !== "string") throw new Error("Provider returned no message content.");

      return {
        content,
        usage: readUsage(data),
        latencyMs: Date.now() - started,
        reportedModel: typeof data.model === "string" ? data.model : undefined,
      };
    } finally {
      clearTimeout(timer);
    }
  };
}

/**
 * Extract only a short machine-readable code from an error response.
 *
 * Deliberately narrow: `code` and `type` are enum-like and safe, `message` is
 * free text written by the provider about our request and is never read.
 */
async function errorCode(res: Response): Promise<string> {
  try {
    const data = (await res.json()) as { error?: { code?: unknown; type?: unknown } };
    const parts = [data.error?.code, data.error?.type]
      .filter((v): v is string | number => typeof v === "string" || typeof v === "number")
      .map((v) => String(v))
      .filter((v) => v.length <= 40 && /^[\w.-]+$/.test(v));
    return parts.length ? ` [${parts.join("/")}]` : "";
  } catch {
    return "";
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
