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
        const body = await res.text().catch(() => "");
        // Provider errors can quote the request. Truncate hard and never log the
        // key, which is in the headers rather than the body but is worth saying.
        throw new Error(`Provider ${res.status}: ${body.slice(0, 300)}`);
      }

      const data = (await res.json()) as { choices?: { message?: { content?: string } }[] };
      const content = data.choices?.[0]?.message?.content;
      if (typeof content !== "string") throw new Error("Provider returned no message content.");

      return { content, usage: readUsage(data), latencyMs: Date.now() - started };
    } finally {
      clearTimeout(timer);
    }
  };
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
