-- Knowledge base with vector search.
-- Safe to run more than once.

create extension if not exists vector;

-- ----------------------------------------------------------- categories ---
-- Broad directions. Kept as a table rather than an enum so new ones can be
-- added without a migration once the library grows past the original three.

create table if not exists public.knowledge_categories (
  id text primary key,
  name text not null,
  description text not null,
  sort_order int not null default 0
);

-- -------------------------------------------------------------- sources ---

create table if not exists public.knowledge_sources (
  id text primary key,
  category_id text not null references public.knowledge_categories(id) on delete cascade,
  title text not null,
  author text,
  type text not null default 'method' check (type in ('book','lecture','research','method','craft')),
  evidence_grade text check (evidence_grade in ('A','B','C','D')),
  created_at timestamptz not null default now()
);

create index if not exists knowledge_sources_category_idx
  on public.knowledge_sources(category_id);

-- --------------------------------------------------------------- chunks ---
-- gemini-embedding-001 returns 768 dimensions at the size we request.

create table if not exists public.knowledge_chunks (
  id uuid primary key default gen_random_uuid(),
  source_id text not null references public.knowledge_sources(id) on delete cascade,
  chapter_title text not null,
  content text not null,
  -- One or two sentences. Used for fast machine scanning and for showing the
  -- router's pick to a human without dumping the full chunk.
  short_definition text not null,
  applicable_situations text[] not null default '{}',
  embedding vector(768),
  created_at timestamptz not null default now()
);

create index if not exists knowledge_chunks_source_idx
  on public.knowledge_chunks(source_id);

-- IVFFlat needs rows present before it can build meaningful lists, so this is
-- created after seeding by the ingest script rather than here.

-- ------------------------------------------------------------------ RLS ---
-- The library is reference material: readable by anyone using the app,
-- writable only by service role. Same shape as the corpus tables in the other
-- project, where a permissive update policy once made every row world-writable.
-- Supabase grants table-level DML to anon/authenticated BY DEFAULT, so the
-- grants must be revoked explicitly — RLS alone does not do it.

alter table public.knowledge_categories enable row level security;
alter table public.knowledge_sources enable row level security;
alter table public.knowledge_chunks enable row level security;

revoke insert, update, delete, truncate on public.knowledge_categories from anon, authenticated;
revoke insert, update, delete, truncate on public.knowledge_sources from anon, authenticated;
revoke insert, update, delete, truncate on public.knowledge_chunks from anon, authenticated;

drop policy if exists "anyone can read categories" on public.knowledge_categories;
create policy "anyone can read categories"
  on public.knowledge_categories for select to anon, authenticated using (true);

drop policy if exists "anyone can read sources" on public.knowledge_sources;
create policy "anyone can read sources"
  on public.knowledge_sources for select to anon, authenticated using (true);

drop policy if exists "anyone can read chunks" on public.knowledge_chunks;
create policy "anyone can read chunks"
  on public.knowledge_chunks for select to anon, authenticated using (true);

-- ------------------------------------------------------------ retrieval ---
-- Similarity search scoped to a category set. The scoping is load-bearing:
-- searching the whole library at once lets a psychology chunk outrank the
-- craft chunk the question was actually about.

create or replace function public.match_knowledge_chunks(
  p_embedding vector(768),
  p_categories text[] default null,
  p_limit int default 6
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
  similarity float
)
language sql stable
as $$
  select
    c.id,
    s.id,
    s.title,
    s.category_id,
    s.evidence_grade,
    c.chapter_title,
    c.content,
    c.short_definition,
    c.applicable_situations,
    1 - (c.embedding <=> p_embedding) as similarity
  from public.knowledge_chunks c
  join public.knowledge_sources s on s.id = c.source_id
  where c.embedding is not null
    and (p_categories is null or s.category_id = any(p_categories))
  order by c.embedding <=> p_embedding
  limit p_limit;
$$;

grant execute on function public.match_knowledge_chunks(vector, text[], int)
  to anon, authenticated;


-- ------------------------------------------------- dossier -> suggestions ---
-- Links extracted patterns to tracks that work on them.

create table if not exists public.suggested_tracks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  pattern_source text not null,        -- the memory subject that triggered it
  suggested_track_id text not null,    -- catalog slug
  reason text not null,                -- shown to the user, cites the observation
  shown_at timestamptz,
  accepted boolean,
  created_at timestamptz not null default now(),
  unique (user_id, pattern_source, suggested_track_id)
);

alter table public.suggested_tracks enable row level security;

drop policy if exists "owner reads own suggestions" on public.suggested_tracks;
create policy "owner reads own suggestions"
  on public.suggested_tracks for select using (auth.uid() = user_id);
drop policy if exists "owner writes own suggestions" on public.suggested_tracks;
create policy "owner writes own suggestions"
  on public.suggested_tracks for insert with check (auth.uid() = user_id);
drop policy if exists "owner updates own suggestions" on public.suggested_tracks;
create policy "owner updates own suggestions"
  on public.suggested_tracks for update using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create index if not exists suggested_tracks_user_idx
  on public.suggested_tracks(user_id, created_at desc);

-- Block A's checklist blocks write here too, so the response column must
-- tolerate a checkbox as well as prose.
alter table public.training_responses
  add column if not exists block_id text;
alter table public.training_responses
  add column if not exists checked boolean;
