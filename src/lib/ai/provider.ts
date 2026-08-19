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

// Primary: OpenRouter, Grok 4.3 — deliberately less "corporate-polished"
// default voice. Character is still built by the system prompt, not by
// picking the most permissive model.
// NOTE (2026-08-20): the originally-briefed "Grok 4.1 Fast" is deprecated on
// OpenRouter (404s). Its direct successor grok-4.3 is ~6x pricier
// ($1.25/$2.50 per M tokens vs the $0.20/$0.50 the brief was costed against).
// If that matters, google/gemini-3.1-flash-lite ($0.125/$0.75/M) is a much
// cheaper option — same one-line swap via AI_PROVIDER=gemini below.
const PRIMARY: ProviderConfig = {
  name: "openrouter",
  baseUrl: "https://openrouter.ai/api/v1/chat/completions",
  apiKeyEnv: "OPENROUTER_API_KEY",
  model: "x-ai/grok-4.3",
};

// Fallback path — flip AI_PROVIDER=gemini or AI_PROVIDER=anthropic in env to
// switch without touching call sites. Both still ride OpenRouter's unified
// endpoint so no separate client code is needed.
const FALLBACKS: Record<string, ProviderConfig> = {
  gemini: {
    name: "gemini",
    baseUrl: "https://openrouter.ai/api/v1/chat/completions",
    apiKeyEnv: "OPENROUTER_API_KEY",
    model: "google/gemini-3.1-flash-lite",
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
