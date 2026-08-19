/**
 * Single AI provider entry point. Swapping the model or provider is a
 * one-line change here — never scatter model names/base URLs across routes.
 */

export interface AiMessage {
  role: "system" | "user" | "assistant" | "tool";
  content: string;
  tool_call_id?: string;
  name?: string;
  tool_calls?: AiToolCall[];
}

export interface AiToolCall {
  id: string;
  type: "function";
  function: { name: string; arguments: string };
}

export interface AiToolDef {
  type: "function";
  function: {
    name: string;
    description: string;
    parameters: Record<string, unknown>;
  };
}

interface ProviderConfig {
  name: string;
  baseUrl: string;
  apiKeyEnv: string;
  model: string;
}

// Primary: OpenRouter, Gemini 3.1 Flash-Lite — chosen for cost (~10x cheaper
// than Grok 4.3) over the originally-briefed Grok. Voice/looseness is carried
// entirely by the system prompt, not by model choice.
// NOTE (2026-08-20): the originally-briefed "Grok 4.1 Fast" is deprecated on
// OpenRouter (404s); its successor grok-4.3 is ~6x pricier than the brief's
// budget. Kept as a one-line swap below (AI_PROVIDER=grok) if the founder
// wants Grok's default tone back despite the cost.
const PRIMARY: ProviderConfig = {
  name: "gemini",
  baseUrl: "https://openrouter.ai/api/v1/chat/completions",
  apiKeyEnv: "OPENROUTER_API_KEY",
  model: "google/gemini-3.1-flash-lite",
};

// Fallback path — flip AI_PROVIDER=grok or AI_PROVIDER=anthropic in env to
// switch without touching call sites. All ride OpenRouter's unified endpoint
// so no separate client code is needed.
const FALLBACKS: Record<string, ProviderConfig> = {
  grok: {
    name: "openrouter",
    baseUrl: "https://openrouter.ai/api/v1/chat/completions",
    apiKeyEnv: "OPENROUTER_API_KEY",
    model: "x-ai/grok-4.3",
  },
  anthropic: {
    name: "anthropic",
    baseUrl: "https://openrouter.ai/api/v1/chat/completions",
    apiKeyEnv: "OPENROUTER_API_KEY",
    model: "anthropic/claude-sonnet-5",
  },
};

function activeConfig(): ProviderConfig {
  const override = process.env.AI_PROVIDER;
  if (override && FALLBACKS[override]) return FALLBACKS[override];
  return PRIMARY;
}

export function isAiConfigured(): boolean {
  const cfg = activeConfig();
  return Boolean(process.env[cfg.apiKeyEnv]);
}

export interface ChatCompleteResult {
  message: AiMessage;
  raw: unknown;
}

export async function chatComplete(
  messages: AiMessage[],
  opts: { tools?: AiToolDef[]; temperature?: number } = {}
): Promise<ChatCompleteResult> {
  const cfg = activeConfig();
  const apiKey = process.env[cfg.apiKeyEnv];
  if (!apiKey) {
    throw new Error(
      `AI provider "${cfg.name}" is not configured — missing ${cfg.apiKeyEnv} in env.`
    );
  }

  const res = await fetch(cfg.baseUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: cfg.model,
      messages,
      tools: opts.tools,
      temperature: opts.temperature ?? 0.8,
    }),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`AI provider "${cfg.name}" request failed (${res.status}): ${text.slice(0, 500)}`);
  }

  const data = await res.json();
  const choice = data.choices?.[0]?.message;
  if (!choice) {
    throw new Error(`AI provider "${cfg.name}" returned no message.`);
  }

  return { message: choice as AiMessage, raw: data };
}
