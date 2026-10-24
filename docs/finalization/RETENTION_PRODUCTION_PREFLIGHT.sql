-- READ ONLY. Run in the Supabase SQL Editor for project pehjmojhezldzcedzcxi.
-- Confirm the project reference in the dashboard before running. These queries
-- inspect catalog/configuration metadata only; they do not read user records.

-- 1. Record the database identity and any PostgREST settings visible to SQL.
select
  current_database() as database_name,
  current_user as sql_editor_role,
  session_user as session_role,
  current_setting('server_version') as postgres_version,
  current_setting('pgrst.db_schemas', true) as pgrst_db_schemas,
  current_setting('pgrst.db_extra_search_path', true) as pgrst_extra_search_path;

-- 2. Determine whether each relation exists, in which schema, and whether RLS
--    is enabled/forced. Search all schemas to detect a wrong-schema placement.
select
  n.nspname as schema_name,
  c.relname as relation_name,
  c.relkind as relation_kind,
  pg_get_userbyid(c.relowner) as relation_owner,
  c.relrowsecurity as rls_enabled,
  c.relforcerowsecurity as rls_forced
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where c.relname in ('routines', 'skincare_preferences', 'skin_diary_entries')
  and c.relkind in ('r', 'p', 'v', 'm', 'f')
order by n.nspname, c.relname;

-- 3. Inspect exact columns and nullability for every matching relation.
select table_schema, table_name, ordinal_position, column_name, data_type,
       udt_name, is_nullable, column_default
from information_schema.columns
where table_name in ('routines', 'skincare_preferences', 'skin_diary_entries')
order by table_schema, table_name, ordinal_position;

-- 4. Inspect primary/unique/foreign/check constraints and indexes.
select n.nspname as schema_name, c.relname as relation_name,
       con.conname as constraint_name, con.contype as constraint_type,
       pg_get_constraintdef(con.oid, true) as definition
from pg_constraint con
join pg_class c on c.oid = con.conrelid
join pg_namespace n on n.oid = c.relnamespace
where c.relname in ('routines', 'skincare_preferences', 'skin_diary_entries')
order by n.nspname, c.relname, con.conname;

select schemaname, tablename, indexname, indexdef
from pg_indexes
where tablename in ('routines', 'skincare_preferences', 'skin_diary_entries')
order by schemaname, tablename, indexname;

-- 5. List every policy on the target relations. Policies combine permissively
--    by OR unless marked restrictive; do not assume a new owner policy is the
--    only effective policy.
select schemaname, tablename, policyname, permissive, roles, cmd, qual, with_check
from pg_policies
where tablename in ('routines', 'skincare_preferences', 'skin_diary_entries')
order by schemaname, tablename, policyname;

-- 6. Inspect explicit table grants, including the API roles and PUBLIC.
select table_schema, table_name, grantee, privilege_type, is_grantable
from information_schema.role_table_grants
where table_name in ('routines', 'skincare_preferences', 'skin_diary_entries')
  and grantee in ('PUBLIC', 'anon', 'authenticated', 'service_role')
order by table_schema, table_name, grantee, privilege_type;

-- 7. Inspect schema USAGE for PostgREST roles. A table grant without schema
--    USAGE does not make the table accessible through the REST API.
select n.nspname as schema_name,
       has_schema_privilege('anon', n.oid, 'USAGE') as anon_schema_usage,
       has_schema_privilege('authenticated', n.oid, 'USAGE') as authenticated_schema_usage,
       has_schema_privilege('service_role', n.oid, 'USAGE') as service_role_schema_usage
from pg_namespace n
where n.nspname in ('public', 'auth')
order by n.nspname;

-- 8. Check whether the Supabase migration ledger exists. If it does, run the
--    following query separately to verify the pending version:
select to_regclass('supabase_migrations.schema_migrations') as migration_ledger;

-- Only run this query if migration_ledger above is non-NULL.
select version, name
from supabase_migrations.schema_migrations
where version in ('202610210001', '202610220001', '202610240001')
order by version;

-- 9. PostgREST exposed schemas are configured in Supabase API settings. A NULL
--    pgrst.db_schemas above is not proof of exposure or non-exposure. Confirm
--    the API > Exposed schemas setting in the dashboard, and confirm `public`
--    is exposed before considering any schema-cache action.
