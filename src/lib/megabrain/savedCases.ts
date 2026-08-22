import { randomUUID } from "node:crypto";
import { chmod, mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";

export interface SavedCase {
  id: string;
  ownerId: string;
  flowId: string;
  originalCase: string;
  title: string;
  actors: string[];
  documentedFacts: string[];
  reportedFacts: string[];
  hypotheses: string[];
  unresolvedQuestions: string[];
  clarificationQuestions: { id: string; question: string; options: string[] }[];
  clarificationAnswers: Record<string, string>;
  previousRecommendation: string;
  actionsTaken: string;
  observedOutcome: string;
  messages: { role: "user" | "assistant"; content: string }[];
  createdAt: string;
  updatedAt: string;
}

export type SavedCaseDraft = Omit<SavedCase, "id" | "ownerId" | "createdAt" | "updatedAt">;

function defaultPath(): string {
  return join(process.cwd(), ".megabrain-journal", "manual-alpha", "saved-cases.json");
}

export function savedCasePersistence(): { available: boolean; durable: boolean; reason: string | null } {
  if (process.env.VERCEL) {
    return { available: false, durable: false, reason: "Saved Case is disabled on Preview: the serverless filesystem is ephemeral." };
  }
  return { available: true, durable: true, reason: null };
}

function requireDefaultPersistence(path: string): void {
  if (path === defaultPath() && !savedCasePersistence().available) throw new Error("SAVED_CASE_UNAVAILABLE");
}

async function readAll(path: string): Promise<SavedCase[]> {
  try {
    const raw = JSON.parse(await readFile(path, "utf8"));
    return Array.isArray(raw) ? raw as SavedCase[] : [];
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw e;
  }
}

async function writeAll(path: string, rows: SavedCase[]): Promise<void> {
  await mkdir(dirname(path), { recursive: true, mode: 0o700 });
  const temp = `${path}.${randomUUID()}.tmp`;
  await writeFile(temp, `${JSON.stringify(rows, null, 2)}\n`, { mode: 0o600 });
  await rename(temp, path);
  await chmod(path, 0o600);
}

export async function listSavedCases(ownerId: string, path = defaultPath()): Promise<SavedCase[]> {
  requireDefaultPersistence(path);
  return (await readAll(path)).filter((row) => row.ownerId === ownerId);
}

export async function getSavedCase(ownerId: string, id: string, path = defaultPath()): Promise<SavedCase | null> {
  return (await listSavedCases(ownerId, path)).find((row) => row.id === id) ?? null;
}

export async function saveCase(ownerId: string, draft: SavedCaseDraft, path = defaultPath()): Promise<SavedCase> {
  requireDefaultPersistence(path);
  const rows = await readAll(path);
  const existing = rows.find((row) => row.ownerId === ownerId && row.flowId === draft.flowId);
  const now = new Date().toISOString();
  const clean = sanitizeDraft(draft);
  const row: SavedCase = existing
    ? { ...existing, ...clean, id: existing.id, ownerId, createdAt: existing.createdAt, updatedAt: now }
    : { ...clean, id: randomUUID(), ownerId, createdAt: now, updatedAt: now };
  const next = existing ? rows.map((r) => r.id === existing.id ? row : r) : [...rows, row];
  await writeAll(path, next);
  return row;
}

function strings(value: unknown, maxItems: number, maxLength: number): string[] {
  return Array.isArray(value)
    ? value.filter((x): x is string => typeof x === "string").map((x) => x.trim().slice(0, maxLength)).filter(Boolean).slice(0, maxItems)
    : [];
}

function sanitizeDraft(d: SavedCaseDraft): SavedCaseDraft {
  return {
    flowId: String(d.flowId).slice(0, 100),
    originalCase: String(d.originalCase ?? "").slice(0, 20_000),
    title: String(d.title).trim().slice(0, 120) || "Untitled case",
    actors: strings(d.actors, 30, 300),
    documentedFacts: strings(d.documentedFacts, 60, 1_000),
    reportedFacts: strings(d.reportedFacts, 60, 1_000),
    hypotheses: strings(d.hypotheses, 30, 1_000),
    unresolvedQuestions: strings(d.unresolvedQuestions, 30, 1_000),
    clarificationQuestions: Array.isArray(d.clarificationQuestions)
      ? d.clarificationQuestions.filter((q) => q && typeof q.id === "string" && typeof q.question === "string")
          .slice(0, 10).map((q) => ({ id: q.id.slice(0, 100), question: q.question.slice(0, 1_000), options: strings(q.options, 6, 300) }))
      : [],
    clarificationAnswers: Object.fromEntries(Object.entries(d.clarificationAnswers ?? {})
      .filter(([, value]) => typeof value === "string")
      .slice(0, 10).map(([id, value]) => [id.slice(0, 100), String(value).slice(0, 1_000)])),
    previousRecommendation: String(d.previousRecommendation ?? "").slice(0, 20_000),
    actionsTaken: String(d.actionsTaken ?? "").slice(0, 10_000),
    observedOutcome: String(d.observedOutcome ?? "").slice(0, 10_000),
    messages: Array.isArray(d.messages)
      ? d.messages.filter((m) => m && (m.role === "user" || m.role === "assistant") && typeof m.content === "string")
          .slice(-100).map((m) => ({ role: m.role, content: m.content.slice(0, 20_000) }))
      : [],
  };
}

export function renderSavedContext(saved: SavedCase): string {
  return JSON.stringify({
    title: saved.title,
    actors: saved.actors,
    documentedFacts: saved.documentedFacts,
    reportedFacts: saved.reportedFacts,
    hypotheses: saved.hypotheses,
    unresolvedQuestions: saved.unresolvedQuestions,
    clarificationAnswers: saved.clarificationAnswers,
    previousRecommendation: saved.previousRecommendation,
    actionsTaken: saved.actionsTaken,
    observedOutcome: saved.observedOutcome,
  }).slice(0, 20_000);
}
