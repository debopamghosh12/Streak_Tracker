-- Persist: initial schema for multi-device sync.
-- Run once in the Supabase SQL editor (or `supabase db push`).
-- Every row belongs to one user (user_id defaults to auth.uid()); Row Level Security
-- limits every query to the signed-in user's own rows.

-- ---------------------------------------------------------------------------
-- updated_at maintenance: the server clock is the source of truth for sync.
-- ---------------------------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------

-- One row per calendar day: blocks, sundayTasks, dsa, apps, hours, topicsCovered,
-- morning, night, frozen, overrides, skipped, customTasks, movedOut.
create table if not exists public.days (
  user_id    uuid        not null default auth.uid() references auth.users (id) on delete cascade,
  date       date        not null,
  data       jsonb       not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  primary key (user_id, date)
);

-- Carry-forward items. id is a deterministic uuid v5 of (user id + "<source_date>:<source_block_id>"),
-- so two devices rolling over the same day upsert the same row instead of duplicating it.
-- Deletes are soft (dropped = true) so they reach every device.
create table if not exists public.carried_items (
  id              uuid        primary key,
  user_id         uuid        not null default auth.uid() references auth.users (id) on delete cascade,
  source_date     date        not null,
  source_block_id text        not null,
  text            text        not null default '',
  subject         text,
  current_day     date        not null,          -- "current_date" is reserved in SQL
  moves           int         not null default 1 check (moves >= 1),
  done            boolean     not null default false,
  completed_on    date,
  dropped         boolean     not null default false,
  updated_at      timestamptz not null default now(),
  unique (user_id, source_date, source_block_id)
);

-- Syllabus topics ticked off. done_on = null means un-ticked (kept as a row so it syncs).
create table if not exists public.topics_done (
  user_id    uuid        not null default auth.uid() references auth.users (id) on delete cascade,
  topic_id   text        not null,
  done_on    date,
  updated_at timestamptz not null default now(),
  primary key (user_id, topic_id)
);

-- Weekly reviews: javaShipped, aiBuilt, well, slipped, change.
create table if not exists public.reviews (
  user_id    uuid        not null default auth.uid() references auth.users (id) on delete cascade,
  week       int         not null check (week between 1 and 13),
  data       jsonb       not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  primary key (user_id, week)
);

-- Per-user settings: { version, rolledThrough }.
create table if not exists public.settings (
  user_id    uuid        primary key default auth.uid() references auth.users (id) on delete cascade,
  data       jsonb       not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- updated_at triggers
-- ---------------------------------------------------------------------------
drop trigger if exists days_set_updated_at on public.days;
create trigger days_set_updated_at before update on public.days
  for each row execute function public.set_updated_at();

drop trigger if exists carried_items_set_updated_at on public.carried_items;
create trigger carried_items_set_updated_at before update on public.carried_items
  for each row execute function public.set_updated_at();

drop trigger if exists topics_done_set_updated_at on public.topics_done;
create trigger topics_done_set_updated_at before update on public.topics_done
  for each row execute function public.set_updated_at();

drop trigger if exists reviews_set_updated_at on public.reviews;
create trigger reviews_set_updated_at before update on public.reviews
  for each row execute function public.set_updated_at();

drop trigger if exists settings_set_updated_at on public.settings;
create trigger settings_set_updated_at before update on public.settings
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Indexes (pulls filter by user_id and updated_at)
-- ---------------------------------------------------------------------------
create index if not exists carried_items_user_current_day_idx on public.carried_items (user_id, current_day);
create index if not exists carried_items_user_updated_at_idx  on public.carried_items (user_id, updated_at);
create index if not exists days_user_updated_at_idx           on public.days (user_id, updated_at);
create index if not exists topics_done_user_updated_at_idx    on public.topics_done (user_id, updated_at);
create index if not exists reviews_user_updated_at_idx        on public.reviews (user_id, updated_at);

-- ---------------------------------------------------------------------------
-- Row Level Security: each user sees and edits only their own rows.
-- ---------------------------------------------------------------------------
alter table public.days          enable row level security;
alter table public.carried_items enable row level security;
alter table public.topics_done   enable row level security;
alter table public.reviews       enable row level security;
alter table public.settings      enable row level security;

-- days
drop policy if exists "days: select own" on public.days;
drop policy if exists "days: insert own" on public.days;
drop policy if exists "days: update own" on public.days;
drop policy if exists "days: delete own" on public.days;
create policy "days: select own" on public.days for select to authenticated using (user_id = auth.uid());
create policy "days: insert own" on public.days for insert to authenticated with check (user_id = auth.uid());
create policy "days: update own" on public.days for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "days: delete own" on public.days for delete to authenticated using (user_id = auth.uid());

-- carried_items
drop policy if exists "carried_items: select own" on public.carried_items;
drop policy if exists "carried_items: insert own" on public.carried_items;
drop policy if exists "carried_items: update own" on public.carried_items;
drop policy if exists "carried_items: delete own" on public.carried_items;
create policy "carried_items: select own" on public.carried_items for select to authenticated using (user_id = auth.uid());
create policy "carried_items: insert own" on public.carried_items for insert to authenticated with check (user_id = auth.uid());
create policy "carried_items: update own" on public.carried_items for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "carried_items: delete own" on public.carried_items for delete to authenticated using (user_id = auth.uid());

-- topics_done
drop policy if exists "topics_done: select own" on public.topics_done;
drop policy if exists "topics_done: insert own" on public.topics_done;
drop policy if exists "topics_done: update own" on public.topics_done;
drop policy if exists "topics_done: delete own" on public.topics_done;
create policy "topics_done: select own" on public.topics_done for select to authenticated using (user_id = auth.uid());
create policy "topics_done: insert own" on public.topics_done for insert to authenticated with check (user_id = auth.uid());
create policy "topics_done: update own" on public.topics_done for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "topics_done: delete own" on public.topics_done for delete to authenticated using (user_id = auth.uid());

-- reviews
drop policy if exists "reviews: select own" on public.reviews;
drop policy if exists "reviews: insert own" on public.reviews;
drop policy if exists "reviews: update own" on public.reviews;
drop policy if exists "reviews: delete own" on public.reviews;
create policy "reviews: select own" on public.reviews for select to authenticated using (user_id = auth.uid());
create policy "reviews: insert own" on public.reviews for insert to authenticated with check (user_id = auth.uid());
create policy "reviews: update own" on public.reviews for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "reviews: delete own" on public.reviews for delete to authenticated using (user_id = auth.uid());

-- settings
drop policy if exists "settings: select own" on public.settings;
drop policy if exists "settings: insert own" on public.settings;
drop policy if exists "settings: update own" on public.settings;
drop policy if exists "settings: delete own" on public.settings;
create policy "settings: select own" on public.settings for select to authenticated using (user_id = auth.uid());
create policy "settings: insert own" on public.settings for insert to authenticated with check (user_id = auth.uid());
create policy "settings: update own" on public.settings for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "settings: delete own" on public.settings for delete to authenticated using (user_id = auth.uid());
