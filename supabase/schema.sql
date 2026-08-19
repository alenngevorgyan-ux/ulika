-- УЛИКА schema: personal learning plans, owner-only RLS.
-- Auth/profiles come from Supabase Auth (auth.users) — no separate profiles
-- table needed for this MVP.

create table if not exists public.learning_plans (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  goal text not null,
  items jsonb not null, -- [{slug, title, rationale, order, completed}]
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.learning_plans enable row level security;

create policy "owner can select own plans"
  on public.learning_plans for select
  using (auth.uid() = user_id);

create policy "owner can insert own plans"
  on public.learning_plans for insert
  with check (auth.uid() = user_id);

create policy "owner can update own plans"
  on public.learning_plans for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "owner can delete own plans"
  on public.learning_plans for delete
  using (auth.uid() = user_id);

create index if not exists learning_plans_user_id_idx on public.learning_plans(user_id);
