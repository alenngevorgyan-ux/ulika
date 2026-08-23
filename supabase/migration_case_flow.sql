-- Durable, server-owned Megabrain case flow.
--
-- Replaces the in-process `Map` that used to back src/lib/megabrain/caseFlow.ts.
-- On Vercel, a plain module-scope Map is not shared across serverless
-- instances/invocations, so a flow created by one request could be invisible
-- to the next — the STATE_EXPIRED bug. This table is the fix: the flow now
-- lives in Postgres, one row per case, owner-scoped by RLS exactly like every
-- other table in this project (mentalist_memory, mentalist_conversations,
-- learning_plans all use the same auth.uid() = owner pattern).
--
-- Safe to run more than once: CREATE TABLE IF NOT EXISTS, indexes IF NOT
-- EXISTS, policies dropped before recreated.
--
-- Privacy: `account` (the user's original case text) and `manual` (hidden
-- brief/snapshot/retrieval — internal analysis artifacts needed only for
-- continuation) are stored here, owner-RLS-only, never returned by
-- publicFlow() to the client and never logged. Same 30-minute TTL the old
-- in-memory flow used — this is ACTIVE case state, not the separate,
-- long-term "Saved Case" feature (src/lib/megabrain/savedCases.ts), which
-- remains an explicit, user-triggered save and is untouched by this migration.

create table if not exists public.megabrain_case_flows (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references auth.users(id) on delete cascade,
  conversation_id text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  expires_at timestamptz not null,

  mode text not null check (mode in ('light', 'standard', 'strong')),
  cap_usd numeric not null check (cap_usd >= 0),
  budgeted_spend_usd numeric not null default 0 check (budgeted_spend_usd >= 0),

  account text not null,
  response_language text not null,
  jurisdiction jsonb not null default '{}'::jsonb,

  phase text not null check (phase in ('intake', 'awaiting_answers', 'analysing', 'completed', 'failed')),
  questions jsonb not null default '[]'::jsonb,
  answers jsonb not null default '{}'::jsonb,
  answer text,
  follow_ups jsonb not null default '[]'::jsonb,

  active_request_id text,
  completed_request_ids text[] not null default '{}',
  safe_error text,

  manual jsonb
);

-- One live case per (owner, conversation) — enforced by the database, not by
-- a SELECT-then-INSERT race in application code (ACTIVE_FLOW_EXISTS).
create unique index if not exists megabrain_case_flows_one_active
  on public.megabrain_case_flows (owner_user_id, conversation_id)
  where phase in ('intake', 'awaiting_answers', 'analysing');

create index if not exists megabrain_case_flows_owner_idx
  on public.megabrain_case_flows (owner_user_id);

create index if not exists megabrain_case_flows_owner_active_request_idx
  on public.megabrain_case_flows (owner_user_id, active_request_id)
  where active_request_id is not null;

alter table public.megabrain_case_flows enable row level security;

drop policy if exists "owner reads own case flows" on public.megabrain_case_flows;
create policy "owner reads own case flows"
  on public.megabrain_case_flows for select using (auth.uid() = owner_user_id);

drop policy if exists "owner inserts own case flows" on public.megabrain_case_flows;
create policy "owner inserts own case flows"
  on public.megabrain_case_flows for insert with check (auth.uid() = owner_user_id);

drop policy if exists "owner updates own case flows" on public.megabrain_case_flows;
create policy "owner updates own case flows"
  on public.megabrain_case_flows for update using (auth.uid() = owner_user_id)
  with check (auth.uid() = owner_user_id);

-- No delete policy: rows are left to expire (expires_at) and are lazily swept
-- by the app on the owner's own next request. Nothing needs to delete
-- another owner's row, and nothing needs to delete rows in bulk from the
-- client.
