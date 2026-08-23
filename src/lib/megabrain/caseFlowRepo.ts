import type { AnalysisMode } from "./analysisMode";
import { FlowError, MAX_FLOWS_PER_OWNER, newFlowShape, touch, type CaseFlow, type CaseFlowPhase } from "./caseFlow";

/**
 * Storage seam for the case flow.
 *
 * The orchestration functions below (createCaseFlow, ownedFlow, flowForRequest,
 * beginTransition, persistFlow) are storage-agnostic: they know the phase
 * machine's rules, but not where a CaseFlow row actually lives. Production
 * wires CaseFlowSupabaseRepo (Postgres, RLS-scoped by the caller's JWT — see
 * caseFlowSupabaseRepo.ts); tests wire InMemoryCaseFlowRepo below, so the
 * phase-machine tests still run with zero network calls, and the durable-
 * persistence property itself is proven separately, empirically, against the
 * deployed endpoint (unit tests cannot prove "survives a different serverless
 * instance" — only a real second HTTP request can).
 */
export interface CaseFlowRepo {
  /** Inserts a new flow. Throws ACTIVE_FLOW_EXISTS / FLOW_LIMIT_REACHED. */
  insert(flow: CaseFlow): Promise<CaseFlow>;
  /** RLS-scoped read. Returns null for "doesn't exist" AND "exists but is someone else's" — indistinguishable on purpose, so a wrong id never confirms another user's case exists. */
  selectById(id: string, ownerId: string): Promise<CaseFlow | null>;
  selectByRequestId(ownerId: string, requestId: string): Promise<CaseFlow | null>;
  /**
   * Atomically claims the flow for `requestId`: moves phase -> next only if
   * phase is currently one of `allowed` AND no other request currently holds
   * the lock (or the lock is stale — older than `staleLockMs`, which can only
   * mean the request that held it was already killed by the platform, since
   * the route's own maxDuration is well under that). Returns the updated row
   * on success, or null if the claim did not happen (caller re-reads to
   * report FLOW_BUSY vs INVALID_FLOW_TRANSITION precisely).
   */
  claim(flowId: string, ownerId: string, requestId: string, allowed: CaseFlowPhase[], next: CaseFlowPhase, staleLockMs: number): Promise<CaseFlow | null>;
  /** Bumps the sliding TTL on a plain read, without touching any other field. */
  touchExpiry(id: string, ownerId: string): Promise<void>;
  /** Full write-back. Called once, at the end of a request, by whichever request holds the lock (activeRequestId). */
  persist(flow: CaseFlow): Promise<void>;
}

/** Route ceiling is 300s (maxDuration). A lock older than this can only be abandoned. */
export const STALE_LOCK_MS = 6 * 60 * 1000;

export async function createCaseFlow(
  repo: CaseFlowRepo,
  input: {
    ownerId: string;
    conversationId: string;
    mode: Exclude<AnalysisMode, "deep">;
    account: string;
    responseLanguage: string;
    jurisdiction: { country: string; region?: string };
    requestId: string;
    capUsd?: number;
    manual?: CaseFlow["manual"];
  }
): Promise<CaseFlow> {
  return repo.insert(newFlowShape(input));
}

export async function ownedFlow(repo: CaseFlowRepo, id: string, ownerId: string): Promise<CaseFlow> {
  const flow = await repo.selectById(id, ownerId);
  if (!flow) throw new FlowError("FLOW_NOT_FOUND", 404);
  await repo.touchExpiry(flow.id, ownerId);
  touch(flow);
  return flow;
}

export async function flowForRequest(repo: CaseFlowRepo, ownerId: string, requestId: string): Promise<CaseFlow | null> {
  const flow = await repo.selectByRequestId(ownerId, requestId);
  if (!flow) return null;
  await repo.touchExpiry(flow.id, ownerId);
  touch(flow);
  return flow;
}

/**
 * Mutates `flow` in place to reflect the claimed transition (mirrors the old
 * in-memory beginTransition's contract exactly) and returns the same
 * "started" | "duplicate" the route already branches on.
 */
export async function beginTransition(
  repo: CaseFlowRepo,
  flow: CaseFlow,
  requestId: string,
  allowed: CaseFlowPhase[],
  next: CaseFlowPhase
): Promise<"started" | "duplicate"> {
  if (flow.completedRequestIds.has(requestId) || flow.activeRequestId === requestId) return "duplicate";
  const claimed = await repo.claim(flow.id, flow.ownerId, requestId, allowed, next, STALE_LOCK_MS);
  if (!claimed) {
    // Re-read to report precisely why the atomic claim did not happen. Order
    // matches the original in-memory precedence: a live lock is reported as
    // FLOW_BUSY even when the phase has also since moved on, because from the
    // caller's point of view "someone else is mid-transition" is the more
    // actionable fact than "the phase changed under you".
    const fresh = await repo.selectById(flow.id, flow.ownerId);
    if (!fresh) throw new FlowError("FLOW_NOT_FOUND", 404);
    if (fresh.activeRequestId !== null) throw new FlowError("FLOW_BUSY", 409);
    throw new FlowError("INVALID_FLOW_TRANSITION", 409);
  }
  flow.phase = claimed.phase;
  flow.activeRequestId = claimed.activeRequestId;
  flow.safeError = claimed.safeError;
  flow.updatedAt = claimed.updatedAt;
  flow.expiresAt = claimed.expiresAt;
  return "started";
}

export async function persistFlow(repo: CaseFlowRepo, flow: CaseFlow): Promise<void> {
  await repo.persist(flow);
}

/** Test double. No network calls — the phase machine is exercised in full. */
export class InMemoryCaseFlowRepo implements CaseFlowRepo {
  private rows = new Map<string, CaseFlow>();

  private clone(flow: CaseFlow): CaseFlow {
    return { ...structuredClone({ ...flow, completedRequestIds: [...flow.completedRequestIds] }), completedRequestIds: new Set(flow.completedRequestIds) };
  }

  async insert(flow: CaseFlow): Promise<CaseFlow> {
    const ownerFlows = [...this.rows.values()].filter((f) => f.ownerId === flow.ownerId && f.expiresAt > Date.now());
    if (ownerFlows.some((f) => f.conversationId === flow.conversationId && ["intake", "awaiting_answers", "analysing"].includes(f.phase))) {
      throw new FlowError("ACTIVE_FLOW_EXISTS", 409);
    }
    if (ownerFlows.length >= MAX_FLOWS_PER_OWNER) throw new FlowError("FLOW_LIMIT_REACHED", 429);
    this.rows.set(flow.id, this.clone(flow));
    return this.clone(flow);
  }

  async selectById(id: string, ownerId: string): Promise<CaseFlow | null> {
    const row = this.rows.get(id);
    if (!row || row.ownerId !== ownerId || row.expiresAt <= Date.now()) return null;
    return this.clone(row);
  }

  async selectByRequestId(ownerId: string, requestId: string): Promise<CaseFlow | null> {
    for (const row of this.rows.values()) {
      if (row.ownerId !== ownerId || row.expiresAt <= Date.now()) continue;
      if (row.activeRequestId === requestId || row.completedRequestIds.has(requestId)) return this.clone(row);
    }
    return null;
  }

  async claim(flowId: string, ownerId: string, requestId: string, allowed: CaseFlowPhase[], next: CaseFlowPhase, staleLockMs: number): Promise<CaseFlow | null> {
    const row = this.rows.get(flowId);
    if (!row || row.ownerId !== ownerId || row.expiresAt <= Date.now()) return null;
    const lockStale = row.activeRequestId !== null && Date.now() - row.updatedAt >= staleLockMs;
    if (!allowed.includes(row.phase)) return null;
    if (row.activeRequestId !== null && !lockStale) return null;
    row.phase = next;
    row.activeRequestId = requestId;
    row.safeError = null;
    touch(row);
    return this.clone(row);
  }

  async touchExpiry(id: string, ownerId: string): Promise<void> {
    const row = this.rows.get(id);
    if (row && row.ownerId === ownerId) touch(row);
  }

  async persist(flow: CaseFlow): Promise<void> {
    const row = this.rows.get(flow.id);
    if (!row || row.ownerId !== flow.ownerId) return;
    this.rows.set(flow.id, this.clone(flow));
  }

  /** Tests only. */
  clear(): void {
    this.rows.clear();
  }
}
