-- Additive, owner-reviewed migration. Do not apply automatically.
begin;
create table if not exists public.skincare_preferences (
  user_id uuid primary key references auth.users(id) on delete cascade,
  data jsonb not null check (jsonb_typeof(data) = 'object' and data ? 'consent' and data->>'consent' = 'true'),
  updated_at timestamptz not null default now()
);
-- Reuse the existing customization table; immutable AI suggestions stay in analysis_jobs.
create table if not exists public.routines (
  user_id uuid primary key references auth.users(id) on delete cascade,
  data jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);
create table if not exists public.skin_diary_entries (
  user_id uuid not null references auth.users(id) on delete cascade,
  entry_date date not null,
  data jsonb not null check (jsonb_typeof(data) = 'object' and data->>'date' = entry_date::text),
  updated_at timestamptz not null default now(),
  primary key (user_id, entry_date)
);
alter table public.skincare_preferences enable row level security;
alter table public.routines enable row level security;
alter table public.skin_diary_entries enable row level security;
drop policy if exists "Retention own preferences" on public.skincare_preferences;
create policy "Retention own preferences" on public.skincare_preferences for all to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
drop policy if exists "Retention own routines" on public.routines;
create policy "Retention own routines" on public.routines for all to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
drop policy if exists "Retention own diary" on public.skin_diary_entries;
create policy "Retention own diary" on public.skin_diary_entries for all to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
revoke all on public.skincare_preferences, public.routines, public.skin_diary_entries from anon;
grant select, insert, update, delete on public.skincare_preferences, public.routines, public.skin_diary_entries to authenticated, service_role;
-- The diary primary key supports owner-scoped date ranges and idempotent daily upserts.
commit;
