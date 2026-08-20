-- Persistent memory for the Mentalist.
--
-- Without this every conversation starts from zero, which is the single
-- biggest thing making it feel like a generic chatbot: a mentor who cannot
-- remember your sister's name or the job you were deciding about last week
-- is not a mentor.
--
-- Kinds, deliberately narrow so extraction stays disciplined:
--   person    - someone in the user's life (name, role, relationship)
--   situation - an ongoing thing with a live outcome
--   pattern   - something recurring about how the user operates
--   goal      - what they said they want
--   fact      - stable biographical detail (job, city, family shape)

create table if not exists public.mentalist_memory (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  kind text not null check (kind in ('person','situation','pattern','goal','fact')),
  subject text not null,          -- "Marina", "the funding round", "avoids direct conflict"
  detail text not null,           -- the actual content
  confidence text not null default 'stated'
    check (confidence in ('stated','inferred')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.mentalist_memory enable row level security;

create policy "owner reads own memory"
  on public.mentalist_memory for select using (auth.uid() = user_id);
create policy "owner writes own memory"
  on public.mentalist_memory for insert with check (auth.uid() = user_id);
create policy "owner updates own memory"
  on public.mentalist_memory for update using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
create policy "owner deletes own memory"
  on public.mentalist_memory for delete using (auth.uid() = user_id);

create index if not exists mentalist_memory_user_idx
  on public.mentalist_memory(user_id, kind);

-- One row per (user, kind, subject): re-mentioning someone updates the detail
-- rather than accumulating near-duplicates that would bloat the prompt.
create unique index if not exists mentalist_memory_unique_subject
  on public.mentalist_memory(user_id, kind, lower(subject));


-- Conversations move server-side so history follows the account, not the
-- browser. localStorage stays as the guest-mode path.
create table if not exists public.mentalist_conversations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null default 'New conversation',
  messages jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.mentalist_conversations enable row level security;

create policy "owner reads own conversations"
  on public.mentalist_conversations for select using (auth.uid() = user_id);
create policy "owner writes own conversations"
  on public.mentalist_conversations for insert with check (auth.uid() = user_id);
create policy "owner updates own conversations"
  on public.mentalist_conversations for update using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
create policy "owner deletes own conversations"
  on public.mentalist_conversations for delete using (auth.uid() = user_id);

create index if not exists mentalist_conversations_user_idx
  on public.mentalist_conversations(user_id, updated_at desc);
