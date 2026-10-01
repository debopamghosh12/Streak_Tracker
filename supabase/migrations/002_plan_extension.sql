-- Persist: open-ended plan — user-defined phases and weeks layered over the built-in 13 weeks.
-- Run once in the Supabase SQL editor after 001_init.sql (or `supabase db push`). Safe to re-run.
-- Reuses public.set_updated_at() from 001. Deletes are soft (deleted = true) so they reach every device.

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------

-- A phase: name, week range (end_week null = open-ended), optional goal line and DSA problem goal.
create table if not exists public.plan_phases (
  user_id    uuid        not null default auth.uid() references auth.users (id) on delete cascade,
  id         text        not null,
  name       text        not null,
  start_week int         not null check (start_week >= 1),
  end_week   int         check (end_week is null or end_week >= start_week),
  goal       text,
  dsa_goal   int         check (dsa_goal is null or dsa_goal > 0),
  deleted    boolean     not null default false,
  updated_at timestamptz not null default now(),
  primary key (user_id, id)
);

-- A week's plan. week_number n starts on 2 Oct 2026 + 7·(n−1); weeks 1–13 override the base plan.
-- topics: { dsa, java, cs, ai, apt } (text or null = not set) · targets: optional custom target text per subject.
create table if not exists public.plan_weeks (
  user_id     uuid        not null default auth.uid() references auth.users (id) on delete cascade,
  week_number int         not null check (week_number >= 1),
  phase_id    text,
  topics      jsonb       not null default '{}'::jsonb,
  targets     jsonb,
  deleted     boolean     not null default false,
  updated_at  timestamptz not null default now(),
  primary key (user_id, week_number)
);

-- ---------------------------------------------------------------------------
-- updated_at triggers (function defined in 001_init.sql)
-- ---------------------------------------------------------------------------
drop trigger if exists plan_phases_set_updated_at on public.plan_phases;
create trigger plan_phases_set_updated_at before update on public.plan_phases
  for each row execute function public.set_updated_at();

drop trigger if exists plan_weeks_set_updated_at on public.plan_weeks;
create trigger plan_weeks_set_updated_at before update on public.plan_weeks
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Indexes (pulls filter by user_id and updated_at)
-- ---------------------------------------------------------------------------
create index if not exists plan_phases_user_updated_at_idx on public.plan_phases (user_id, updated_at);
create index if not exists plan_weeks_user_updated_at_idx  on public.plan_weeks (user_id, updated_at);

-- ---------------------------------------------------------------------------
-- Row Level Security: each user sees and edits only their own rows.
-- ---------------------------------------------------------------------------
alter table public.plan_phases enable row level security;
alter table public.plan_weeks  enable row level security;

-- plan_phases
drop policy if exists "plan_phases: select own" on public.plan_phases;
drop policy if exists "plan_phases: insert own" on public.plan_phases;
drop policy if exists "plan_phases: update own" on public.plan_phases;
drop policy if exists "plan_phases: delete own" on public.plan_phases;
create policy "plan_phases: select own" on public.plan_phases for select to authenticated using (user_id = auth.uid());
create policy "plan_phases: insert own" on public.plan_phases for insert to authenticated with check (user_id = auth.uid());
create policy "plan_phases: update own" on public.plan_phases for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "plan_phases: delete own" on public.plan_phases for delete to authenticated using (user_id = auth.uid());

-- plan_weeks
drop policy if exists "plan_weeks: select own" on public.plan_weeks;
drop policy if exists "plan_weeks: insert own" on public.plan_weeks;
drop policy if exists "plan_weeks: update own" on public.plan_weeks;
drop policy if exists "plan_weeks: delete own" on public.plan_weeks;
create policy "plan_weeks: select own" on public.plan_weeks for select to authenticated using (user_id = auth.uid());
create policy "plan_weeks: insert own" on public.plan_weeks for insert to authenticated with check (user_id = auth.uid());
create policy "plan_weeks: update own" on public.plan_weeks for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "plan_weeks: delete own" on public.plan_weeks for delete to authenticated using (user_id = auth.uid());
