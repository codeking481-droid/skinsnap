# SkinSnap data-flow audit

**Prepared:** 23 October 2026  
**Status:** Engineering review of repository source; not a legal opinion or a live-provider certification.  
**Publication:** Do not publish the legal pages until the contact, live configuration checks, and legal review listed below are complete.

## Scope and confidence

This audit follows the checked-in mobile, Worker, website, and SQL migration source. No production user data was queried or deleted as part of this work. The current Supabase project schema, bucket inventory, Cloudflare log settings, provider-account controls, project regions, backups, billing status, and deployed Worker version were not freshly verified. Where source alone cannot establish those facts, the status is marked **UNVERIFIED**.

The active Worker source calls Groq for both image observations and routine generation. The vision model is `qwen/qwen3.8-27b`; the routine model is `openai/gpt-oss-20b`. The current request path does not call Gemini. A compatibility migration still writes `providers: ["gemini", "groq"]` into `model_metadata`; this stored metadata is stale relative to the current Worker implementation and should not be treated as proof that Gemini received an image.

## Data-flow inventory

| Data | Source and destination | Purpose and retention evidence |
|---|---|---|
| Selected photo | Camera or a selected gallery item → app session → locally prepared JPEG → HTTPS multipart request to the authenticated Cloudflare Worker → Groq vision request | Photo is required only to request a photo analysis. The app asks for explicit consent before upload. The Worker parses and processes the photo in request memory and sends it to Groq. No current app/Worker source path intentionally writes the raw photo to Supabase or object storage. Provider-side handling and retention are **UNVERIFIED** for the SkinSnap account. |
| Device photo copies | Original camera/gallery image and possible camera/picker cache | SkinSnap does not delete the selected original. Temporary copies are subject to operating-system behavior. The app attempts to delete its prepared JPEG in its request cleanup path; app termination, filesystem failure, or cleanup failure can prevent removal. |
| Photo consent | Consent-version constant and an affirmative checkbox in the upload screen; consent state is held by `PhotoContext` | Consent is not stored as a server-side record in the inspected implementation. It is cleared with the photo/session flow and does not provide a durable server audit record. |
| Age eligibility | An explicit 18+ confirmation in onboarding and sign-up; local preferences store a boolean only | The app does not collect date of birth. This is a client-side attestation, not independently verified age or a server-side age record. |
| Account data | A guest Supabase Auth identity is created lazily when a protected history, routine-history, purchase, or analysis feature needs a backend identity; users may also sign in or create an email/password account. The Worker derives the account UUID from the signed token. | Email registration is not required to explore the app. Guest recovery/linking is not currently implemented; clearing app data or reinstalling may make guest data inaccessible, and a new guest identity must never inherit the old account's data. Passwords are sent to Supabase Auth and are not saved in app local storage. Session tokens use platform secure storage. Supabase anonymous-auth configuration, rate limits/CAPTCHA, authentication logs, backups, and retention settings are **UNVERIFIED**. |
| Optional routine preferences | User-entered concerns, skin feel, sensitivity, budget, and routine complexity → Worker request → Groq text routine request | Preferences are self-reported and optional; the Worker uses them for routine generation. The current flow does not persist a separate preference profile. |
| Analysis and routine results | Worker → Supabase analysis job and structured analysis/routine records → history and result screens | The result contains cosmetic observations, quality/limitation text, routine recommendations, precautions, timestamps, and model metadata. It does not contain a photo URL in the inspected migration. Retention is indefinite in source: no automatic result expiry is configured. |
| Failed analyses | Worker reservation/status updates → Supabase job record | A failed request can leave a failed job, attempt count, and safe error code. The failure path does not intentionally save the uploaded image. Attempt counts contribute to the rolling analysis limit; a client-visible failure does not imply that no request or quota reservation occurred. |
| Routine completion | App JSON file in Expo document storage; also account-scoped routine/progress records in Supabase when a protected profile exists | The local file is scoped to the guest or registered account UUID when available, otherwise it remains device-local. In-app account deletion attempts to remove the current account's local file. Files on other devices require separate app-data removal. |
| Subscription / offer data | RevenueCat and Google Play SDKs when configured; app user ID, purchase/entitlement state, and offer records | The mobile billing code is conditional on supported builds and configured keys. Google Play handles Android payment collection. Current production product availability, RevenueCat account configuration, retention, and any table contents are **UNVERIFIED**. |
| Operational metadata | Cloudflare Workers observability and safe Worker diagnostics | `wrangler.jsonc` enables observability. Custom analysis logs contain correlation ID, stage/provider/model, image byte count/MIME type, status/category, and attempt metadata. Source logging is not intended to include selfie bytes, passwords, auth tokens, prompts, or result text. Cloudflare request/invocation metadata may include IP/device/request information; retention and access settings are **UNVERIFIED**. |

## Database and storage inventory

### Tables defined or used in source

The base migration defines:

- `profiles` — account ID and optional display name.
- `analysis_history` — legacy analysis status, idempotency key, result, timestamps, and attempt count.
- `downsell_offer_claims` — claim identifier, idempotency key, status, and timestamps.
- `routines` and `progress_snapshots` — JSON data and update timestamps.

The compatibility migration and current Worker use:

- `analysis_jobs` — status, idempotency key, attempt count, completion information, error code, and result JSON.
- `skin_analyses` — structured visible-feature observations, quality/limitations, recommendations, and model metadata.
- `skincare_routines` — generated morning/evening steps associated with the account and analysis.

The current Worker deletion code also references `routine_progress`, `offer_eligibility`, and `subscription_entitlements`; their definitions and contents were not found in the inspected migrations and require verification against the live project. The migrations declare cascading auth relationships for their own tables, but those declarations do not prove the current production schema or every live constraint.

No Supabase Storage upload/download call, Cloudflare R2 write, or photo URL field is used by the inspected application flow. This is **not** proof that the live Supabase project has no buckets or older objects. Live bucket names, policies, and object inventory are **UNVERIFIED**.

## Processing failures and deletion

The Worker authenticates the bearer token with Supabase Auth and derives the account ID from that response; account deletion does not accept a browser-selected user ID. This applies to guest and registered identities. It deletes a fixed set of known account-scoped tables before asking Supabase Auth to remove that authenticated user. If a table deletion fails, Auth deletion is not attempted. If Auth deletion fails after table cleanup, the account remains and the user must sign in and retry. These operations are sequential, not one database transaction; earlier deletes may have succeeded when an error is returned. Repeated deletes of the same scoped records are safe, but live schema compatibility must be verified before deployment.

After server deletion, the app attempts to remove the current device's account-scoped routine-progress file and clear the local token. A local cleanup failure is reported separately; the app must not show a success-shaped message for an unconfirmed server deletion. Provider copies, gallery originals, other devices, and provider backups are outside this endpoint.

The public website has a browser deletion client that authenticates with Supabase, checks that the Worker sees the same account, and then calls the authenticated deletion endpoint. It is intentionally disabled in the review build. The Supabase public URL/key, Worker CORS origin, public contact, live deletion behavior, and hosted end-to-end test are not complete; this remains a launch blocker.

## Third parties and retention facts

- **Groq:** receives the image for vision and receives validated observation text plus optional preferences for routine generation. Exact account data controls and retention are **UNVERIFIED**. Consult Groq's current data documentation and verify the SkinSnap organization settings; this audit makes no promise that submitted content is never retained.
- **Cloudflare:** runs the API and may process invocation/request metadata. Observability is enabled in repository configuration; retention, sampling, and export settings are **UNVERIFIED**.
- **Supabase:** authenticates accounts and stores structured records. Project region, live tables/constraints, backups, retention, and deletion behavior are **UNVERIFIED**.
- **RevenueCat / Google Play:** billing code can be enabled in supported builds. Actual availability, identifiers processed, vendor settings, and retention are **UNVERIFIED**.

HTTPS is used by the inspected mobile API/auth and provider endpoints. Session tokens are stored with Expo SecureStore. The Worker secret is server-side and is not part of mobile configuration. These implementation facts do not establish encryption-at-rest settings or eliminate security risk.

## Required checks before publication or release

1. Provide and verify the public support/privacy contact. Do not replace it with invented details.
2. Inspect the live Supabase schema, all user foreign keys and cascade rules, the three deletion-code-only tables, and the storage bucket/object inventory.
3. Use a disposable account to verify valid deletion, retry after each controlled partial failure, repeated requests, and absence of all account-linked rows. Do not use production users.
4. Verify the live Worker version, secrets/bindings without exposing values, approved website CORS origin, request/log retention, and deployment configuration.
5. Verify Groq's current terms and the account's data-retention settings, plus Supabase, Cloudflare, RevenueCat, and Google Play regions/retention.
6. Reconcile the stale Gemini value in the SQL `model_metadata` function without rewriting historical records.
7. Obtain jurisdiction-specific legal review, approve the policy text/effective date, and verify the hosted HTTPS pages and external deletion flow before Play Console submission.

## Source references

- Mobile consent and photo path: `src/app/upload.tsx`, `src/PhotoContext.tsx`, `src/photoUpload.ts`, `src/services/analysisApi.ts`, `src/privacy.ts`.
- Age and local preference gate: `src/app/onboarding.tsx`, `src/app/sign-in.tsx`, `src/app/_layout.tsx`, `src/preferences.ts`.
- Account/auth/deletion: `src/services/authApi.ts`, `src/services/session.ts`, `src/routineStorage.ts`, `worker/src/index.ts`.
- Billing: `src/services/billing.ts`, `src/subscriptionRules.ts`, `src/app/paywall.tsx`.
- SQL: `supabase/migrations/202610210001_skinsnap_core.sql`, `supabase/migrations/202610220001_skinsnap_live_schema_compat.sql`.
- Hosting/observability: `wrangler.jsonc`, `website/_headers`, `website/_redirects`.
- Related worksheet: `docs/google-play/data-safety-review.md`.
