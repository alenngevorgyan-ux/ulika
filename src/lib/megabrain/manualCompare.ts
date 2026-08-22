import { randomBytes, randomUUID } from "node:crypto";
import type { ManualPresetId } from "./manualPresets";

export interface BlindVariant {
  label: string;
  preset: ManualPresetId;
  answer: string;
  reportedSpendUsd: number;
  conservativeSpendUsd: number;
  latencyMs: number;
  calls: { stage: string; model: string; reasoningTokens: number; inputTokens: number; outputTokens: number; cost: number | null }[];
}

interface CompareRun {
  id: string;
  ownerId: string;
  createdAt: number;
  variants: BlindVariant[];
}

const runs = new Map<string, CompareRun>();
const TTL = 60 * 60 * 1000;

function purge(): void {
  const cutoff = Date.now() - TTL;
  for (const [id, run] of runs) if (run.createdAt < cutoff) runs.delete(id);
}

export function shuffledLabels(count: number): string[] {
  const labels = Array.from({ length: count }, (_, i) => `Variant ${i + 1}`);
  for (let i = labels.length - 1; i > 0; i--) {
    const j = randomBytes(4).readUInt32BE(0) % (i + 1);
    [labels[i], labels[j]] = [labels[j], labels[i]];
  }
  return labels;
}

export function saveCompare(ownerId: string, variants: BlindVariant[]): string {
  purge();
  const id = randomUUID();
  runs.set(id, { id, ownerId, createdAt: Date.now(), variants });
  return id;
}

export function revealCompare(ownerId: string, id: string): Omit<BlindVariant, "answer">[] {
  purge();
  const run = runs.get(id);
  if (!run || run.ownerId !== ownerId) throw new Error("COMPARE_NOT_FOUND");
  return run.variants.map((variant) => ({
    label: variant.label,
    preset: variant.preset,
    reportedSpendUsd: variant.reportedSpendUsd,
    conservativeSpendUsd: variant.conservativeSpendUsd,
    latencyMs: variant.latencyMs,
    calls: variant.calls,
  }));
}

export function clearComparesForTest(): void {
  runs.clear();
}
