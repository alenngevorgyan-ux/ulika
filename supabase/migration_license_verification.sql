-- Licence verification provenance. Safe to run more than once.
--
-- The rule this enforces: a licence is only believed when it is read at the
-- PRIMARY source — the author, the publisher, or the work's own copyright
-- page. Secondary catalogues (MERLOT, OER Commons, library records) are
-- frequently wrong or stale, and "three catalogues agree" is not verification,
-- it is three copies of the same unchecked claim.

do $$ begin
  create type license_status as enum (
    'verified',            -- read at the primary source, quote recorded
    'needs_manual_check',  -- ambiguous, or catalogue and primary disagree
    'not_applicable'       -- our own original writing
  );
exception when duplicate_object then null; end $$;

alter table public.knowledge_sources
  add column if not exists license_status license_status not null default 'needs_manual_check';

-- The page where the licence was actually read, not where it was claimed.
alter table public.knowledge_sources
  add column if not exists license_verified_source_url text;

-- The licence text, verbatim, as it appeared there.
alter table public.knowledge_sources
  add column if not exists license_quote text;

-- When primary and secondary disagree, BOTH readings are kept so a human can
-- adjudicate rather than being handed one side of a conflict.
alter table public.knowledge_sources
  add column if not exists license_conflict jsonb;

-- Our own notes are not a licensing question.
update public.knowledge_sources
set license_status = 'not_applicable'
where license_note like 'Original notes written for ULIKA%';


-- ------------------------------------------------------------- feedback ---
-- A structured channel for the first outside testers, so problems arrive as
-- records rather than as remarks in a chat.

create table if not exists public.feedback_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade,
  page text not null,
  rating int check (rating between 1 and 5),
  comment text,
  created_at timestamptz not null default now()
);

alter table public.feedback_events enable row level security;

drop policy if exists "owner writes own feedback" on public.feedback_events;
create policy "owner writes own feedback"
  on public.feedback_events for insert with check (auth.uid() = user_id);

-- Readable by the person who wrote it, so they can see it was recorded. The
-- owner reads the full set through the service role, not through this policy.
drop policy if exists "owner reads own feedback" on public.feedback_events;
create policy "owner reads own feedback"
  on public.feedback_events for select using (auth.uid() = user_id);

create index if not exists feedback_events_created_idx
  on public.feedback_events(created_at desc);


-- ------------------------------------------------- per-chunk grading ---
-- Some sources are internally heterogeneous. The 50-scenarios file puts a
-- forcing trick that is arithmetic (certain) next to gaze-direction reading
-- that barely beats chance. A single source-level grade would either launder
-- the weak entries under the strong ones' credibility or bury the certain ones
-- under the weak. So a chunk may override its source's grade.

alter table public.knowledge_chunks
  add column if not exists grade_override text
    check (grade_override in ('A','B','C','D'));

-- Stage craft that must NEVER be presented as real perception, whatever the
-- conversation. Enforced at retrieval rather than trusted to the persona.
alter table public.knowledge_chunks
  add column if not exists craft_only boolean not null default false;

create index if not exists knowledge_chunks_craft_idx
  on public.knowledge_chunks(craft_only) where craft_only;


-- Retrieval must surface the per-chunk grade and the craft flag, otherwise the
-- rules layer has nothing to enforce against.
drop function if exists public.match_knowledge_chunks(vector, text[], int, text[]);

create or replace function public.match_knowledge_chunks(
  p_embedding vector(768),
  p_categories text[] default null,
  p_limit int default 6,
  p_depths text[] default null
)
returns table (
  chunk_id uuid, source_id text, source_title text, category_id text,
  evidence_grade text, chapter_title text, content text, short_definition text,
  applicable_situations text[], depth text, craft_only boolean, similarity float
)
language sql stable
as $$
  select
    c.id, s.id, s.title, s.category_id,
    -- A chunk's own grade wins over its source's.
    coalesce(c.grade_override, s.evidence_grade),
    c.chapter_title, c.content, c.short_definition, c.applicable_situations,
    c.depth::text, c.craft_only,
    1 - (c.embedding <=> p_embedding)
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
