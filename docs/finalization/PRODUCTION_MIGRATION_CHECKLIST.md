# SkinSnap Production Migration Checklist

**Status:** NOT APPROVED / NOT APPLIED
**Migration under review:** `supabase/migrations/202610240001_retention_upgrade.sql`
**Current recovery point:** Git `6699e387`; prior recovery commit `f37a995f`

This checklist is preparation only. The verification task did not alter any Supabase database. Never run this against production until staging verification and explicit owner approval are complete.

## 1. Identify and protect the target

- [ ] Identify the Supabase project by its dashboard project reference and environment label. Do not rely on a local `.env` file alone.
- [ ] Identify a dedicated staging project and confirm it is not production.
- [ ] Record the currently deployed Worker version and current database migration state.
- [ ] Take/verify a recoverable staging backup before testing.
- [ ] Use disposable User A, User B, and authenticated anonymous test accounts only.
- [ ] Confirm there are no active concurrent migration/deployment operations.
- [ ] Do not copy production user data into an unapproved local test database.

No staging Supabase project or database service was identifiable in the inspected environment. No production database was contacted or modified.

## 2. Review migration ordering and compatibility

Repository migrations:

1. `202610210001_skinsnap_core.sql` — legacy core schema and legacy analysis history.
2. `202610220001_skinsnap_live_schema_compat.sql` — assumes the newer `analysis_jobs`, `skin_analyses`, and `skincare_routines` schema.
3. `202610240001_retention_upgrade.sql` — additive preferences, routine reuse, and diary tables.

Do not replay all migrations blindly. The older core and live-compat migrations describe different analysis layouts. Apply only migrations confirmed pending for the identified target.

The retention migration:

- Creates `skincare_preferences` and `skin_diary_entries`; reuses/creates `routines`.
- Adds owner foreign keys to `auth.users(id) ON DELETE CASCADE`.
- Uses `(user_id, entry_date)` as the diary key.
- Enables RLS and adds owner equality policies.
- Revokes table access from `PUBLIC` and `anon`, and grants CRUD to `authenticated` and `service_role`.
- Does not drop tables, rewrite existing routine records, change analysis data, or modify prices/entitlements.
- Includes JSON shape constraints. Existing same-named tables and extra pre-existing policies still require live preflight; `IF NOT EXISTS` does not repair incompatible schema.

The local PGlite simulation executed the core migration followed by this retention migration and passed 19 checks. It did not connect to Supabase or execute the live-compat migration against a real database.

## 3. Staging metadata preflight

Run read-only queries on staging and save results without exporting user contents:

```sql
select tablename, rowsecurity
from pg_tables
where schemaname = 'public'
  and tablename in ('routines', 'skincare_preferences', 'skin_diary_entries');

select table_name, column_name, data_type, is_nullable
from information_schema.columns
where table_schema = 'public'
  and table_name in ('routines', 'skincare_preferences', 'skin_diary_entries')
order by table_name, ordinal_position;

select tc.table_name, tc.constraint_name, tc.constraint_type,
       kcu.column_name, ccu.table_name as foreign_table, ccu.column_name as foreign_column
from information_schema.table_constraints tc
left join information_schema.key_column_usage kcu
  on tc.constraint_name = kcu.constraint_name and tc.table_schema = kcu.table_schema
left join information_schema.constraint_column_usage ccu
  on tc.constraint_name = ccu.constraint_name and tc.table_schema = ccu.table_schema
where tc.table_schema = 'public'
  and tc.table_name in ('routines', 'skincare_preferences', 'skin_diary_entries');

select tablename, policyname, permissive, roles, cmd, qual, with_check
from pg_policies
where schemaname = 'public'
  and tablename in ('routines', 'skincare_preferences', 'skin_diary_entries')
order by tablename, policyname;
```

Stop before applying if:

- An existing `routines` table has columns incompatible with the migration or Worker API.
- An unexpected permissive policy can broaden access.
- Required foreign keys, constraints, privileges, or table ownership differ from the reviewed assumptions.
- The target project cannot be independently confirmed as staging.

Do not “fix” a discrepancy with ad hoc production SQL. Prepare and review a separate compatibility migration first.

## 4. Apply to approved staging only

Use the Supabase SQL editor after confirming the dashboard project reference, or an administrator-provided `psql` service name. Do not place database passwords in chat, source control, shell history, or logs.

```powershell
psql 'service=skinsnap_staging' -X -v ON_ERROR_STOP=1 -f supabase/migrations/202610240001_retention_upgrade.sql
```

If the administrator has not configured `skinsnap_staging`, do not substitute an unknown connection string. Use the authenticated Supabase dashboard and verify its project identity first.

Repeat the metadata queries. Confirm RLS enabled, policies owner-scoped, primary/foreign keys correct, and no unexpected grants. Compare row counts before/after for existing `routines`; do not export row contents.

## 5. Staging authorization tests

Use disposable authenticated accounts and a guest Supabase Auth JWT:

- [ ] A reads only A preferences, routine, diary, and analysis history.
- [ ] A cannot read B records.
- [ ] A cannot insert records with B's `user_id`.
- [ ] A cannot reassign A rows to B.
- [ ] A cannot update or delete B records.
- [ ] B cannot access A's analysis history.
- [ ] An authenticated anonymous user can access only its own authorized rows.
- [ ] An API-key-only `anon` request cannot read, insert, update, or delete private data.
- [ ] Repeated same-date diary saves produce one row.
- [ ] Invalid date/data constraints fail.
- [ ] Deleting disposable A removes only A records and preserves B and guest records.
- [ ] Application account deletion reports failure honestly if a controlled database step fails; Auth deletion must not proceed past a blocking record-delete failure.
- [ ] Repeated authenticated deletion requests do not delete another account's data.

PGlite results are not a substitute for these Supabase/PostgREST/Auth tests.

## 6. Staging Worker and mobile rollout

Only after the migration and RLS tests pass:

1. Configure a clearly separate staging Worker and confirm its Supabase URL, public key, service key, Groq settings, RevenueCat settings, and CORS origins. Never reuse production secrets.
2. Deploy the reviewed Worker to staging only. `RETENTION_ENABLED` must remain off until the migration is verified; then enable it only in staging.
3. Point an internal mobile build at staging.
4. Exercise preferences, custom routine edits/schedules, diary CRUD/date lookup, account isolation, offline failures, and account deletion with disposable identities.
5. Verify current production premium entitlement gates and quota behavior remain unchanged; do not raise quotas for this exercise.
6. Test the existing Groq pipeline only if explicitly authorized, using a synthetic or explicitly consented sample and one bounded request. Do not make repeated paid calls.
7. Complete `ANDROID_FINAL_ACCEPTANCE.md` on a physical device.

## 7. Production approval and execution

Production remains blocked until all staging checks, Android acceptance, privacy review, external deletion readiness, RevenueCat setup, and owner approvals are recorded.

With explicit approval for both the database migration and Worker deployment:

1. Reconfirm the production Supabase project reference and backup.
2. Re-run the schema/policy preflight against production in read-only mode.
3. Confirm the exact migration is still the reviewed file and is pending.
4. Apply only the approved migration once; do not replay historical migrations.
5. Verify schema/RLS/constraints without exposing row contents.
6. Deploy the reviewed Worker to production with existing variables and secrets preserved.
7. Enable the retention flag only after migration and Worker review.
8. Use a specifically authorized disposable production account only if separately approved; never use or delete a customer account.
9. Monitor safe correlation IDs and error categories. Do not log photos, credentials, diary content, or preference text.
10. Record the deployed Worker version, migration state, and validation evidence.

This verification did not perform any of these production steps.

## 8. Rollback

- First disable new retention writes with `RETENTION_ENABLED=false`; this prevents further writes while preserving existing records.
- Keep the additive tables and their RLS policies. Do not drop, truncate, or remove foreign keys as an application rollback.
- Keep account-deletion code that removes preferences, custom routines, and diary entries. A Worker rollback that omits these deletions is not safe while such records exist.
- If mobile rollback is needed, build from an approved prior commit in a new branch/worktree after preserving all current uncommitted work. Do not use `git reset --hard`.
- If Worker rollback is needed, choose a prior reviewed deployment that has compatible deletion behavior. Verify account deletion before restoring traffic.
- Re-enable the feature only after the underlying cause is understood and tests pass.

No database rollback is currently required because no migration was applied.
