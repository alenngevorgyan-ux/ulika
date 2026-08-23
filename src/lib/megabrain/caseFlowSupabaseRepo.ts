import { FlowError, MAX_FLOWS_PER_OWNER, type CaseFlow, type CaseFlowPhase } from "./caseFlow";
import type { CaseFlowRepo } from "./caseFlowRepo";
import type { getServerSupabase } from "@/lib/supabase/server";

type SupabaseServerClient = NonNullable<Awaited<ReturnType<typeof getServerSupabase>>>;

const TABLE = "megabrain_case_flows";
const ACTIVE_PHASES: CaseFlowPhase[] = ["intake", "awaiting_answers", "analysing"];

/** PostgREST error code for a unique-constraint violation. */
const UNIQUE_VIOLATION = "23505";

interface Row {
  id: string;
  owner_user_id: string;
  conversation_id: string;
  created_at: string;
  updated_at: string;
  expires_at: string;
  mode: CaseFlow["mode"];
  cap_usd: number;
  budgeted_spend_usd: number;
  account: string;
  response_language: string;
  jurisdiction: CaseFlow["jurisdiction"];
  phase: CaseFlowPhase;
  questions: CaseFlow["questions"];
  answers: CaseFlow["answers"];
  answer: string | null;
  follow_ups: CaseFlow["followUps"];
  active_request_id: string | null;
  completed_request_ids: string[];
  safe_error: string | null;
  manual: CaseFlow["manual"];
}

function rowToFlow(row: Row): CaseFlow {
  return {
    id: row.id,
    ownerId: row.owner_user_id,
    conversationId: row.conversation_id,
    phase: row.phase,
    mode: row.mode,
    capUsd: Number(row.cap_usd),
    budgetedSpendUsd: Number(row.budgeted_spend_usd),
    account: row.account,
    responseLanguage: row.response_language,
    jurisdiction: row.jurisdiction,
    questions: row.questions ?? [],
    answers: row.answers ?? {},
    answer: row.answer,
    followUps: row.follow_ups ?? [],
    activeRequestId: row.active_request_id,
    completedRequestIds: new Set(row.completed_request_ids ?? []),
    safeError: row.safe_error,
    createdAt: Date.parse(row.created_at),
    updatedAt: Date.parse(row.updated_at),
    expiresAt: Date.parse(row.expires_at),
    manual: row.manual,
  };
}

function flowToRow(flow: CaseFlow): Omit<Row, "created_at"> {
  return {
    id: flow.id,
    owner_user_id: flow.ownerId,
    conversation_id: flow.conversationId,
    updated_at: new Date(flow.updatedAt).toISOString(),
    expires_at: new Date(flow.expiresAt).toISOString(),
    mode: flow.mode,
    cap_usd: flow.capUsd,
    budgeted_spend_usd: flow.budgetedSpendUsd,
    account: flow.account,
    response_language: flow.responseLanguage,
    jurisdiction: flow.jurisdiction,
    phase: flow.phase,
    questions: flow.questions,
    answers: flow.answers,
    answer: flow.answer,
    follow_ups: flow.followUps,
    active_request_id: flow.activeRequestId,
    completed_request_ids: [...flow.completedRequestIds],
    safe_error: flow.safeError,
    manual: flow.manual,
  };
}

/**
 * Postgres-backed, RLS-scoped case flow storage.
 *
 * Uses the caller's own JWT-scoped client (the same one every other table in
 * this project reads/writes through) — never a service-role key. Ownership is
 * enforced twice, redundantly on purpose: explicitly in every query below,
 * and independently by the table's own RLS policies (auth.uid() =
 * owner_user_id), so a bug in this file's filters cannot leak another
 * user's case.
 */
export class SupabaseCaseFlowRepo implements CaseFlowRepo {
  constructor(private readonly client: SupabaseServerClient) {}

  async insert(flow: CaseFlow): Promise<CaseFlow> {
    const { count, error: countError } = await this.client
      .from(TABLE)
      .select("id", { count: "exact", head: true })
      .eq("owner_user_id", flow.ownerId)
      .in("phase", ACTIVE_PHASES);
    if (countError) throw new FlowError("CASE_FAILED", 500);
    if ((count ?? 0) >= MAX_FLOWS_PER_OWNER) throw new FlowError("FLOW_LIMIT_REACHED", 429);

    const row = { ...flowToRow(flow), created_at: new Date(flow.createdAt).toISOString() };
    const { data, error } = await this.client.from(TABLE).insert(row).select().single();
    if (error) {
      if (error.code === UNIQUE_VIOLATION) throw new FlowError("ACTIVE_FLOW_EXISTS", 409);
      throw new FlowError("CASE_FAILED", 500);
    }
    return rowToFlow(data as Row);
  }

  async selectById(id: string, ownerId: string): Promise<CaseFlow | null> {
    const { data, error } = await this.client
      .from(TABLE)
      .select("*")
      .eq("id", id)
      .eq("owner_user_id", ownerId)
      .gt("expires_at", new Date().toISOString())
      .maybeSingle();
    if (error || !data) return null;
    return rowToFlow(data as Row);
  }

  async selectByRequestId(ownerId: string, requestId: string): Promise<CaseFlow | null> {
    const { data, error } = await this.client
      .from(TABLE)
      .select("*")
      .eq("owner_user_id", ownerId)
      .gt("expires_at", new Date().toISOString())
      .or(`active_request_id.eq.${requestId},completed_request_ids.cs.{${requestId}}`)
      .maybeSingle();
    if (error || !data) return null;
    return rowToFlow(data as Row);
  }

  async claim(flowId: string, ownerId: string, requestId: string, allowed: CaseFlowPhase[], next: CaseFlowPhase, staleLockMs: number): Promise<CaseFlow | null> {
    const now = Date.now();
    const staleThreshold = new Date(now - staleLockMs).toISOString();
    const { data, error } = await this.client
      .from(TABLE)
      .update({
        phase: next,
        active_request_id: requestId,
        safe_error: null,
        updated_at: new Date(now).toISOString(),
        expires_at: new Date(now + 30 * 60 * 1000).toISOString(),
      })
      .eq("id", flowId)
      .eq("owner_user_id", ownerId)
      .in("phase", allowed)
      .or(`active_request_id.is.null,updated_at.lt.${staleThreshold}`)
      .select()
      .maybeSingle();
    if (error || !data) return null;
    return rowToFlow(data as Row);
  }

  async touchExpiry(id: string, ownerId: string): Promise<void> {
    const now = Date.now();
    await this.client
      .from(TABLE)
      .update({ updated_at: new Date(now).toISOString(), expires_at: new Date(now + 30 * 60 * 1000).toISOString() })
      .eq("id", id)
      .eq("owner_user_id", ownerId);
  }

  async persist(flow: CaseFlow): Promise<void> {
    const { id, owner_user_id, ...patch } = flowToRow(flow);
    await this.client.from(TABLE).update(patch).eq("id", id).eq("owner_user_id", owner_user_id);
  }
}
