alter table public.analysis_jobs
  add column if not exists attempt_count integer not null default 1,
  add column if not exists result jsonb;

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
  existing_created_at timestamptz;
  existing_attempt_count integer;
  recent_count integer;
begin
  if p_monthly_limit < 1 or char_length(p_idempotency_key) not between 1 and 128 then
    raise exception 'Invalid analysis reservation parameters';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(p_user_id::text, 0));

  select status, created_at, attempt_count
    into existing_status, existing_created_at, existing_attempt_count
    from public.analysis_jobs
    where user_id = p_user_id and idempotency_key = p_idempotency_key
    for update;

  if found then
    if existing_status = 'completed' then
      return 'existing';
    end if;
    if existing_status = 'processing' and existing_created_at >= now() - interval '5 minutes' then
      return 'existing';
    end if;
    if existing_attempt_count >= 2 then
      update public.analysis_jobs
        set status = 'failed', error_code = 'retry-limited', updated_at = now()
        where user_id = p_user_id and idempotency_key = p_idempotency_key
          and status = 'processing';
      return 'retry-limited';
    end if;
    select coalesce(sum(attempt_count), 0)::integer
      into recent_count
      from public.analysis_jobs
      where user_id = p_user_id and created_at >= now() - interval '30 days';
    if recent_count >= p_monthly_limit then
      return 'limited';
    end if;
    update public.analysis_jobs
      set status = 'processing', error_code = null, created_at = now(),
          updated_at = now(), completed_at = null,
          attempt_count = existing_attempt_count + 1
      where user_id = p_user_id and idempotency_key = p_idempotency_key;
    return 'reserved';
  end if;

  select coalesce(sum(attempt_count), 0)::integer
    into recent_count
    from public.analysis_jobs
    where user_id = p_user_id and created_at >= now() - interval '30 days';
  if recent_count >= p_monthly_limit then
    return 'limited';
  end if;

  insert into public.analysis_jobs (user_id, idempotency_key, status, attempt_count)
    values (p_user_id, p_idempotency_key, 'processing', 1);
  return 'reserved';
end;
$$;

revoke all on function public.reserve_skinsnap_analysis(uuid, text, integer) from public, anon, authenticated;
grant execute on function public.reserve_skinsnap_analysis(uuid, text, integer) to service_role;

create or replace function public.complete_skinsnap_analysis(
  p_user_id uuid,
  p_idempotency_key text,
  p_result jsonb
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  job_id uuid;
  analysis_id uuid;
begin
  select id
    into job_id
    from public.analysis_jobs
    where user_id = p_user_id
      and idempotency_key = p_idempotency_key
      and status = 'processing'
    for update;
  if not found then
    raise exception 'No active analysis reservation exists';
  end if;
  if jsonb_typeof(p_result->'observations') <> 'array'
    or jsonb_typeof(p_result->'morningRoutine') <> 'array'
    or jsonb_typeof(p_result->'eveningRoutine') <> 'array' then
    raise exception 'Analysis result has an invalid shape';
  end if;

  insert into public.skin_analyses (
    user_id, job_id, image_quality, limitations, observations, recommendations, model_metadata
  )
  values (
    p_user_id,
    job_id,
    jsonb_build_object('quality', p_result->'imageQuality', 'summary', p_result->'summary'),
    case when p_result->>'imageQuality' = 'limited' then p_result->>'summary' else null end,
    p_result->'observations',
    jsonb_build_object(
      'morningRoutine', p_result->'morningRoutine',
      'eveningRoutine', p_result->'eveningRoutine',
      'precautions', coalesce(p_result->'precautions', '[]'::jsonb)
    ),
    '{"providers":["gemini","groq"]}'::jsonb
  )
  returning id into analysis_id;

  insert into public.skincare_routines (user_id, analysis_id, period, title, steps)
  values
    (p_user_id, analysis_id, 'morning', 'SkinSnap morning routine', p_result->'morningRoutine'),
    (p_user_id, analysis_id, 'evening', 'SkinSnap evening routine', p_result->'eveningRoutine');

  update public.analysis_jobs
    set status = 'completed', result = p_result, completed_at = now(),
        updated_at = now(), error_code = null
    where id = job_id and user_id = p_user_id;

  return analysis_id;
end;
$$;

revoke all on function public.complete_skinsnap_analysis(uuid, text, jsonb) from public, anon, authenticated;
grant execute on function public.complete_skinsnap_analysis(uuid, text, jsonb) to service_role;
