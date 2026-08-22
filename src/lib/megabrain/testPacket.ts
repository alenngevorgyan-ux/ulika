const SECRET_PATTERNS = [
  /sk-or-v1-[A-Za-z0-9_-]+/g,
  /(?:service[_-]?role|api[_-]?key|authorization)\s*[:=]\s*\S+/gi,
  /Bearer\s+\S+/gi,
];

function safe(value: unknown): string {
  let text = String(value ?? "");
  for (const pattern of SECRET_PATTERNS) text = text.replace(pattern, "[REDACTED]");
  return text;
}

export interface TestPacketInput {
  testId: string;
  date: string;
  preset?: string;
  blindLabel?: string;
  knowledgeMode: string;
  memoryMode: string;
  clarificationMode: string;
  originalCase: string;
  questions: { question: string }[];
  answers: Record<string, string>;
  finalResponse: string;
  actualCostUsd: number | null;
  conservativeUsd: number;
  latencyMs: number;
  revealed: boolean;
}

export function buildTestPacket(p: TestPacketInput): string {
  const identity = p.revealed ? `Preset: ${safe(p.preset)}` : `Variant: ${safe(p.blindLabel ?? "hidden")}`;
  return [
    "# ULIKA Manual Alpha Test Packet",
    "",
    `Test ID: ${safe(p.testId)}`,
    `Date: ${safe(p.date)}`,
    identity,
    `Knowledge: ${safe(p.knowledgeMode)}`,
    `Memory: ${safe(p.memoryMode)}`,
    `Clarification: ${safe(p.clarificationMode)}`,
    "",
    "## Original case",
    safe(p.originalCase),
    "",
    "## Clarification",
    p.questions.length ? p.questions.map((q, i) => `${i + 1}. ${safe(q.question)}`).join("\n") : "None",
    ...Object.entries(p.answers).map(([id, answer]) => `- ${safe(id)}: ${safe(answer)}`),
    "",
    "## Final response",
    safe(p.finalResponse),
    "",
    "## Telemetry",
    `Actual provider cost: ${p.actualCostUsd === null ? "unavailable" : `$${p.actualCostUsd.toFixed(6)}`}`,
    `Conservative debit: $${p.conservativeUsd.toFixed(6)}`,
    `Latency: ${Math.round(p.latencyMs)} ms`,
  ].join("\n");
}
