-- Block 1 (source provenance) + Block 4 (three depth layers).
-- Combined so this is one paste rather than two. Safe to run more than once.

-- ------------------------------------------------------- provenance ---
-- acquisition_method has NO option for a purchased or unauthorised source.
-- The enum is the enforcement: there is no value to put there, so no code
-- path can quietly create one.

do $$ begin
  create type acquisition_method as enum (
    'public_domain',
    'open_courseware',
    'open_access_research',
    'author_released_free',
    'user_uploaded'
  );
exception when duplicate_object then null; end $$;

-- licence_class is the distinction the whitelist enforces: freely READABLE is
-- not the same as freely REDISTRIBUTABLE. reference_only sources may carry our
-- own notes and a citation, never their text.
do $$ begin
  create type licence_class as enum ('redistributable', 'reference_only');
exception when duplicate_object then null; end $$;

alter table public.knowledge_sources
  add column if not exists acquisition_method acquisition_method;
alter table public.knowledge_sources
  add column if not exists licence licence_class not null default 'reference_only';
alter table public.knowledge_sources
  add column if not exists source_url text;
alter table public.knowledge_sources
  add column if not exists licence_note text;
alter table public.knowledge_sources
  add column if not exists added_by uuid references auth.users(id) on delete set null;

-- ------------------------------------------------- three depth layers ---
-- Same content in the database, different traversal speed. A short deadline
-- gets CORE across many topics; a long one unfolds all three on each.

do $$ begin
  create type depth_layer as enum ('core', 'deepening', 'mastery');
exception when duplicate_object then null; end $$;

alter table public.knowledge_chunks
  add column if not exists depth depth_layer not null default 'core';

-- Map the existing four-part notes onto the three layers rather than
-- rewriting 116 chunks of content:
--   Mechanism + Using it        -> core       (the idea and one practice)
--   What it lets you see        -> deepening  (context, what it surfaces)
--   Where it fails              -> mastery    (edge cases, misapplication)
-- This is why the notes were split on those boundaries in the first place.
update public.knowledge_chunks set depth = 'core'
  where chapter_title in ('Mechanism', 'Using it');
update public.knowledge_chunks set depth = 'deepening'
  where chapter_title = 'What it lets you see';
update public.knowledge_chunks set depth = 'mastery'
  where chapter_title = 'Where it fails';

create index if not exists knowledge_chunks_depth_idx
  on public.knowledge_chunks(depth);

-- Retrieval gains a depth filter. Recreated rather than replaced because the
-- return shape changes, which CREATE OR REPLACE refuses.
drop function if exists public.match_knowledge_chunks(vector, text[], int);

create or replace function public.match_knowledge_chunks(
  p_embedding vector(768),
  p_categories text[] default null,
  p_limit int default 6,
  p_depths text[] default null
)
returns table (
  chunk_id uuid,
  source_id text,
  source_title text,
  category_id text,
  evidence_grade text,
  chapter_title text,
  content text,
  short_definition text,
  applicable_situations text[],
  depth text,
  similarity float
)
language sql stable
as $$
  select
    c.id, s.id, s.title, s.category_id, s.evidence_grade,
    c.chapter_title, c.content, c.short_definition, c.applicable_situations,
    c.depth::text,
    1 - (c.embedding <=> p_embedding) as similarity
  from public.knowledge_chunks c
  join public.knowledge_sources s on s.id = c.source_id
  where c.embedding is not null
    and (p_categories is null or s.category_id = any(p_categories))
    and (p_depths is null or c.depth::text = any(p_depths))
  order by c.embedding <=> p_embedding
  limit p_limit;
$$;

grant execute on function public.match_knowledge_chunks(vector, text[], int, text[])
  to anon, authenticated;

-- --------------------------------------------------------- admin gate ---
-- Owner-only. A single-owner allowlist rather than a role system, because a
-- role system for one person is machinery with no payload.

create table if not exists public.app_admins (
  user_id uuid primary key references auth.users(id) on delete cascade,
  added_at timestamptz not null default now()
);

alter table public.app_admins enable row level security;
revoke insert, update, delete, truncate on public.app_admins from anon, authenticated;

drop policy if exists "admins can see the admin list" on public.app_admins;
create policy "admins can see the admin list"
  on public.app_admins for select using (auth.uid() = user_id);

create or replace function public.is_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.app_admins where user_id = auth.uid());
$$;

grant execute on function public.is_admin() to authenticated;
