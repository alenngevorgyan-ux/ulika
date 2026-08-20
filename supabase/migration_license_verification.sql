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
