create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text check (display_name is null or char_length(display_name) <= 80),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create or replace function public.create_skin_snap_profile()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id) values (new.id) on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created_skin_snap on auth.users;
create trigger on_auth_user_created_skin_snap
  after insert on auth.users
  for each row execute function public.create_skin_snap_profile();
revoke all on function public.create_skin_snap_profile() from public, anon, authenticated;

create table if not exists public.analysis_history (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  idempotency_key text not null check (char_length(idempotency_key) between 1 and 128),
  status text not null check (status in ('processing', 'complete')),
  result jsonb,
  created_at timestamptz not null default now(),
  completed_at timestamptz,
  unique (user_id, idempotency_key),
  check ((status = 'processing' and result is null and completed_at is null)
    or (status = 'complete' and result is not null and completed_at is not null))
);
create index if not exists analysis_history_user_created_idx
  on public.analysis_history (user_id, created_at desc)
  where status = 'complete';

create or replace function public.reserve_skinsnap_analysis(
  p_user_id uuid,
  p_idempotency_key text,
  p_monthly_limit integer
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  existing_status text;
  recent_count integer;
begin
  perform pg_advisory_xact_lock(hashtextextended(p_user_id::text, 0));

  select status into existing_status
    from public.analysis_history
    where user_id = p_user_id and idempotency_key = p_idempotency_key;
  if found then
    return 'existing';
  end if;

  select count(*) into recent_count
    from public.analysis_history
    where user_id = p_user_id
      and status in ('processing', 'complete')
      and created_at >= now() - interval '30 days';
  if recent_count >= p_monthly_limit then
    return 'limited';
  end if;

  insert into public.analysis_history (user_id, idempotency_key, status)
    values (p_user_id, p_idempotency_key, 'processing');
  return 'reserved';
end;
$$;
revoke all on function public.reserve_skinsnap_analysis(uuid, text, integer) from public, anon, authenticated;
grant execute on function public.reserve_skinsnap_analysis(uuid, text, integer) to service_role;

create table if not exists public.downsell_offer_claims (
  user_id uuid primary key references auth.users (id) on delete cascade,
  claim_id uuid not null unique,
  idempotency_key text not null check (char_length(idempotency_key) between 1 and 128),
  status text not null check (status in ('claimed', 'dismissed', 'redeemed')),
  created_at timestamptz not null default now(),
  dismissed_at timestamptz
);
alter table public.downsell_offer_claims enable row level security;

create table if not exists public.routines (
  user_id uuid primary key references auth.users (id) on delete cascade,
  data jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

create table if not exists public.progress_snapshots (
  user_id uuid primary key references auth.users (id) on delete cascade,
  data jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

alter table public.profiles enable row level security;
alter table public.analysis_history enable row level security;
alter table public.routines enable row level security;
alter table public.progress_snapshots enable row level security;

drop policy if exists "Users can read own profile" on public.profiles;
create policy "Users can read own profile"
  on public.profiles for select to authenticated
  using ((select auth.uid()) = id);
drop policy if exists "Users can update own profile" on public.profiles;
create policy "Users can update own profile"
  on public.profiles for update to authenticated
  using ((select auth.uid()) = id)
  with check ((select auth.uid()) = id);

drop policy if exists "Users can read own analysis history" on public.analysis_history;
create policy "Users can read own analysis history"
  on public.analysis_history for select to authenticated
  using ((select auth.uid()) = user_id);
drop policy if exists "Users can delete own analysis history" on public.analysis_history;
create policy "Users can delete own analysis history"
  on public.analysis_history for delete to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists "Users can manage own routines" on public.routines;
create policy "Users can manage own routines"
  on public.routines for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

drop policy if exists "Users can manage own progress" on public.progress_snapshots;
create policy "Users can manage own progress"
  on public.progress_snapshots for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

grant select, update on public.profiles to authenticated;
grant select, delete on public.analysis_history to authenticated;
grant select, insert, update, delete on public.routines to authenticated;
grant select, insert, update, delete on public.progress_snapshots to authenticated;
