-- Mentalist as applied-psychology and meta-learning expert.
-- Safe to run more than once.

-- ------------------------------------------------------- crisis logging ---
-- A log of escalations, NOT a diagnosis and never surfaced as one. It exists
-- so a real safety failure is discoverable after the fact, and so the same
-- person is not handed the same handoff five times in one session.

create table if not exists public.crisis_flags (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade,
  triggered_at timestamptz not null default now(),
  trigger_type text not null
    check (trigger_type in ('suicide_self_harm','violence_threat','domestic_abuse','acute_clinical')),
  session_context text
);

alter table public.crisis_flags enable row level security;

-- Deliberately NO select policy for the owner. Someone reading back a list of
-- their own crisis moments is a harm, not a feature. Writes are allowed so the
-- escalation is recorded; reads stay service-role only.
drop policy if exists "user can log own flag" on public.crisis_flags;
create policy "user can log own flag"
  on public.crisis_flags for insert with check (auth.uid() = user_id);

-- ------------------------------------------------------------ screening ---

create table if not exists public.intake_screening (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  completed_at timestamptz not null default now(),
  result text not null check (result in ('clear','escalate')),
  notes jsonb not null default '{}'::jsonb,
  unique (user_id)
);

alter table public.intake_screening enable row level security;

drop policy if exists "owner reads own screening" on public.intake_screening;
create policy "owner reads own screening"
  on public.intake_screening for select using (auth.uid() = user_id);
drop policy if exists "owner writes own screening" on public.intake_screening;
create policy "owner writes own screening"
  on public.intake_screening for insert with check (auth.uid() = user_id);
drop policy if exists "owner updates own screening" on public.intake_screening;
create policy "owner updates own screening"
  on public.intake_screening for update using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- --------------------------------------------------------------- tracks ---
-- Several parallel tracks at once: stoicism AND negotiation AND drawing, each
-- moving at its own pace.

create table if not exists public.user_tracks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  track_id text not null,              -- content slug or a free-form skill
  label text not null,
  started_at timestamptz not null default now(),
  target_pace text not null default 'steady'
    check (target_pace in ('intense','steady','light','paused')),
  current_stage int not null default 1,
  last_reviewed_at timestamptz,
  updated_at timestamptz not null default now(),
  unique (user_id, track_id)
);

alter table public.user_tracks enable row level security;

drop policy if exists "owner reads own tracks" on public.user_tracks;
create policy "owner reads own tracks"
  on public.user_tracks for select using (auth.uid() = user_id);
drop policy if exists "owner writes own tracks" on public.user_tracks;
create policy "owner writes own tracks"
  on public.user_tracks for insert with check (auth.uid() = user_id);
drop policy if exists "owner updates own tracks" on public.user_tracks;
create policy "owner updates own tracks"
  on public.user_tracks for update using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
drop policy if exists "owner deletes own tracks" on public.user_tracks;
create policy "owner deletes own tracks"
  on public.user_tracks for delete using (auth.uid() = user_id);

-- ------------------------------------------------------------ responses ---
-- What the learner actually wrote back. This is both engagement data and the
-- learning mechanism: writing a retrieval answer beats re-reading.

create table if not exists public.training_responses (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  skill_id text not null,
  prompt text,
  response text not null,
  created_at timestamptz not null default now()
);

alter table public.training_responses enable row level security;

drop policy if exists "owner reads own responses" on public.training_responses;
create policy "owner reads own responses"
  on public.training_responses for select using (auth.uid() = user_id);
drop policy if exists "owner writes own responses" on public.training_responses;
create policy "owner writes own responses"
  on public.training_responses for insert with check (auth.uid() = user_id);
drop policy if exists "owner deletes own responses" on public.training_responses;
create policy "owner deletes own responses"
  on public.training_responses for delete using (auth.uid() = user_id);

create index if not exists training_responses_user_idx
  on public.training_responses(user_id, skill_id, created_at desc);
