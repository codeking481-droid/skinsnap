# Retention and deletion

**Last reviewed:** 2026-10-22

## Current implementation

| Data | Current location | Current retention/deletion behavior |
|---|---|---|
| Source selfie/photo | User-selected URI on device; source ownership varies between camera cache and gallery provider | Not proactively deleted by SkinSnap. Gallery originals are never deleted. OS/app cache lifecycle is not controlled by SkinSnap. |
| Normalized JPEG upload copy | Expo temporary/cache file | Created for request preparation; now removed in request `finally`. Failure is surfaced. Abrupt process termination can prevent cleanup; OS cache policy is outside app control. |
| In-flight uploaded image | Cloudflare Worker request memory; sent inline to Gemini | Worker source does not persist raw bytes to Supabase or use Gemini's file upload API. Provider and platform processing/telemetry remain subject to their terms. |
| Analysis result | Supabase `analysis_jobs.result`; structured rows in `skin_analyses` and `skincare_routines` | No user-facing single-result/history deletion is implemented. Retained until account deletion or a database retention policy is applied. No expiration period is configured in the inspected source. |
| Routine completion state | Local app document file, optionally named with authenticated account UUID | Persists until app data removal or the new account-deletion cleanup runs. Guest state is not account-scoped. |
| Auth access/refresh tokens | Platform secure storage through `expo-secure-store` | Cleared on sign-out/account deletion when local cleanup succeeds. |
| Worker invocation/log metadata | Cloudflare Workers observability | Observability is enabled; configured retention period and whether request metadata contains source IP/device details were not inspected. |
| Provider input/output records | Google Gemini and Groq systems | Controlled by provider terms/settings; SkinSnap cannot delete provider-side records from the app. See `THIRD_PARTY_PROCESSORS.md`. |

## Account deletion behavior

The in-app route is Progress → Account & data settings → Delete account and data. It obtains the authenticated identity from the Worker, calls authenticated `DELETE /v1/account`, and the Worker deletes the authenticated Supabase Auth user using its server-side credential. The app then removes account-scoped routine progress and clears local tokens.

The Worker does not accept a client-selected user ID for deletion. Cross-user authorization is covered by a Worker test. The live schema's deletion cascade constraints were not captured by the available schema summary; therefore, associated database-row deletion is **not yet verified**. Provider deletion is also not performed by the app. The success message must not be interpreted as proof of third-party deletion.

No automated, publicly accessible external deletion-request channel is configured. The website draft identifies this as a launch blocker rather than discarding user requests.

## Required retention decisions before release

1. Define and disclose retention duration for completed analysis results.
2. Decide whether users can delete individual results or only delete the entire account.
3. Verify all live `auth.users` foreign keys and `ON DELETE` actions for `analysis_jobs`, `skin_analyses`, `skincare_routines`, `routine_progress`, `offer_eligibility`, `subscription_entitlements`, and `profiles`.
4. Test deletion with a disposable account, verify no owned rows remain, and test idempotent retry/partial failure.
5. Inspect Cloudflare log retention and Google/Groq project settings.
6. Supply the actual legal operator identity and support/privacy contact.
7. Define a working out-of-app account deletion request mechanism.

## Claims SkinSnap must not make

- "Photos are deleted everywhere immediately."
- "AI providers never retain photos or observations."
- "Account deletion removes all records and third-party copies" before cascade, provider, and disposable-user verification.
- Any fixed retention period until it is configured and validated.
