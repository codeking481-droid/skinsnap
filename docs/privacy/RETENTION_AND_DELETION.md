# Retention and deletion notes

**Reviewed:** 23 October 2026
**Status:** Repository-source review only. Live project configuration, backups, and provider retention remain unverified.

For the complete flow and evidence limits, see [`data-flow-audit.md`](./data-flow-audit.md).

## Current implementation

| Data | Location | Behavior supported by source |
|---|---|---|
| Selected original photo | User device/gallery or camera/picker cache | SkinSnap does not delete the selected original. Operating-system cache behavior is outside the app's control. |
| Prepared JPEG | App temporary/cache file | Created for an analysis request; the app attempts cleanup when the request finishes or fails. Process termination and file-system failure can prevent cleanup. |
| In-flight photo | Cloudflare Worker request memory and Groq vision request | The Worker source does not intentionally persist the raw upload in Supabase or object storage. Provider-side processing/retention and live storage inventory are unverified. |
| Completed result | Supabase analysis job and structured analysis/routine tables | No automatic expiration or individual result deletion is implemented in inspected source. |
| Failed analysis | Supabase job status and attempt metadata | A failed request may leave a failed record and consume an attempt. The raw photo is not intentionally stored with it. |
| Routine completion | Local app-document JSON and account progress records | In-app deletion attempts to remove the current account-scoped local file and known server-side rows. Other devices are unaffected. |
| Authentication token | Expo SecureStore | Sign-out/account deletion attempts to clear the token. Device storage failure is reported. |
| Worker logs | Cloudflare observability | Safe custom stage logs are visible in source. Cloudflare request metadata, retention, and log access settings are unverified. |
| Provider content/logs | Groq, Supabase, Cloudflare, RevenueCat/Google Play as configured | SkinSnap has no provider-side deletion API integration. Provider retention and account settings require owner verification. |

## Account deletion behavior and recovery

In-app deletion requires a valid authenticated session. The Worker derives the user ID from Supabase Auth and deletes the known user-scoped tables before requesting Auth-user deletion. If a row deletion fails, it stops before deleting the Auth user. If Auth deletion fails after database cleanup, the user can sign in and retry; repeated scoped deletes are safe. This is a sequence of API operations, not a cross-service transaction, so a failed request may mean some records have already been removed.

After confirmed server deletion, the app attempts local progress cleanup and token removal. A local cleanup failure is surfaced separately. The public web deletion form is intentionally disabled in the review build; configuring, deploying, and testing it is a release blocker.

The current live table definitions, constraints, storage bucket contents, and any records outside the repository's known table list have not been verified. Do not promise that all historical rows or provider-held copies are deleted until a live metadata review and disposable-account verification pass.

## Release checks

1. Confirm live schema and table list, including `routine_progress`, `offer_eligibility`, and `subscription_entitlements`, which are referenced by deletion code but not defined in the inspected migrations.
2. Inspect all user-linked foreign keys, storage buckets/objects, and backup policies.
3. Test valid, unauthorized, repeated, and controlled partial-failure deletion with a disposable account only.
4. Verify provider retention settings, current legal obligations, and the public contact.
5. Enable and deploy external deletion only after the hosted flow passes the disposable-account test.


## Retention candidate - 2026-10-24 (not deployed)

Preferences, custom routine edits and diary records are retained until individually removed or account deletion; no automatic expiry is configured. Saving preferences is opt-in. Diary Save is an explicit storage action. No offline persistent copy of preferences, routine edits or diary notes is introduced; drafts stay in memory, server errors retain the current draft while the screen remains open. Original routine checkmarks stay in the account-scoped device document and are removed through the existing account-deletion cleanup. The migration adds RLS and cascading Auth deletion; the Worker additionally clears skincare_preferences and skin_diary_entries explicitly even with the feature switch off. Backups/provider logs and copies on other devices are not proven erased by a successful response. Live migration/deletion verification is pending approval.
