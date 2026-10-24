# Retention migration and rollout plan

Date: 2026-10-24. **Not applied. No production deployment is authorized by this report.**

## Reviewed scope

Migration: `supabase/migrations/202610240001_retention_upgrade.sql`.

- Adds `skincare_preferences(user_id, data, updated_at)`.
- Reuses `routines(user_id, data, updated_at)`, creating it only if absent. This overlaps the historical core migration; do not create a second customization table.
- Adds `skin_diary_entries(user_id, entry_date, data, updated_at)` with `(user_id, entry_date)` as its primary key and owner/date lookup index.
- All reference `auth.users(id) ON DELETE CASCADE`. RLS is enabled; authenticated users (including Supabase anonymous profiles with authenticated JWTs) can act only where `auth.uid() = user_id`. Anonymous API-key-only clients receive no table grants. Worker service-role requests explicitly scope the verified owner because service-role access bypasses RLS.
- No analysis tables, quota functions, subscription records, prices, existing rows or original AI output are rewritten.
- Historical migration `202610210001` describes a different analysis-history layout from the inspected live-schema compatibility migration `202610220001`. **Do not replay all historical migrations blindly.**

## Preflight and staging procedure

1. Confirm the Supabase project and environment with the owner. Preserve a database backup and record the current Worker version. The source recovery checkpoint is Git `f37a995f`.
2. In an approved staging database, inspect these metadata queries (they return no user content):

```sql
select tablename, rowsecurity
from pg_tables where schemaname = 'public'
and tablename in ('routines', 'skincare_preferences', 'skin_diary_entries');

select table_name, column_name, data_type
from information_schema.columns where table_schema = 'public'
and table_name in ('routines', 'skincare_preferences', 'skin_diary_entries')
order by table_name, ordinal_position;

select tablename, policyname, roles, cmd, qual, with_check
from pg_policies where schemaname = 'public'
and tablename in ('routines', 'skincare_preferences', 'skin_diary_entries');
```

3. If an existing table has incompatible columns or a permissive/public policy, stop and review an explicit compatibility migration. `CREATE TABLE IF NOT EXISTS` does not repair an incompatible existing table or remove unrelated policies.
4. Review the exact migration file and execute its complete transaction against staging using the Supabase SQL editor. Alternatively, if the administrator has configured a PostgreSQL service named `skinsnap_staging`, run:

```powershell
psql 'service=skinsnap_staging' -X -v ON_ERROR_STOP=1 -f supabase/migrations/202610240001_retention_upgrade.sql
```

No database password belongs in chat, source control or command output.

5. Repeat the metadata queries. Verify primary keys, foreign keys and RLS. Using **two disposable staging authenticated users and an anonymous guest JWT**, test SELECT/INSERT/UPDATE/DELETE: A must never read or modify B's rows, including an attempted owner change. Repeat with the public API key and no JWT; it must not read/write rows. Source-level policy tests do not replace this test.
6. Deploy the reviewed Worker to an approved staging environment with its existing secret bindings. Set `RETENTION_ENABLED=true` there only after the migration. The default absence of this variable returns an authenticated 503 for the new routes.
7. Point a test app build at staging. Test preferences save/load after restart; custom routine CRUD/restore and schedules; diary save/edit/delete and older-date lookup; offline failures; duplicate saves; account deletion. New endpoints must make no Groq, reservation or billing requests. Verify existing premium analysis gates separately without increasing quotas.
8. Delete only the disposable staging accounts and verify all new records are removed. Account deletion explicitly attempts new tables even if the feature switch is off; an exact missing-optional-relation `PGRST205` is tolerated, while other database failures stop before Auth deletion.

## Production PGRST205 investigation (2026-10-24)

Configured production app target: Supabase project reference `pehjmojhezldzcedzcxi` (`pehjmojhezldzcedzcxi.supabase.co`). The configured Worker hostname is `skinsnap.risewithalphatekx.workers.dev`. Confirm the project reference in the Supabase dashboard before running SQL; local configuration identifies the app target but is not an owner confirmation of the intended project.

Read-only observations:

- Worker `/health`: HTTP 200.
- Using only the configured public Supabase key and `limit=0`, PostgREST returned HTTP 404 `PGRST205` for `public.skincare_preferences`, `public.skin_diary_entries`, and `public.routines`.
- No rows were requested or read.
- `psql`, Supabase CLI, Docker, database connection variables, and an authorized database-admin connection are not available in this environment. No SQL catalog, grant, policy, migration-ledger, or PostgREST exposed-schema inspection has been possible.
- The repository's historical migration defines `public.routines` with `user_id uuid` primary key, `data jsonb`, and `updated_at timestamptz`, but repository history does not prove that this migration ran in the configured production project.

**Root cause is not yet established.** `PGRST205` proves these names are unavailable in the current PostgREST schema cache for the requested API role. It does not prove the tables are absent. The identical result for `routines`, which is defined by an earlier checked-in migration, makes it particularly important to inspect physical schema placement, grants, schema `USAGE`, and Supabase API exposed schemas before applying the pending migration. Do not reload the schema cache until those checks establish that the relations exist with compatible definitions, the intended schema is exposed, and the required roles have appropriate grants.

Run [RETENTION_PRODUCTION_PREFLIGHT.sql](./RETENTION_PRODUCTION_PREFLIGHT.sql) in the SQL Editor for the confirmed project. If the migration ledger exists, run its version query; if it does not exist, report that rather than creating one. Separately confirm **Project Settings > API > Exposed schemas** includes `public`. The SQL `pgrst.db_schemas` setting can be NULL in SQL Editor and is not conclusive by itself.

Worker contract, verified in `worker/src/retention.ts`:

- `skincare_preferences`: `user_id`, `data`, `updated_at`; upsert conflict key `user_id`.
- `routines`: `user_id`, `data`, `updated_at`; upsert conflict key `user_id`.
- `skin_diary_entries`: `user_id`, `entry_date`, `data`, `updated_at`; upsert conflict key `(user_id, entry_date)`, ordered/read by `entry_date`.
- Every request scopes the REST query by the authenticated `user_id`. The Worker uses its service-role key; this bypasses RLS, so this owner filter and authenticated identity verification are essential.

Migration assessment:

- The pending migration is additive for the two new relations and does not issue row updates, deletes, truncates, or changes to analysis, quota, or billing records.
- The `routines` statement is `CREATE TABLE IF NOT EXISTS`; it will not repair an existing incompatible table. The checked-in historical definition matches the Worker contract, but production must be inspected before proceeding.
- The migration replaces only its own named policies. Other policies remain; permissive policies can OR together and broaden access. Inspect every existing policy before applying it.
- The migration enables (not disables) RLS, revokes table privileges from `PUBLIC` and `anon`, grants the intended operations to `authenticated` and `service_role`, and creates owner-scoped authenticated policies. Actual safety still depends on the inspected effective policies and grants.
- The migration is not yet confirmed applied in the production migration ledger. Do not apply it until catalog results establish table absence or a compatible schema and policy/grant review is complete. If relations already exist but are not exposed or granted, correct that diagnosed configuration rather than blindly running the migration.

RLS and account-deletion verification must be done in an approved **staging** project with two disposable authenticated users A and B (never use customer identities):

1. Obtain separate Supabase access tokens for A and B. Through PostgREST using each user's JWT, create/read/update/delete A's and B's own sample preference, routine, and diary rows. A must never read B's rows; A's attempted update to set `user_id` to B must be rejected or leave B's records unchanged. Repeat for B against A.
2. Try the same endpoints with only the public API key and no user JWT; no private rows may be readable or writable. Confirm requests made as the Worker continue to filter by the verified owner's ID.
3. Seed only disposable test records across the account-owned application tables, invoke authenticated `DELETE /v1/account` for disposable user A, and require the endpoint's confirmed success. Verify A's retention rows, routines, diary, analysis/history, profile and other enumerated account rows are absent, and A's Auth identity is gone. Verify B's rows and Auth identity remain. Do not test deletion in production.
4. Exercise a controlled partial failure in staging (for example, deny a disposable test deletion step); the endpoint must report incomplete deletion and must not delete the Auth identity before data cleanup is confirmed. Retry only for the same disposable user and verify idempotent cleanup.

`RETENTION_ENABLED=true` is safe only after the correct project is confirmed, physical relations/columns/constraints and migration ledger are reconciled, exposed schema and grants permit the Worker role, RLS and policy tests pass for separate identities, deletion tests pass, and the reviewed Worker is deployed with its existing secrets preserved. Prefer staging first. Production migration and production Worker deployment/feature-switch activation remain separate approval steps.

## Production approval boundary

After staging and Android sign-off, obtain explicit approval for **both** the production migration and Worker deployment. Apply the reviewed additive migration first; deploy the reviewed Worker with existing vars/secrets preserved; enable `RETENTION_ENABLED=true`; then distribute the tested mobile build. Verify a disposable production account only if separately authorized. Do not test deletion against a customer account.

No production command, migration, feature-switch change or legal publication has been executed in this task. Existing Worker secrets, allowance and billing settings are unchanged.

## Recovery

- Disable new writes by switching `RETENTION_ENABLED` off. Keep the new tables and foreign keys: existing data must remain recoverable, and account deletion must still remove it.
- Keep the upgraded deletion handler when rolling back feature UI. A full rollback to the old Worker needs an explicit deletion compatibility review.
- Revert the mobile candidate to checkpoint `f37a995f` in a separate recovery branch if needed; do not reset over other local work.
- Do not drop/truncate new tables or replay the old core schema as a rollback. Routine saves and diary saves use last-write-wins upserts; automatic multi-device conflict merging is not implemented.

## External prerequisites

An approved staging database/credentials and runtime RLS tests are still required. PostgreSQL/Supabase/Docker local database tooling was not available during this session.

No user rows were read, and no production schema, Worker configuration, or secrets were changed during this investigation.

### Post-migration verification update

The owner reports that migration `202610240001_retention_upgrade.sql` has now been applied in project `pehjmojhezldzcedzcxi`, and confirms the three retention relations exist with RLS, the expected owner policies, authenticated CRUD grants, and no `anon` SELECT grant. Read-only checks now return HTTP 401 / `42501 permission denied for table` for all three relations when called with only the public key. Unlike `PGRST205`, this response means PostgREST recognizes the relation but denies the anonymous role, which is consistent with the reported grant configuration. Authenticated REST behavior has not yet been tested.

Wrangler version metadata confirms the deployed Worker version `8f40f3e5-6bf9-4b89-b9fe-ce2076013373` points at the same Supabase project as the app. Its existing Supabase publishable-key and secret-key bindings are present, alongside existing AI bindings; secret values were not read. `RETENTION_ENABLED` is absent. Anonymous Auth sign-ins are disabled, so no production test identities were created and no test rows or accounts were written.

The ignored-local-file harness `scripts/verify-retention-production.mjs` is prepared to run authenticated RLS checks and delete only two explicitly confirmed disposable accounts through the authenticated account-deletion endpoint. Add the two disposable test users' credentials only to the ignored `.env.test.local` file and set `SKINSNAP_RETENTION_TEST_USERS_DISPOSABLE=true`; never send credentials in chat. This harness must pass before production activation approval is requested.
