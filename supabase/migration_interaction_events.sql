-- Interaction event log. Safe to run more than once.
--
-- Append-only log, current state DERIVED by a pure reducer. Not a full
-- event-sourcing framework: no aggregates, no projections table, no snapshots
-- yet. The log plus a fold is enough for persistence, retrospective, debugging
-- and replay, and anything more would be infrastructure the product has not
-- earned.

create table if not exists public.interaction_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  conversation_id text not null,
  -- Validated against a server-side whitelist before it ever gets here.
  event_type text not null,
  payload jsonb not null,
  -- Optimistic-concurrency guard: an action created against an older case
  -- version is rejected rather than silently applied out of order.
  case_version int not null default 0,
  -- Set for events that replace rather than accumulate (a checklist tick
  -- toggled twice is one row, last write wins). Null means append.
  dedupe_key text,
  created_at timestamptz not null default now()
);

alter table public.interaction_events enable row level security;

drop policy if exists "owner reads own events" on public.interaction_events;
create policy "owner reads own events"
  on public.interaction_events for select using (auth.uid() = user_id);

drop policy if exists "owner writes own events" on public.interaction_events;
create policy "owner writes own events"
  on public.interaction_events for insert with check (auth.uid() = user_id);

drop policy if exists "owner updates own events" on public.interaction_events;
create policy "owner updates own events"
  on public.interaction_events for update using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- No delete policy on purpose. The log is append-only; "undoing" an
-- interaction is a new event, not the removal of an old one, because the
-- retrospective needs to be able to show that someone changed their mind.

create index if not exists interaction_events_lookup_idx
  on public.interaction_events(user_id, conversation_id, created_at);

-- Enforces the dedupe contract in the database rather than trusting the
-- application to check first, which would race under double-submit.
create unique index if not exists interaction_events_dedupe_idx
  on public.interaction_events(user_id, conversation_id, dedupe_key)
  where dedupe_key is not null;
