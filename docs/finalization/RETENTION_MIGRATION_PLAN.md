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

## Production approval boundary

After staging and Android sign-off, obtain explicit approval for **both** the production migration and Worker deployment. Apply the reviewed additive migration first; deploy the reviewed Worker with existing vars/secrets preserved; enable `RETENTION_ENABLED=true`; then distribute the tested mobile build. Verify a disposable production account only if separately authorized. Do not test deletion against a customer account.

No production command, migration, feature-switch change or legal publication has been executed in this task. Existing Worker secrets, allowance and billing settings are unchanged.

## Recovery

- Disable new writes by switching `RETENTION_ENABLED` off. Keep the new tables and foreign keys: existing data must remain recoverable, and account deletion must still remove it.
- Keep the upgraded deletion handler when rolling back feature UI. A full rollback to the old Worker needs an explicit deletion compatibility review.
- Revert the mobile candidate to checkpoint `f37a995f` in a separate recovery branch if needed; do not reset over other local work.
- Do not drop/truncate new tables or replay the old core schema as a rollback. Routine saves and diary saves use last-write-wins upserts; automatic multi-device conflict merging is not implemented.

## External prerequisites

An approved staging database/credentials and runtime RLS tests are still required. PostgreSQL/Supabase/Docker local database tooling was not available during this session. The live schema was not altered or newly queried in this task.
